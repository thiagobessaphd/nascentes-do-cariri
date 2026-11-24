/**
 * Nascentes do Cariri — Guarda de Autenticação Administrativa
 *
 * Validação de sessão administrativa vinculada a registros ativos na tabela `sessoes`.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import {
  extractAuthTokenFromRequest,
  hashSessionId,
  verifyAdminSessionToken,
} from './admin-session-token';

export {
  createAdminSessionToken,
  extractAuthTokenFromRequest,
  generateSessionId,
  hashSessionId,
  isValidSessionId,
  verifyAdminSessionToken,
  type AdminSessionPayload,
  type CreateAdminSessionTokenParams,
} from './admin-session-token';

export interface AdminUserSession {
  readonly id: number;
  readonly nome: string;
  readonly email: string;
  readonly ativo: boolean;
  readonly sessionId: number;
  readonly sessionExpiresAt: Date;
}

export interface RequireAdminSessionOptions {
  readonly prismaClient?: PrismaClient | undefined;
  readonly now?: Date | undefined;
}

/**
 * @throws AppError 401 caso a sessão seja ausente, inválida, revogada ou expirada.
 * @throws AppError 403 caso a conta do administrador esteja inativa.
 */
export async function requireAdminSession(
  request: Request | Headers | string | null | undefined,
  options?: RequireAdminSessionOptions
): Promise<AdminUserSession> {
  const now = options?.now ?? new Date();
  const token = extractAuthTokenFromRequest(request);

  if (!token) {
    throw new AppError(
      'Acesso não autorizado: sessão de administrador ausente.',
      401,
      'UNAUTHORIZED'
    );
  }

  const payload = verifyAdminSessionToken(token, now);

  if (!payload) {
    throw new AppError(
      'Acesso não autorizado: sessão de administrador inválida ou expirada.',
      401,
      'UNAUTHORIZED'
    );
  }

  const prisma = options?.prismaClient ?? defaultPrisma;

  const sessionRecord = await prisma.sessao.findUnique({
    where: { tokenHash: hashSessionId(payload.sid) },
    select: {
      id: true,
      usuarioId: true,
      expiresAt: true,
      revokedAt: true,
      usuario: {
        select: {
          id: true,
          nome: true,
          email: true,
          ativo: true,
        },
      },
    },
  });

  if (!sessionRecord) {
    throw new AppError(
      'Acesso não autorizado: sessão administrativa não encontrada ou encerrada.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (
    sessionRecord.usuarioId !== payload.userId ||
    sessionRecord.usuario.id !== payload.userId
  ) {
    throw new AppError(
      'Acesso não autorizado: sessão incompatível com o usuário autenticado.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (sessionRecord.revokedAt !== null) {
    throw new AppError(
      'Acesso não autorizado: sessão administrativa revogada.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (sessionRecord.expiresAt.getTime() <= now.getTime()) {
    throw new AppError(
      'Acesso não autorizado: sessão administrativa expirada.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (!sessionRecord.usuario.ativo) {
    throw new AppError(
      'Acesso proibido: conta de administrador inativa.',
      403,
      'FORBIDDEN_INACTIVE_USER'
    );
  }

  return {
    id: sessionRecord.usuario.id,
    nome: sessionRecord.usuario.nome,
    email: sessionRecord.usuario.email,
    ativo: sessionRecord.usuario.ativo,
    sessionId: sessionRecord.id,
    sessionExpiresAt: sessionRecord.expiresAt,
  };
}

export async function getOptionalAdminSession(
  request: Request | Headers | string | null | undefined,
  options?: RequireAdminSessionOptions
): Promise<AdminUserSession | null> {
  const token = extractAuthTokenFromRequest(request);
  if (!token) {
    return null;
  }

  try {
    return await requireAdminSession(token, options);
  } catch (error: unknown) {
    if (error instanceof AppError && (error.statusCode === 401 || error.statusCode === 403)) {
      return null;
    }
    throw error;
  }
}
