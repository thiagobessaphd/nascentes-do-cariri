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
  CANCELLED_IMPORTACAO_DEFAULT_MESSAGE,
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

  it('deve cancelar lote pendente preservando TXT no storage e bloquear transições cruzadas CANCELADA <-> CONCLUIDA (CT-BE-15)', async () => {
    const cancelBuffer = buildTxtFileBuffer([
      `-7.280101;-39.380101;Crato;Fonte ${uniqueTag} Cancel 1;Belmonte;2024-09-01;1.15`,
      `-7.280202;-39.380202;Crato;Fonte ${uniqueTag} Cancel 2;Belmonte;2024-09-02;1.25`,
    ]);

    const previewCancel = await validationService.validateAndPreview(
      {
        usuarioId: testUser.id,
        files: [
          {
            filename: 'lote-cancelamento.txt',
            sizeBytes: cancelBuffer.byteLength,
            mimeType: 'text/plain',
            content: cancelBuffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(previewCancel.importacaoId);

    setNascentesInCache('public:nascentes:cancel-check', {
      data: [],
      meta: { total: 2, updated_at: '2026-11-15T00:00:00.000Z' },
    });

    const cancelResult = await commitService.cancelImportacao({
      importacaoId: previewCancel.importacaoId,
      usuarioId: testUser.id,
    });

    expect(cancelResult.importacaoId).toBe(previewCancel.importacaoId);
    expect(cancelResult.status).toBe(StatusImportacao.CANCELADA);
    expect(cancelResult.mensagemErro).toBe(CANCELLED_IMPORTACAO_DEFAULT_MESSAGE);
    expect(Number.isNaN(Date.parse(cancelResult.concluidaAt))).toBe(false);

    const cancelledRow = await prisma.importacao.findUniqueOrThrow({
      where: { id: previewCancel.importacaoId },
    });
    expect(cancelledRow.status).toBe(StatusImportacao.CANCELADA);
    expect(cancelledRow.concluidaAt).toBeInstanceOf(Date);
    expect(cancelledRow.mensagemErro).toBe(CANCELLED_IMPORTACAO_DEFAULT_MESSAGE);

    const insertedOnCancel = await prisma.nascente.count({
      where: { importacaoId: previewCancel.importacaoId },
    });
    expect(insertedOnCancel).toBe(0);

    // Arquivo original preservado para auditoria e cache intacto
    expect(await memoryDriver.exists(cancelledRow.caminhoPrivadoArquivo)).toBe(true);
    expect(getNascentesFromCache('public:nascentes:cancel-check')).toBeDefined();

    // Lote CANCELADA não pode ser confirmado posteriormente
    await expect(
      commitService.confirmImportacao(
        { importacaoId: previewCancel.importacaoId, usuarioId: testUser.id },
        { storageDriver: memoryDriver }
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED,
    });

    // Lote CONCLUIDA também não pode ser cancelado posteriormente
    const concludedBuffer = buildTxtFileBuffer([
      `-7.285101;-39.385101;Barbalha;Fonte ${uniqueTag} Concluded 1;Caldas;2024-09-05;2.10`,
    ]);
    const previewConcluded = await validationService.validateAndPreview(
      {
        usuarioId: testUser.id,
        files: [
          {
            filename: 'lote-concluido.txt',
            sizeBytes: concludedBuffer.byteLength,
            mimeType: 'text/plain',
            content: concludedBuffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(previewConcluded.importacaoId);

    await commitService.confirmImportacao(
      { importacaoId: previewConcluded.importacaoId, usuarioId: testUser.id },
      { storageDriver: memoryDriver }
    );

    await expect(
      commitService.cancelImportacao({
        importacaoId: previewConcluded.importacaoId,
        usuarioId: testUser.id,
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED,
    });
  });

  it('deve resolver corrida paralela entre confirmImportacao e cancelImportacao com exatamente um vencedor atômico', async () => {
    const raceMixBuffer = buildTxtFileBuffer([
      `-7.290101;-39.390101;Juazeiro do Norte;Fonte ${uniqueTag} RaceMix 1;Horto;2024-10-01;0.80`,
      `-7.290202;-39.390202;Juazeiro do Norte;Fonte ${uniqueTag} RaceMix 2;Horto;2024-10-02;0.90`,
    ]);

    const previewRaceMix = await validationService.validateAndPreview(
      {
        usuarioId: testUser.id,
        files: [
          {
            filename: 'lote-race-confirm-vs-cancel.txt',
            sizeBytes: raceMixBuffer.byteLength,
            mimeType: 'text/plain',
            content: raceMixBuffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(previewRaceMix.importacaoId);

    const outcomes = await Promise.allSettled([
      commitService.confirmImportacao(
        { importacaoId: previewRaceMix.importacaoId, usuarioId: testUser.id },
        { storageDriver: memoryDriver }
      ),
      commitService.cancelImportacao({
        importacaoId: previewRaceMix.importacaoId,
        usuarioId: testUser.id,
      }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(AppError);
    expect((rejected[0]?.reason as AppError).code).toBe(
      IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED
    );

    const finalImp = await prisma.importacao.findUniqueOrThrow({
      where: { id: previewRaceMix.importacaoId },
    });
    const persistedCount = await prisma.nascente.count({
      where: { importacaoId: previewRaceMix.importacaoId },
    });

    if (finalImp.status === StatusImportacao.CONCLUIDA) {
      expect(persistedCount).toBe(2);
    } else {
      expect(finalImp.status).toBe(StatusImportacao.CANCELADA);
      expect(persistedCount).toBe(0);
    }
  });

  it('deve aplicar enforcement de ownership (403 IMPORTACAO_OWNERSHIP_FORBIDDEN) em confirmImportacao e cancelImportacao', async () => {
    const ownerBuffer = buildTxtFileBuffer([
      `-7.295101;-39.395101;Crato;Fonte ${uniqueTag} Owner 1;Sitio Fundao;2024-10-10;1.50`,
    ]);

    const previewOwner = await validationService.validateAndPreview(
      {
        usuarioId: testUser.id,
        files: [
          {
            filename: 'lote-ownership.txt',
            sizeBytes: ownerBuffer.byteLength,
            mimeType: 'text/plain',
            content: ownerBuffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(previewOwner.importacaoId);

    const intruderUserId = testUser.id + 99999;

    await expect(
      commitService.confirmImportacao(
        { importacaoId: previewOwner.importacaoId, usuarioId: intruderUserId },
        { storageDriver: memoryDriver }
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_OWNERSHIP_FORBIDDEN,
    });

    await expect(
      commitService.cancelImportacao({
        importacaoId: previewOwner.importacaoId,
        usuarioId: intruderUserId,
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_OWNERSHIP_FORBIDDEN,
    });

    const untouched = await prisma.importacao.findUniqueOrThrow({
      where: { id: previewOwner.importacaoId },
    });
    expect(untouched.status).toBe(StatusImportacao.AGUARDANDO_CONFIRMACAO);
    expect(untouched.concluidaAt).toBeNull();
    expect(
      await prisma.nascente.count({ where: { importacaoId: previewOwner.importacaoId } })
    ).toBe(0);
  });
});
