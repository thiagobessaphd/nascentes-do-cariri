/**
 * Nascentes do Cariri — Rota Administrativa de Confirmação Atômica de Importação
 *
 * POST /api/admin/importacoes/[id]/confirmar
 *
 * Endpoint administrativo autenticado para confirmar uma importação validada
 * (status AGUARDANDO_CONFIRMACAO), validando ownership, executando persistência
 * transacional "tudo-ou-nada" com deduplicação e invalidando o cache público pós-commit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/security/admin-guard';
import { handleApiError, type PublicErrorResponse } from '@/lib/errors';
import {
  importacaoCommitService,
  parseImportacaoRouteId,
  type ImportacaoConfirmResponseDto,
  type ImportacaoRouteContext,
} from '@/modules/importacoes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
      error: 'Método não permitido. Utilize POST para confirmar uma importação.',
      code: 'METHOD_NOT_ALLOWED',
    },
    {
      status: 405,
      headers: {
        Allow: 'POST',
        'Cache-Control': 'no-store',
      },
    }
  );
}

/**
 * POST /api/admin/importacoes/[id]/confirmar
 *
 * Respostas:
 * - 200 OK: ImportacaoConfirmResponseDto (status CONCLUIDA, resumo e cacheInvalidated=true)
 * - 400 Bad Request: Identificador [id] inválido na URL
 * - 401 Unauthorized: Sessão administrativa ausente, inválida ou expirada
 * - 403 Forbidden: Conta de administrador inativa ou violação de ownership
 * - 404 Not Found: Importação não encontrada
 * - 409 Conflict: Importação já processada, cancelada ou em estado inválido
 * - 422 Unprocessable Entity: Falha de integridade SHA-256 ou conteúdo do arquivo TXT original
 * - 500 Internal Server Error: Falha interna na transação (com rollback integral garantido)
 */
export async function POST(
  request: NextRequest,
  context: ImportacaoRouteContext
): Promise<NextResponse<ImportacaoConfirmResponseDto | PublicErrorResponse>> {
  try {
    const sessionUser = await requireAdminSession(request);

    const resolvedParams = await Promise.resolve(context.params);
    const importacaoId = parseImportacaoRouteId(resolvedParams?.id);

    const result = await importacaoCommitService.confirmImportacao({
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
 */
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
