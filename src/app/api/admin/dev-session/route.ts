/**
 * Nascentes do Cariri — Emissão de Cookie de Sessão Administrativa em Desenvolvimento
 *
 * GET /api/admin/dev-session?token=<JWT_ASSINADO>
 * DELETE /api/admin/dev-session
 *
 * Rota auxiliar exclusiva para desenvolvimento local (`NODE_ENV === 'development'`),
 * vinculada à validação de sessões persistidas em `sessoes`. Retorna 404 nos demais ambientes.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  serializeExpiredSessionCookie,
  serializeSessionCookie,
} from '@/config/session-cookies';
import { AppError, handleApiError } from '@/lib/errors';
import { requireAdminSession } from '@/lib/security/admin-guard';
import { sanitizeAdminRedirectPath } from '@/lib/security/admin-redirect';
import { authService } from '@/modules/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
} as const;

function notFoundInNonDevResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Endpoint não disponível neste ambiente.', code: 'NOT_FOUND' },
    { status: 404, headers: NO_STORE_HEADERS }
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV !== 'development') {
    return notFoundInNonDevResponse();
  }

  const token = request.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json(
      {
        error:
          'Token de desenvolvimento ausente. Gere o link executando `npm run auth:dev`.',
        code: 'MISSING_DEV_TOKEN',
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let maxAgeSeconds: number;
  try {
    const session = await requireAdminSession(token);
    maxAgeSeconds = Math.max(
      1,
      Math.floor((session.sessionExpiresAt.getTime() - Date.now()) / 1000)
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode, headers: NO_STORE_HEADERS }
      );
    }
    return handleApiError(error);
  }

  const redirectPath = sanitizeAdminRedirectPath(
    request.nextUrl.searchParams.get('next')
  );
  const destinationUrl = new URL(redirectPath, request.url);
  const response = NextResponse.redirect(destinationUrl, {
    status: 303,
    headers: NO_STORE_HEADERS,
  });

  response.headers.append(
    'Set-Cookie',
    serializeSessionCookie(token, { isProduction: false, maxAgeSeconds })
  );

  return response;
}

export async function DELETE(request?: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV !== 'development') {
    return notFoundInNonDevResponse();
  }

  if (request) {
    try {
      await authService.revokeSessionByToken(request);
    } catch {
      // Limpeza do cookie prossegue mesmo que o banco esteja indisponível em dev
    }
  }

  const response = NextResponse.json(
    { cleared: true },
    { status: 200, headers: NO_STORE_HEADERS }
  );
  response.headers.append(
    'Set-Cookie',
    serializeExpiredSessionCookie({ isProduction: false })
  );

  return response;
}
