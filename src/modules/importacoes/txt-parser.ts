/**
 * Nascentes do Cariri — Parser e Validador Linha a Linha de Arquivos TXT
 */

import { CARIRI_BOUNDS } from '@/lib/domain/nascente';
import { UNIDADE_VAZAO_PADRAO } from '@/modules/nascentes/nascentes.dto';
import {
  DUPLICATE_REASONS,
  EXPECTED_TXT_HEADER_COLUMNS,
  IMPORT_ERROR_CODES,
  TXT_COLUMN_SEPARATOR,
  type DuplicateTxtRow,
  type ImportRowError,
  type InvalidTxtRow,
  type NascenteParsedData,
  type ParseNascentesTxtOptions,
  type TxtParseResult,
  type ValidTxtRow,
} from './importacoes.types';

/**
 * Remove caracteres de controle ASCII mantendo espaços comuns.
 */
function stripControlCharacters(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
}

/**
 * Decodifica o conteúdo de entrada (string, Uint8Array ou ArrayBuffer) em string UTF-8 válida.
 * Remove Byte Order Mark (BOM) inicial se presente.
 *
 * @throws {Error} com código INVALID_ENCODING se os bytes não forem UTF-8 válidos.
 */
export function decodeTxtContent(input: string | Uint8Array | ArrayBuffer): string {
  if (typeof input === 'string') {
    return input.replace(/^\uFEFF/, '');
  }

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
    const decoded = decoder.decode(buffer);
    return decoded.replace(/^\uFEFF/, '');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Codificação inválida';
    const encodingError = new Error(`Falha na decodificação UTF-8: ${message}`);
    (encodingError as { code?: string }).code = IMPORT_ERROR_CODES.INVALID_ENCODING;
    throw encodingError;
  }
}

/**
 * Constrói a chave canônica e normalizada de duplicidade para uma nascente.
 * Combina latitude (8 casas), longitude (8 casas) e fonte (trim, colapso de espaços, NFC, lowercase).
 *
 * Regra: Mesma latitude, longitude e fonte caracterizam duplicidade.
 */
export function buildNascenteDuplicateKey(
  latitude: number,
  longitude: number,
  fonte: string
): string {
  const latPart = Number(latitude).toFixed(8);
  const lngPart = Number(longitude).toFixed(8);
  const fontePart = stripControlCharacters(fonte)
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFC')
    .toLowerCase();

  return `${latPart}:${lngPart}:${fontePart}`;
}

/**
 * Valida se os componentes numéricos formam uma data de calendário real no passado/presente.
 */
function validateCalendarDate(
  year: number,
  month: number,
  day: number,
  line: number
): { valid: true; dateUtc: Date } | { valid: false; error: ImportRowError } {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000 || year > 9999) {
    return {
      valid: false,
      error: {
        line,
        field: 'data_criacao',
        code: IMPORT_ERROR_CODES.INVALID_CALENDAR_DATE,
        message: 'Data de criação não representa uma data válida do calendário.',
      },
    };
  }

  const dateUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  // Validação de overflow
  if (
    dateUtc.getUTCFullYear() !== year ||
    dateUtc.getUTCMonth() !== month - 1 ||
    dateUtc.getUTCDate() !== day
  ) {
    return {
      valid: false,
      error: {
        line,
        field: 'data_criacao',
        code: IMPORT_ERROR_CODES.INVALID_CALENDAR_DATE,
        message: `Data de criação inválida para o calendário: ${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}.`,
      },
    };
  }

  // Tolerância de 24 horas no futuro para fusos horários locais
  const agoraTolerante = new Date();
  agoraTolerante.setUTCDate(agoraTolerante.getUTCDate() + 1);

  if (dateUtc.getTime() > agoraTolerante.getTime()) {
    return {
      valid: false,
      error: {
        line,
        field: 'data_criacao',
        code: IMPORT_ERROR_CODES.FUTURE_DATE,
        message: 'Data de criação não pode ser futura.',
      },
    };
  }

  return { valid: true, dateUtc };
}

/**
 * Valida o cabeçalho canônico do arquivo TXT (CT-BE-06).
 */
export function validateTxtHeader(
  headerLine: string,
  lineNumber = 1
): { valid: true; columns: readonly string[] } | { valid: false; error: ImportRowError } {
  const trimmedHeader = headerLine.replace(/^\uFEFF/, '').trim();

  if (trimmedHeader.length === 0) {
    return {
      valid: false,
      error: {
        line: lineNumber,
        field: 'cabecalho',
        code: IMPORT_ERROR_CODES.INVALID_HEADER,
        message: 'O cabeçalho do arquivo está vazio.',
        rawValue: headerLine,
      },
    };
  }

  const rawColumns = trimmedHeader.split(TXT_COLUMN_SEPARATOR);
  const normalizedColumns = rawColumns.map((col) => col.trim());

  const matchesLength = normalizedColumns.length === EXPECTED_TXT_HEADER_COLUMNS.length;
  const matchesColumns =
    matchesLength &&
    EXPECTED_TXT_HEADER_COLUMNS.every((expectedCol, idx) => normalizedColumns[idx] === expectedCol);

  if (!matchesColumns) {
    return {
      valid: false,
      error: {
        line: lineNumber,
        field: 'cabecalho',
        code: IMPORT_ERROR_CODES.INVALID_HEADER,
        message: `Cabeçalho incorreto ou ausente. Esperado: "${EXPECTED_TXT_HEADER_COLUMNS.join(';')}". Encontrado: "${normalizedColumns.join(';')}".`,
        rawValue: headerLine,
      },
    };
  }

  return { valid: true, columns: normalizedColumns };
}

export type ParseLineOutcome =
  | { readonly valid: true; readonly data: NascenteParsedData; readonly duplicateKey: string }
  | { readonly valid: false; readonly errors: readonly ImportRowError[] };

/**
 * Valida individualmente uma linha física de dados do arquivo TXT.
 * Acumula todos os erros encontrados na linha para correção unificada pelo administrador.
 */
export function parseTxtLine(rawLine: string, lineNumber: number): ParseLineOutcome {
  const errors: ImportRowError[] = [];
  const columns = rawLine.split(TXT_COLUMN_SEPARATOR);

  // 1. Contagem de colunas
  if (columns.length !== EXPECTED_TXT_HEADER_COLUMNS.length) {
    errors.push({
      line: lineNumber,
      field: 'linha',
      code: IMPORT_ERROR_CODES.INVALID_COLUMN_COUNT,
      message: `A linha possui ${columns.length} colunas, mas são esperadas exatamente ${EXPECTED_TXT_HEADER_COLUMNS.length} colunas separadas por ponto e vírgula (;).`,
      rawValue: rawLine,
    });
    return { valid: false, errors };
  }

  const [
    rawLat = '',
    rawLng = '',
    rawMunicipio = '',
    rawFonte = '',
    rawLocalidade = '',
    rawDataCriacao = '',
    rawVazao = '',
  ] = columns;

  // 2. Campo: latitude
  const trimmedLat = rawLat.trim();
  let parsedLat: number | undefined;

  if (trimmedLat.length === 0) {
    errors.push({
      line: lineNumber,
      field: 'latitude',
      code: IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY,
      message: 'Latitude é obrigatória e não pode ser vazia.',
      rawValue: rawLat,
    });
  } else if (trimmedLat.includes(',')) {
    errors.push({
      line: lineNumber,
      field: 'latitude',
      code: IMPORT_ERROR_CODES.INVALID_DECIMAL_FORMAT,
      message: 'Latitude deve usar ponto (.) como separador decimal.',
      rawValue: rawLat,
    });
  } else if (!/^[+-]?\d+(\.\d+)?$/.test(trimmedLat)) {
    errors.push({
      line: lineNumber,
      field: 'latitude',
      code: IMPORT_ERROR_CODES.INVALID_COORDINATE,
      message: 'Latitude deve ser um valor numérico válido.',
      rawValue: rawLat,
    });
  } else {
    const num = Number(trimmedLat);
    if (!Number.isFinite(num)) {
      errors.push({
        line: lineNumber,
        field: 'latitude',
        code: IMPORT_ERROR_CODES.INVALID_COORDINATE,
        message: 'Latitude não pode ser NaN ou infinita.',
        rawValue: rawLat,
      });
    } else if (num < -90 || num > 90) {
      errors.push({
        line: lineNumber,
        field: 'latitude',
        code: IMPORT_ERROR_CODES.OUT_OF_BOUNDS_GLOBAL,
        message: 'Latitude deve estar entre -90 e 90 graus.',
        rawValue: rawLat,
      });
    } else if (num < CARIRI_BOUNDS.MIN_LAT || num > CARIRI_BOUNDS.MAX_LAT) {
      errors.push({
        line: lineNumber,
        field: 'latitude',
        code: IMPORT_ERROR_CODES.OUT_OF_BOUNDS_CARIRI,
        message: `Latitude fora dos limites do Cariri [${CARIRI_BOUNDS.MIN_LAT}, ${CARIRI_BOUNDS.MAX_LAT}].`,
        rawValue: rawLat,
      });
    } else {
      parsedLat = num;
    }
  }

  // 3. Campo: longitude
  const trimmedLng = rawLng.trim();
  let parsedLng: number | undefined;

  if (trimmedLng.length === 0) {
    errors.push({
      line: lineNumber,
      field: 'longitude',
      code: IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY,
      message: 'Longitude é obrigatória e não pode ser vazia.',
      rawValue: rawLng,
    });
  } else if (trimmedLng.includes(',')) {
    errors.push({
      line: lineNumber,
      field: 'longitude',
      code: IMPORT_ERROR_CODES.INVALID_DECIMAL_FORMAT,
      message: 'Longitude deve usar ponto (.) como separador decimal.',
      rawValue: rawLng,
    });
  } else if (!/^[+-]?\d+(\.\d+)?$/.test(trimmedLng)) {
    errors.push({
      line: lineNumber,
      field: 'longitude',
      code: IMPORT_ERROR_CODES.INVALID_COORDINATE,
      message: 'Longitude deve ser um valor numérico válido.',
      rawValue: rawLng,
    });
  } else {
    const num = Number(trimmedLng);
    if (!Number.isFinite(num)) {
      errors.push({
        line: lineNumber,
        field: 'longitude',
        code: IMPORT_ERROR_CODES.INVALID_COORDINATE,
        message: 'Longitude não pode ser NaN ou infinita.',
        rawValue: rawLng,
      });
    } else if (num < -180 || num > 180) {
      errors.push({
        line: lineNumber,
        field: 'longitude',
        code: IMPORT_ERROR_CODES.OUT_OF_BOUNDS_GLOBAL,
        message: 'Longitude deve estar entre -180 e 180 graus.',
        rawValue: rawLng,
      });
    } else if (num < CARIRI_BOUNDS.MIN_LNG || num > CARIRI_BOUNDS.MAX_LNG) {
      errors.push({
        line: lineNumber,
        field: 'longitude',
        code: IMPORT_ERROR_CODES.OUT_OF_BOUNDS_CARIRI,
        message: `Longitude fora dos limites do Cariri [${CARIRI_BOUNDS.MIN_LNG}, ${CARIRI_BOUNDS.MAX_LNG}].`,
        rawValue: rawLng,
      });
    } else {
      parsedLng = num;
    }
  }

  // 4. Campo: municipio
  const cleanedMunicipio = stripControlCharacters(rawMunicipio).trim();
  if (cleanedMunicipio.length === 0) {
    errors.push({
      line: lineNumber,
      field: 'municipio',
      code: IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY,
      message: 'Município é obrigatório e não pode ser vazio.',
      rawValue: rawMunicipio,
    });
  } else if (cleanedMunicipio.length > 150) {
    errors.push({
      line: lineNumber,
      field: 'municipio',
      code: IMPORT_ERROR_CODES.INVALID_TEXT_LENGTH,
      message: 'Município deve ter no máximo 150 caracteres.',
      rawValue: rawMunicipio,
    });
  }

  // 5. Campo: fonte
  const cleanedFonte = stripControlCharacters(rawFonte).trim();
  if (cleanedFonte.length === 0) {
    errors.push({
      line: lineNumber,
      field: 'fonte',
      code: IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY,
      message: 'Fonte é obrigatória e não pode ser vazia.',
      rawValue: rawFonte,
    });
  } else if (cleanedFonte.length > 255) {
    errors.push({
      line: lineNumber,
      field: 'fonte',
      code: IMPORT_ERROR_CODES.INVALID_TEXT_LENGTH,
      message: 'Fonte deve ter no máximo 255 caracteres.',
      rawValue: rawFonte,
    });
  }

  // 6. Campo: localidade
  const cleanedLocalidade = stripControlCharacters(rawLocalidade).trim();
  if (cleanedLocalidade.length === 0) {
    errors.push({
      line: lineNumber,
      field: 'localidade',
      code: IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY,
      message: 'Localidade é obrigatória e não pode ser vazia.',
      rawValue: rawLocalidade,
    });
  } else if (cleanedLocalidade.length > 255) {
    errors.push({
      line: lineNumber,
      field: 'localidade',
      code: IMPORT_ERROR_CODES.INVALID_TEXT_LENGTH,
      message: 'Localidade deve ter no máximo 255 caracteres.',
      rawValue: rawLocalidade,
    });
  }

  // 7. Campo: data_criacao
  const trimmedData = rawDataCriacao.trim();
  let parsedDateUtc: Date | undefined;
  let parsedDateIso: string | undefined;

  if (trimmedData.length === 0) {
    errors.push({
      line: lineNumber,
      field: 'data_criacao',
      code: IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY,
      message: 'Data de criação é obrigatória e não pode ser vazia.',
      rawValue: rawDataCriacao,
    });
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedData)) {
    errors.push({
      line: lineNumber,
      field: 'data_criacao',
      code: IMPORT_ERROR_CODES.INVALID_DATE_FORMAT,
      message: 'Data de criação deve estar no formato ISO AAAA-MM-DD.',
      rawValue: rawDataCriacao,
    });
  } else {
    const [yStr = '', mStr = '', dStr = ''] = trimmedData.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    const day = Number(dStr);

    const dateResult = validateCalendarDate(year, month, day, lineNumber);
    if (!dateResult.valid) {
      errors.push(dateResult.error);
    } else {
      parsedDateUtc = dateResult.dateUtc;
      parsedDateIso = trimmedData;
    }
  }

  // 8. Campo: vazao_media
  const trimmedVazao = rawVazao.trim();
  let parsedVazao: number | undefined;

  if (trimmedVazao.length === 0) {
    errors.push({
      line: lineNumber,
      field: 'vazao_media',
      code: IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY,
      message: 'Vazão média é obrigatória e não pode ser vazia.',
      rawValue: rawVazao,
    });
  } else if (trimmedVazao.includes(',')) {
    errors.push({
      line: lineNumber,
      field: 'vazao_media',
      code: IMPORT_ERROR_CODES.INVALID_DECIMAL_FORMAT,
      message: 'Vazão média deve usar ponto (.) como separador decimal.',
      rawValue: rawVazao,
    });
  } else if (!/^[+-]?\d+(\.\d+)?$/.test(trimmedVazao)) {
    errors.push({
      line: lineNumber,
      field: 'vazao_media',
      code: IMPORT_ERROR_CODES.INVALID_DECIMAL_FORMAT,
      message: 'Vazão média deve ser um valor numérico válido.',
      rawValue: rawVazao,
    });
  } else {
    const num = Number(trimmedVazao);
    if (!Number.isFinite(num)) {
      errors.push({
        line: lineNumber,
        field: 'vazao_media',
        code: IMPORT_ERROR_CODES.INVALID_DECIMAL_FORMAT,
        message: 'Vazão média não pode ser NaN ou infinita.',
        rawValue: rawVazao,
      });
    } else if (num < 0) {
      errors.push({
        line: lineNumber,
        field: 'vazao_media',
        code: IMPORT_ERROR_CODES.NEGATIVE_FLOW,
        message: 'Vazão média deve ser maior ou igual a zero (m³/s).',
        rawValue: rawVazao,
      });
    } else {
      parsedVazao = num;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const validData: NascenteParsedData = {
    latitude: parsedLat!,
    longitude: parsedLng!,
    municipio: cleanedMunicipio,
    fonte: cleanedFonte,
    localidade: cleanedLocalidade,
    dataCriacaoIso: parsedDateIso!,
    dataCriacao: parsedDateUtc!,
    vazaoMedia: parsedVazao!,
    unidadeVazao: UNIDADE_VAZAO_PADRAO,
  };

  const duplicateKey = buildNascenteDuplicateKey(
    validData.latitude,
    validData.longitude,
    validData.fonte
  );

  return { valid: true, data: validData, duplicateKey };
}

/**
 * Função principal do parser de arquivo TXT de nascentes.
 * Processa o arquivo completo, retornando diagnóstico estruturado e contadores quantitativos.
 */
export function parseNascentesTxt(
  input: string | Uint8Array | ArrayBuffer,
  options?: ParseNascentesTxtOptions
): TxtParseResult {
  let content: string;

  try {
    content = decodeTxtContent(input);
  } catch (decodingErr: unknown) {
    const message =
      decodingErr instanceof Error ? decodingErr.message : 'Codificação UTF-8 inválida';
    const error: ImportRowError = {
      line: 1,
      field: 'arquivo',
      code: IMPORT_ERROR_CODES.INVALID_ENCODING,
      message,
    };
    return {
      headerValid: false,
      canConfirm: false,
      summary: { totalLinhas: 0, totalValidas: 0, totalInvalidas: 1, totalDuplicadas: 0 },
      validRows: [],
      duplicateRows: [],
      invalidRows: [{ line: 1, rawContent: '', errors: [error] }],
      allErrors: [error],
    };
  }

  const rawLines = content.split(/\r\n|\r|\n/);

  let headerFound = false;
  let headerValid = false;
  let headerError: ImportRowError | undefined;

  const validRows: ValidTxtRow[] = [];
  const duplicateRows: DuplicateTxtRow[] = [];
  const invalidRows: InvalidTxtRow[] = [];
  const allErrors: ImportRowError[] = [];

  const seenInternalKeys = new Map<string, number>();
  const existingDatabaseKeys = options?.existingKeys;

  for (let i = 0; i < rawLines.length; i++) {
    const physicalLineNumber = i + 1;
    const rawLine = rawLines[i] ?? '';
    const trimmedLine = rawLine.trim();

    // Linhas vazias são ignoradas sem gerar erro
    if (trimmedLine.length === 0) {
      continue;
    }

    // 1. Processamento da primeira linha de conteúdo (cabeçalho)
    if (!headerFound) {
      headerFound = true;
      const headerOutcome = validateTxtHeader(rawLine, physicalLineNumber);

      if (!headerOutcome.valid) {
        headerValid = false;
        headerError = headerOutcome.error;
        allErrors.push(headerError);
        invalidRows.push({
          line: physicalLineNumber,
          rawContent: rawLine,
          errors: [headerError],
        });
        // Cabeçalho inválido interrompe a análise das linhas subsequentes
        break;
      }

      headerValid = true;
      continue;
    }

    // 2. Processamento das linhas de dados
    const lineOutcome = parseTxtLine(rawLine, physicalLineNumber);

    if (!lineOutcome.valid) {
      invalidRows.push({
        line: physicalLineNumber,
        rawContent: rawLine,
        errors: lineOutcome.errors,
      });
      allErrors.push(...lineOutcome.errors);
      continue;
    }

    const { data, duplicateKey } = lineOutcome;

    // 3. Verificação de duplicidade interna (repetição no mesmo arquivo)
    const previousLine = seenInternalKeys.get(duplicateKey);
    if (previousLine !== undefined) {
      duplicateRows.push({
        line: physicalLineNumber,
        data,
        duplicateKey,
        duplicateOfLine: previousLine,
        reason: DUPLICATE_REASONS.INTERNAL,
      });
      continue;
    }

    // 4. Verificação de duplicidade contra base de dados (se informado options.existingKeys)
    if (existingDatabaseKeys && existingDatabaseKeys.has(duplicateKey)) {
      duplicateRows.push({
        line: physicalLineNumber,
        data,
        duplicateKey,
        reason: DUPLICATE_REASONS.DATABASE,
      });
      continue;
    }

    // 5. Linha válida aceita
    seenInternalKeys.set(duplicateKey, physicalLineNumber);
    validRows.push({
      line: physicalLineNumber,
      data,
      duplicateKey,
    });
  }

  // Caso: Arquivo completamente vazio ou contendo apenas linhas em branco
  if (!headerFound) {
    const emptyError: ImportRowError = {
      line: 1,
      field: 'arquivo',
      code: IMPORT_ERROR_CODES.EMPTY_FILE,
      message: 'O arquivo TXT está vazio.',
    };
    allErrors.push(emptyError);
    invalidRows.push({
      line: 1,
      rawContent: '',
      errors: [emptyError],
    });

    return {
      headerValid: false,
      canConfirm: false,
      summary: {
        totalLinhas: 0,
        totalValidas: 0,
        totalInvalidas: 1,
        totalDuplicadas: 0,
      },
      validRows: [],
      duplicateRows: [],
      invalidRows,
      allErrors,
    };
  }

  // Caso: Cabeçalho com erro (interrompido antes dos dados)
  if (!headerValid) {
    return {
      headerValid: false,
      canConfirm: false,
      summary: {
        totalLinhas: 0,
        totalValidas: 0,
        totalInvalidas: invalidRows.length,
        totalDuplicadas: 0,
      },
      validRows: [],
      duplicateRows: [],
      invalidRows,
      allErrors,
    };
  }

  // Caso: Cabeçalho válido mas 0 linhas de dados encontradas
  const totalDados = validRows.length + duplicateRows.length + invalidRows.length;
  if (totalDados === 0) {
    const noDataError: ImportRowError = {
      line: 1,
      field: 'arquivo',
      code: IMPORT_ERROR_CODES.EMPTY_FILE,
      message: 'O arquivo TXT contém apenas o cabeçalho e nenhuma linha de dados.',
    };
    allErrors.push(noDataError);
    invalidRows.push({
      line: 1,
      rawContent: '',
      errors: [noDataError],
    });

    return {
      headerValid: true,
      canConfirm: false,
      summary: {
        totalLinhas: 0,
        totalValidas: 0,
        totalInvalidas: 1,
        totalDuplicadas: 0,
      },
      validRows: [],
      duplicateRows: [],
      invalidRows,
      allErrors,
    };
  }

  const summary = {
    totalLinhas: validRows.length + duplicateRows.length + invalidRows.length,
    totalValidas: validRows.length,
    totalInvalidas: invalidRows.length,
    totalDuplicadas: duplicateRows.length,
  };

  const canConfirm = headerValid && summary.totalInvalidas === 0 && summary.totalValidas > 0;

  return {
    headerValid,
    canConfirm,
    summary,
    validRows,
    duplicateRows,
    invalidRows,
    allErrors,
  };
}

