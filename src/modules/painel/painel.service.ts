/**
 * Nascentes do Cariri — Serviço Server-Side de Resumo Operacional do Painel Administrativo
 *
 * Responsabilidades:
 * 1. Executar em paralelo (Promise.all — 1 RTT lógico) as consultas leves no MySQL:
 *    - contagem de nascentes ativas via índice `nascentes_ativo_idx` (Index-Only Scan);
 *    - últimos N lotes de importação ordenados por `(createdAt DESC, id DESC)`;
 *    - contagem total de lotes registrados;
 * 2. Aplicar projeção estrita (allowlist) omitindo `caminhoPrivadoArquivo`, `hashArquivo`,
 *    `mensagemErro`, `usuario.email`, `passwordHash` e `tokenHash`;
 * 3. Reaproveitar `historicoRecente[0]` como `ultimaImportacao` sem query extra.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import {
  ADMIN_RECENT_IMPORTACOES_LIMIT,
  PAINEL_ERROR_CODES,
  type AdminResumoImportacaoItemDto,
  type AdminResumoResponseDto,
} from './painel.contracts';
import {
  getAdminResumoOptionsSchema,
  type GetAdminResumoOptions,
  type IPainelService,
  type PainelServiceDeps,
} from './painel.types';

/**
 * Projeção fechada para o resumo do painel `/admin`.
 * Exclui colunas privadas, `TEXT` off-page (`mensagemErro`), hashes e PII desnecessária (`email`).
 */
const ADMIN_RESUMO_IMPORTACAO_SELECT = {
  id: true,
  nomeArquivo: true,
  status: true,
  totalLinhas: true,
  totalValidas: true,
  totalInvalidas: true,
  totalDuplicadas: true,
  createdAt: true,
  concluidaAt: true,
  usuario: {
    select: {
      id: true,
      nome: true,
    },
  },
} satisfies Prisma.ImportacaoSelect;

type AdminResumoImportacaoRow = Prisma.ImportacaoGetPayload<{
  select: typeof ADMIN_RESUMO_IMPORTACAO_SELECT;
}>;

function toResumoImportacaoItemDto(
  row: AdminResumoImportacaoRow
): AdminResumoImportacaoItemDto {
  return {
    id: row.id,
    nomeArquivo: row.nomeArquivo,
    status: row.status,
    totalLinhas: row.totalLinhas,
    totalValidas: row.totalValidas,
    totalInvalidas: row.totalInvalidas,
    totalDuplicadas: row.totalDuplicadas,
    createdAt: row.createdAt.toISOString(),
    concluidaAt: row.concluidaAt ? row.concluidaAt.toISOString() : null,
    usuario: {
      id: row.usuario.id,
      nome: row.usuario.nome,
    },
  };
}

export class PainelService implements IPainelService {
  private readonly prisma: PrismaClient;

  constructor(deps?: PainelServiceDeps) {
    this.prisma = deps?.prismaClient ?? defaultPrisma;
  }

  /**
   * Consulta os indicadores operacionais e o histórico recente do painel administrativo
   * diretamente no MySQL (sem cache público).
   */
  async getResumo(options?: GetAdminResumoOptions): Promise<AdminResumoResponseDto> {
    const candidateOptions =
      options?.recentLimit !== undefined ? { recentLimit: options.recentLimit } : {};

    const parsedOptions = getAdminResumoOptionsSchema.safeParse(candidateOptions);
    if (!parsedOptions.success) {
      throw new AppError(
        parsedOptions.error.issues[0]?.message ??
          'Parâmetros inválidos para consultar o resumo do painel administrativo.',
        400,
        PAINEL_ERROR_CODES.INVALID_PAINEL_INPUT
      );
    }

    const recentLimit = parsedOptions.data.recentLimit ?? ADMIN_RECENT_IMPORTACOES_LIMIT;
    const now = options?.now ?? new Date();

    const [totalNascentesAtivas, recentRows, totalImportacoes] = await Promise.all([
      this.prisma.nascente.count({
        where: { ativo: true },
      }),
      this.prisma.importacao.findMany({
        select: ADMIN_RESUMO_IMPORTACAO_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: recentLimit,
      }),
      this.prisma.importacao.count(),
    ]);

    const historicoRecente: readonly AdminResumoImportacaoItemDto[] = recentRows.map(
      toResumoImportacaoItemDto
    );
    const ultimaImportacao = historicoRecente[0] ?? null;

    return {
      indicadores: {
        totalNascentesAtivas,
        totalImportacoes,
        ultimaImportacao,
      },
      historicoRecente,
      meta: {
        recentLimit,
        generatedAt: now.toISOString(),
      },
    };
  }
}

export const painelService = new PainelService();
