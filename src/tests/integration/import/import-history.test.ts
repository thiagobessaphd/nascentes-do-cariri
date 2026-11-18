/**
 * Nascentes do Cariri — Teste de Integração Backend
 *
 * Escopo:
 * - Listagem paginada e ordenada (createdAt DESC, id DESC com tie-breaker determinístico) no MySQL real;
 * - Filtro opcional por status e comportamento em página/status sem registros;
 * - Consulta de detalhe para estados CONCLUIDA, FALHOU, CANCELADA e AGUARDANDO_CONFIRMACAO;
 * - Opção A: reconstrução fiel da prévia de lote pendente a partir do storage privado, com
 *   recomputação atualizada de duplicidades no MySQL e verificação de ownership (isOwner);
 * - Omissão estrita de caminhoPrivadoArquivo, storageUrl e passwordHash em todos os payloads.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { MemoryStorageDriver } from '@/lib/storage/drivers/memory-storage.driver';
import {
  DUPLICATE_REASONS,
  IMPORTACAO_COMMIT_ERROR_CODES,
  IMPORTACAO_STATUS_VALUES,
  ImportacaoCommitService,
  ImportacaoHistoryService,
  ImportacaoStorageService,
  ImportacaoValidationService,
  StatusImportacao,
} from '@/modules/importacoes';

function buildTxtFileBuffer(rows: readonly string[]): Buffer {
  const header = 'latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media';
  return Buffer.from([header, ...rows].join('\n'), 'utf-8');
}

function assertNoSensitiveLeakage(payload: unknown, secretPaths: readonly string[], secretHashes: readonly string[]): void {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain('caminhoPrivadoArquivo');
  expect(serialized).not.toContain('caminho_privado_arquivo');
  expect(serialized).not.toContain('storageUrl');
  expect(serialized).not.toContain('passwordHash');
  expect(serialized).not.toContain('password_hash');

  for (const path of secretPaths) {
    expect(serialized).not.toContain(path);
  }
  for (const pwdHash of secretHashes) {
    expect(serialized).not.toContain(pwdHash);
  }
}

describe('US-14 / Task-27 — Consultas Administrativas de Histórico e Detalhe no MySQL', () => {
  const uniqueTag = `HIST_${Date.now()}`;
  const createdImportacaoIds: number[] = [];
  const ownerPwdHash = '$2b$12$history_owner_secret_hash_for_integration';
  const otherPwdHash = '$2b$12$history_other_secret_hash_for_integration';

  let ownerUser: { id: number; nome: string; email: string };
  let otherAdminUser: { id: number; nome: string; email: string };
  let memoryDriver: MemoryStorageDriver;
  let storageService: ImportacaoStorageService;
  let validationService: ImportacaoValidationService;
  let commitService: ImportacaoCommitService;
  let historyService: ImportacaoHistoryService;

  beforeAll(async () => {
    ownerUser = await prisma.usuario.create({
      data: {
        nome: 'Admin Autor Histórico',
        email: `qa_hist_owner_${Date.now()}@ufca.edu.br`,
        passwordHash: ownerPwdHash,
      },
    });
    otherAdminUser = await prisma.usuario.create({
      data: {
        nome: 'Admin Auditor Histórico',
        email: `qa_hist_other_${Date.now()}@ufca.edu.br`,
        passwordHash: otherPwdHash,
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
      cacheInvalidator: () => undefined,
    });
    historyService = new ImportacaoHistoryService({
      prismaClient: prisma,
      storageService,
    });
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

    if (ownerUser || otherAdminUser) {
      await prisma.usuario.deleteMany({
        where: {
          id: {
            in: [ownerUser?.id, otherAdminUser?.id].filter(
              (id): id is number => typeof id === 'number'
            ),
          },
        },
      });
    }
  });

  it('deve listar histórico ordenado por createdAt DESC e id DESC com paginação e filtro por status sem vazar segredos', async () => {
    // Cria 4 registros com datas futuras controladas (incluindo empate em createdAt para validar tie-breaker id DESC)
    const tiedDate = new Date('2099-06-01T10:00:00.000Z');
    const newerDate = new Date('2099-06-01T12:00:00.000Z');
    const newestDate = new Date('2099-06-01T14:00:00.000Z');

    const rowTied1 = await prisma.importacao.create({
      data: {
        usuarioId: ownerUser.id,
        nomeArquivo: `${uniqueTag}-tied-1.txt`,
        caminhoPrivadoArquivo: `importacoes/test/${uniqueTag}-tied-1.txt`,
        hashArquivo: '1'.repeat(64),
        totalLinhas: 2,
        totalValidas: 2,
        totalInvalidas: 0,
        totalDuplicadas: 0,
        status: StatusImportacao.CONCLUIDA,
        createdAt: tiedDate,
        concluidaAt: tiedDate,
      },
    });
    const rowTied2 = await prisma.importacao.create({
      data: {
        usuarioId: otherAdminUser.id,
        nomeArquivo: `${uniqueTag}-tied-2.txt`,
        caminhoPrivadoArquivo: `importacoes/test/${uniqueTag}-tied-2.txt`,
        hashArquivo: '2'.repeat(64),
        totalLinhas: 3,
        totalValidas: 0,
        totalInvalidas: 3,
        totalDuplicadas: 0,
        status: StatusImportacao.FALHOU,
        mensagemErro: 'Erro de validação simulado.',
        createdAt: tiedDate,
      },
    });
    const rowMid = await prisma.importacao.create({
      data: {
        usuarioId: ownerUser.id,
        nomeArquivo: `${uniqueTag}-mid.txt`,
        caminhoPrivadoArquivo: `importacoes/test/${uniqueTag}-mid.txt`,
        hashArquivo: '3'.repeat(64),
        totalLinhas: 1,
        totalValidas: 1,
        totalInvalidas: 0,
        totalDuplicadas: 0,
        status: StatusImportacao.CANCELADA,
        mensagemErro: 'Cancelada pelo administrador.',
        createdAt: newerDate,
        concluidaAt: newerDate,
      },
    });
    const rowTop = await prisma.importacao.create({
      data: {
        usuarioId: ownerUser.id,
        nomeArquivo: `${uniqueTag}-top.txt`,
        caminhoPrivadoArquivo: `importacoes/test/${uniqueTag}-top.txt`,
        hashArquivo: '4'.repeat(64),
        totalLinhas: 5,
        totalValidas: 5,
        totalInvalidas: 0,
        totalDuplicadas: 0,
        status: StatusImportacao.CONCLUIDA,
        createdAt: newestDate,
        concluidaAt: newestDate,
      },
    });

    createdImportacaoIds.push(rowTied1.id, rowTied2.id, rowMid.id, rowTop.id);

    const secretPaths = [
      rowTied1.caminhoPrivadoArquivo,
      rowTied2.caminhoPrivadoArquivo,
      rowMid.caminhoPrivadoArquivo,
      rowTop.caminhoPrivadoArquivo,
    ];

    // Página 1 (tamanho 2) deve trazer rowTop e rowMid no topo
    const page1 = await historyService.listHistory({ page: 1, pageSize: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.data.map((item) => item.id)).toEqual([rowTop.id, rowMid.id]);
    expect(page1.meta.hasPreviousPage).toBe(false);
    expect(page1.meta.hasNextPage).toBe(true);
    expect(page1.meta.totalItems).toBeGreaterThanOrEqual(4);
    assertNoSensitiveLeakage(page1, secretPaths, [ownerPwdHash, otherPwdHash]);

    // Página 2 (tamanho 2) deve desempatar rowTied2 (id maior) antes de rowTied1 (id menor)
    const page2 = await historyService.listHistory({ page: 2, pageSize: 2 });
    expect(page2.data.map((item) => item.id)).toEqual([rowTied2.id, rowTied1.id]);
    expect(page2.meta.hasPreviousPage).toBe(true);
    assertNoSensitiveLeakage(page2, secretPaths, [ownerPwdHash, otherPwdHash]);

    // Filtro por status CANCELADA deve trazer rowMid no topo
    const cancelledList = await historyService.listHistory({
      page: 1,
      pageSize: 10,
      status: StatusImportacao.CANCELADA,
    });
    expect(cancelledList.data[0]?.id).toBe(rowMid.id);
    expect(cancelledList.data.every((item) => item.status === 'CANCELADA')).toBe(true);

    // Página além do limite retorna lista vazia
    const emptyPage = await historyService.listHistory({ page: 99999, pageSize: 20 });
    expect(emptyPage.data).toEqual([]);
    expect(emptyPage.meta.hasNextPage).toBe(false);
    expect(emptyPage.meta.hasPreviousPage).toBe(true);

    // Se houver algum status sem registros no banco, valida resposta vazia para o filtro
    for (const statusValue of IMPORTACAO_STATUS_VALUES) {
      const existingCount = await prisma.importacao.count({ where: { status: statusValue } });
      if (existingCount === 0) {
        const emptyByStatus = await historyService.listHistory({ status: statusValue });
        expect(emptyByStatus.data).toEqual([]);
        expect(emptyByStatus.meta.totalItems).toBe(0);
        expect(emptyByStatus.meta.totalPages).toBe(0);
        break;
      }
    }
  });

  it('deve retornar detalhes completos para CONCLUIDA, FALHOU, CANCELADA, AGUARDANDO_CONFIRMACAO (Opção A) e 404 para inexistente', async () => {
    const secretPaths: string[] = [];

    // 1. Lote CONCLUIDA (2 nascentes inseridas)
    const loteConcluidoBuffer = buildTxtFileBuffer([
      `-7.215101;-39.315101;Crato;Fonte ${uniqueTag} A;Sítio Fundão;2024-03-10;1.50`,
      `-7.225202;-39.325202;Barbalha;Fonte ${uniqueTag} B;Arajara;2024-04-12;2.25`,
    ]);
    const valConcluido = await validationService.validateAndPreview(
      {
        usuarioId: ownerUser.id,
        files: [
          {
            filename: 'concluido.txt',
            sizeBytes: loteConcluidoBuffer.byteLength,
            mimeType: 'text/plain',
            content: loteConcluidoBuffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(valConcluido.importacaoId);
    await commitService.confirmImportacao(
      { importacaoId: valConcluido.importacaoId, usuarioId: ownerUser.id },
      { storageDriver: memoryDriver }
    );

    const dbConcluido = await prisma.importacao.findUniqueOrThrow({
      where: { id: valConcluido.importacaoId },
    });
    secretPaths.push(dbConcluido.caminhoPrivadoArquivo);

    const detailConcluido = await historyService.getById(
      { importacaoId: valConcluido.importacaoId, usuarioId: ownerUser.id },
      { storageDriver: memoryDriver }
    );
    expect(detailConcluido.status).toBe(StatusImportacao.CONCLUIDA);
    expect(detailConcluido.nascentesInseridasCount).toBe(2);
    expect(detailConcluido.concluidaAt).not.toBeNull();
    expect(detailConcluido.preview).toBeNull();
    expect(detailConcluido.isOwner).toBe(true);
    assertNoSensitiveLeakage(detailConcluido, secretPaths, [ownerPwdHash, otherPwdHash]);

    // 2. Lote FALHOU
    const loteFalhoBuffer = buildTxtFileBuffer([
      `-25.000000;-39.315101;Crato;Fonte ${uniqueTag} Falha;Sítio;2024-03-10;-1.0`,
    ]);
    const valFalho = await validationService.validateAndPreview(
      {
        usuarioId: ownerUser.id,
        files: [
          {
            filename: 'falho.txt',
            sizeBytes: loteFalhoBuffer.byteLength,
            mimeType: 'text/plain',
            content: loteFalhoBuffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(valFalho.importacaoId);
    const dbFalho = await prisma.importacao.findUniqueOrThrow({
      where: { id: valFalho.importacaoId },
    });
    secretPaths.push(dbFalho.caminhoPrivadoArquivo);

    const detailFalho = await historyService.getById(
      { importacaoId: valFalho.importacaoId, usuarioId: otherAdminUser.id },
      { storageDriver: memoryDriver }
    );
    expect(detailFalho.status).toBe(StatusImportacao.FALHOU);
    expect(detailFalho.totalInvalidas).toBe(1);
    expect(detailFalho.mensagemErro).toBeTruthy();
    expect(detailFalho.preview).toBeNull();
    expect(detailFalho.isOwner).toBe(false);
    assertNoSensitiveLeakage(detailFalho, secretPaths, [ownerPwdHash, otherPwdHash]);

    // 3. Lote CANCELADA
    const loteCancelBuffer = buildTxtFileBuffer([
      `-7.245404;-39.345404;Crato;Fonte ${uniqueTag} Cancel;Sítio;2024-05-01;1.10`,
    ]);
    const valCancel = await validationService.validateAndPreview(
      {
        usuarioId: ownerUser.id,
        files: [
          {
            filename: 'cancelado.txt',
            sizeBytes: loteCancelBuffer.byteLength,
            mimeType: 'text/plain',
            content: loteCancelBuffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(valCancel.importacaoId);
    await commitService.cancelImportacao({
      importacaoId: valCancel.importacaoId,
      usuarioId: ownerUser.id,
    });
    const dbCancel = await prisma.importacao.findUniqueOrThrow({
      where: { id: valCancel.importacaoId },
    });
    secretPaths.push(dbCancel.caminhoPrivadoArquivo);

    const detailCancel = await historyService.getById(
      { importacaoId: valCancel.importacaoId, usuarioId: ownerUser.id },
      { storageDriver: memoryDriver }
    );
    expect(detailCancel.status).toBe(StatusImportacao.CANCELADA);
    expect(detailCancel.concluidaAt).not.toBeNull();
    expect(detailCancel.mensagemErro).toBeTruthy();
    expect(detailCancel.preview).toBeNull();
    assertNoSensitiveLeakage(detailCancel, secretPaths, [ownerPwdHash, otherPwdHash]);

    // 4. Lote AGUARDANDO_CONFIRMACAO:
    // Contém 1 nascente que já foi inserida no lote CONCLUIDA acima + 1 nascente nova
    const lotePendenteBuffer = buildTxtFileBuffer([
      `-7.215101;-39.315101;Crato;Fonte ${uniqueTag} A;Sítio Fundão;2024-03-10;1.50`,
      `-7.255505;-39.355505;Missão Velha;Fonte ${uniqueTag} NovaPendente;Cachoeira;2024-06-15;3.10`,
    ]);
    const valPendente = await validationService.validateAndPreview(
      {
        usuarioId: ownerUser.id,
        files: [
          {
            filename: 'pendente-op-a.txt',
            sizeBytes: lotePendenteBuffer.byteLength,
            mimeType: 'text/plain',
            content: lotePendenteBuffer,
          },
        ],
      },
      { storageDriver: memoryDriver }
    );
    createdImportacaoIds.push(valPendente.importacaoId);
    const dbPendente = await prisma.importacao.findUniqueOrThrow({
      where: { id: valPendente.importacaoId },
    });
    secretPaths.push(dbPendente.caminhoPrivadoArquivo);

    const detailPendenteOwner = await historyService.getById(
      { importacaoId: valPendente.importacaoId, usuarioId: ownerUser.id },
      { storageDriver: memoryDriver }
    );
    expect(detailPendenteOwner.status).toBe(StatusImportacao.AGUARDANDO_CONFIRMACAO);
    expect(detailPendenteOwner.isOwner).toBe(true);
    expect(detailPendenteOwner.preview).not.toBeNull();
    expect(detailPendenteOwner.preview?.canConfirm).toBe(true);
    expect(detailPendenteOwner.preview?.tamanhoBytes).toBe(lotePendenteBuffer.byteLength);
    expect(detailPendenteOwner.preview?.summary).toEqual({
      totalLinhas: 2,
      totalValidas: 1,
      totalInvalidas: 0,
      totalDuplicadas: 1,
    });
    expect(detailPendenteOwner.preview?.duplicateRows[0]?.reason).toBe(
      DUPLICATE_REASONS.DATABASE
    );
    expect(detailPendenteOwner.preview?.validRows[0]?.data.fonte).toBe(
      `Fonte ${uniqueTag} NovaPendente`
    );
    assertNoSensitiveLeakage(detailPendenteOwner, secretPaths, [ownerPwdHash, otherPwdHash]);

    // Outro admin vendo lote pendente recebe isOwner=false e canConfirm=false na prévia
    const detailPendenteOther = await historyService.getById(
      { importacaoId: valPendente.importacaoId, usuarioId: otherAdminUser.id },
      { storageDriver: memoryDriver }
    );
    expect(detailPendenteOther.isOwner).toBe(false);
    expect(detailPendenteOther.preview).not.toBeNull();
    expect(detailPendenteOther.preview?.canConfirm).toBe(false);
    assertNoSensitiveLeakage(detailPendenteOther, secretPaths, [ownerPwdHash, otherPwdHash]);

    // 5. ID inexistente -> 404 IMPORTACAO_NOT_FOUND
    await expect(
      historyService.getById(
        { importacaoId: 99999999, usuarioId: ownerUser.id },
        { storageDriver: memoryDriver }
      )
    ).rejects.toMatchObject({
      statusCode: 404,
      code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_NOT_FOUND,
    });
  });
});
