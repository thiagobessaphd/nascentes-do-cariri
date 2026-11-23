/**
 * Nascentes do Cariri — Sanitização de Redirecionamentos Administrativos
 *
 * Módulo compartilhado entre middleware/proxy, Server Components e futuras telas de autenticação para evitar
 * vulnerabilidades de Open Redirect e loops de redirecionamento.
 */

export const ADMIN_LOGIN_PATH = '/admin/login' as const;
export const DEFAULT_ADMIN_REDIRECT_PATH = '/admin/importacoes' as const;

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

/**
 * Valida e sanitiza o caminho de destino pós-login administrativo.
 * Retorna `fallback` para qualquer URL externa, relativa ambígua ou rota de login.
 */
export function sanitizeAdminRedirectPath(
  rawNext: string | null | undefined,
  fallback: string = DEFAULT_ADMIN_REDIRECT_PATH
): string {
  return parseValidAdminRedirectPath(rawNext) ?? fallback;
}

/**
 * Constrói a URL segura de redirecionamento para a tela de login administrativo,
 * anexando `?next=` apenas quando `rawNext` representa uma rota protegida válida.
 */
export function buildAdminLoginRedirectUrl(rawNext?: string | null | undefined): string {
  const validPath = parseValidAdminRedirectPath(rawNext);
  if (!validPath) {
    return ADMIN_LOGIN_PATH;
  }

  return `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(validPath)}`;
}
