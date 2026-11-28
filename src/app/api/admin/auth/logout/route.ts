/**
 * Nascentes do Cariri — Endpoint de Encerramento de Sessão Administrativa (Logout)
 *
 * POST /api/admin/auth/logout — Revoga a sessão atual no banco (best-effort),
 * expira ambos os cookies de sessão (`__Host-` e desenvolvimento) e retorna `200 { loggedOut: true }`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { serializeAllExpiredSessionCookies } from '@/config/session-cookies';
import type { PublicErrorResponse } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  AUTH_ERROR_CODES,
  authService,
  logoutResponseSchema,
  type LogoutResponseDto,
} from '@/modules/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_METHODS = 'POST';

const AUTH_RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
} as const;

function applyAuthNoStoreHeaders<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', AUTH_RESPONSE_HEADERS['Cache-Control']);
  response.headers.set('Pragma', AUTH_RESPONSE_HEADERS.Pragma);
  response.headers.set('Referrer-Policy', AUTH_RESPONSE_HEADERS['Referrer-Policy']);
  return response;
}

function methodNotAllowedResponse(): NextResponse<PublicErrorResponse> {
  return NextResponse.json(
    {
      error: 'Método não permitido. Utilize POST para encerrar a sessão administrativa.',
      code: 'METHOD_NOT_ALLOWED',
    },
    {
      status: 405,
      headers: {
        Allow: ALLOWED_METHODS,
        'Cache-Control': AUTH_RESPONSE_HEADERS['Cache-Control'],
        Pragma: AUTH_RESPONSE_HEADERS.Pragma,
        'Referrer-Policy': AUTH_RESPONSE_HEADERS['Referrer-Policy'],
      },
    }
  );
}

function normalizeOrigin(rawOrigin: string): string | null {
  const trimmed = rawOrigin.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

function resolveExpectedRequestOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>();

  const requestUrlOrigin = normalizeOrigin(request.url);
  if (requestUrlOrigin) {
    origins.add(requestUrlOrigin);
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim();

  if (host) {
    const forwardedProto = request.headers
      .get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      .toLowerCase();

    let fallbackProto = 'http';
    try {
      fallbackProto = new URL(request.url).protocol.replace(':', '').toLowerCase();
    } catch {
      fallbackProto = 'http';
    }

    const proto =
      forwardedProto === 'https' || forwardedProto === 'http'
        ? forwardedProto
        : fallbackProto;

    const headerOrigin = normalizeOrigin(`${proto}://${host}`);
    if (headerOrigin) {
      origins.add(headerOrigin);
    }
  }

  return origins;
}

function isCrossSiteLogoutRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return true;
  }

  const rawOrigin = request.headers.get('origin');
  if (rawOrigin !== null) {
    const normalizedOrigin = normalizeOrigin(rawOrigin);
    if (!normalizedOrigin) {
      return true;
    }

    const expectedOrigins = resolveExpectedRequestOrigins(request);
    if (!expectedOrigins.has(normalizedOrigin)) {
      return true;
    }
  }

  return false;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<LogoutResponseDto | PublicErrorResponse>> {
  if (isCrossSiteLogoutRequest(request)) {
    const forbiddenResponse = NextResponse.json<PublicErrorResponse>(
      {
        error: 'Origem da requisição não autorizada para encerrar a sessão.',
        code: AUTH_ERROR_CODES.FORBIDDEN_CROSS_ORIGIN,
      },
      {
        status: 403,
        headers: AUTH_RESPONSE_HEADERS,
      }
    );

    return applyAuthNoStoreHeaders(forbiddenResponse);
  }

  try {
    await authService.revokeSessionByToken(request);
  } catch (error: unknown) {
    const safeErrorName = error instanceof Error ? error.name : 'UnknownError';
    logger.error('Falha não-bloqueante ao revogar sessão administrativa no logout.', {
      errorName: safeErrorName,
    });
  }

  const payload: LogoutResponseDto = logoutResponseSchema.parse({ loggedOut: true });

  const response = NextResponse.json<LogoutResponseDto>(payload, {
    status: 200,
    headers: AUTH_RESPONSE_HEADERS,
  });

  for (const expiredCookieHeader of serializeAllExpiredSessionCookies()) {
    response.headers.append('Set-Cookie', expiredCookieHeader);
  }

  return applyAuthNoStoreHeaders(response);
}

export async function GET(): Promise<NextResponse<PublicErrorResponse>> {
  return methodNotAllowedResponse();
}

export async function PUT(): Promise<NextResponse<PublicErrorResponse>> {
  return methodNotAllowedResponse();
}

export async function DELETE(): Promise<NextResponse<PublicErrorResponse>> {
  return methodNotAllowedResponse();
}

export async function PATCH(): Promise<NextResponse<PublicErrorResponse>> {
  return methodNotAllowedResponse();
}
