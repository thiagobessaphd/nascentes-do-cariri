/**
 * Nascentes do Cariri — Rota Administrativa de Validação e Prévia de Importações
 *
 * POST /api/admin/importacoes/validar
 *
 * Endpoint administrativo para upload preliminar, validação de integridade física
 * e de negócio e prévia do arquivo TXT de nascentes com registro de auditoria.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/security/admin-guard';
import { handleApiError, AppError, type PublicErrorResponse } from '@/lib/errors';
import {
  extractUploadedFilesFromFormData,
  importacaoValidationService,
  type ImportacaoValidationResponseDto,
} from '@/modules/importacoes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Resposta padronizada para métodos HTTP não permitidos (405 Method Not Allowed).
 */
function methodNotAllowedResponse(): NextResponse<PublicErrorResponse> {
  return NextResponse.json(
    {
      error: 'Método não permitido. Utilize POST para validação de importações.',
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
 * POST /api/admin/importacoes/validar
 *
 * Endpoint administrativo para upload, validação preliminar fail-fast
 * e geração de prévia de importação de arquivo TXT de nascentes.
 *
 * Respostas:
 * - 200 OK: ImportacaoValidationResponseDto (diagnóstico e contadores consolidados)
 * - 400 Bad Request: Arquivo inválido, binário, vazio ou Content-Type incorreto
 * - 401 Unauthorized: Sessão ausente, inválida ou expirada
 * - 403 Forbidden: Conta de administrador inativa
 * - 413 Payload Too Large: Arquivo excede o limite configurado (5MB)
 * - 500 Internal Server Error: Falha interna de processamento
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ImportacaoValidationResponseDto | PublicErrorResponse>> {
  try {
    const sessionUser = await requireAdminSession(request);

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      throw new AppError(
        'Content-Type inválido. A requisição deve ser multipart/form-data.',
        400,
        'INVALID_CONTENT_TYPE'
      );
    }
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new AppError(
        'Falha ao processar o formulário multipart/form-data enviado.',
        400,
        'MALFORMED_FORM_DATA'
      );
    }

    const files = await extractUploadedFilesFromFormData(formData);

    const result = await importacaoValidationService.validateAndPreview({
      files,
      usuarioId: sessionUser.id,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
      },
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

