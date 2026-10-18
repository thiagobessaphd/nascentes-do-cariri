import { prisma } from '@/lib/db/prisma';
import type { MunicipiosPublicResponse } from './municipios.dto';

/**
 * Consulta a lista de municípios únicos que possuem nascentes ativas.
 *
 * Diretrizes de persistência e arquitetura:
 * - Filtra estritamente por `ativo: true`.
 * - Projeção fechada: seleciona apenas a coluna `municipio`.
 * - Utiliza DISTINCT para deduplicação no banco de dados.
 *
 * @returns Lista de municípios ordenados alfabeticamente e metadados de contagem.
 */
export async function getMunicipiosPublicos(): Promise<MunicipiosPublicResponse> {
  const records = await prisma.nascente.findMany({
    where: {
      ativo: true,
    },
    select: {
      municipio: true,
    },
    distinct: ['municipio'],
    orderBy: {
      municipio: 'asc',
    },
  });

  const municipios = Array.from(
    new Set(
      records
        .map((r) => r.municipio.trim())
        .filter((m) => m.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

  return {
    data: municipios,
    meta: {
      total: municipios.length,
    },
  };
}
