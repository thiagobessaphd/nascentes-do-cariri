/**
 * Nascentes do Cariri — Rota Administrativa de Cancelamento de Importação Pendente
 *
 * DELETE /api/admin/importacoes/[id]
 *
 * Endpoint administrativo autenticado para cancelar uma importação pendente
 * (status AGUARDANDO_CONFIRMACAO), validando ownership, transicionando atomicamente
 * para CANCELADA e preservando o arquivo TXT original no storage privado para auditoria.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/security/admin-guard';
import { handleApiError, type PublicErrorResponse } from '@/lib/errors';
import {
  importacaoCommitService,
  parseImportacaoRouteId,
  type ImportacaoCancelResponseDto,
  type ImportacaoRouteContext,
} from '@/modules/importacoes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_METHODS = 'DELETE';

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
      error: 'Método não permitido. Utilize DELETE para cancelar uma importação pendente.',
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
 * DELETE /api/admin/importacoes/[id]
 *
 * Respostas:
 * - 200 OK: ImportacaoCancelResponseDto (status CANCELADA e concluidaAt)
 * - 400 Bad Request: Identificador [id] inválido na URL
 * - 401 Unauthorized: Sessão administrativa ausente, inválida ou expirada
 * - 403 Forbidden: Conta de administrador inativa ou violação de ownership
 * - 404 Not Found: Importação não encontrada
 * - 409 Conflict: Importação já processada, cancelada ou em estado inválido
 * - 500 Internal Server Error: Falha interna de persistência
 */
export async function DELETE(
  request: NextRequest,
  context: ImportacaoRouteContext
): Promise<NextResponse<ImportacaoCancelResponseDto | PublicErrorResponse>> {
  try {
    const sessionUser = await requireAdminSession(request);

    const resolvedParams = await Promise.resolve(context.params);
    const importacaoId = parseImportacaoRouteId(resolvedParams?.id);

    const result = await importacaoCommitService.cancelImportacao({
      importacaoId,
      usuarioId: sessionUser.id,
    });

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
 * (Nota: GET será implementado na Task-27 para consulta de detalhe da importação.)
 */
export async function GET(): Promise<NextResponse<PublicErrorResponse>> {
  return methodNotAllowedResponse();
}

export async function POST(): Promise<NextResponse<PublicErrorResponse>> {
  return methodNotAllowedResponse();
}

export async function PUT(): Promise<NextResponse<PublicErrorResponse>> {
  return methodNotAllowedResponse();
}

export async function PATCH(): Promise<NextResponse<PublicErrorResponse>> {
  return methodNotAllowedResponse();
}
