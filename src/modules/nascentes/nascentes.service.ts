import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  UNIDADE_VAZAO_PADRAO,
  type NascentePublicDto,
  type NascentesPublicResponse,
  type NascentesQueryParams,
} from './nascentes.dto';

/**
 * Converte um objeto Date em string no formato estrito AAAA-MM-DD baseado em UTC,
 * prevenindo deslocamentos indevidos causados por fusos horários locais.
 */
function formatDateToIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Consulta e serializa as nascentes ativas para o consumo público da API e do mapa Leaflet.
 */
export async function getNascentesPublicas(
  filters: NascentesQueryParams = {}
): Promise<NascentesPublicResponse> {
  const where: Prisma.NascenteWhereInput = {
    ativo: true,
  };

  // Filtro por município exato
  if (filters.municipio) {
    where.municipio = {
      equals: filters.municipio,
    };
  }

  // Busca textual 'q' em fonte OU localidade
  if (filters.q) {
    where.OR = [
      { fonte: { contains: filters.q } },
      { localidade: { contains: filters.q } },
    ];
  }

  // Filtro de Bounding Box (Área geográfica visível do mapa)
  if (
    filters.north !== undefined &&
    filters.south !== undefined &&
    filters.east !== undefined &&
    filters.west !== undefined
  ) {
    where.latitude = {
      gte: filters.south,
      lte: filters.north,
    };
    where.longitude = {
      gte: filters.west,
      lte: filters.east,
    };
  }

  const records = await prisma.nascente.findMany({
    where,
    select: {
      id: true,
      latitude: true,
      longitude: true,
      municipio: true,
      fonte: true,
      localidade: true,
      dataCriacao: true,
      vazaoMedia: true,
      updatedAt: true,
    },
    orderBy: [
      { municipio: 'asc' },
      { fonte: 'asc' },
      { id: 'asc' },
    ],
  });

  let latestUpdatedAt: Date | null = null;
  for (const record of records) {
    if (!latestUpdatedAt || record.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = record.updatedAt;
    }
  }

  const data: NascentePublicDto[] = records.map((record) => {
    return {
      id: record.id,
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      municipio: record.municipio,
      fonte: record.fonte,
      localidade: record.localidade,
      data_criacao: formatDateToIsoDate(record.dataCriacao),
      vazao_media: Number(record.vazaoMedia),
      unidade_vazao: UNIDADE_VAZAO_PADRAO,
    };
  });

  const formattedUpdatedAt: string | null = latestUpdatedAt
    ? latestUpdatedAt.toISOString()
    : null;

  return {
    data,
    meta: {
      total: data.length,
      updated_at: formattedUpdatedAt,
    },
  };
}
