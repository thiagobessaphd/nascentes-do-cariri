/**
 * Nascentes do Cariri — Testes Unitários de QA
 *
 * Módulo: ImportacaoHistoryService
 * Consultas paginadas do histórico administrativo, detalhe por ID,
 * projeção segura (allowlist LGPD sem caminhoPrivadoArquivo/passwordHash)
 * e reconstrução da prévia a partir do storage privado.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { computeFileSha256 } from '@/lib/storage/crypto';
import { MemoryStorageDriver } from '@/lib/storage/drivers/memory-storage.driver';
import {
  ImportacaoHistoryService,
  parseBooleanQueryFlag,
  parseImportacoesHistorySearchParams,
} from '@/modules/importacoes/importacoes-history.service';
import { ImportacaoStorageService } from '@/modules/importacoes/importacoes-storage.service';
import {
  CANCELLED_IMPORTACAO_DEFAULT_MESSAGE,
  DEFAULT_HISTORY_PAGE,
  DEFAULT_HISTORY_PAGE_SIZE,
  DUPLICATE_REASONS,
  IMPORTACAO_COMMIT_ERROR_CODES,
  MAX_HISTORY_PAGE_SIZE,
  StatusImportacao,
} from '@/modules/importacoes/importacoes.types';

interface MockImportacaoRecord {
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
  usuario: {
    id: number;
    nome: string;
    email: string;
    passwordHash?: string;
    ativo?: boolean;
  };
  _count: {
    nascentes: number;
  };
}

const SAMPLE_PENDING_TXT = [
  'latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media',
  '-7.211111;-39.311111;Crato;Nascente Sítio Fundão;Belmonte;2024-03-15;2.50',
  '-7.222222;-39.322222;Barbalha;Olho DÁgua Arajara;Arajara;2024-04-10;1.80',
].join('\n');

function createMockRecord(overrides?: Partial<MockImportacaoRecord>): MockImportacaoRecord {
  const buffer = Buffer.from(SAMPLE_PENDING_TXT, 'utf-8');
  return {
    id: 10,
    usuarioId: 7,
    nomeArquivo: 'lote-cariri.txt',
    caminhoPrivadoArquivo: 'importacoes/2026/11/secret-lote-cariri.txt',
    hashArquivo: computeFileSha256(buffer),
    totalLinhas: 2,
    totalValidas: 2,
    totalInvalidas: 0,
    totalDuplicadas: 0,
    status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
    mensagemErro: null,
    createdAt: new Date('2026-11-15T18:00:00.000Z'),
    concluidaAt: null,
    usuario: {
      id: 7,
      nome: 'Admin Responsável',
      email: 'admin@ufca.edu.br',
      passwordHash: '$2b$12$secret_hash_should_never_leak',
      ativo: true,
    },
    _count: {
      nascentes: 0,
    },
    ...overrides,
  };
}

describe('QA Unitário — ImportacaoHistoryService e Parsers de Consulta', () => {
  let memoryDriver: MemoryStorageDriver;
  let storageService: ImportacaoStorageService;
  let mockFindMany: ReturnType<typeof vi.fn>;
  let mockCount: ReturnType<typeof vi.fn>;
  let mockFindUnique: ReturnType<typeof vi.fn>;
  let mockNascenteFindMany: ReturnType<typeof vi.fn>;
  let mockPrisma: PrismaClient;
  let historyService: ImportacaoHistoryService;

  beforeEach(() => {
    memoryDriver = new MemoryStorageDriver();
    storageService = new ImportacaoStorageService({
      storageDriver: memoryDriver,
    });

    mockFindMany = vi.fn().mockResolvedValue([]);
    mockCount = vi.fn().mockResolvedValue(0);
    mockFindUnique = vi.fn().mockResolvedValue(null);
    mockNascenteFindMany = vi.fn().mockResolvedValue([]);

    mockPrisma = {
      importacao: {
        findMany: mockFindMany,
        count: mockCount,
        findUnique: mockFindUnique,
      },
      nascente: {
        findMany: mockNascenteFindMany,
      },
    } as unknown as PrismaClient;

    historyService = new ImportacaoHistoryService({
      prismaClient: mockPrisma,
      storageService,
    });
  });

  // 1. Parsers de Query String
  describe('parseImportacoesHistorySearchParams & parseBooleanQueryFlag', () => {
    it('deve aplicar valores padrão quando query string é vazia', () => {
      const parsed = parseImportacoesHistorySearchParams(new URLSearchParams());
      expect(parsed).toEqual({
        page: DEFAULT_HISTORY_PAGE,
        pageSize: DEFAULT_HISTORY_PAGE_SIZE,
      });
    });

    it('deve aceitar page, pageSize, alias limit, precedência de pageSize e status válidos', () => {
      expect(
        parseImportacoesHistorySearchParams(
          new URLSearchParams('page=3&pageSize=15&limit=50&status=CONCLUIDA')
        )
      ).toEqual({
        page: 3,
        pageSize: 15,
        status: 'CONCLUIDA',
      });

      expect(
        parseImportacoesHistorySearchParams(
          new URLSearchParams('page=2&limit=30&status=AGUARDANDO_CONFIRMACAO')
        )
      ).toEqual({
        page: 2,
        pageSize: 30,
        status: 'AGUARDANDO_CONFIRMACAO',
      });
    });

    it.each([
      'page=0',
      'page=-1',
      'page=abc',
      'page=1.5',
      'page=9007199254740993',
      'pageSize=0',
      'pageSize=-5',
      'pageSize=abc',
      `pageSize=${MAX_HISTORY_PAGE_SIZE + 1}`,
      'limit=0',
      `limit=${MAX_HISTORY_PAGE_SIZE + 1}`,
      'status=',
      'status=INVALIDO',
    ])(
      'deve rejeitar query string "%s" com 400 INVALID_IMPORTACAO_INPUT',
      (query) => {
        try {
          parseImportacoesHistorySearchParams(new URLSearchParams(query));
          expect.unreachable('Deveria lançar AppError 400');
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          expect((error as AppError).statusCode).toBe(400);
          expect((error as AppError).code).toBe(
            IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT
          );
        }
      }
    );

    it('deve interpretar parseBooleanQueryFlag corretamente e rejeitar valores inválidos', () => {
      expect(parseBooleanQueryFlag(null, 'includePreview')).toBeUndefined();
      expect(parseBooleanQueryFlag(undefined, 'includePreview')).toBeUndefined();
      expect(parseBooleanQueryFlag('true', 'includePreview')).toBe(true);
      expect(parseBooleanQueryFlag('1', 'includePreview')).toBe(true);
      expect(parseBooleanQueryFlag('TRUE', 'includePreview')).toBe(true);
      expect(parseBooleanQueryFlag('false', 'includePreview')).toBe(false);
      expect(parseBooleanQueryFlag('0', 'includePreview')).toBe(false);

      expect(() => parseBooleanQueryFlag('sim', 'includePreview')).toThrowError(AppError);
      expect(() => parseBooleanQueryFlag('', 'includePreview')).toThrowError(AppError);
    });
  });

  // 2. listHistory
  describe('listHistory', () => {
    it('deve rejeitar entradas inválidas em runtime com 400 INVALID_IMPORTACAO_INPUT', async () => {
      await expect(
        historyService.listHistory({ page: 0 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT,
      });

      await expect(
        historyService.listHistory({ pageSize: MAX_HISTORY_PAGE_SIZE + 1 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT,
      });

      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it('deve retornar histórico vazio com metadados consistentes quando não houver registros', async () => {
      mockFindMany.mockResolvedValueOnce([]);
      mockCount.mockResolvedValueOnce(0);

      const result = await historyService.listHistory();

      expect(result).toEqual({
        data: [],
        meta: {
          page: DEFAULT_HISTORY_PAGE,
          pageSize: DEFAULT_HISTORY_PAGE_SIZE,
          totalItems: 0,
          totalPages: 0,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      });
    });

    it('deve consultar com orderBy [createdAt desc, id desc], skip/take corretos, filtro de status e metadados de paginação', async () => {
      const rowA = createMockRecord({
        id: 22,
        status: StatusImportacao.CONCLUIDA,
        concluidaAt: new Date('2026-11-15T19:00:00.000Z'),
      });
      const rowB = createMockRecord({
        id: 21,
        status: StatusImportacao.CONCLUIDA,
        concluidaAt: new Date('2026-11-15T18:30:00.000Z'),
      });

      mockFindMany.mockResolvedValueOnce([rowA, rowB]);
      mockCount.mockResolvedValueOnce(25);

      const page2 = await historyService.listHistory({
        page: 2,
        pageSize: 2,
        status: StatusImportacao.CONCLUIDA,
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: StatusImportacao.CONCLUIDA },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 2,
          take: 2,
        })
      );
      expect(mockCount).toHaveBeenCalledWith({
        where: { status: StatusImportacao.CONCLUIDA },
      });

      expect(page2.meta).toEqual({
        page: 2,
        pageSize: 2,
        totalItems: 25,
        totalPages: 13,
        hasPreviousPage: true,
        hasNextPage: true,
      });
      expect(page2.data).toHaveLength(2);
      expect(page2.data[0]).toMatchObject({
        id: 22,
        nomeArquivo: 'lote-cariri.txt',
        hashSha256: rowA.hashArquivo,
        status: 'CONCLUIDA',
        createdAt: '2026-11-15T18:00:00.000Z',
        concluidaAt: '2026-11-15T19:00:00.000Z',
        usuario: {
          id: 7,
          nome: 'Admin Responsável',
          email: 'admin@ufca.edu.br',
        },
      });

      // Última página: hasNextPage deve ser false
      mockFindMany.mockResolvedValueOnce([rowB]);
      mockCount.mockResolvedValueOnce(5);
      const lastPage = await historyService.listHistory({ page: 3, pageSize: 2 });
      expect(lastPage.meta).toEqual({
        page: 3,
        pageSize: 2,
        totalItems: 5,
        totalPages: 3,
        hasPreviousPage: true,
        hasNextPage: false,
      });
    });

    it('jamais deve expor caminhoPrivadoArquivo, storageUrl ou passwordHash nos itens listados', async () => {
      const secretRow = createMockRecord({
        caminhoPrivadoArquivo: 'importacoes/2026/11/TOP_SECRET_PATH.txt',
      });
      mockFindMany.mockResolvedValueOnce([secretRow]);
      mockCount.mockResolvedValueOnce(1);

      const result = await historyService.listHistory();
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain('caminhoPrivadoArquivo');
      expect(serialized).not.toContain('TOP_SECRET_PATH');
      expect(serialized).not.toContain('storageUrl');
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('secret_hash_should_never_leak');
      expect('caminhoPrivadoArquivo' in result.data[0]!).toBe(false);
      expect('passwordHash' in result.data[0]!.usuario).toBe(false);
    });
  });

  // 3. getById + Reconstrução de Prévia ()
  describe('getById', () => {
    it('deve rejeitar importacaoId ou usuarioId inválidos com 400 INVALID_IMPORTACAO_INPUT', async () => {
      await expect(
        historyService.getById({ importacaoId: 0 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT,
      });

      await expect(
        historyService.getById({ importacaoId: 10, usuarioId: -1 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT,
      });

      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it('deve lançar 404 IMPORTACAO_NOT_FOUND quando a importação não existir', async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      await expect(
        historyService.getById({ importacaoId: 9999, usuarioId: 7 })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_NOT_FOUND,
      });
    });

    it.each([
      { status: StatusImportacao.CONCLUIDA, concluidaAt: new Date('2026-11-15T18:10:00.000Z'), mensagemErro: null, nascentesCount: 2 },
      { status: StatusImportacao.FALHOU, concluidaAt: null, mensagemErro: 'Arquivo rejeitado com 1 inconsistência.', nascentesCount: 0 },
      { status: StatusImportacao.CANCELADA, concluidaAt: new Date('2026-11-15T18:15:00.000Z'), mensagemErro: CANCELLED_IMPORTACAO_DEFAULT_MESSAGE, nascentesCount: 0 },
      { status: StatusImportacao.VALIDANDO, concluidaAt: null, mensagemErro: null, nascentesCount: 0 },
      { status: StatusImportacao.PROCESSANDO, concluidaAt: null, mensagemErro: null, nascentesCount: 0 },
    ])(
      'deve retornar metadados completos com preview=null e sem ler storage para status $status',
      async ({ status, concluidaAt, mensagemErro, nascentesCount }) => {
        const record = createMockRecord({
          id: 44,
          usuarioId: 7,
          status,
          concluidaAt,
          mensagemErro,
          _count: { nascentes: nascentesCount },
        });
        mockFindUnique.mockResolvedValueOnce(record);

        const downloadSpy = vi.spyOn(memoryDriver, 'download');
        const detail = await historyService.getById({ importacaoId: 44, usuarioId: 99 });

        expect(downloadSpy).not.toHaveBeenCalled();
        expect(detail).toMatchObject({
          id: 44,
          status,
          nascentesInseridasCount: nascentesCount,
          isOwner: false,
          preview: null,
          mensagemErro,
        });
        const serialized = JSON.stringify(detail);
        expect(serialized).not.toContain('caminhoPrivadoArquivo');
        expect(serialized).not.toContain('passwordHash');
      }
    );

    it('deve reconstruir preview completo de AGUARDANDO_CONFIRMACAO com deduplicação atualizada e isOwner', async () => {
      const buffer = Buffer.from(SAMPLE_PENDING_TXT, 'utf-8');
      const pathname = 'importacoes/2026/11/pending-op-a.txt';
      await memoryDriver.upload(buffer, {
        pathname,
        contentType: 'text/plain; charset=utf-8',
        isPrivate: true,
      });

      const record = createMockRecord({
        id: 55,
        usuarioId: 7,
        caminhoPrivadoArquivo: pathname,
        hashArquivo: computeFileSha256(buffer),
        status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
      });

      // Simula que uma das nascentes já foi cadastrada no banco por outro lote
      mockNascenteFindMany.mockResolvedValue([
        {
          latitude: -7.211111,
          longitude: -39.311111,
          fonte: 'Nascente Sítio Fundão',
        },
      ]);

      mockFindUnique.mockResolvedValueOnce(record);
      const ownerDetail = await historyService.getById({ importacaoId: 55, usuarioId: 7 });

      expect(ownerDetail.isOwner).toBe(true);
      expect(ownerDetail.preview).not.toBeNull();
      expect(ownerDetail.preview).toMatchObject({
        importacaoId: 55,
        nomeArquivo: 'lote-cariri.txt',
        hashSha256: record.hashArquivo,
        tamanhoBytes: buffer.byteLength,
        status: 'AGUARDANDO_CONFIRMACAO',
        canConfirm: true,
        summary: {
          totalLinhas: 2,
          totalValidas: 1,
          totalInvalidas: 0,
          totalDuplicadas: 1,
        },
      });
      expect(ownerDetail.preview?.duplicateRows[0]?.reason).toBe(DUPLICATE_REASONS.DATABASE);
      expect(ownerDetail.preview?.validRows[0]?.data.dataCriacao).toBe('2024-04-10T00:00:00.000Z');

      // Outro administrador visualizando o detalhe vê a prévia mas com isOwner=false e canConfirm=false
      mockFindUnique.mockResolvedValueOnce(record);
      const otherAdminDetail = await historyService.getById({ importacaoId: 55, usuarioId: 99 });
      expect(otherAdminDetail.isOwner).toBe(false);
      expect(otherAdminDetail.preview).not.toBeNull();
      expect(otherAdminDetail.preview?.canConfirm).toBe(false);
    });

    it('deve respeitar requirePreview=false sem acessar storage em AGUARDANDO_CONFIRMACAO', async () => {
      const record = createMockRecord({
        id: 56,
        status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
      });
      mockFindUnique.mockResolvedValueOnce(record);
      const downloadSpy = vi.spyOn(memoryDriver, 'download');

      const detail = await historyService.getById({
        importacaoId: 56,
        usuarioId: 7,
        requirePreview: false,
      });

      expect(downloadSpy).not.toHaveBeenCalled();
      expect(detail.preview).toBeNull();
    });

    it('deve degradar para preview=null se arquivo não existir e requirePreview não for true; ou lançar 422 quando requirePreview=true', async () => {
      const record = createMockRecord({
        id: 57,
        caminhoPrivadoArquivo: 'importacoes/2026/11/missing.txt',
        status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
      });

      mockFindUnique.mockResolvedValueOnce(record);
      const graceful = await historyService.getById({ importacaoId: 57, usuarioId: 7 });
      expect(graceful.preview).toBeNull();
      expect(graceful.id).toBe(57);

      mockFindUnique.mockResolvedValueOnce(record);
      await expect(
        historyService.getById({
          importacaoId: 57,
          usuarioId: 7,
          requirePreview: true,
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        code: IMPORTACAO_COMMIT_ERROR_CODES.FILE_INTEGRITY_ERROR,
      });
    });

    it('deve lançar 422 FILE_INTEGRITY_ERROR quando o hash SHA-256 divergir do armazenado', async () => {
      const buffer = Buffer.from(SAMPLE_PENDING_TXT, 'utf-8');
      const pathname = 'importacoes/2026/11/tampered.txt';
      await memoryDriver.upload(buffer, {
        pathname,
        contentType: 'text/plain; charset=utf-8',
        isPrivate: true,
      });

      const record = createMockRecord({
        id: 58,
        caminhoPrivadoArquivo: pathname,
        hashArquivo: 'f'.repeat(64),
        status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
      });
      mockFindUnique.mockResolvedValueOnce(record);

      await expect(
        historyService.getById({ importacaoId: 58, usuarioId: 7 })
      ).rejects.toMatchObject({
        statusCode: 422,
        code: IMPORTACAO_COMMIT_ERROR_CODES.FILE_INTEGRITY_ERROR,
      });
    });

    it('deve lançar 422 INVALID_IMPORTACAO_CONTENT quando o TXT armazenado contiver UTF-8 inválido', async () => {
      const invalidUtf8 = Buffer.from([0xff, 0xfe, 0xfd]);
      const pathname = 'importacoes/2026/11/invalid-utf8.txt';
      await memoryDriver.upload(invalidUtf8, {
        pathname,
        contentType: 'text/plain; charset=utf-8',
        isPrivate: true,
      });

      const record = createMockRecord({
        id: 59,
        caminhoPrivadoArquivo: pathname,
        hashArquivo: computeFileSha256(invalidUtf8),
        status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
      });
      mockFindUnique.mockResolvedValueOnce(record);

      await expect(
        historyService.getById({ importacaoId: 59, usuarioId: 7 })
      ).rejects.toMatchObject({
        statusCode: 422,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_CONTENT,
      });
    });
  });
});
