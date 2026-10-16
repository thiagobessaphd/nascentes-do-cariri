/**
 * Mapeamento de caracteres especiais HTML para entidades seguras (mitigação de XSS).
 */
const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
};

const HTML_ESCAPE_REGEX = /[&<>"'`/]/g;

/**
 * Escapa caracteres especiais em strings HTML para mitigar injeção de scripts (XSS).
 * Essencial para sanitizar dados externos antes de
 * interpolação em popups, tooltips ou templates do Leaflet.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  return str.replace(HTML_ESCAPE_REGEX, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

/**
 * Remove tags HTML e caracteres de controle, retornando texto puro.
 */
export function stripHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();
}

/**
 * Normaliza e sanitiza campos de texto de nascentes
 * garantindo ausência de tags maliciosas e caracteres de controle antes da renderização.
 */
export function sanitizeMapText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const cleaned = String(value)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return escapeHtml(cleaned);
}

/**
 * Nomes de dispositivos reservados em sistemas Windows (independente de extensão).
 */
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export interface SanitizeFilenameOptions {
  readonly allowedExtensions?: readonly string[];
  readonly maxLength?: number;
  readonly fallbackName?: string;
}

export interface FilenameValidationResult {
  readonly isValid: boolean;
  readonly reason?: string;
}

/**
 * Valida se um nome de arquivo para upload é seguro e segue as políticas do sistema.
 */
export function validateUploadFilename(
  filename: unknown,
  allowedExtensions: readonly string[] = ['.txt']
): FilenameValidationResult {
  if (typeof filename !== 'string' || !filename.trim()) {
    return { isValid: false, reason: 'O nome do arquivo não pode ser vazio.' };
  }

  const trimmed = filename.trim();

  // Bloqueio de tamanho excessivo
  if (trimmed.length > 255) {
    return { isValid: false, reason: 'O nome do arquivo excede o limite máximo de 255 caracteres.' };
  }

  // Bloqueio de caracteres nulos ou de controle
  if (/[\u0000-\u001F\u007F-\u009F]/.test(trimmed)) {
    return { isValid: false, reason: 'O nome do arquivo contém caracteres de controle inválidos.' };
  }

  // Bloqueio de tentativa de Path Traversal
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return { isValid: false, reason: 'Tentativa de navegação de diretório (Path Traversal) detectada.' };
  }

  // Extração e validação da extensão
  const lowerName = trimmed.toLowerCase();
  const hasAllowedExt = allowedExtensions.some((ext) => lowerName.endsWith(ext.toLowerCase()));
  if (!hasAllowedExt) {
    return {
      isValid: false,
      reason: `Extensão não permitida. Extensões aceitas: ${allowedExtensions.join(', ')}.`,
    };
  }

  // Bloqueio de nomes de dispositivos do Windows (ex: NUL.txt, CON.txt)
  const baseName = trimmed.replace(/\.[^/.]+$/, '');
  if (WINDOWS_RESERVED_NAMES.test(baseName)) {
    return { isValid: false, reason: 'Nome de arquivo reservado pelo sistema operacional.' };
  }

  return { isValid: true };
}

/**
 * Sanitiza rigorosamente nomes de arquivos enviados pelo usuário para upload,
 * eliminando sequências de Path Traversal, caracteres ilegais e garantindo extensão segura.
 */
export function sanitizeFilename(
  rawFilename: unknown,
  options?: SanitizeFilenameOptions
): string {
  const allowedExtensions = options?.allowedExtensions ?? ['.txt'];
  const maxLength = options?.maxLength ?? 200;
  const fallbackName = options?.fallbackName ?? 'upload.txt';

  if (typeof rawFilename !== 'string' || !rawFilename.trim()) {
    return fallbackName;
  }

  let cleaned = rawFilename.trim();

  // Decodifica possíveis URL-encodings defensivamente
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
  }

  // Remove caracteres nulos e de controle
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

  // Normaliza barras e extrai estritamente o basename
  cleaned = cleaned.replace(/\\/g, '/');
  const lastSlashIndex = cleaned.lastIndexOf('/');
  if (lastSlashIndex !== -1) {
    cleaned = cleaned.slice(lastSlashIndex + 1);
  }

  // Remove sequências remanescentes de path traversal
  cleaned = cleaned.replace(/\.\.+/g, '');

  // Separa nome base e extensão
  const lastDotIndex = cleaned.lastIndexOf('.');
  let baseName = lastDotIndex !== -1 ? cleaned.slice(0, lastDotIndex) : cleaned;
  let ext = lastDotIndex !== -1 ? cleaned.slice(lastDotIndex).toLowerCase() : '';

  // Substitui caracteres inválidos e acentos por caracteres seguros alfanuméricos, hífens e underscores
  baseName = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9_-]/g, '_') // caracteres não alfanuméricos viram _
    .replace(/__+/g, '_') // compacta múltiplos underscores
    .replace(/^_|_$/g, ''); // remove underscores nas extremidades

  // Se o nome base ficou vazio ou é nome reservado do Windows, aplica fallback
  if (!baseName || WINDOWS_RESERVED_NAMES.test(baseName)) {
    baseName = 'upload';
  }

  // Assegura extensão autorizada
  if (!allowedExtensions.map((e) => e.toLowerCase()).includes(ext)) {
    ext = allowedExtensions[0] ?? '.txt';
  }

  // Trunca nome mantendo a extensão
  const maxBaseLength = maxLength - ext.length;
  if (baseName.length > maxBaseLength) {
    baseName = baseName.slice(0, maxBaseLength);
  }

  return `${baseName}${ext}`;
}

/**
 * Gera um pathname seguro e único para armazenamento em Vercel Blob,
 * combinando namespace, timestamp e identificador aleatório com o nome sanitizado.
 */
export function generateSafeBlobPathname(
  filename: string,
  namespace = 'importacoes'
): string {
  const safeName = sanitizeFilename(filename);
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 10);

  return `${namespace}/${timestamp}-${randomSuffix}-${safeName}`;
}

export interface PaginationParams {
  readonly page?: unknown;
  readonly pageSize?: unknown;
}

export interface SafePagination {
  readonly page: number;
  readonly pageSize: number;
  readonly skip: number;
  readonly take: number;
}

export interface NascenteFilterParams {
  readonly municipio?: unknown;
  readonly fonte?: unknown;
  readonly localidade?: unknown;
  readonly ativo?: unknown;
}

export interface SafeNascenteFilters {
  readonly municipio?: string;
  readonly fonte?: string;
  readonly localidade?: string;
  readonly ativo?: boolean;
}

/**
 * Sanitiza termos textuais utilizados em buscas e filtros de consultas,
 * eliminando caracteres de controle e limitando o tamanho para mitigar sobrecarga (DoS) e injeções.
 */
export function sanitizeSearchTerm(term: unknown, maxLength = 100): string {
  if (typeof term !== 'string' || !term.trim()) {
    return '';
  }

  // Remove caracteres nulos e de controle
  const cleaned = term
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Limita o tamanho máximo para mitigar ataques de DoS em consultas
  return cleaned.slice(0, maxLength);
}

/**
 * Valida e normaliza parâmetros de paginação, impondo limites rígidos (teto máximo de pageSize)
 * para prevenir ataques de negação de serviço (DoS) por exaustão de memória ou buffer de banco.
 */
export function validatePaginationParams(params?: PaginationParams): SafePagination {
  const DEFAULT_PAGE = 1;
  const DEFAULT_PAGE_SIZE = 50;
  const MAX_PAGE_SIZE = 100;
  const MIN_PAGE_SIZE = 1;

  let page = Number(params?.page);
  let pageSize = Number(params?.pageSize);

  if (!Number.isInteger(page) || page < 1) {
    page = DEFAULT_PAGE;
  }

  if (!Number.isInteger(pageSize) || pageSize < MIN_PAGE_SIZE) {
    pageSize = DEFAULT_PAGE_SIZE;
  } else if (pageSize > MAX_PAGE_SIZE) {
    pageSize = MAX_PAGE_SIZE;
  }

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  return {
    page,
    pageSize,
    skip,
    take,
  };
}

/**
 * Normaliza e valida filtros de busca de nascentes, garantindo que entradas sejam tratadas
 * estritamente como literais de string parametrizados em consultas do Prisma ORM.
 */
export function buildSafeNascenteFilters(params?: NascenteFilterParams): SafeNascenteFilters {
  if (!params) {
    return {};
  }

  const filters: Record<string, string | boolean> = {};

  const municipio = sanitizeSearchTerm(params.municipio);
  if (municipio) {
    filters.municipio = municipio;
  }

  const fonte = sanitizeSearchTerm(params.fonte);
  if (fonte) {
    filters.fonte = fonte;
  }

  const localidade = sanitizeSearchTerm(params.localidade);
  if (localidade) {
    filters.localidade = localidade;
  }

  if (typeof params.ativo === 'boolean') {
    filters.ativo = params.ativo;
  } else if (typeof params.ativo === 'string') {
    const lower = params.ativo.toLowerCase().trim();
    if (lower === 'true') {
      filters.ativo = true;
    } else if (lower === 'false') {
      filters.ativo = false;
    }
  }

  return filters as SafeNascenteFilters;
}
