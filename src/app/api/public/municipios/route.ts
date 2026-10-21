import { NextResponse } from 'next/server';
import { getMunicipiosPublicos } from '@/modules/municipios';
import { handleApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/public/municipios
 *
 * Endpoint público que expõe a lista de municípios com nascentes ativas cadastradas.
 * Utilizado para alimentar o filtro de municípios no mapa público.
 *
 * Respostas:
 * - 200 OK: { data: readonly string[], meta: { total: number } }
 * - 500 Internal Server Error: { error: string, code: 'INTERNAL_SERVER_ERROR' }
 */
export async function GET(): Promise<NextResponse> {
  try {
    const result = await getMunicipiosPublicos();

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
