/**
 * Nascentes do Cariri — Serviço de Autenticação e Sessões Administrativas
 *
 * Orquestra login resistente a timing/enumeração, persistência e revogação de sessões no MySQL.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { logger, maskEmail } from '@/lib/logger';
import {
  createAdminSessionToken,
  extractAuthTokenFromRequest,
  generateSessionId,
  hashSessionId,
  verifyAdminSessionToken,
  type AdminUserSession,
} from '@/lib/security/admin-guard';
import { verifyPassword } from '@/lib/security/password';
import {
  AUTH_ERROR_CODES,
  DEFAULT_ADMIN_SESSION_TTL_SECONDS,
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  toAdminPublicUserDto,
  type AuthMeResponseDto,
} from './auth.contracts';
import {
  LoginRateLimitError,
  type AuthenticateAdminInput,
  type AuthenticateAdminResult,
  type CreatePersistedSessionInput,
  type CreatePersistedSessionResult,
  type LoginRateLimiter,
} from './auth.types';
import { loginRateLimiter as defaultRateLimiter } from './login-rate-limit.service';

// Hash válido custo 12 para equalizar tempo de verificação quando o e-mail não existe (timing attack).
export const DUMMY_BCRYPT_HASH =
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oL8.1/W2m';

export interface AuthServiceOptions {
  readonly prismaClient?: PrismaClient | undefined;
  readonly rateLimiter?: LoginRateLimiter | undefined;
  readonly verifyPasswordFn?:
    | ((password: string, hash: string) => Promise<boolean>)
    | undefined;
}

interface PreparedSessionToken {
  readonly tokenHash: string;
  readonly token: string;
  readonly expiresAt: Date;
}

function buildPreparedSessionToken(params: {
  readonly userId: number;
  readonly email: string;
  readonly role?: string | undefined;
  readonly ttlSeconds: number;
  readonly now: Date;
}): PreparedSessionToken {
  const sid = generateSessionId();
  const tokenHash = hashSessionId(sid);
  const expiresAt = new Date(params.now.getTime() + params.ttlSeconds * 1000);
  const token = createAdminSessionToken({
    sid,
    userId: params.userId,
    email: params.email,
    role: params.role,
    expiresInSeconds: params.ttlSeconds,
  });

  return { tokenHash, token, expiresAt };
}

export class AuthService {
  private readonly prisma: PrismaClient;
  private readonly rateLimiter: LoginRateLimiter;
  private readonly verifyPasswordFn: (password: string, hash: string) => Promise<boolean>;

  constructor(options?: AuthServiceOptions) {
    this.prisma = options?.prismaClient ?? defaultPrisma;
    this.rateLimiter = options?.rateLimiter ?? defaultRateLimiter;
    this.verifyPasswordFn = options?.verifyPasswordFn ?? verifyPassword;
  }

  async authenticateAdmin(input: AuthenticateAdminInput): Promise<AuthenticateAdminResult> {
    const now = input.now ?? new Date();
    const ttlSeconds = input.ttlSeconds ?? DEFAULT_ADMIN_SESSION_TTL_SECONDS;
    const normalizedEmail = input.email.trim().toLowerCase();
    const clientIp = input.clientIp.trim() || 'unknown';

    // Checa rate limit antes de consultar usuário ou rodar bcrypt (evita DoS de CPU)
    const rateCheck = await this.rateLimiter.check({
      email: normalizedEmail,
      clientIp,
      now,
    });

    if (!rateCheck.allowed) {
      logger.warn('Tentativa de login administrativo bloqueada por rate limit.', {
        email: maskEmail(normalizedEmail),
        ip: clientIp,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      });
      throw new LoginRateLimitError(rateCheck.retryAfterSeconds);
    }

    const user = await this.prisma.usuario.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        nome: true,
        email: true,
        passwordHash: true,
        ativo: true,
      },
    });

    const isPasswordValid = await this.verifyPasswordFn(
      input.password,
      user?.passwordHash ?? DUMMY_BCRYPT_HASH
    );

    if (!user || !isPasswordValid || !user.ativo) {
      const postFailureCheck = await this.rateLimiter.recordFailure({
        email: normalizedEmail,
        clientIp,
        now,
      });

      logger.warn('Falha de autenticação administrativa.', {
        email: maskEmail(normalizedEmail),
        ip: clientIp,
        reason: !user
          ? 'USER_NOT_FOUND'
          : !isPasswordValid
            ? 'INVALID_PASSWORD'
            : 'INACTIVE_USER',
        blocked: !postFailureCheck.allowed,
      });

      throw new AppError(
        GENERIC_INVALID_CREDENTIALS_MESSAGE,
        401,
        AUTH_ERROR_CODES.INVALID_CREDENTIALS
      );
    }

    const prepared = buildPreparedSessionToken({
      userId: user.id,
      email: user.email,
      role: 'ADMIN',
      ttlSeconds,
      now,
    });

    const createdSession = await this.prisma.$transaction(async (tx) => {
      const sessao = await tx.sessao.create({
        data: {
          usuarioId: user.id,
          tokenHash: prepared.tokenHash,
          expiresAt: prepared.expiresAt,
        },
        select: {
          id: true,
          expiresAt: true,
        },
      });

      await tx.usuario.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      });

      return sessao;
    });

    await this.rateLimiter.resetOnSuccess({
      email: normalizedEmail,
      clientIp,
      now,
    });

    logger.info('Administrador autenticado com sucesso.', {
      userId: user.id,
      sessionId: createdSession.id,
      email: maskEmail(user.email),
      ip: clientIp,
    });

    return {
      user: toAdminPublicUserDto(user),
      session: {
        expiresAt: createdSession.expiresAt.toISOString(),
      },
      sessionId: createdSession.id,
      token: prepared.token,
      expiresAt: createdSession.expiresAt,
    };
  }

  async createPersistedSession(
    input: CreatePersistedSessionInput
  ): Promise<CreatePersistedSessionResult> {
    const now = input.now ?? new Date();
    const ttlSeconds = input.ttlSeconds ?? DEFAULT_ADMIN_SESSION_TTL_SECONDS;
    const prepared = buildPreparedSessionToken({
      userId: input.userId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      ttlSeconds,
      now,
    });

    const created = await this.prisma.sessao.create({
      data: {
        usuarioId: input.userId,
        tokenHash: prepared.tokenHash,
        expiresAt: prepared.expiresAt,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    return {
      sessionId: created.id,
      token: prepared.token,
      expiresAt: created.expiresAt,
    };
  }

  getAuthenticatedAdmin(session: AdminUserSession): AuthMeResponseDto {
    return {
      user: toAdminPublicUserDto(session),
      session: {
        expiresAt: session.sessionExpiresAt.toISOString(),
      },
    };
  }

  async revokeSessionById(sessionId: number, now: Date = new Date()): Promise<boolean> {
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
      return false;
    }

    const result = await this.prisma.sessao.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    return result.count > 0;
  }

  async revokeSessionByToken(
    requestOrToken: Request | Headers | string | null | undefined,
    now: Date = new Date()
  ): Promise<boolean> {
    const token = extractAuthTokenFromRequest(requestOrToken);
    if (!token) {
      return false;
    }

    const payload = verifyAdminSessionToken(token, now);
    if (!payload) {
      return false;
    }

    const result = await this.prisma.sessao.updateMany({
      where: {
        tokenHash: hashSessionId(payload.sid),
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    return result.count > 0;
  }

  async revokeAllUserSessions(usuarioId: number, now: Date = new Date()): Promise<number> {
    if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
      return 0;
    }

    const result = await this.prisma.sessao.updateMany({
      where: {
        usuarioId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    return result.count;
  }
}

export const authService = new AuthService();
