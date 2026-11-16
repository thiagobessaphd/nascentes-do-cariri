/**
 * Nascentes do Cariri — Rota Administrativa de Histórico de Importações
 *
 * GET /api/admin/importacoes
 *
 * Endpoint administrativo autenticado para listar o histórico paginado e ordenado
 * das importações realizadas, permitindo filtragem opcional por status
 * e omitindo estritamente caminhos privados de storage e hashes de senha.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/security/admin-guard';
import { handleApiError, type PublicErrorResponse } from '@/lib/errors';
import {
  importacaoHistoryService,
  parseImportacoesHistorySearchParams,
  type ImportacaoHistoryListResponseDto,
} from '@/modules/importacoes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_METHODS = 'GET';

const NO_STORE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
} as const;

/**
 * Resposta padronizada para métodos HTTP não permitidos (405 Method Not Allowed).
 */
function methodNotAllowedResponse(): NextResponse<PublicErrorResponse> {
  return NextResponse.json(
    {
      error: 'Método não permitido. Utilize GET para consultar o histórico de importações.',
      code: 'METHOD_NOT_ALLOWED',
    },
    {
      status: 405,
      headers: {
        Allow: ALLOWED_METHODS,
        'Cache-Control': 'no-store',
      },
    }
  );
}

/**
 * GET /api/admin/importacoes
 *
 * Respostas:
 * - 200 OK: ImportacaoHistoryListResponseDto (lista paginada e ordenada por data desc)
 * - 400 Bad Request: Query params de paginação ou status inválidos
 * - 401 Unauthorized: Sessão administrativa ausente, inválida ou expirada
 * - 403 Forbidden: Conta de administrador inativa
 * - 500 Internal Server Error: Falha interna de consulta
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ImportacaoHistoryListResponseDto | PublicErrorResponse>> {
  try {
    await requireAdminSession(request);

    const searchParams = request.nextUrl?.searchParams ?? new URL(request.url).searchParams;
    const query = parseImportacoesHistorySearchParams(searchParams);

    const result = await importacaoHistoryService.listHistory(query);

    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Handlers explícitos para métodos não permitidos garantem contrato 405 consistente.
 */
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

