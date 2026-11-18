/**
 * Nascentes do Cariri — Cliente HTTP e Formatadores Frontend de Importações
 *
 * Provê o cliente tipado para o endpoint administrativo POST /api/admin/importacoes/validar,
 * além de formatadores puros, lógica de paginação e classificação do estado
 * de prévia para tecnologias assistivas e regras de confirmação.
 */

import { z } from 'zod';
import type {
  DuplicateReason,
  ImportErrorCode,
  ImportRowField,
  ImportacaoCancelResponseDto,
  ImportacaoConfirmResponseDto,
  ImportacaoDetailResponseDto,
  ImportacaoHistoryItemDto,
  ImportacaoHistoryListResponseDto,
  ImportacaoStatus,
  ImportacaoValidationResponseDto,
  TxtParseSummary,
} from '@/modules/importacoes/importacoes.contracts';
import {
  DUPLICATE_REASONS,
  EXPECTED_TXT_HEADER_COLUMNS,
  IMPORTACAO_STATUS_VALUES,
  IMPORT_ERROR_CODES,
  MAX_HISTORY_PAGE_SIZE,
  MAX_UPLOAD_SIZE_BYTES_CLIENT,
  UNIDADE_VAZAO_PADRAO,
} from '@/modules/importacoes/importacoes.contracts';


// CONTRATOS E MODELOS DE ESTADO DO CLIENTE

export interface UploadAndValidateOptions {
  readonly signal?: AbortSignal | undefined;
  readonly authToken?: string | undefined;
}

export type ImportacaoRequestOptions = UploadAndValidateOptions;

export interface FetchImportacoesHistoryParams {
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
  readonly status?: ImportacaoStatus | undefined;
}

export interface FetchImportacaoDetailOptions extends ImportacaoRequestOptions {
  readonly includePreview?: boolean | undefined;
}

/**
 * Erro customizado com metadados para falhas de requisição e validação prévia de upload.
 */
export class ImportacaoClientError extends Error {
  public readonly statusCode?: number | undefined;
  public readonly isNetworkError: boolean;
  public readonly code?: string | undefined;
  public readonly details?: unknown | undefined;

  constructor(
    message: string,
    options?: {
      readonly statusCode?: number | undefined;
      readonly isNetworkError?: boolean;
      readonly code?: string | undefined;
      readonly details?: unknown | undefined;
      readonly cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'ImportacaoClientError';
    this.statusCode = options?.statusCode;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.code = options?.code;
    this.details = options?.details;
  }
}

/**
 * Classificação discriminada do resultado da validação para feedback visual e assistivo.
 */
export type PreviewStateKind = 'valid' | 'invalid' | 'empty';

export type PreviewClassification =
  | {
      readonly kind: 'valid';
      /**
       * Mensagem descritiva do diagnóstico para status visual e aria-live
       */
      readonly message: string;
      /**
       * Indicador booleano estrito se o lote está habilitado para confirmação
       */
      readonly canConfirm: true;
      readonly blockingReason?: undefined;
    }
  | {
      readonly kind: 'invalid' | 'empty';
      /**
       * Mensagem descritiva do diagnóstico para status visual e aria-live
       */
      readonly message: string;
      /**
       * Indicador booleano estrito se o lote está habilitado para confirmação
       */
      readonly canConfirm: false;
      /**
       * Motivo impeditivo obrigatório quando a confirmação não é permitida
       */
      readonly blockingReason: string;
    };

/**
 * Estrutura tipada para resultados de paginação
 */
export interface PaginationResult<T> {
  readonly items: readonly T[];
  readonly currentPage: number;
  readonly totalPages: number;
  readonly totalItems: number;
  readonly pageSize: number;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
}

// LÓGICA PURA DE PRÉVIA E TRAVA DE CONFIRMAÇÃO

/**
 * Dados mínimos necessários para avaliação diagnóstica da prévia de importação.
 */
export interface PreviewValidationInput {
  readonly canConfirm: boolean;
  readonly summary: Pick<
    TxtParseSummary,
    'totalLinhas' | 'totalValidas' | 'totalInvalidas' | 'totalDuplicadas'
  >;
  readonly allErrors: readonly unknown[];
}

/**
 * Avalia se uma importação validada está estritamente apta para confirmação no banco.
 *
 * Critérios cumulativos:
 * 1. dto.canConfirm === true;
 * 2. Total de linhas inválidas === 0;
 * 3. Array de erros impeditivos allErrors vazio;
 * 4. Pelo menos 1 registro novo e válido para inserção (totalValidas > 0).
 */
export function canConfirmImportacao(
  dto: PreviewValidationInput | null | undefined
): boolean {
  if (!dto) {
    return false;
  }

  const hasNoErrors = dto.summary.totalInvalidas === 0 && dto.allErrors.length === 0;
  const hasNewRows = dto.summary.totalValidas > 0;

  return Boolean(dto.canConfirm && hasNoErrors && hasNewRows);
}

/**
 * Deriva a classificação do estado de prévia com semântica de diagnóstico e acessibilidade.
 */
export function derivePreviewState(
  dto: PreviewValidationInput
): PreviewClassification {
  const totalErros = dto.allErrors.length > 0 ? dto.allErrors.length : dto.summary.totalInvalidas;

  // 1. Caso possua erros impeditivos
  if (totalErros > 0 || dto.summary.totalInvalidas > 0) {
    const errorMessage =
      totalErros === 1
        ? 'Validação concluída com falhas. Foi encontrado 1 erro que impede a importação.'
        : `Validação concluída com falhas. Foram encontrados ${totalErros} erros que impedem a importação.`;

    return {
      kind: 'invalid',
      message: errorMessage,
      canConfirm: false,
      blockingReason: 'O arquivo contém linhas ou cabeçalho inválidos. Corrija os erros apontados para prosseguir.',
    };
  }

  // 2. Caso não possua erros, mas não haja linhas válidas novas para importar (ex: todas duplicadas)
  if (dto.summary.totalValidas === 0) {
    const totalDuplicadas = dto.summary.totalDuplicadas;
    const blockingReason =
      totalDuplicadas === 1
        ? 'A única linha do arquivo já está cadastrada na base de dados ou duplicada internamente.'
        : totalDuplicadas > 1
          ? `Todas as ${totalDuplicadas} linhas do arquivo já estão cadastradas na base de dados ou duplicadas internamente.`
          : 'Nenhum registro de nascente válido foi encontrado no arquivo para importação.';

    return {
      kind: 'empty',
      message: 'Nenhum novo registro disponível para inserção.',
      canConfirm: false,
      blockingReason,
    };
  }

  // 3. Salvaguarda caso o servidor bloqueie confirmação sem listar erros explícitos
  if (!dto.canConfirm) {
    return {
      kind: 'invalid',
      message: 'A validação não foi aprovada para confirmação no banco de dados.',
      canConfirm: false,
      blockingReason:
        'A confirmação deste lote foi bloqueada pela validação do servidor.',
    };
  }

  // 4. Caso válido com novos registros prontos para confirmação
  const validMessage =
    dto.summary.totalValidas === 1
      ? 'Arquivo validado com sucesso! 1 nova nascente pronta para confirmação.'
      : `Arquivo validado com sucesso! ${dto.summary.totalValidas} novas nascentes prontas para confirmação.`;

  return {
    kind: 'valid',
    message: validMessage,
    canConfirm: true,
  };
}


// FORMATADORES PUROS E DETERMINÍSTICOS

/**
 * Formata a vazão média sempre acompanhada da unidade oficial 'm³/s'.
 * Utiliza o separador decimal padrão do Brasil (,).
 */
export function formatVazaoMedia(vazaoMedia: number | null | undefined): string {
  if (typeof vazaoMedia !== 'number' || !Number.isFinite(vazaoMedia)) {
    return '0,00 m³/s';
  }

  const formattedNumber = vazaoMedia.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });

  return `${formattedNumber} m³/s`;
}

/**
 * Formata coordenadas cartográficas no padrão [latitude, longitude] com 6 casas decimais.
 */
export function formatCoordinates(latitude: number, longitude: number): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'Coordenadas inválidas';
  }

  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

/**
 * Formata datas civis no padrão AAAA-MM-DD para DD/MM/AAAA sem sofrer distorção de timezone.
 */
export function formatIsoDateToPtBr(dateIso: string | null | undefined): string {
  if (!dateIso || typeof dateIso !== 'string') {
    return 'Data não informada';
  }

  const parts = dateIso.trim().split('-');
  if (parts.length !== 3) {
    return dateIso;
  }

  const [year = '', month = '', day = ''] = parts;
  if (year.length !== 4 || month.length !== 2 || day.length !== 2) {
    return dateIso;
  }

  return `${day}/${month}/${year}`;
}

/**
 * Formata tamanho em bytes para leitura humana (B, KB, MB).
 */
export function formatFileSizeBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    const kb = (bytes / 1024).toFixed(1).replace('.', ',');
    return `${kb} KB`;
  }

  const mb = (bytes / (1024 * 1024)).toFixed(2).replace('.', ',');
  return `${mb} MB`;
}

/**
 * Rótulos descritivos e amigáveis para campos de dados e cabeçalho.
 */
const FIELD_LABEL_MAP: Readonly<Record<string, string>> = {
  latitude: 'Latitude',
  longitude: 'Longitude',
  municipio: 'Município',
  fonte: 'Fonte',
  localidade: 'Localidade',
  data_criacao: 'Data de criação',
  vazao_media: 'Vazão média',
  cabecalho: 'Cabeçalho do arquivo',
  linha: 'Linha',
  arquivo: 'Arquivo',
};

export function formatFieldLabel(field?: ImportRowField | string | undefined): string {
  if (!field) {
    return 'Geral';
  }

  return FIELD_LABEL_MAP[field] ?? field;
}

/**
 * Converte o motivo técnico de duplicidade em texto legível para a tabela de prévia.
 */
export function formatDuplicateReason(reason?: DuplicateReason | string | undefined): string {
  if (reason === DUPLICATE_REASONS.DATABASE) {
    return 'Já cadastrada na base de dados';
  }

  if (reason === DUPLICATE_REASONS.INTERNAL) {
    return 'Duplicada no próprio arquivo';
  }

  return 'Registro duplicado';
}

/**
 * Mapeamento de códigos semânticos de erro para títulos amigáveis em português.
 */
/**
 * Mapeamento exaustivo de códigos semânticos de domínio para títulos amigáveis em português.
 */
const DOMAIN_ERROR_CODE_MAP: Readonly<Record<ImportErrorCode, string>> = {
  REQUIRED_FIELD_EMPTY: 'Campo obrigatório vazio',
  INVALID_COORDINATE: 'Coordenada geográfica inválida',
  OUT_OF_BOUNDS_CARIRI: 'Coordenada fora da macrorregião do Cariri',
  OUT_OF_BOUNDS_GLOBAL: 'Coordenada fora dos limites geográficos mundiais',
  INVALID_DECIMAL_FORMAT: 'Formato decimal inválido (utilize ponto)',
  INVALID_TEXT_LENGTH: 'Tamanho do texto fora do limite permitido',
  INVALID_DATE_FORMAT: 'Formato de data inválido (esperado AAAA-MM-DD)',
  INVALID_CALENDAR_DATE: 'Data inexistente no calendário',
  FUTURE_DATE: 'Data de criação futura não permitida',
  NEGATIVE_FLOW: 'Vazão média negativa não permitida',
  DUPLICATE_ROW_INTERNAL: 'Registro duplicado no próprio arquivo',
  DUPLICATE_ROW_DATABASE: 'Registro já cadastrado na base de dados',
  INVALID_COLUMN_COUNT: 'Quantidade incorreta de colunas',
  INVALID_HEADER: 'Cabeçalho ausente ou incompatível',
  INVALID_ENCODING: 'Codificação de texto incompatível (exige UTF-8)',
  EMPTY_FILE: 'Arquivo vazio',
};

const EXTRA_UPLOAD_ERROR_CODE_MAP: Readonly<Record<string, string>> = {
  INVALID_FLOW_RATE: 'Vazão média numérica inválida',
  NEGATIVE_FLOW_RATE: 'Vazão média negativa não permitida',
  INVALID_FILENAME: 'Extensão de arquivo não permitida (exige .txt)',
  FILE_TOO_LARGE: 'Arquivo excede o limite máximo permitido (5 MB)',
  BINARY_FILE_NOT_ALLOWED: 'Arquivo binário ou corrompido não permitido',
};

const ERROR_CODE_MAP: Readonly<Record<string, string>> = {
  ...DOMAIN_ERROR_CODE_MAP,
  ...EXTRA_UPLOAD_ERROR_CODE_MAP,
};

export function formatErrorCodeLabel(code?: string | undefined): string {
  if (!code) {
    return 'Inconsistência de dados';
  }

  const mapped = ERROR_CODE_MAP[code];
  if (mapped) {
    return mapped;
  }

  // Fallback protetor: impede que códigos em UPPER_SNAKE_CASE vazem diretamente para a UI
  if (/^[A-Z0-9_]+$/.test(code.trim())) {
    return 'Inconsistência nos dados informados';
  }

  return code;
}

// PAGINAÇÃO EM MEMÓRIA O(1) PARA GRANDES VOLUMES DE DADOS

/**
 * Realiza a paginação pura e imutável de arrays em memória.
 */
export function paginateSlice<T>(
  items: readonly T[],
  page: number,
  pageSize = 50
): PaginationResult<T> {
  const safePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.floor(pageSize))
    : 50;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const normalizedPage = Number.isFinite(page) ? Math.floor(page) : 1;
  const safePage = Math.min(Math.max(1, normalizedPage), totalPages);

  const startIndex = (safePage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, totalItems);
  const sliced = items.slice(startIndex, endIndex);

  return {
    items: sliced,
    currentPage: safePage,
    totalPages,
    totalItems,
    pageSize: safePageSize,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  };
}


// VALIDAÇÃO EM TEMPO DE EXECUÇÃO (ZOD) E CLIENTE HTTP

const IMPORT_ROW_FIELD_VALUES = [
  'arquivo',
  'cabecalho',
  'linha',
  ...EXPECTED_TXT_HEADER_COLUMNS,
] as const;

const IMPORT_ERROR_CODE_VALUES = Object.values(IMPORT_ERROR_CODES) as [
  ImportErrorCode,
  ...ImportErrorCode[],
];

const nascenteSerializedSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  municipio: z.string(),
  fonte: z.string(),
  localidade: z.string(),
  dataCriacaoIso: z.string(),
  dataCriacao: z.string(),
  vazaoMedia: z.number().finite(),
  unidadeVazao: z.literal(UNIDADE_VAZAO_PADRAO),
});

const importRowErrorSchema = z.object({
  line: z.number().int().nonnegative(),
  field: z.enum(IMPORT_ROW_FIELD_VALUES),
  code: z.enum(IMPORT_ERROR_CODE_VALUES),
  message: z.string(),
  rawValue: z.string().optional(),
});

const importacaoValidationResponseSchema = z.object({
  importacaoId: z.number().finite().int(),
  nomeArquivo: z.string(),
  hashSha256: z.string(),
  tamanhoBytes: z.number().finite().nonnegative(),
  status: z.enum(IMPORTACAO_STATUS_VALUES),
  canConfirm: z.boolean(),
  summary: z.object({
    totalLinhas: z.number().finite().int().nonnegative(),
    totalValidas: z.number().finite().int().nonnegative(),
    totalInvalidas: z.number().finite().int().nonnegative(),
    totalDuplicadas: z.number().finite().int().nonnegative(),
  }),
  validRows: z.array(
    z.object({
      line: z.number().int().positive(),
      data: nascenteSerializedSchema,
      duplicateKey: z.string(),
    })
  ),
  duplicateRows: z.array(
    z.object({
      line: z.number().int().positive(),
      data: nascenteSerializedSchema,
      duplicateKey: z.string(),
      duplicateOfLine: z.number().int().positive().optional(),
      reason: z.enum([DUPLICATE_REASONS.INTERNAL, DUPLICATE_REASONS.DATABASE]),
    })
  ),
  invalidRows: z.array(
    z.object({
      line: z.number().int().nonnegative(),
      rawContent: z.string(),
      errors: z.array(importRowErrorSchema),
    })
  ),
  allErrors: z.array(importRowErrorSchema),
  createdAt: z.string(),
});

const importacaoConfirmResponseSchema = z.object({
  importacaoId: z.number().finite().int().positive(),
  nomeArquivo: z.string(),
  hashSha256: z.string(),
  status: z.literal('CONCLUIDA'),
  summary: z.object({
    totalLinhas: z.number().finite().int().nonnegative(),
    totalInseridas: z.number().finite().int().nonnegative(),
    totalDuplicadas: z.number().finite().int().nonnegative(),
    totalInvalidas: z.number().finite().int().nonnegative(),
  }),
  cacheInvalidated: z.boolean(),
  concluidaAt: z.string(),
});

const importacaoCancelResponseSchema = z.object({
  importacaoId: z.number().finite().int().positive(),
  nomeArquivo: z.string(),
  hashSha256: z.string(),
  status: z.literal('CANCELADA'),
  mensagemErro: z.string(),
  concluidaAt: z.string(),
});

const importacaoHistoryUserSchema = z
  .object({
    id: z.number().finite().int().positive(),
    nome: z.string(),
    email: z.string(),
  })
  .strict();

const importacaoHistoryItemSchema = z
  .object({
    id: z.number().finite().int().positive(),
    nomeArquivo: z.string(),
    hashSha256: z.string(),
    status: z.enum(IMPORTACAO_STATUS_VALUES),
    totalLinhas: z.number().finite().int().nonnegative(),
    totalValidas: z.number().finite().int().nonnegative(),
    totalInvalidas: z.number().finite().int().nonnegative(),
    totalDuplicadas: z.number().finite().int().nonnegative(),
    mensagemErro: z.string().nullable(),
    createdAt: z.string(),
    concluidaAt: z.string().nullable(),
    usuario: importacaoHistoryUserSchema,
  })
  .strict();

const importacaoHistoryPaginationMetaSchema = z
  .object({
    page: z.number().finite().int().positive(),
    pageSize: z.number().finite().int().positive(),
    totalItems: z.number().finite().int().nonnegative(),
    totalPages: z.number().finite().int().nonnegative(),
    hasPreviousPage: z.boolean(),
    hasNextPage: z.boolean(),
  })
  .strict();

const importacaoHistoryListResponseSchema = z
  .object({
    data: z.array(importacaoHistoryItemSchema),
    meta: importacaoHistoryPaginationMetaSchema,
  })
  .strict();

const importacaoDetailResponseSchema = importacaoHistoryItemSchema
  .extend({
    nascentesInseridasCount: z.number().finite().int().nonnegative(),
    isOwner: z.boolean(),
    preview: importacaoValidationResponseSchema.nullable(),
  })
  .strict();

type ImportacaoHttpOperation = 'validate' | 'confirm' | 'cancel' | 'listHistory' | 'getDetail';

function validateClientImportacaoId(importacaoId: number): number {
  if (
    typeof importacaoId !== 'number' ||
    !Number.isFinite(importacaoId) ||
    !Number.isInteger(importacaoId) ||
    importacaoId <= 0 ||
    !Number.isSafeInteger(importacaoId)
  ) {
    throw new ImportacaoClientError(
      'Identificador da importação inválido. Informe um número inteiro positivo.',
      {
        statusCode: 400,
        code: 'INVALID_IMPORTACAO_INPUT',
      }
    );
  }

  return importacaoId;
}

function resolveHttpStatusFallback(
  status: number,
  operation: ImportacaoHttpOperation = 'validate'
): {
  readonly message: string;
  readonly code?: string | undefined;
} {
  if (status === 401) {
    return {
      message: 'Sessão expirada ou não autorizada. Faça login novamente para continuar.',
      code: 'UNAUTHORIZED',
    };
  }
  if (status === 403) {
    return {
      message: 'Acesso negado. Sua conta de administrador não possui permissão ativa.',
      code: 'FORBIDDEN',
    };
  }
  if (status === 404) {
    return {
      message: 'Registro de importação não encontrado.',
      code: 'IMPORTACAO_NOT_FOUND',
    };
  }
  if (status === 405) {
    return {
      message: 'Método HTTP não permitido.',
      code: 'METHOD_NOT_ALLOWED',
    };
  }
  if (status === 409) {
    return {
      message:
        'Esta importação já foi processada ou não pode realizar esta operação no estado atual.',
      code: 'IMPORTACAO_ALREADY_PROCESSED',
    };
  }
  if (status === 413) {
    return {
      message: 'O arquivo enviado excede o limite máximo permitido (5 MB).',
      code: 'FILE_TOO_LARGE',
    };
  }
  if (status === 422) {
    return {
      message: 'O arquivo original da importação apresentou inconsistência de integridade.',
      code: 'FILE_INTEGRITY_ERROR',
    };
  }
  if (status >= 500) {
    const serverMessages: Record<ImportacaoHttpOperation, string> = {
      validate: 'Erro interno no servidor ao processar o arquivo. Tente novamente mais tarde.',
      confirm: 'Erro interno no servidor ao confirmar a importação. Tente novamente mais tarde.',
      cancel: 'Erro interno no servidor ao cancelar a importação. Tente novamente mais tarde.',
      listHistory:
        'Erro interno no servidor ao carregar o histórico de importações. Tente novamente mais tarde.',
      getDetail:
        'Erro interno no servidor ao carregar os detalhes da importação. Tente novamente mais tarde.',
    };

    return {
      message: serverMessages[operation],
      code: 'INTERNAL_SERVER_ERROR',
    };
  }

  const defaultMessages: Record<ImportacaoHttpOperation, string> = {
    validate: 'Não foi possível validar o arquivo de importação.',
    confirm: 'Não foi possível confirmar a importação no servidor.',
    cancel: 'Não foi possível cancelar a importação no servidor.',
    listHistory: 'Não foi possível carregar o histórico de importações.',
    getDetail: 'Não foi possível carregar os detalhes da importação.',
  };

  return {
    message: defaultMessages[operation],
  };
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function buildImportacaoRequestHeaders(authToken?: string): Headers {
  const headers = new Headers({
    Accept: 'application/json',
  });

  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken.trim()}`);
  }

  return headers;
}

async function parseImportacaoErrorResponse(
  response: Response,
  operation: ImportacaoHttpOperation
): Promise<ImportacaoClientError> {
  const statusFallback = resolveHttpStatusFallback(response.status, operation);
  let errorMessage = statusFallback.message;
  let errorCode = statusFallback.code;
  let errorDetails: unknown | undefined;

  try {
    const errorBody: unknown = await response.json();
    if (typeof errorBody === 'object' && errorBody !== null) {
      const record = errorBody as Record<string, unknown>;
      const nestedError =
        typeof record['error'] === 'object' && record['error'] !== null
          ? (record['error'] as Record<string, unknown>)
          : undefined;

      const parsedMessage =
        readNonEmptyString(record['error']) ??
        readNonEmptyString(nestedError?.['message']);

      if (parsedMessage) {
        errorMessage = parsedMessage;
      }

      const parsedCode =
        readNonEmptyString(record['code']) ??
        readNonEmptyString(nestedError?.['code']);

      if (parsedCode) {
        errorCode = parsedCode;
      }

      if ('details' in record) {
        errorDetails = record['details'];
      }
    }
  } catch {
    // Fallback de status HTTP já aplicado acima em statusFallback
  }

  return new ImportacaoClientError(errorMessage, {
    statusCode: response.status,
    code: errorCode,
    details: errorDetails,
  });
}

async function executeImportacaoRequest<T>(params: {
  readonly url: string;
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly operation: ImportacaoHttpOperation;
  readonly parsePayload: (rawPayload: unknown) =>
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly details: unknown };
  readonly body?: BodyInit | undefined;
  readonly options?: ImportacaoRequestOptions | undefined;
}): Promise<T> {
  const headers = buildImportacaoRequestHeaders(params.options?.authToken);

  const requestInit: RequestInit = {
    method: params.method,
    headers,
    credentials: 'same-origin',
  };

  if (params.body !== undefined) {
    requestInit.body = params.body;
  }

  if (params.options?.signal) {
    requestInit.signal = params.options.signal;
  }

  try {
    const response = await fetch(params.url, requestInit);

    if (!response.ok) {
      throw await parseImportacaoErrorResponse(response, params.operation);
    }

    let rawPayload: unknown;
    try {
      rawPayload = await response.json();
    } catch (parseError: unknown) {
      throw new ImportacaoClientError(
        'Resposta inválida recebida do servidor ao processar a importação.',
        {
          statusCode: response.status,
          code: 'INVALID_SERVER_RESPONSE',
          cause: parseError,
        }
      );
    }

    const parsed = params.parsePayload(rawPayload);
    if (!parsed.success) {
      throw new ImportacaoClientError(
        'Formato inesperado na resposta do servidor. Tente novamente ou contate o suporte.',
        {
          statusCode: response.status,
          code: 'INVALID_SERVER_RESPONSE',
          details: parsed.details,
        }
      );
    }

    return parsed.data;
  } catch (error: unknown) {
    if (error instanceof ImportacaoClientError) {
      throw error;
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name: string }).name === 'AbortError'
    ) {
      throw error;
    }

    throw new ImportacaoClientError(
      'Dificuldade de conexão com o servidor. Verifique sua conexão e tente novamente.',
      {
        isNetworkError: true,
        cause: error,
      }
    );
  }
}

/**
 * Dispara o upload de um arquivo TXT para o endpoint administrativo de validação.
 *
 * @param file Arquivo do tipo File extraído do input de formulário
 * @param options Opções com AbortSignal e token opcional de autenticação
 * @returns Diagnóstico consolidado de validação e prévia
 * @throws ImportacaoClientError com mensagens amigáveis e código de status
 */
export async function uploadAndValidateTxt(
  file: File,
  options?: UploadAndValidateOptions
): Promise<ImportacaoValidationResponseDto> {
  // 1. Validações prévias no cliente (fail-fast antes do upload de rede)
  if (!file) {
    throw new ImportacaoClientError('Nenhum arquivo foi selecionado para envio.', {
      statusCode: 400,
      code: 'NO_FILE_SELECTED',
    });
  }

  const fileName = (file.name || '').trim();
  if (!fileName.toLowerCase().endsWith('.txt')) {
    throw new ImportacaoClientError('Apenas arquivos de texto (.txt) são permitidos.', {
      statusCode: 400,
      code: 'INVALID_FILENAME',
    });
  }

  if (file.size === 0) {
    throw new ImportacaoClientError('O arquivo selecionado está vazio (0 bytes).', {
      statusCode: 400,
      code: 'EMPTY_FILE',
    });
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES_CLIENT) {
    throw new ImportacaoClientError(
      'O arquivo selecionado excede o limite máximo permitido (5 MB).',
      {
        statusCode: 413,
        code: 'FILE_TOO_LARGE',
      }
    );
  }

  // 2. Montagem do payload multipart/form-data
  const formData = new FormData();
  formData.append('arquivo', file, fileName);

  return executeImportacaoRequest<ImportacaoValidationResponseDto>({
    url: '/api/admin/importacoes/validar',
    method: 'POST',
    operation: 'validate',
    body: formData,
    options,
    parsePayload: (rawPayload) => {
      const parsed = importacaoValidationResponseSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return { success: false, details: parsed.error.flatten() };
      }
      const validatedDto: ImportacaoValidationResponseDto = parsed.data;
      return { success: true, data: validatedDto };
    },
  });
}

/**
 * Confirma atomicamente uma importação pendente (status AGUARDANDO_CONFIRMACAO)
 * no endpoint administrativo POST /api/admin/importacoes/[id]/confirmar.
 *
 * @param importacaoId Identificador numérico inteiro positivo da importação
 * @param options Opções com AbortSignal e token opcional de autenticação
 * @returns Resumo quantitativo consolidado e confirmação da invalidação de cache
 * @throws ImportacaoClientError com mensagens amigáveis e código de status
 */
export async function confirmImportacaoById(
  importacaoId: number,
  options?: ImportacaoRequestOptions
): Promise<ImportacaoConfirmResponseDto> {
  const safeId = validateClientImportacaoId(importacaoId);

  return executeImportacaoRequest<ImportacaoConfirmResponseDto>({
    url: `/api/admin/importacoes/${safeId}/confirmar`,
    method: 'POST',
    operation: 'confirm',
    options,
    parsePayload: (rawPayload) => {
      const parsed = importacaoConfirmResponseSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return { success: false, details: parsed.error.flatten() };
      }
      const confirmedDto: ImportacaoConfirmResponseDto = parsed.data;
      return { success: true, data: confirmedDto };
    },
  });
}

/**
 * Cancela atomicamente uma importação pendente (status AGUARDANDO_CONFIRMACAO)
 * no endpoint administrativo DELETE /api/admin/importacoes/[id], preservando o
 * arquivo TXT original no storage privado para auditoria.
 *
 * @param importacaoId Identificador numérico inteiro positivo da importação
 * @param options Opções com AbortSignal e token opcional de autenticação
 * @returns Dados do cancelamento registrado no servidor
 * @throws ImportacaoClientError com mensagens amigáveis e código de status
 */
export async function cancelImportacaoById(
  importacaoId: number,
  options?: ImportacaoRequestOptions
): Promise<ImportacaoCancelResponseDto> {
  const safeId = validateClientImportacaoId(importacaoId);

  return executeImportacaoRequest<ImportacaoCancelResponseDto>({
    url: `/api/admin/importacoes/${safeId}`,
    method: 'DELETE',
    operation: 'cancel',
    options,
    parsePayload: (rawPayload) => {
      const parsed = importacaoCancelResponseSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return { success: false, details: parsed.error.flatten() };
      }
      const cancelledDto: ImportacaoCancelResponseDto = parsed.data;
      return { success: true, data: cancelledDto };
    },
  });
}

function validateAndBuildHistoryQueryUrl(
  params?: FetchImportacoesHistoryParams
): string {
  const searchParams = new URLSearchParams();

  if (params?.page !== undefined) {
    if (
      typeof params.page !== 'number' ||
      !Number.isFinite(params.page) ||
      !Number.isInteger(params.page) ||
      params.page < 1 ||
      !Number.isSafeInteger(params.page)
    ) {
      throw new ImportacaoClientError(
        'Número de página inválido. Informe um número inteiro positivo.',
        {
          statusCode: 400,
          code: 'INVALID_IMPORTACAO_INPUT',
        }
      );
    }
    searchParams.set('page', String(params.page));
  }

  if (params?.pageSize !== undefined) {
    if (
      typeof params.pageSize !== 'number' ||
      !Number.isFinite(params.pageSize) ||
      !Number.isInteger(params.pageSize) ||
      params.pageSize < 1 ||
      params.pageSize > MAX_HISTORY_PAGE_SIZE
    ) {
      throw new ImportacaoClientError(
        `Tamanho de página inválido. Informe um número inteiro entre 1 e ${MAX_HISTORY_PAGE_SIZE}.`,
        {
          statusCode: 400,
          code: 'INVALID_IMPORTACAO_INPUT',
        }
      );
    }
    searchParams.set('pageSize', String(params.pageSize));
  }

  if (params?.status !== undefined) {
    if (!(IMPORTACAO_STATUS_VALUES as readonly string[]).includes(params.status)) {
      throw new ImportacaoClientError(
        'Filtro de status de importação inválido.',
        {
          statusCode: 400,
          code: 'INVALID_IMPORTACAO_INPUT',
        }
      );
    }
    searchParams.set('status', params.status);
  }

  const queryString = searchParams.toString();
  return queryString ? `/api/admin/importacoes?${queryString}` : '/api/admin/importacoes';
}

/**
 * Consulta o histórico paginado de importações no endpoint GET /api/admin/importacoes.
 *
 * @param params Parâmetros opcionais de paginação e filtragem por status
 * @param options Opções com AbortSignal e token opcional de autenticação
 * @returns Envelope paginado com itens de auditoria e metadados de paginação
 * @throws ImportacaoClientError com mensagens amigáveis e código de status
 */
export async function fetchImportacoesHistory(
  params?: FetchImportacoesHistoryParams,
  options?: ImportacaoRequestOptions
): Promise<ImportacaoHistoryListResponseDto> {
  const url = validateAndBuildHistoryQueryUrl(params);

  return executeImportacaoRequest<ImportacaoHistoryListResponseDto>({
    url,
    method: 'GET',
    operation: 'listHistory',
    options,
    parsePayload: (rawPayload) => {
      const parsed = importacaoHistoryListResponseSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return { success: false, details: parsed.error.flatten() };
      }
      const items: readonly ImportacaoHistoryItemDto[] = parsed.data.data;
      const historyListDto: ImportacaoHistoryListResponseDto = {
        data: items,
        meta: parsed.data.meta,
      };
      return { success: true, data: historyListDto };
    },
  });
}

/**
 * Consulta os metadados e eventual prévia reconstruída de uma importação
 * no endpoint GET /api/admin/importacoes/[id].
 *
 * @param importacaoId Identificador numérico inteiro positivo da importação
 * @param options Opções incluindo flag opcional includePreview, AbortSignal e token
 * @returns Detalhes da importação e prévia completa quando aplicável
 * @throws ImportacaoClientError com mensagens amigáveis e código de status
 */
export async function fetchImportacaoDetailById(
  importacaoId: number,
  options?: FetchImportacaoDetailOptions
): Promise<ImportacaoDetailResponseDto> {
  const safeId = validateClientImportacaoId(importacaoId);
  const query =
    options?.includePreview !== undefined
      ? `?includePreview=${options.includePreview ? 'true' : 'false'}`
      : '';

  return executeImportacaoRequest<ImportacaoDetailResponseDto>({
    url: `/api/admin/importacoes/${safeId}${query}`,
    method: 'GET',
    operation: 'getDetail',
    options,
    parsePayload: (rawPayload) => {
      const parsed = importacaoDetailResponseSchema.safeParse(rawPayload);
      if (!parsed.success) {
        return { success: false, details: parsed.error.flatten() };
      }
      const detailDto: ImportacaoDetailResponseDto = parsed.data;
      return { success: true, data: detailDto };
    },
  });
}

// PERSISTÊNCIA TEMPORÁRIA DA PRÉVIA NA SESSÃO

export const IMPORTACAO_PREVIEW_STORAGE_KEY =
  'nascentes_cariri:admin_importacao_preview_v1';

const RECOVERABLE_PREVIEW_STATUSES = new Set<string>([
  'AGUARDANDO_CONFIRMACAO',
  'FALHOU',
]);

function getBrowserSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Salva o DTO da prévia atual em `sessionStorage` para recuperação,
 * apenas enquanto o lote ainda puder ser inspecionado, corrigido ou cancelado.
 */
export function savePreviewSession(dto: ImportacaoValidationResponseDto): void {
  const storage = getBrowserSessionStorage();
  if (!storage || !RECOVERABLE_PREVIEW_STATUSES.has(dto.status)) {
    return;
  }

  try {
    storage.setItem(IMPORTACAO_PREVIEW_STORAGE_KEY, JSON.stringify(dto));
  } catch {
    // QuotaExceededError ou restrição de privacidade não devem interromper o fluxo principal
  }
}

/**
 * Remove a prévia salva da sessão do navegador.
 */
export function clearPreviewSession(): void {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(IMPORTACAO_PREVIEW_STORAGE_KEY);
  } catch {
    // Ignora falhas de acesso ao storage em ambientes restritos
  }
}

/**
 * Recupera e valida com Zod a prévia salva na sessão atual.
 * Limpa automaticamente o armazenamento se os dados estiverem corrompidos ou em estado final.
 */
export function loadPreviewSession(): ImportacaoValidationResponseDto | null {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(IMPORTACAO_PREVIEW_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsedJson: unknown = JSON.parse(raw);
    const validated = importacaoValidationResponseSchema.safeParse(parsedJson);
    if (!validated.success || !RECOVERABLE_PREVIEW_STATUSES.has(validated.data.status)) {
      clearPreviewSession();
      return null;
    }

    const dto: ImportacaoValidationResponseDto = validated.data;
    return dto;
  } catch {
    clearPreviewSession();
    return null;
  }
}
