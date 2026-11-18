/**
 * Nascentes do Cariri — Testes Unitários de QA
 *
 * Módulo: ImportacaoCommitService (Task-26 / US-13)
 * Persistência transacional "tudo-ou-nada", trava de concorrência, deduplicação
 * contra a base, rollback integral em falha, preservação de arquivos/registros
 * prévios e invalidação de cache somente após o commit.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { computeFileSha256 } from '@/lib/storage/crypto';
import { MemoryStorageDriver } from '@/lib/storage/drivers/memory-storage.driver';
import { ImportacaoCommitService } from '@/modules/importacoes/importacoes-commit.service';
import { ImportacaoStorageService } from '@/modules/importacoes/importacoes-storage.service';
import {
  IMPORTACAO_COMMIT_ERROR_CODES,
  StatusImportacao,
  type PrismaTransactionClient,
} from '@/modules/importacoes/importacoes.types';

interface SimulatedImportacaoRow {
  id: number;
  usuarioId: number;
  nomeArquivo: string;
  caminhoPrivadoArquivo: string;
  hashArquivo: string;
  totalLinhas: number;
  totalValidas: number;
  totalInvalidas: number;
  totalDuplicadas: number;
  status: StatusImportacao;
  mensagemErro: string | null;
  createdAt: Date;
  concluidaAt: Date | null;
}

interface SimulatedNascenteRow {
  id: number;
  importacaoId: number;
  latitude: number;
  longitude: number;
  municipio: string;
  fonte: string;
  localidade: string;
  dataCriacao: Date;
  vazaoMedia: number;
  ativo: boolean;
}

const VALID_THREE_ROWS_TXT = [
  'latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media',
  '-7.211111;-39.311111;Crato;Nascente Sítio Fundão;Belmonte;2024-03-15;2.50',
  '-7.222222;-39.322222;Barbalha;Olho DÁgua Arajara;Arajara;2024-04-10;1.80',
  '-7.233333;-39.333333;Juazeiro do Norte;Fonte do Horto;Horto;2024-05-20;0.95',
].join('\n');

describe('QA Unitário — ImportacaoCommitService (Persistência Transacional e Rollback)', () => {
  let memoryDriver: MemoryStorageDriver;
  let storageService: ImportacaoStorageService;
  let importacoesStore: Map<number, SimulatedImportacaoRow>;
  let nascentesStore: SimulatedNascenteRow[];
  let nextNascenteId: number;
  let simulateConcurrentClaimForId: number | null;
  let mockFindUnique: ReturnType<
    typeof vi.fn<({ where }: { where: { id: number } }) => Promise<SimulatedImportacaoRow | null>>
  >;
  let mockTransaction: ReturnType<typeof vi.fn>;
  let mockPrisma: PrismaClient;
  let cacheInvalidatorMock: ReturnType<typeof vi.fn<(importacaoId: number) => void>>;

  async function seedImportacaoWithFile(
    overrides?: Partial<SimulatedImportacaoRow> & {
      rawContent?: string | Buffer;
      skipStorageUpload?: boolean;
    }
  ): Promise<SimulatedImportacaoRow> {
    const rawBuffer =
      overrides?.rawContent !== undefined
        ? typeof overrides.rawContent === 'string'
          ? Buffer.from(overrides.rawContent, 'utf-8')
          : overrides.rawContent
        : Buffer.from(VALID_THREE_ROWS_TXT, 'utf-8');

    const pathname = overrides?.caminhoPrivadoArquivo ?? 'importacoes/2026/11/lote-valido.txt';
    const hash = overrides?.hashArquivo ?? computeFileSha256(rawBuffer);

    const row: SimulatedImportacaoRow = {
      id: overrides?.id ?? 101,
      usuarioId: overrides?.usuarioId ?? 7,
      nomeArquivo: overrides?.nomeArquivo ?? 'lote-valido.txt',
      caminhoPrivadoArquivo: pathname,
      hashArquivo: hash,
      totalLinhas: overrides?.totalLinhas ?? 3,
      totalValidas: overrides?.totalValidas ?? 3,
      totalInvalidas: overrides?.totalInvalidas ?? 0,
      totalDuplicadas: overrides?.totalDuplicadas ?? 0,
      status: overrides?.status ?? StatusImportacao.AGUARDANDO_CONFIRMACAO,
      mensagemErro: overrides?.mensagemErro ?? null,
      createdAt: overrides?.createdAt ?? new Date('2026-11-13T12:00:00.000Z'),
      concluidaAt: overrides?.concluidaAt ?? null,
    };

    importacoesStore.set(row.id, row);

    if (!overrides?.skipStorageUpload) {
      await memoryDriver.upload(rawBuffer, { pathname });
    }

    return row;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    memoryDriver = new MemoryStorageDriver();
    importacoesStore = new Map<number, SimulatedImportacaoRow>();
    nascentesStore = [];
    nextNascenteId = 1;
    simulateConcurrentClaimForId = null;
    cacheInvalidatorMock = vi.fn<(importacaoId: number) => void>();

    mockFindUnique = vi.fn(async ({ where }: { where: { id: number } }) => {
      const found = importacoesStore.get(where.id);
      return found ? { ...found } : null;
    });

    mockTransaction = vi.fn(
      async <T>(callback: (tx: PrismaTransactionClient) => Promise<T>): Promise<T> => {
        if (simulateConcurrentClaimForId !== null) {
          const raceRow = importacoesStore.get(simulateConcurrentClaimForId);
          if (raceRow) {
            importacoesStore.set(simulateConcurrentClaimForId, {
              ...raceRow,
              status: StatusImportacao.PROCESSANDO,
            });
          }
        }

        const snapshotImportacoes = new Map<number, SimulatedImportacaoRow>();
        for (const [k, v] of importacoesStore.entries()) {
          snapshotImportacoes.set(k, { ...v });
        }
        const snapshotNascentes = nascentesStore.map((n) => ({ ...n }));

        const txClient = {
          importacao: {
            updateMany: vi.fn(
              async ({
                where,
                data,
              }: {
                where: { id: number; status: StatusImportacao };
                data: { status: StatusImportacao };
              }) => {
                const current = importacoesStore.get(where.id);
                if (!current || current.status !== where.status) {
                  return { count: 0 };
                }
                importacoesStore.set(where.id, {
                  ...current,
                  status: data.status,
                });
                return { count: 1 };
              }
            ),
            update: vi.fn(
              async ({
                where,
                data,
              }: {
                where: { id: number };
                data: Partial<SimulatedImportacaoRow>;
              }) => {
                const current = importacoesStore.get(where.id);
                if (!current) {
                  throw new Error('Importacao not found inside transaction');
                }
                const updated: SimulatedImportacaoRow = {
                  ...current,
                  ...data,
                };
                importacoesStore.set(where.id, updated);
                return { ...updated };
              }
            ),
          },
          nascente: {
            findMany: vi.fn(async () =>
              nascentesStore.map((n) => ({
                latitude: n.latitude,
                longitude: n.longitude,
                fonte: n.fonte,
              }))
            ),
            create: vi.fn(
              async ({
                data,
              }: {
                data: Omit<SimulatedNascenteRow, 'id'>;
              }) => {
                const created: SimulatedNascenteRow = {
                  id: nextNascenteId++,
                  ...data,
                };
                nascentesStore.push(created);
                return created;
              }
            ),
          },
        } as unknown as PrismaTransactionClient;

        try {
          return await callback(txClient);
        } catch (error) {
          importacoesStore = snapshotImportacoes;
          nascentesStore = snapshotNascentes;
          throw error;
        }
      }
    );

    mockPrisma = {
      importacao: {
        findUnique: mockFindUnique,
      },
      $transaction: mockTransaction,
    } as unknown as PrismaClient;

    storageService = new ImportacaoStorageService({
      storageDriver: memoryDriver,
      prismaClient: mockPrisma,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Validações de Fronteira em Runtime (Schema Zod)
  // ---------------------------------------------------------------------------
  describe('1. Validação de Entrada em Runtime (Zod)', () => {
    it('deve rejeitar importacaoId igual a zero ou negativo com INVALID_IMPORTACAO_INPUT (400)', async () => {
      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      await expect(service.confirmImportacao({ importacaoId: 0 })).rejects.toMatchObject({
        statusCode: 400,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT,
      });

      await expect(service.confirmImportacao({ importacaoId: -10 })).rejects.toMatchObject({
        statusCode: 400,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT,
      });

      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(cacheInvalidatorMock).not.toHaveBeenCalled();
    });

    it('deve rejeitar importacaoId decimal ou usuarioId inválido com INVALID_IMPORTACAO_INPUT (400)', async () => {
      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      await expect(service.confirmImportacao({ importacaoId: 1.5 })).rejects.toMatchObject({
        statusCode: 400,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT,
      });

      await expect(
        service.confirmImportacao({ importacaoId: 10, usuarioId: 0 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Máquina de Estados e Proteção de Concorrência
  // ---------------------------------------------------------------------------
  describe('2. Máquina de Estados e Proteção de Concorrência', () => {
    it('deve rejeitar com 404 IMPORTACAO_NOT_FOUND quando o ID não existir', async () => {
      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      await expect(service.confirmImportacao({ importacaoId: 9999 })).rejects.toMatchObject({
        statusCode: 404,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_NOT_FOUND,
      });

      expect(cacheInvalidatorMock).not.toHaveBeenCalled();
    });

    it('deve rejeitar com 409 IMPORTACAO_ALREADY_PROCESSED quando já estiver CONCLUIDA ou PROCESSANDO', async () => {
      await seedImportacaoWithFile({ id: 201, status: StatusImportacao.CONCLUIDA });
      await seedImportacaoWithFile({ id: 202, status: StatusImportacao.PROCESSANDO });

      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      await expect(service.confirmImportacao({ importacaoId: 201 })).rejects.toMatchObject({
        statusCode: 409,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED,
      });

      await expect(service.confirmImportacao({ importacaoId: 202 })).rejects.toMatchObject({
        statusCode: 409,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED,
      });

      expect(mockTransaction).not.toHaveBeenCalled();
      expect(cacheInvalidatorMock).not.toHaveBeenCalled();
    });

    it('deve rejeitar com 409 INVALID_IMPORTACAO_STATE quando estiver FALHOU, VALIDANDO ou com linhas inválidas', async () => {
      await seedImportacaoWithFile({ id: 203, status: StatusImportacao.FALHOU });
      await seedImportacaoWithFile({ id: 204, status: StatusImportacao.VALIDANDO });
      await seedImportacaoWithFile({
        id: 205,
        status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
        totalInvalidas: 2,
      });

      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      for (const id of [203, 204, 205]) {
        await expect(service.confirmImportacao({ importacaoId: id })).rejects.toMatchObject({
          statusCode: 409,
          code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_STATE,
        });
      }

      expect(mockTransaction).not.toHaveBeenCalled();
      expect(cacheInvalidatorMock).not.toHaveBeenCalled();
    });

    it('deve abortar com 409 IMPORTACAO_ALREADY_PROCESSED se outra requisição concorrente reivindicar a trava na transação', async () => {
      await seedImportacaoWithFile({ id: 206 });
      simulateConcurrentClaimForId = 206;

      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      await expect(service.confirmImportacao({ importacaoId: 206 })).rejects.toMatchObject({
        statusCode: 409,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED,
      });

      expect(nascentesStore).toHaveLength(0);
      expect(cacheInvalidatorMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Integridade Criptográfica e Sintática do Arquivo Original no Storage
  // ---------------------------------------------------------------------------
  describe('3. Verificação de Integridade SHA-256 e Conteúdo TXT', () => {
    it('deve rejeitar com 422 FILE_INTEGRITY_ERROR se o arquivo não existir no storage privado', async () => {
      await seedImportacaoWithFile({ id: 301, skipStorageUpload: true });

      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      await expect(service.confirmImportacao({ importacaoId: 301 })).rejects.toMatchObject({
        statusCode: 422,
        code: IMPORTACAO_COMMIT_ERROR_CODES.FILE_INTEGRITY_ERROR,
      });

      expect(mockTransaction).not.toHaveBeenCalled();
      expect(cacheInvalidatorMock).not.toHaveBeenCalled();
    });

    it('deve rejeitar com 422 FILE_INTEGRITY_ERROR se o hash SHA-256 divergir do registrado no MySQL', async () => {
      const row = await seedImportacaoWithFile({
        id: 302,
        hashArquivo: 'a'.repeat(64),
      });

      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      await expect(service.confirmImportacao({ importacaoId: 302 })).rejects.toMatchObject({
        statusCode: 422,
        code: IMPORTACAO_COMMIT_ERROR_CODES.FILE_INTEGRITY_ERROR,
      });

      expect(nascentesStore).toHaveLength(0);
      expect(await memoryDriver.exists(row.caminhoPrivadoArquivo)).toBe(true);
      expect(cacheInvalidatorMock).not.toHaveBeenCalled();
    });

    it('deve rejeitar com 422 INVALID_IMPORTACAO_CONTENT se o arquivo tiver bytes UTF-8 inválidos', async () => {
      const invalidUtf8Buffer = Buffer.from([0xff, 0xfe, 0xfd]);
      await seedImportacaoWithFile({
        id: 303,
        rawContent: invalidUtf8Buffer,
      });

      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      await expect(service.confirmImportacao({ importacaoId: 303 })).rejects.toMatchObject({
        statusCode: 422,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_CONTENT,
      });

      expect(nascentesStore).toHaveLength(0);
      expect(cacheInvalidatorMock).not.toHaveBeenCalled();
    });

    it('deve rejeitar com 422 INVALID_IMPORTACAO_CONTENT se o re-parse encontrar erro de domínio nas linhas', async () => {
      const badDomainTxt = [
        'latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media',
        '-45.000000;-39.311111;Crato;Fonte Fora do Cariri;Belmonte;2024-03-15;2.50',
      ].join('\n');

      await seedImportacaoWithFile({
        id: 304,
        rawContent: badDomainTxt,
      });

      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      await expect(service.confirmImportacao({ importacaoId: 304 })).rejects.toMatchObject({
        statusCode: 422,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_CONTENT,
      });

      expect(nascentesStore).toHaveLength(0);
      expect(cacheInvalidatorMock).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Confirmação Transacional, Adição Cumulativa e Deduplicação
  // ---------------------------------------------------------------------------
  describe('4. Persistência Transacional, Adição Cumulativa e Deduplicação', () => {
    it('deve inserir todas as novas nascentes com importacaoId, concluir a importação e invalidar o cache pós-commit', async () => {
      await seedImportacaoWithFile({ id: 401 });

      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      const response = await service.confirmImportacao({
        importacaoId: 401,
        usuarioId: 7,
      });

      expect(response.importacaoId).toBe(401);
      expect(response.status).toBe(StatusImportacao.CONCLUIDA);
      expect(response.cacheInvalidated).toBe(true);
      expect(response.summary).toEqual({
        totalLinhas: 3,
        totalInseridas: 3,
        totalDuplicadas: 0,
        totalInvalidas: 0,
      });
      expect(new Date(response.concluidaAt).toISOString()).toBe(response.concluidaAt);
      expect('caminhoPrivadoArquivo' in response).toBe(false);
      expect('storageUrl' in response).toBe(false);

      expect(nascentesStore).toHaveLength(3);
      expect(nascentesStore.every((n) => n.importacaoId === 401 && n.ativo)).toBe(true);

      const updatedImp = importacoesStore.get(401);
      expect(updatedImp?.status).toBe(StatusImportacao.CONCLUIDA);
      expect(updatedImp?.concluidaAt).toBeInstanceOf(Date);
      expect(updatedImp?.totalValidas).toBe(3);

      expect(cacheInvalidatorMock).toHaveBeenCalledTimes(1);
      expect(cacheInvalidatorMock).toHaveBeenCalledWith(401);
    });

    it('deve preservar registros de importações anteriores e ignorar duplicados existentes no banco (inclusive case/accent-insensitive)', async () => {
      nascentesStore.push({
        id: nextNascenteId++,
        importacaoId: 50,
        latitude: -7.211111,
        longitude: -39.311111,
        municipio: 'Crato',
        fonte: 'NASCENTE SITIO FUNDAO',
        localidade: 'Belmonte',
        dataCriacao: new Date('2024-03-15T00:00:00.000Z'),
        vazaoMedia: 2.5,
        ativo: true,
      });

      const txtWithDuplicates = [
        'latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media',
        '-7.211111;-39.311111;Crato;Nascente Sítio Fundão;Belmonte;2024-03-15;2.50',
        '-7.222222;-39.322222;Barbalha;Olho DÁgua Arajara;Arajara;2024-04-10;1.80',
        '-7.222222;-39.322222;Barbalha;olho dagua arajara;Arajara;2024-04-10;1.80',
        '-7.233333;-39.333333;Juazeiro do Norte;Fonte do Horto;Horto;2024-05-20;0.95',
      ].join('\n');

      await seedImportacaoWithFile({
        id: 402,
        rawContent: txtWithDuplicates,
        totalLinhas: 4,
        totalValidas: 2,
        totalDuplicadas: 2,
      });

      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      const response = await service.confirmImportacao({ importacaoId: 402 });

      expect(response.summary).toEqual({
        totalLinhas: 4,
        totalInseridas: 2,
        totalDuplicadas: 2,
        totalInvalidas: 0,
      });

      expect(nascentesStore).toHaveLength(3);
      expect(nascentesStore.filter((n) => n.importacaoId === 50)).toHaveLength(1);
      expect(nascentesStore.filter((n) => n.importacaoId === 402)).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Rollback Forçado no Meio da Operação e Preservação de Cache/Arquivos
  // ---------------------------------------------------------------------------
  describe('5. Rollback Tudo-ou-Nada em Falha no Meio do Lote', () => {
    it('deve reverter todas as inserções parciais, restaurar status da importação, manter arquivos/dados prévios e NÃO invalidar o cache', async () => {
      nascentesStore.push({
        id: nextNascenteId++,
        importacaoId: 10,
        latitude: -7.15,
        longitude: -39.25,
        municipio: 'Missão Velha',
        fonte: 'Nascente Antiga Intacta',
        localidade: 'Cachoeira',
        dataCriacao: new Date('2023-01-10T00:00:00.000Z'),
        vazaoMedia: 4.2,
        ativo: true,
      });

      const row = await seedImportacaoWithFile({ id: 501 });

      const service = new ImportacaoCommitService({
        prismaClient: mockPrisma,
        storageService,
        cacheInvalidator: cacheInvalidatorMock,
      });

      await expect(
        service.confirmImportacao(
          { importacaoId: 501 },
          {
            onAfterRowInsert: ({ insertedCount }) => {
              if (insertedCount === 2) {
                throw new AppError(
                  'Falha forçada após a 2ª inserção',
                  500,
                  IMPORTACAO_COMMIT_ERROR_CODES.TRANSACTION_FAILED
                );
              }
            },
          }
        )
      ).rejects.toThrow('Falha forçada após a 2ª inserção');

      // 1. Nenhuma nascente parcial do lote 501 persistiu
      expect(nascentesStore.filter((n) => n.importacaoId === 501)).toHaveLength(0);

      // 2. Registro anterior (lote 10) permaneceu 100% intacto
      expect(nascentesStore).toHaveLength(1);
      expect(nascentesStore[0]?.importacaoId).toBe(10);

      // 3. Importacao 501 voltou ao estado AGUARDANDO_CONFIRMACAO (sem concluidaAt)
      const revertedImp = importacoesStore.get(501);
      expect(revertedImp?.status).toBe(StatusImportacao.AGUARDANDO_CONFIRMACAO);
      expect(revertedImp?.concluidaAt).toBeNull();

      // 4. Arquivo original no storage permaneceu intacto
      expect(await memoryDriver.exists(row.caminhoPrivadoArquivo)).toBe(true);

      // 5. Cache público NÃO foi invalidado
      expect(cacheInvalidatorMock).not.toHaveBeenCalled();
    });
  });
});
