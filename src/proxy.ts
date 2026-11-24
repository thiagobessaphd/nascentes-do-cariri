/**
 * Nascentes do Cariri — Proxy de Proteção de Rotas Administrativas (Next.js 16)
 *
 * Primeira barreira de defesa (Defense in Depth) para `/admin/*` e `/api/admin/*`.
 * Valida assinatura HMAC-SHA256 e expiração do token sem consultar o banco de dados;
 * a verificação autoritativa (revogação e status ativo no MySQL) ocorre nos Route Handlers e Server Components.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAMES, extractSessionToken } from '@/config/session-cookies';
import { ADMIN_LOGIN_PATH, buildAdminLoginRedirectUrl } from '@/lib/security/admin-redirect';
import {
  extractAuthTokenFromRequest,
  verifyAdminSessionToken,
} from '@/lib/security/admin-session-token';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
} as const;

const ADMIN_API_PREFIX = '/api/admin';
const ADMIN_LOGIN_API_PATH = '/api/admin/auth/login';
const ADMIN_DEV_SESSION_API_PATH = '/api/admin/dev-session';

function isAdminLoginPage(pathname: string): boolean {
  return pathname === ADMIN_LOGIN_PATH || pathname.startsWith(`${ADMIN_LOGIN_PATH}/`);
}

function isAdminApiRoute(pathname: string): boolean {
  return pathname === ADMIN_API_PREFIX || pathname.startsWith(`${ADMIN_API_PREFIX}/`);
}

function isAdminPageRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isExemptAdminApiRoute(pathname: string): boolean {
  if (pathname === ADMIN_LOGIN_API_PATH || pathname === `${ADMIN_LOGIN_API_PATH}/`) {
    return true;
  }

  if (
    process.env.NODE_ENV === 'development' &&
    (pathname === ADMIN_DEV_SESSION_API_PATH || pathname === `${ADMIN_DEV_SESSION_API_PATH}/`)
  ) {
    return true;
  }

  return false;
}

function safeDecodeCookieCandidate(rawValue: string | undefined): string | null {
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

function extractCookieSessionToken(request: NextRequest): string | null {
  const fromHeader = extractSessionToken(request.headers.get('cookie'));
  if (fromHeader) {
    return fromHeader;
  }

  return (
    safeDecodeCookieCandidate(request.cookies.get(SESSION_COOKIE_NAMES.PRODUCTION)?.value) ??
    safeDecodeCookieCandidate(request.cookies.get(SESSION_COOKIE_NAMES.DEVELOPMENT)?.value)
  );
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (isAdminApiRoute(pathname)) {
    if (isExemptAdminApiRoute(pathname)) {
      return NextResponse.next();
    }

    const token = extractCookieSessionToken(request) ?? extractAuthTokenFromRequest(request);
    if (!token || !verifyAdminSessionToken(token)) {
      return NextResponse.json(
        {
          error: 'Acesso não autorizado: sessão de administrador ausente ou inválida.',
          code: 'UNAUTHORIZED',
        },
        {
          status: 401,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    return NextResponse.next();
  }

  if (isAdminPageRoute(pathname)) {
    if (isAdminLoginPage(pathname)) {
      return NextResponse.next();
    }

    const cookieToken = extractCookieSessionToken(request);
    if (!cookieToken || !verifyAdminSessionToken(cookieToken)) {
      const loginPath = buildAdminLoginRedirectUrl(`${pathname}${search}`);
      const destinationUrl = new URL(loginPath, request.url);
      return NextResponse.redirect(destinationUrl, {
        status: 307,
        headers: NO_STORE_HEADERS,
      });
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};
