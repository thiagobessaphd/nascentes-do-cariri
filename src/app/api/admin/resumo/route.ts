/**
 * Nascentes do Cariri — Endpoint Administrativo de Resumo Operacional do Painel
 *
 * GET /api/admin/resumo
 *
 * Retorna indicadores operacionais do painel administrativo (total de nascentes ativas,
 * situação da última importação e os 5 lotes mais recentes) com autenticação obrigatória
 * no MySQL e cabeçalhos `no-store` em respostas de sucesso e erro.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, type PublicErrorResponse } from '@/lib/errors';
import { requireAdminSession } from '@/lib/security/admin-guard';
import { painelService, type AdminResumoResponseDto } from '@/modules/painel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_METHODS = 'GET';

const RESUMO_RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
} as const;

function applyNoStoreHeaders<T extends NextResponse>(response: T): T {
  response.headers.set('Cache-Control', RESUMO_RESPONSE_HEADERS['Cache-Control']);
  response.headers.set('Pragma', RESUMO_RESPONSE_HEADERS.Pragma);
  response.headers.set('Referrer-Policy', RESUMO_RESPONSE_HEADERS['Referrer-Policy']);
  return response;
}

function methodNotAllowedResponse(): NextResponse<PublicErrorResponse> {
  return NextResponse.json(
    {
      error: 'Método não permitido. Utilize GET para consultar o resumo do painel administrativo.',
      code: 'METHOD_NOT_ALLOWED',
    },
    {
      status: 405,
      headers: {
        Allow: ALLOWED_METHODS,
        'Cache-Control': RESUMO_RESPONSE_HEADERS['Cache-Control'],
        Pragma: RESUMO_RESPONSE_HEADERS.Pragma,
        'Referrer-Policy': RESUMO_RESPONSE_HEADERS['Referrer-Policy'],
      },
    }
  );
}

/**
 * GET /api/admin/resumo
 *
 * Contrato MVP sem query params configuráveis: retorna sempre até 5 lotes recentes.
 * Respostas:
 * - 200 OK: AdminResumoResponseDto
 * - 401 Unauthorized: Sessão administrativa ausente, inválida, revogada ou expirada
 * - 403 Forbidden: Conta de administrador inativa
 * - 500 Internal Server Error: Falha interna mascarada
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<AdminResumoResponseDto | PublicErrorResponse>> {
  try {
    await requireAdminSession(request);

    const resumo = await painelService.getResumo();

    return NextResponse.json<AdminResumoResponseDto>(resumo, {
      status: 200,
      headers: RESUMO_RESPONSE_HEADERS,
    });
  } catch (error) {
    const errorResponse = handleApiError(error);
    return applyNoStoreHeaders(errorResponse);
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
