/**
 * Nascentes do Cariri — Tipos Server-Side do Módulo de Painel Administrativo
 */

import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  ADMIN_RECENT_IMPORTACOES_LIMIT,
  MAX_ADMIN_RECENT_IMPORTACOES_LIMIT,
  type AdminResumoResponseDto,
} from './painel.contracts';

export const getAdminResumoOptionsSchema = z
  .object({
    recentLimit: z
      .number()
      .int('O limite de histórico recente deve ser um número inteiro.')
      .min(1, 'O limite de histórico recente deve ser no mínimo 1.')
      .max(
        MAX_ADMIN_RECENT_IMPORTACOES_LIMIT,
        `O limite de histórico recente não pode exceder ${MAX_ADMIN_RECENT_IMPORTACOES_LIMIT}.`
      )
      .default(ADMIN_RECENT_IMPORTACOES_LIMIT),
  })
  .strict();

export interface GetAdminResumoOptions {
  readonly recentLimit?: number | undefined;
  readonly now?: Date | undefined;
}

export interface PainelServiceDeps {
  readonly prismaClient?: PrismaClient | undefined;
}

export interface IPainelService {
  getResumo(options?: GetAdminResumoOptions): Promise<AdminResumoResponseDto>;
}
