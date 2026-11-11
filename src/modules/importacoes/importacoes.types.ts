/**
 * Nascentes do Cariri — Contratos e Tipos Estritos do Módulo de Importações
 */

import { UNIDADE_VAZAO_PADRAO, type UnidadeVazao } from '@/modules/nascentes/nascentes.dto';

export { UNIDADE_VAZAO_PADRAO, type UnidadeVazao };

/**
 * Separador oficial de colunas do arquivo TXT.
 */
export const TXT_COLUMN_SEPARATOR = ';' as const;

/**
 * Colunas obrigatórias esperadas no cabeçalho na ordem oficial.
 */
export const EXPECTED_TXT_HEADER_COLUMNS = [
  'latitude',
  'longitude',
  'municipio',
  'fonte',
  'localidade',
  'data_criacao',
  'vazao_media',
] as const;

export type TxtHeaderColumn = (typeof EXPECTED_TXT_HEADER_COLUMNS)[number];

/**
 * String exata do cabeçalho canônico formatado com ponto e vírgula.
 */
export const EXPECTED_TXT_HEADER_STRING = EXPECTED_TXT_HEADER_COLUMNS.join(
  TXT_COLUMN_SEPARATOR
) as 'latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media';

/**
 * Identificadores de campo para apontamento de erros de validação.
 */
export type ImportRowField =
  | 'arquivo'
  | 'cabecalho'
  | 'linha'
  | TxtHeaderColumn;

/**
 * Códigos de erro semânticos e rastreáveis da validação de TXT.
 */
export const IMPORT_ERROR_CODES = {
  EMPTY_FILE: 'EMPTY_FILE',
  INVALID_ENCODING: 'INVALID_ENCODING',
  INVALID_HEADER: 'INVALID_HEADER',
  INVALID_COLUMN_COUNT: 'INVALID_COLUMN_COUNT',
  REQUIRED_FIELD_EMPTY: 'REQUIRED_FIELD_EMPTY',
  INVALID_DECIMAL_FORMAT: 'INVALID_DECIMAL_FORMAT',
  INVALID_COORDINATE: 'INVALID_COORDINATE',
  OUT_OF_BOUNDS_GLOBAL: 'OUT_OF_BOUNDS_GLOBAL',
  OUT_OF_BOUNDS_CARIRI: 'OUT_OF_BOUNDS_CARIRI',
  INVALID_TEXT_LENGTH: 'INVALID_TEXT_LENGTH',
  INVALID_DATE_FORMAT: 'INVALID_DATE_FORMAT',
  INVALID_CALENDAR_DATE: 'INVALID_CALENDAR_DATE',
  FUTURE_DATE: 'FUTURE_DATE',
  NEGATIVE_FLOW: 'NEGATIVE_FLOW',
  DUPLICATE_ROW_INTERNAL: 'DUPLICATE_ROW_INTERNAL',
  DUPLICATE_ROW_DATABASE: 'DUPLICATE_ROW_DATABASE',
} as const;

export type ImportErrorCode =
  (typeof IMPORT_ERROR_CODES)[keyof typeof IMPORT_ERROR_CODES];

/**
 * Estrutura de erro com localização exata (linha física, campo, código e mensagem).
 */
export interface ImportRowError {
  readonly line: number;
  readonly field: ImportRowField;
  readonly code: ImportErrorCode;
  readonly message: string;
  readonly rawValue?: string | undefined;
}

/**
 * Representação bruta de uma linha lida do arquivo físico.
 */
export interface RawTxtRow {
  readonly line: number;
  readonly columns: readonly string[];
  readonly rawContent: string;
}

/**
 * Dados válidos e normalizados de uma nascente extraída do arquivo TXT.
 */
export interface NascenteParsedData {
  readonly latitude: number;
  readonly longitude: number;
  readonly municipio: string;
  readonly fonte: string;
  readonly localidade: string;
  readonly dataCriacaoIso: string; // Formato canônico AAAA-MM-DD
  readonly dataCriacao: Date; // Instância UTC 00:00:00.000Z
  readonly vazaoMedia: number; // Numérico >= 0
  readonly unidadeVazao: UnidadeVazao; // Sempre 'm³/s'
}

/**
 * Linha válida aceita pelo parser, pronta para prévia ou persistência.
 */
export interface ValidTxtRow {
  readonly line: number;
  readonly data: NascenteParsedData;
  readonly duplicateKey: string;
}

/**
 * Motivo pelo qual a linha foi marcada como duplicada.
 */
export const DUPLICATE_REASONS = {
  INTERNAL: 'DUPLICATE_INTERNAL',
  DATABASE: 'DUPLICATE_DATABASE',
} as const;

export type DuplicateReason =
  (typeof DUPLICATE_REASONS)[keyof typeof DUPLICATE_REASONS];

/**
 * Linha válida porém descartada da inserção por duplicidade (mesma chave normalizada).
 */
export interface DuplicateTxtRow {
  readonly line: number;
  readonly data: NascenteParsedData;
  readonly duplicateKey: string;
  readonly duplicateOfLine?: number | undefined;
  readonly reason: DuplicateReason;
}

/**
 * Linha inválida contendo um ou mais erros impeditivos de negócio ou formato.
 */
export interface InvalidTxtRow {
  readonly line: number;
  readonly rawContent: string;
  readonly errors: readonly ImportRowError[];
}

/**
 * União discriminada para avaliação exaustiva de cada linha parseada.
 */
export type ParsedRowOutcome =
  | { readonly status: 'valid'; readonly row: ValidTxtRow }
  | { readonly status: 'duplicate'; readonly row: DuplicateTxtRow }
  | { readonly status: 'invalid'; readonly row: InvalidTxtRow };

/**
 * Resumo estatístico quantitativo do processamento do TXT.
 */
export interface TxtParseSummary {
  readonly totalLinhas: number;
  readonly totalValidas: number;
  readonly totalInvalidas: number;
  readonly totalDuplicadas: number;
}

/**
 * Diagnóstico consolidado retornado pelo parser para uso em API, UI de prévia e transação.
 */
export interface TxtParseResult {
  readonly headerValid: boolean;
  readonly canConfirm: boolean;
  readonly summary: TxtParseSummary;
  readonly validRows: readonly ValidTxtRow[];
  readonly duplicateRows: readonly DuplicateTxtRow[];
  readonly invalidRows: readonly InvalidTxtRow[];
  readonly allErrors: readonly ImportRowError[];
}

/**
 * Opções de entrada para execução do parser.
 */
export interface ParseNascentesTxtOptions {
  /**
   * Conjunto opcional de chaves normalizadas pré-existentes no banco de dados.
   * Quando informado, marca registros coincidentes como DUPLICATE_DATABASE.
   */
  readonly existingKeys?: ReadonlySet<string> | undefined;
}

