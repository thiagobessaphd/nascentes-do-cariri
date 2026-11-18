/**
 * Nascentes do Cariri - Serviço de Consultas Administrativas do Histórico de Importações
 *
 * Responsável por prover listagem paginada e detalhe auditável das importações:
 * 1. Valida parâmetros de consulta e paginação em runtime via Zod;
 * 2. Aplica projeção estrita (allowlist) no Prisma impedindo vazamento de caminhoPrivadoArquivo e passwordHash;
 * 3. Ordena deterministicamente por createdAt DESC, id DESC usando os índices existentes;
 * 4. No detalhe de lotes pendentes (AGUARDANDO_CONFIRMACAO), reconstrói a prévia completa a partir
 *    do TXT original no storage privado com conferência criptográfica SHA-256 e deduplicação atualizada.
 */

import { Prisma, StatusImportacao, type PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { StorageFileNotFoundError, verifyFileIntegrity } from '@/lib/storage';
import { importacaoStorageService as defaultImportacaoStorageService } from './importacoes-storage.service';
import {
  buildNascenteDuplicateKey,
  decodeTxtContent,
  parseNascentesTxt,
} from './txt-parser';
import {
  IMPORTACAO_COMMIT_ERROR_CODES,
  IMPORTACAO_STATUS_VALUES,
  getImportacaoDetailInputSchema,
  listImportacoesHistoryQuerySchema,
  type GetImportacaoDetailInput,
  type GetImportacaoDetailOptions,
  type IImportacaoHistoryService,
  type IImportacaoStorageService,
  type ImportacaoDetailResponseDto,
  type ImportacaoHistoryItemDto,
  type ImportacaoHistoryListResponseDto,
  type ImportacaoHistoryServiceDeps,
  type ImportacaoStatus,
  type ImportacaoValidationResponseDto,
  type ListImportacoesHistoryInput,
  type ListImportacoesHistoryQuery,
} from './importacoes.types';

const STRICT_POSITIVE_INT_REGEX = /^[1-9]\d*$/;

/**
 * Projeção explícita segura para listagem de histórico.
 */
const IMPORTACAO_HISTORY_SELECT = {
  id: true,
  usuarioId: true,
  nomeArquivo: true,
  hashArquivo: true,
  totalLinhas: true,
  totalValidas: true,
  totalInvalidas: true,
  totalDuplicadas: true,
  status: true,
  mensagemErro: true,
  createdAt: true,
  concluidaAt: true,
  usuario: {
    select: {
      id: true,
      nome: true,
      email: true,
    },
  },
} satisfies Prisma.ImportacaoSelect;

/**
 * Projeção explícita de detalhe administrativo.
 * Inclui caminhoPrivadoArquivo exclusivamente na camada interna de serviço para leitura no storage.
 */
const IMPORTACAO_DETAIL_SELECT = {
  ...IMPORTACAO_HISTORY_SELECT,
  caminhoPrivadoArquivo: true,
  _count: {
    select: {
      nascentes: true,
    },
  },
} satisfies Prisma.ImportacaoSelect;

type ImportacaoHistoryRow = Prisma.ImportacaoGetPayload<{
  select: typeof IMPORTACAO_HISTORY_SELECT;
}>;

type ImportacaoDetailRow = Prisma.ImportacaoGetPayload<{
  select: typeof IMPORTACAO_DETAIL_SELECT;
}>;

function parsePositiveIntQueryParam(rawValue: string, paramName: string): number {
  const trimmed = rawValue.trim();
  if (!STRICT_POSITIVE_INT_REGEX.test(trimmed)) {
    throw new AppError(
      `O parâmetro '${paramName}' deve ser um número inteiro positivo.`,
      400,
      IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT
    );
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AppError(
      `O parâmetro '${paramName}' está fora do intervalo inteiro seguro.`,
      400,
      IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT
    );
  }

  return parsed;
}

/**
 * Converte e valida estritamente os query params de GET /api/admin/importacoes.
 */
export function parseImportacoesHistorySearchParams(
  searchParams: URLSearchParams
): ListImportacoesHistoryQuery {
  const rawPage = searchParams.get('page');
  const rawPageSize = searchParams.get('pageSize') ?? searchParams.get('limit');
  const rawStatus = searchParams.get('status');

  const candidate: {
    page?: number;
    pageSize?: number;
    status?: ImportacaoStatus;
  } = {};

  if (rawPage !== null) {
    candidate.page = parsePositiveIntQueryParam(rawPage, 'page');
  }

  if (rawPageSize !== null) {
    const paramLabel = searchParams.get('pageSize') !== null ? 'pageSize' : 'limit';
    candidate.pageSize = parsePositiveIntQueryParam(rawPageSize, paramLabel);
  }

  if (rawStatus !== null) {
    const trimmedStatus = rawStatus.trim();
    if (!(IMPORTACAO_STATUS_VALUES as readonly string[]).includes(trimmedStatus)) {
      throw new AppError(
        `O parâmetro 'status' informado é inválido: '${trimmedStatus}'.`,
        400,
        IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT
      );
    }
    candidate.status = trimmedStatus as ImportacaoStatus;
  }

  const parsed = listImportacoesHistoryQuerySchema.safeParse(candidate);
  if (!parsed.success) {
    throw new AppError(
      parsed.error.issues[0]?.message ?? 'Parâmetros inválidos para consulta de histórico.',
      400,
      IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT
    );
  }

  return {
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
  };
}

/**
 * Interpreta estritamente um parâmetro booleano opcional de query string ('true'|'1'|'false'|'0').
 */
export function parseBooleanQueryFlag(
  rawValue: string | null | undefined,
  paramName = 'flag'
): boolean | undefined {
  if (rawValue === null || rawValue === undefined) {
    return undefined;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  throw new AppError(
    `O parâmetro '${paramName}' deve ser um valor booleano (true ou false).`,
    400,
    IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT
  );
}

/**
 * Mapeia uma linha do Prisma para o DTO seguro de item do histórico via allowlist explícita.
 */
function toHistoryItemDto(row: ImportacaoHistoryRow): ImportacaoHistoryItemDto {
  return {
    id: row.id,
    nomeArquivo: row.nomeArquivo,
    hashSha256: row.hashArquivo,
    status: row.status,
    totalLinhas: row.totalLinhas,
    totalValidas: row.totalValidas,
    totalInvalidas: row.totalInvalidas,
    totalDuplicadas: row.totalDuplicadas,
    mensagemErro: row.mensagemErro,
    createdAt: row.createdAt.toISOString(),
    concluidaAt: row.concluidaAt ? row.concluidaAt.toISOString() : null,
    usuario: {
      id: row.usuario.id,
      nome: row.usuario.nome,
      email: row.usuario.email,
    },
  };
}

export class ImportacaoHistoryService implements IImportacaoHistoryService {
  private readonly prisma: PrismaClient;
  private readonly storageService: IImportacaoStorageService;

  constructor(deps?: ImportacaoHistoryServiceDeps) {
    this.prisma = deps?.prismaClient ?? defaultPrisma;
    this.storageService = deps?.storageService ?? defaultImportacaoStorageService;
  }

  /**
   * Lista as importações de forma paginada e ordenada deterministicamente (mais recentes primeiro).
   */
  async listHistory(
    input?: ListImportacoesHistoryInput
  ): Promise<ImportacaoHistoryListResponseDto> {
    const parsedInput = listImportacoesHistoryQuerySchema.safeParse(input ?? {});
    if (!parsedInput.success) {
      throw new AppError(
        parsedInput.error.issues[0]?.message ?? 'Parâmetros inválidos para listar o histórico.',
        400,
        IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT
      );
    }

    const { page, pageSize, status } = parsedInput.data;
    const where: Prisma.ImportacaoWhereInput = status !== undefined ? { status } : {};
    const skip = (page - 1) * pageSize;

    const [rows, totalItems] = await Promise.all([
      this.prisma.importacao.findMany({
        where,
        select: IMPORTACAO_HISTORY_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.importacao.count({ where }),
    ]);

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    return {
      data: rows.map(toHistoryItemDto),
      meta: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: totalPages > 0 && page < totalPages,
      },
    };
  }

  /**
   * Consulta o detalhe de uma importação pelo identificador, reconstruindo a prévia completa
   * quando o lote estiver em AGUARDANDO_CONFIRMACAO.
   */
  async getById(
    input: GetImportacaoDetailInput,
    options?: GetImportacaoDetailOptions
  ): Promise<ImportacaoDetailResponseDto> {
    const parsedInput = getImportacaoDetailInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new AppError(
        parsedInput.error.issues[0]?.message ?? 'Parâmetros inválidos para consultar importação.',
        400,
        IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT
      );
    }

    const { importacaoId, usuarioId, requirePreview } = parsedInput.data;

    const row = await this.prisma.importacao.findUnique({
      where: { id: importacaoId },
      select: IMPORTACAO_DETAIL_SELECT,
    });

    if (!row) {
      throw new AppError(
        `Importação com ID ${importacaoId} não foi encontrada.`,
        404,
        IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_NOT_FOUND
      );
    }

    const isOwner = usuarioId !== undefined ? row.usuarioId === usuarioId : true;
    const nascentesInseridasCount = row._count.nascentes;

    const shouldReconstructPreview =
      row.status === StatusImportacao.AGUARDANDO_CONFIRMACAO && requirePreview !== false;

    const preview = shouldReconstructPreview
      ? await this.reconstructPreviewForPendingImportacao(
          row,
          isOwner,
          requirePreview,
          options
        )
      : null;

    return {
      ...toHistoryItemDto(row),
      nascentesInseridasCount,
      isOwner,
      preview,
    };
  }

  /**
   * Carrega as chaves de duplicidade das nascentes ativas existentes no MySQL.
   */
  private async loadExistingDuplicateKeys(): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.nascente.findMany({
      where: { ativo: true },
      select: {
        latitude: true,
        longitude: true,
        fonte: true,
      },
    });

    const keys = new Set<string>();
    for (const row of rows) {
      keys.add(
        buildNascenteDuplicateKey(
          Number(row.latitude),
          Number(row.longitude),
          row.fonte
        )
      );
    }

    return keys;
  }

  /**
   * Recupera o TXT original do storage privado, valida o SHA-256, decodifica UTF-8 e
   * reexecuta o parser contra o estado atual do banco para compor o DTO de prévia.
   */
  private async reconstructPreviewForPendingImportacao(
    row: ImportacaoDetailRow,
    isOwner: boolean,
    requirePreview: boolean | undefined,
    options?: GetImportacaoDetailOptions
  ): Promise<ImportacaoValidationResponseDto | null> {
    let rawBuffer: Buffer;
    try {
      rawBuffer = await this.storageService.retrieveOriginalFile(
        row.caminhoPrivadoArquivo,
        { storageDriver: options?.storageDriver }
      );
    } catch (error: unknown) {
      if (error instanceof StorageFileNotFoundError && requirePreview !== true) {
        logger.warn(
          'Arquivo TXT original não encontrado no storage durante consulta de detalhe; retornando preview nulo.',
          { importacaoId: row.id }
        );
        return null;
      }

      logger.error(
        'Falha ao recuperar arquivo TXT original no storage privado para reconstrução de prévia.',
        error,
        { importacaoId: row.id }
      );

      throw new AppError(
        'Não foi possível recuperar o arquivo TXT original para reconstruir a prévia da importação.',
        422,
        IMPORTACAO_COMMIT_ERROR_CODES.FILE_INTEGRITY_ERROR
      );
    }

    const integrity = verifyFileIntegrity(rawBuffer, row.hashArquivo);
    if (!integrity.valid) {
      throw new AppError(
        'A integridade do arquivo TXT original não confere com o hash SHA-256 registrado.',
        422,
        IMPORTACAO_COMMIT_ERROR_CODES.FILE_INTEGRITY_ERROR
      );
    }

    let textContent: string;
    try {
      textContent = decodeTxtContent(rawBuffer);
    } catch {
      throw new AppError(
        'O arquivo TXT armazenado não possui codificação UTF-8 válida.',
        422,
        IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_CONTENT
      );
    }

    const existingKeys = await this.loadExistingDuplicateKeys();
    const parseResult = parseNascentesTxt(textContent, { existingKeys });

    const serializedValidRows = parseResult.validRows.map((item) => ({
      ...item,
      data: {
        ...item.data,
        dataCriacao: item.data.dataCriacao.toISOString(),
      },
    }));

    const serializedDuplicateRows = parseResult.duplicateRows.map((item) => ({
      ...item,
      data: {
        ...item.data,
        dataCriacao: item.data.dataCriacao.toISOString(),
      },
    }));

    return {
      importacaoId: row.id,
      nomeArquivo: row.nomeArquivo,
      hashSha256: row.hashArquivo,
      tamanhoBytes: rawBuffer.byteLength,
      status: row.status,
      canConfirm: isOwner && parseResult.canConfirm,
      summary: parseResult.summary,
      validRows: serializedValidRows,
      duplicateRows: serializedDuplicateRows,
      invalidRows: parseResult.invalidRows,
      allErrors: parseResult.allErrors,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export const importacaoHistoryService = new ImportacaoHistoryService();
