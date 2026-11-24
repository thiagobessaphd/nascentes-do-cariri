/**
 * Nascentes do Cariri — Endpoint de Login Administrativo
 *
 * POST /api/admin/auth/login — Autentica administrador, persiste sessão no MySQL e emite cookie HttpOnly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { serializeSessionCookie } from '@/config/session-cookies';
import { AppError, handleApiError, type PublicErrorResponse } from '@/lib/errors';
import {
  AUTH_ERROR_CODES,
  DEFAULT_ADMIN_SESSION_TTL_SECONDS,
  LoginRateLimitError,
  authService,
  extractClientIpFromHeaders,
  loginRequestSchema,
  type LoginResponseDto,
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
      error: 'Método não permitido. Utilize POST para autenticar.',
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

export async function POST(
  request: NextRequest
): Promise<NextResponse<LoginResponseDto | PublicErrorResponse>> {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new AppError(
        'Corpo da requisição JSON inválido.',
        400,
        AUTH_ERROR_CODES.VALIDATION_ERROR
      );
    }

    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      throw new AppError(
        'O corpo da requisição deve ser um objeto JSON válido.',
        400,
        AUTH_ERROR_CODES.VALIDATION_ERROR
      );
    }

    const credentials = loginRequestSchema.parse(rawBody);
    const clientIp = extractClientIpFromHeaders(request);

    const authResult = await authService.authenticateAdmin({
      email: credentials.email,
      password: credentials.password,
      clientIp,
    });

    const payload: LoginResponseDto = {
      user: authResult.user,
      session: authResult.session,
    };

    const response = NextResponse.json<LoginResponseDto>(payload, {
      status: 200,
      headers: AUTH_RESPONSE_HEADERS,
    });

    response.headers.append(
      'Set-Cookie',
      serializeSessionCookie(authResult.token, {
        maxAgeSeconds: DEFAULT_ADMIN_SESSION_TTL_SECONDS,
      })
    );

    return response;
  } catch (error) {
    const errorResponse = handleApiError(error);
    applyAuthNoStoreHeaders(errorResponse);

    if (error instanceof LoginRateLimitError) {
      errorResponse.headers.set('Retry-After', String(error.retryAfterSeconds));
    }

    return errorResponse;
  }
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
