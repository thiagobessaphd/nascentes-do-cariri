export const SESSION_COOKIE_NAMES = {
  DEVELOPMENT: 'nascentes.session-token',
  PRODUCTION: '__Host-nascentes.session-token',
} as const;

export type SessionCookieName =
  (typeof SESSION_COOKIE_NAMES)[keyof typeof SESSION_COOKIE_NAMES];

export const SESSION_COOKIE_DEFAULTS = {
  HTTP_ONLY: true,
  SAME_SITE: 'lax',
  PATH: '/',
  DEFAULT_MAX_AGE_SECONDS: 30 * 24 * 60 * 60, // 30 dias
} as const;

export interface SessionCookieOptions {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: 'lax';
  readonly path: '/';
  readonly maxAge: number;
}

export interface SessionCookieConfig {
  readonly name: SessionCookieName;
  readonly options: SessionCookieOptions;
}

export interface SessionCookieConfigParams {
  readonly isProduction?: boolean;
  readonly maxAgeSeconds?: number;
}

/**
 * Retorna as configurações de cookie de sessão baseadas no ambiente.
 * Em produção (HTTPS), aplica prefixo __Host- e flag Secure obrigatória.
 * Em desenvolvimento (HTTP local), utiliza nome padrão e Secure desligado para permitir testes em localhost.
 */
export function getSessionCookieConfig(
  params?: SessionCookieConfigParams
): SessionCookieConfig {
  const isProduction =
    params?.isProduction ?? process.env.NODE_ENV === 'production';

  const maxAge =
    params?.maxAgeSeconds ?? SESSION_COOKIE_DEFAULTS.DEFAULT_MAX_AGE_SECONDS;

  const name: SessionCookieName = isProduction
    ? SESSION_COOKIE_NAMES.PRODUCTION
    : SESSION_COOKIE_NAMES.DEVELOPMENT;

  return {
    name,
    options: {
      httpOnly: SESSION_COOKIE_DEFAULTS.HTTP_ONLY,
      secure: isProduction,
      sameSite: SESSION_COOKIE_DEFAULTS.SAME_SITE,
      path: SESSION_COOKIE_DEFAULTS.PATH,
      maxAge,
    },
  };
}

/**
 * Constrói a string do cabeçalho Set-Cookie para respostas HTTP manuais ou Route Handlers.
 */
export function serializeSessionCookie(
  token: string,
  params?: SessionCookieConfigParams
): string {
  const { name, options } = getSessionCookieConfig(params);

  const parts: string[] = [
    `${name}=${encodeURIComponent(token)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    `SameSite=${options.sameSite === 'lax' ? 'Lax' : 'Strict'}`,
  ];

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Constrói a string de remoção/expiração imediata de cookie para logout.
 */
export function serializeExpiredSessionCookie(
  params?: SessionCookieConfigParams
): string {
  const { name, options } = getSessionCookieConfig(params);

  const parts: string[] = [
    `${name}=`,
    `Path=${options.path}`,
    'Max-Age=0',
    `Expires=${new Date(0).toUTCString()}`,
    `SameSite=${options.sameSite === 'lax' ? 'Lax' : 'Strict'}`,
  ];

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Constrói os cabeçalhos Set-Cookie de expiração imediata para ambos os nomes
 * de cookie de sessão (`__Host-` e desenvolvimento), eliminando cookies residuais
 * em transições de ambiente local/produção.
 */
export function serializeAllExpiredSessionCookies(): string[] {
  const candidates = [
    serializeExpiredSessionCookie({ isProduction: true }),
    serializeExpiredSessionCookie({ isProduction: false }),
  ];

  return Array.from(new Set(candidates));
}

function safeDecodeCookieValue(rawValue: string): string | null {
  if (!rawValue) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(rawValue).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Extrai o token de sessão a partir do cabeçalho Cookie, priorizando o cookie `__Host-`
 * sobre o de desenvolvimento, ignorando valores vazios e tratando percent-encoding malformado.
 */
export function extractSessionToken(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  let devFallback: string | null = null;
  const cookies = cookieHeader.split(';');

  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim();
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();

    if (key === SESSION_COOKIE_NAMES.PRODUCTION) {
      const decodedProd = safeDecodeCookieValue(value);
      if (decodedProd) {
        return decodedProd;
      }
      continue;
    }

    if (key === SESSION_COOKIE_NAMES.DEVELOPMENT && devFallback === null) {
      devFallback = safeDecodeCookieValue(value);
    }
  }

  return devFallback;
}
