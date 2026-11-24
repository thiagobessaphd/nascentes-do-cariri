/**
 * Nascentes do Cariri — Endpoint de Sessão Administrativa Atual
 *
 * GET /api/admin/auth/me — Retorna dados seguros do administrador autenticado e expiração da sessão.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, type PublicErrorResponse } from '@/lib/errors';
import { requireAdminSession } from '@/lib/security/admin-guard';
import { authService, type AuthMeResponseDto } from '@/modules/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_METHODS = 'GET';

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
      error: 'Método não permitido. Utilize GET para consultar a sessão autenticada.',
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

export async function GET(
  request: NextRequest
): Promise<NextResponse<AuthMeResponseDto | PublicErrorResponse>> {
  try {
    const session = await requireAdminSession(request);
    const payload = authService.getAuthenticatedAdmin(session);

    return NextResponse.json<AuthMeResponseDto>(payload, {
      status: 200,
      headers: AUTH_RESPONSE_HEADERS,
    });
  } catch (error) {
    const errorResponse = handleApiError(error);
    return applyAuthNoStoreHeaders(errorResponse);
  }
}

export async function POST(): Promise<NextResponse<PublicErrorResponse>> {
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
