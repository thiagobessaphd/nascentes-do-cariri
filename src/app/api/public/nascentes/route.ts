import { NextRequest, NextResponse } from 'next/server';
import { parseNascentesQueryParams, getNascentesPublicas } from '@/modules/nascentes';
import { handleApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/public/nascentes
 * 
 * Endpoint público que expõe as nascentes ativas com suporte a filtros
 * por município, busca textual (fonte/localidade) e bounding box geográfico.
 * 
 * Responde conforme o contrato oficial:
 * 200 OK: { data: [...], meta: { total: number, updated_at: string | null } }
 * 400 Bad Request: { error: string, code: 'VALIDATION_ERROR', details: [...] }
 * 500 Internal Server Error: { error: string, code: 'INTERNAL_SERVER_ERROR' }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;

    const rawParams = {
      municipio: searchParams.get('municipio') ?? undefined,
      q: searchParams.get('q') ?? undefined,
      north: searchParams.get('north') ?? undefined,
      south: searchParams.get('south') ?? undefined,
      east: searchParams.get('east') ?? undefined,
      west: searchParams.get('west') ?? undefined,
    };

    const validatedParams = parseNascentesQueryParams(rawParams);
    const result = await getNascentesPublicas(validatedParams);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
