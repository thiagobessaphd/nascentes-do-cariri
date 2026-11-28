/**
 * Nascentes do Cariri — Sanitização de Redirecionamentos Administrativos
 *
 * Valida destinos internos sob `/admin` contra Open Redirect e loops em `/admin/login`.
 */

export const ADMIN_LOGIN_PATH = '/admin/login' as const;
export const DEFAULT_ADMIN_REDIRECT_PATH = '/admin' as const;

export const ADMIN_LOGIN_REASONS = {
  LOGOUT: 'logout',
  SESSION_EXPIRED: 'sessao_expirada',
} as const;

export type AdminLoginReason =
  (typeof ADMIN_LOGIN_REASONS)[keyof typeof ADMIN_LOGIN_REASONS];

export interface BuildAdminLoginRedirectUrlOptions {
  readonly reason?: AdminLoginReason | null | undefined;
}

const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/;

function parseValidAdminRedirectPath(rawNext: string | null | undefined): string | null {
  if (typeof rawNext !== 'string' || CONTROL_CHARS_REGEX.test(rawNext)) {
    return null;
  }

  const trimmed = rawNext.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('\\') || trimmed.includes('//') || trimmed.includes('://')) {
    return null;
  }

  const isAdminRoute =
    trimmed === '/admin' ||
    trimmed.startsWith('/admin/') ||
    trimmed.startsWith('/admin?') ||
    trimmed.startsWith('/admin#');

  if (!isAdminRoute) {
    return null;
  }

  const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? '';
  if (pathOnly === ADMIN_LOGIN_PATH || pathOnly.startsWith(`${ADMIN_LOGIN_PATH}/`)) {
    return null;
  }

  return trimmed;
}

// Bloqueia URLs externas, relativas ambíguas e a própria rota de login (loop).
export function sanitizeAdminRedirectPath(
  rawNext: string | null | undefined,
  fallback: string = DEFAULT_ADMIN_REDIRECT_PATH
): string {
  return parseValidAdminRedirectPath(rawNext) ?? fallback;
}

// Valida estritamente o motivo de redirecionamento em allowlist fechada.
export function resolveAdminLoginReason(rawReason: unknown): AdminLoginReason | null {
  const candidate = Array.isArray(rawReason) ? rawReason[0] : rawReason;
  if (typeof candidate !== 'string') {
    return null;
  }

  const normalized = candidate.trim().toLowerCase();
  if (normalized === ADMIN_LOGIN_REASONS.LOGOUT) {
    return ADMIN_LOGIN_REASONS.LOGOUT;
  }
  if (normalized === ADMIN_LOGIN_REASONS.SESSION_EXPIRED) {
    return ADMIN_LOGIN_REASONS.SESSION_EXPIRED;
  }

  return null;
}

export function buildAdminLoginRedirectUrl(
  rawNext?: string | null | undefined,
  options?: BuildAdminLoginRedirectUrlOptions
): string {
  const validPath = parseValidAdminRedirectPath(rawNext);
  const validReason = resolveAdminLoginReason(options?.reason);

  const queryParts: string[] = [];
  if (validPath) {
    queryParts.push(`next=${encodeURIComponent(validPath)}`);
  }
  if (validReason) {
    queryParts.push(`motivo=${encodeURIComponent(validReason)}`);
  }

  if (queryParts.length === 0) {
    return ADMIN_LOGIN_PATH;
  }

  return `${ADMIN_LOGIN_PATH}?${queryParts.join('&')}`;
}
