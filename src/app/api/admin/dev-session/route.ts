/**
 * Nascentes do Cariri — Emissão de Cookie de Sessão Administrativa em Desenvolvimento
 *
 * GET /api/admin/dev-session?token=<JWT_ASSINADO>
 * DELETE /api/admin/dev-session
 *
 * Rota auxiliar exclusiva para desenvolvimento local (enquanto a tela de login
 * não está implementada). Exige token JWT válido assinado com AUTH_SECRET por meio do script
 * CLI `npm run auth:dev` e pertencente a um administrador ativo no banco de dados.
 * Retorna 404 Not Found em qualquer ambiente diferente de `development`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyAdminSessionToken } from '@/lib/security/admin-guard';
import {
  serializeExpiredSessionCookie,
  serializeSessionCookie,
} from '@/config/session-cookies';

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

function resolveSafeAdminRedirect(rawNext: string | null): string {
  if (!rawNext) {
    return '/admin/importacoes';
  }
  const trimmed = rawNext.trim();
  if (
    trimmed.startsWith('/admin') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('\\')
  ) {
    return trimmed;
  }
  return '/admin/importacoes';
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

  const payload = verifyAdminSessionToken(token);
  if (!payload) {
    return NextResponse.json(
      {
        error: 'Token de sessão inválido ou expirado.',
        code: 'UNAUTHORIZED',
      },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const adminUser = await prisma.usuario.findUnique({
    where: { id: payload.userId },
    select: { id: true, ativo: true },
  });

  if (!adminUser) {
    return NextResponse.json(
      {
        error: 'Administrador associado ao token não encontrado.',
        code: 'USER_NOT_FOUND',
      },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  if (!adminUser.ativo) {
    return NextResponse.json(
      {
        error: 'Conta de administrador inativa.',
        code: 'FORBIDDEN_INACTIVE_USER',
      },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const redirectPath = resolveSafeAdminRedirect(
    request.nextUrl.searchParams.get('next')
  );
  const destinationUrl = new URL(redirectPath, request.url);
  const response = NextResponse.redirect(destinationUrl, {
    status: 303,
    headers: NO_STORE_HEADERS,
  });

  response.headers.append(
    'Set-Cookie',
    serializeSessionCookie(token, { isProduction: false })
  );

  return response;
}

export async function DELETE(): Promise<NextResponse> {
  if (process.env.NODE_ENV !== 'development') {
    return notFoundInNonDevResponse();
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
