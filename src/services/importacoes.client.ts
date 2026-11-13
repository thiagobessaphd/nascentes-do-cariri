/**
 * Nascentes do Cariri — Cliente HTTP e Formatadores Frontend de Importações
 *
 * Provê o cliente tipado para o endpoint administrativo POST /api/admin/importacoes/validar,
 * além de formatadores puros, lógica de paginação e classificação do estado
 * de prévia para tecnologias assistivas e regras de confirmação.
 */

import type {
  DuplicateReason,
  ImportRowField,
  ImportacaoValidationResponseDto,
  TxtParseSummary,
} from '@/modules/importacoes/importacoes.types';
import { DUPLICATE_REASONS } from '@/modules/importacoes/importacoes.types';


// CONTRATOS E MODELOS DE ESTADO DO CLIENTE

export interface UploadAndValidateOptions {
  readonly signal?: AbortSignal | undefined;
  readonly authToken?: string | undefined;
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

export interface PreviewClassification {
  readonly kind: PreviewStateKind;
  /**
   * Mensagem descritiva do diagnóstico para status visual e aria-live
   */
  readonly message: string;
  /**
   * Indicador booleano estrito se o lote está habilitado para confirmação
   */
  readonly canConfirm: boolean;
  /**
   * Motivo impeditivo caso a confirmação não seja permitida
   */
  readonly blockingReason?: string | undefined;
}

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

  // 3. Caso válido com novos registros prontos para confirmação
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
    maximumFractionDigits: 2,
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
const ERROR_CODE_MAP: Readonly<Record<string, string>> = {
  REQUIRED_FIELD_EMPTY: 'Campo obrigatório vazio',
  INVALID_COORDINATE: 'Coordenada geográfica inválida',
  OUT_OF_BOUNDS_CARIRI: 'Coordenada fora da macrorregião do Cariri',
  OUT_OF_BOUNDS_GLOBAL: 'Coordenada fora dos limites geográficos mundiais',
  INVALID_DECIMAL_FORMAT: 'Formato decimal inválido (utilize ponto)',
  INVALID_TEXT_LENGTH: 'Tamanho do texto fora do limite permitido',
  INVALID_DATE_FORMAT: 'Formato de data inválido (esperado AAAA-MM-DD)',
  INVALID_CALENDAR_DATE: 'Data inexistente no calendário',
  FUTURE_DATE: 'Data de criação futura não permitida',
  INVALID_FLOW_RATE: 'Vazão média numérica inválida',
  NEGATIVE_FLOW: 'Vazão média negativa não permitida',
  NEGATIVE_FLOW_RATE: 'Vazão média negativa não permitida',
  DUPLICATE_ROW_INTERNAL: 'Registro duplicado no próprio arquivo',
  DUPLICATE_ROW_DATABASE: 'Registro já cadastrado na base de dados',
  INVALID_COLUMN_COUNT: 'Quantidade incorreta de colunas',
  INVALID_HEADER: 'Cabeçalho ausente ou incompatível',
  INVALID_ENCODING: 'Codificação de texto incompatível (exige UTF-8)',
  INVALID_FILENAME: 'Extensão de arquivo não permitida (exige .txt)',
  EMPTY_FILE: 'Arquivo vazio',
  FILE_TOO_LARGE: 'Arquivo excede o limite máximo permitido (5 MB)',
  BINARY_FILE_NOT_ALLOWED: 'Arquivo binário ou corrompido não permitido',
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
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page)), totalPages);

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


// CLIENTE HTTP PARA ENVIO E VALIDAÇÃO PRELIMINAR

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

  // 2. Montagem do payload multipart/form-data
  const formData = new FormData();
  formData.append('arquivo', file, fileName);

  const headers = new Headers({
    Accept: 'application/json',
  });

  if (options?.authToken) {
    headers.set('Authorization', `Bearer ${options.authToken.trim()}`);
  }

  const requestInit: RequestInit = {
    method: 'POST',
    body: formData,
    headers,
  };

  if (options?.signal) {
    requestInit.signal = options.signal;
  }

  try {
    const response = await fetch('/api/admin/importacoes/validar', requestInit);

    if (!response.ok) {
      let errorMessage = 'Não foi possível validar o arquivo de importação.';
      let errorCode: string | undefined;
      let errorDetails: unknown | undefined;

      try {
        const errorBody: unknown = await response.json();
        if (typeof errorBody === 'object' && errorBody !== null) {
          const record = errorBody as Record<string, unknown>;

          if (typeof record['error'] === 'string') {
            errorMessage = record['error'];
          } else if (
            typeof record['error'] === 'object' &&
            record['error'] !== null &&
            'message' in (record['error'] as Record<string, unknown>)
          ) {
            errorMessage = String((record['error'] as Record<string, unknown>)['message']);
          }

          if (typeof record['code'] === 'string') {
            errorCode = record['code'];
          } else if (
            typeof record['error'] === 'object' &&
            record['error'] !== null &&
            'code' in (record['error'] as Record<string, unknown>)
          ) {
            errorCode = String((record['error'] as Record<string, unknown>)['code']);
          }

          if ('details' in record) {
            errorDetails = record['details'];
          }
        }
      } catch {
        // Fallback para códigos HTTP padrão quando o corpo não for JSON
        if (response.status === 401) {
          errorMessage = 'Sessão expirada ou não autorizada. Faça login novamente para continuar.';
          errorCode = 'UNAUTHORIZED';
        } else if (response.status === 403) {
          errorMessage = 'Acesso negado. Sua conta de administrador não possui permissão ativa.';
          errorCode = 'FORBIDDEN';
        } else if (response.status === 413) {
          errorMessage = 'O arquivo enviado excede o limite máximo permitido (5 MB).';
          errorCode = 'FILE_TOO_LARGE';
        } else if (response.status === 405) {
          errorMessage = 'Método HTTP não permitido.';
          errorCode = 'METHOD_NOT_ALLOWED';
        } else if (response.status >= 500) {
          errorMessage = 'Erro interno no servidor ao processar o arquivo. Tente novamente mais tarde.';
          errorCode = 'INTERNAL_SERVER_ERROR';
        }
      }

      throw new ImportacaoClientError(errorMessage, {
        statusCode: response.status,
        code: errorCode,
        details: errorDetails,
      });
    }

    const data = (await response.json()) as ImportacaoValidationResponseDto;
    return data;
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
