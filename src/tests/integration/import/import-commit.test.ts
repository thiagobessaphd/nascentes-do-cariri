/**
 * Nascentes do Cariri — Teste de Integração Backend (CT-BE-13)
 *
 * Caso de Teste: CT-BE-13 — Adição de novos registros à base após confirmação
 * Escopo (Task-26 / US-13):
 * - Persistência transacional "tudo-ou-nada" via prisma.$transaction no MySQL real;
 * - Adição cumulativa de novos registros vinculados ao importacao_id sem excluir anteriores (RF06);
 * - Deduplicação intratransacional pela chave [latitude, longitude, fonte] (CT-BE-11);
 * - Rollback integral em falha forçada no meio do lote preservando base e arquivos originais (CT-BE-12, CT-BE-14, CT-BE-15);
 * - Invalidação do cache público de nascentes exclusivamente após o commit bem-sucedido (RNF04/RNF05);
 * - Proteção contra confirmação repetida ou concorrente (Compare-and-Swap).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { MemoryStorageDriver } from '@/lib/storage/drivers/memory-storage.driver';
import {
  IMPORTACAO_COMMIT_ERROR_CODES,
  ImportacaoCommitService,
  ImportacaoStorageService,
  ImportacaoValidationService,
  StatusImportacao,
} from '@/modules/importacoes';
import {
  getNascentesCacheStats,
  getNascentesFromCache,
  invalidateNascentesCache,
  resetNascentesCacheStats,
  setNascentesInCache,
} from '@/modules/nascentes/nascentes.cache';

function buildTxtFileBuffer(rows: readonly string[]): Buffer {
  const header = 'latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media';
  return Buffer.from([header, ...rows].join('\n'), 'utf-8');
}

describe('CT-BE-13 — Persistência Transacional, Deduplicação, Rollback e Cache na Confirmação', () => {
  const uniqueTag = `CTBE13_${Date.now()}`;
  const createdImportacaoIds: number[] = [];
  let testUser: { id: number; email: string };
  let memoryDriver: MemoryStorageDriver;
  let storageService: ImportacaoStorageService;
  let validationService: ImportacaoValidationService;
  let commitService: ImportacaoCommitService;

  beforeAll(async () => {
    testUser = await prisma.usuario.create({
      data: {
        nome: 'QA Integration CT-BE-13',
        email: `qa_ct_be_13_${Date.now()}@ufca.edu.br`,
        passwordHash: '$2b$12$fakehashforintegrationtestingonly1234567890',
      },
    });
  });

  beforeEach(() => {
    memoryDriver = new MemoryStorageDriver();
    storageService = new ImportacaoStorageService({
      prismaClient: prisma,
      storageDriver: memoryDriver,
    });
    validationService = new ImportacaoValidationService({
      prismaClient: prisma,
      storageService,
    });
    commitService = new ImportacaoCommitService({
      prismaClient: prisma,
      storageService,
    });

    invalidateNascentesCache();
    resetNascentesCacheStats();
  });

  afterAll(async () => {
    if (createdImportacaoIds.length > 0) {
      await prisma.nascente.deleteMany({
        where: { importacaoId: { in: createdImportacaoIds } },
      });
      await prisma.importacao.deleteMany({
        where: { id: { in: createdImportacaoIds } },
      });
    }

    if (testUser) {
      await prisma.usuario.delete({
        where: { id: testUser.id },
      });
    }
  });

  it('deve adicionar novos registros atomicamente, preservar lotes/arquivos anteriores e deduplicar contra a base existente', async () => {
    // 1. Valida e confirma o 1º lote com 3 nascentes inéditas
    const lote1Buffer = buildTxtFileBuffer([
      `-7.210101;-39.310101;Crato;Fonte ${uniqueTag} Lote1 A;Sítio Fundão;2024-03-10;1.50`,
      `-7.220202;-39.320202;Barbalha;Fonte ${uniqueTag} Lote1 B;Arajara;2024-04-12;2.25`,
      `-7.230303;-39.330303;Juazeiro do Norte;Fonte ${uniqueTag} Lote1 C;Horto;2024-05-15;0.90`,
    ]);

    const preview1 = await validationService.validateAndPreview(
      {
        usuarioId: testUser.id,
        files: [
          {
            filename: 'lote-1.txt',
            sizeBytes: lote1Buffer.byteLength,
            mimeType: 'text/plain',
            content: lote1Buffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(preview1.importacaoId);

    // Popula cache público antes da confirmação para verificar invalidação pós-commit
    setNascentesInCache('public:nascentes:all', {
      data: [],
      meta: { total: 0, updated_at: null },
    });
    expect(getNascentesFromCache('public:nascentes:all')).toBeDefined();

    const commit1 = await commitService.confirmImportacao(
      { importacaoId: preview1.importacaoId, usuarioId: testUser.id },
      { storageDriver: memoryDriver }
    );

    expect(commit1.status).toBe(StatusImportacao.CONCLUIDA);
    expect(commit1.cacheInvalidated).toBe(true);
    expect(commit1.summary).toEqual({
      totalLinhas: 3,
      totalInseridas: 3,
      totalDuplicadas: 0,
      totalInvalidas: 0,
    });
    expect(getNascentesFromCache('public:nascentes:all')).toBeUndefined();

    const nascentesLote1 = await prisma.nascente.findMany({
      where: { importacaoId: preview1.importacaoId },
      orderBy: { fonte: 'asc' },
    });
    expect(nascentesLote1).toHaveLength(3);
    expect(nascentesLote1.every((n) => n.ativo)).toBe(true);

    // 2. Valida e confirma um 2º lote contendo 1 duplicada do 1º lote (com variação de caixa/espaços) e 2 novas
    const lote2Buffer = buildTxtFileBuffer([
      `-7.210101;-39.310101;Crato;  fonte ${uniqueTag.toLowerCase()} lote1 a  ;Sítio Fundão;2024-03-10;1.50`,
      `-7.240404;-39.340404;Missão Velha;Fonte ${uniqueTag} Lote2 D;Cachoeira;2024-06-01;3.40`,
      `-7.250505;-39.350505;Santana do Cariri;Fonte ${uniqueTag} Lote2 E;Pontal;2024-06-02;1.85`,
    ]);

    const preview2 = await validationService.validateAndPreview(
      {
        usuarioId: testUser.id,
        files: [
          {
            filename: 'lote-2.txt',
            sizeBytes: lote2Buffer.byteLength,
            mimeType: 'text/plain',
            content: lote2Buffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(preview2.importacaoId);

    const commit2 = await commitService.confirmImportacao(
      { importacaoId: preview2.importacaoId, usuarioId: testUser.id },
      { storageDriver: memoryDriver }
    );

    expect(commit2.status).toBe(StatusImportacao.CONCLUIDA);
    expect(commit2.summary).toEqual({
      totalLinhas: 3,
      totalInseridas: 2,
      totalDuplicadas: 1,
      totalInvalidas: 0,
    });

    // Verifica preservação integral do 1º lote e adição cumulativa do 2º lote
    const countLote1After = await prisma.nascente.count({
      where: { importacaoId: preview1.importacaoId },
    });
    const countLote2After = await prisma.nascente.count({
      where: { importacaoId: preview2.importacaoId },
    });

    expect(countLote1After).toBe(3);
    expect(countLote2After).toBe(2);

    // Verifica preservação dos dois arquivos TXT originais no storage privado
    const imp1Db = await prisma.importacao.findUniqueOrThrow({
      where: { id: preview1.importacaoId },
    });
    const imp2Db = await prisma.importacao.findUniqueOrThrow({
      where: { id: preview2.importacaoId },
    });
    expect(await memoryDriver.exists(imp1Db.caminhoPrivadoArquivo)).toBe(true);
    expect(await memoryDriver.exists(imp2Db.caminhoPrivadoArquivo)).toBe(true);
  });

  it('deve executar rollback integral no MySQL quando ocorrer falha no meio da operação e preservar o cache público', async () => {
    const rollbackBuffer = buildTxtFileBuffer([
      `-7.260101;-39.360101;Crato;Fonte ${uniqueTag} RB 1;Belmonte;2024-07-01;1.10`,
      `-7.260202;-39.360202;Crato;Fonte ${uniqueTag} RB 2;Belmonte;2024-07-02;1.20`,
      `-7.260303;-39.360303;Crato;Fonte ${uniqueTag} RB 3;Belmonte;2024-07-03;1.30`,
    ]);

    const previewRb = await validationService.validateAndPreview(
      {
        usuarioId: testUser.id,
        files: [
          {
            filename: 'lote-rollback.txt',
            sizeBytes: rollbackBuffer.byteLength,
            mimeType: 'text/plain',
            content: rollbackBuffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(previewRb.importacaoId);

    // Popula cache público antes da falha
    setNascentesInCache('public:nascentes:rollback-check', {
      data: [],
      meta: { total: 5, updated_at: '2026-11-13T00:00:00.000Z' },
    });
    const sizeBeforeRollback = getNascentesCacheStats().size;

    // Força erro após a 2ª inserção real dentro da transação MySQL
    await expect(
      commitService.confirmImportacao(
        { importacaoId: previewRb.importacaoId, usuarioId: testUser.id },
        {
          storageDriver: memoryDriver,
          onAfterRowInsert: ({ insertedCount }) => {
            if (insertedCount === 2) {
              throw new Error('Erro forçado após inserir 2ª linha no MySQL');
            }
          },
        }
      )
    ).rejects.toThrow('Erro forçado após inserir 2ª linha no MySQL');

    // 1. Zero nascentes parciais persistidas para esta importação
    const partialCount = await prisma.nascente.count({
      where: { importacaoId: previewRb.importacaoId },
    });
    expect(partialCount).toBe(0);

    // 2. Status da importação revertido para AGUARDANDO_CONFIRMACAO (sem concluidaAt)
    const impAfterRollback = await prisma.importacao.findUniqueOrThrow({
      where: { id: previewRb.importacaoId },
    });
    expect(impAfterRollback.status).toBe(StatusImportacao.AGUARDANDO_CONFIRMACAO);
    expect(impAfterRollback.concluidaAt).toBeNull();

    // 3. Arquivo original preservado no storage
    expect(await memoryDriver.exists(impAfterRollback.caminhoPrivadoArquivo)).toBe(true);

    // 4. Cache público NÃO foi invalidado
    expect(getNascentesFromCache('public:nascentes:rollback-check')).toBeDefined();
    expect(getNascentesCacheStats().size).toBe(sizeBeforeRollback);

    // 5. Uma nova tentativa limpa após o rollback deve confirmar com sucesso e invalidar o cache
    const retryResult = await commitService.confirmImportacao(
      { importacaoId: previewRb.importacaoId, usuarioId: testUser.id },
      { storageDriver: memoryDriver }
    );
    expect(retryResult.status).toBe(StatusImportacao.CONCLUIDA);
    expect(retryResult.summary.totalInseridas).toBe(3);
    expect(getNascentesFromCache('public:nascentes:rollback-check')).toBeUndefined();
    expect(getNascentesCacheStats().size).toBe(0);
  });

  it('deve bloquear confirmação concorrente paralela garantindo inserção única sem duplicidade', async () => {
    const raceBuffer = buildTxtFileBuffer([
      `-7.270101;-39.370101;Barbalha;Fonte ${uniqueTag} Race 1;Caldas;2024-08-10;2.05`,
      `-7.270202;-39.370202;Barbalha;Fonte ${uniqueTag} Race 2;Caldas;2024-08-11;2.15`,
    ]);

    const previewRace = await validationService.validateAndPreview(
      {
        usuarioId: testUser.id,
        files: [
          {
            filename: 'lote-race.txt',
            sizeBytes: raceBuffer.byteLength,
            mimeType: 'text/plain',
            content: raceBuffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(previewRace.importacaoId);

    const outcomes = await Promise.allSettled([
      commitService.confirmImportacao(
        { importacaoId: previewRace.importacaoId },
        { storageDriver: memoryDriver }
      ),
      commitService.confirmImportacao(
        { importacaoId: previewRace.importacaoId },
        { storageDriver: memoryDriver }
      ),
    ]);

    const fulfilled = outcomes.filter(
      (o): o is PromiseFulfilledResult<Awaited<ReturnType<typeof commitService.confirmImportacao>>> =>
        o.status === 'fulfilled'
    );
    const rejected = outcomes.filter(
      (o): o is PromiseRejectedResult => o.status === 'rejected'
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(AppError);
    expect((rejected[0]?.reason as AppError).code).toBe(
      IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED
    );

    const persistedCount = await prisma.nascente.count({
      where: { importacaoId: previewRace.importacaoId },
    });
    expect(persistedCount).toBe(2);
  });
});
