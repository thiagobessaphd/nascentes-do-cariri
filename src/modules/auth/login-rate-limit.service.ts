/**
 * Nascentes do Cariri — Rate Limiter de Login Persistido no MySQL
 *
 * Controle de tentativas de login com chaves pseudonimizadas via HMAC-SHA256 (LGPD).
 */

import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { env } from '@/config/env';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { LOGIN_RATE_LIMIT_POLICY } from './auth.contracts';
import type {
  LoginRateLimitContext,
  LoginRateLimitPolicy,
  LoginRateLimiter,
  RateLimitCheckResult,
} from './auth.types';

const MAX_CLIENT_IP_LENGTH = 64;

interface RateLimitRowSnapshot {
  readonly chaveHash: string;
  readonly tentativas: number;
  readonly janelaInicio: Date;
  readonly bloqueadoAte: Date | null;
}

interface RateLimitTargetSpec {
  readonly chaveHash: string;
  readonly maxAttempts: number;
}

export function extractClientIpFromHeaders(
  requestOrHeaders: Request | Headers | null | undefined
): string {
  if (!requestOrHeaders) {
    return 'unknown';
  }

  const headers =
    requestOrHeaders instanceof Headers ? requestOrHeaders : requestOrHeaders.headers;

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .find((part) => part.length > 0);
    if (firstIp) {
      return firstIp.slice(0, MAX_CLIENT_IP_LENGTH);
    }
  }

  const realIp = headers.get('x-real-ip')?.trim().toLowerCase();
  if (realIp) {
    return realIp.slice(0, MAX_CLIENT_IP_LENGTH);
  }

  return 'unknown';
}

export function hashRateLimitKey(
  scope: 'ip' | 'email',
  rawValue: string,
  secret?: string
): string {
  const trimmed = rawValue.trim().toLowerCase();
  const normalized = trimmed.length > 0 ? trimmed : 'unknown';

  return createHmac('sha256', secret ?? env.AUTH_SECRET)
    .update(`login-rl:${scope}:${normalized}`, 'utf8')
    .digest('hex');
}

function computeBlockedRetrySeconds(
  record: Pick<RateLimitRowSnapshot, 'tentativas' | 'janelaInicio' | 'bloqueadoAte'> | undefined,
  maxAttempts: number,
  windowMs: number,
  nowMs: number
): number {
  if (!record) {
    return 0;
  }

  if (record.bloqueadoAte && record.bloqueadoAte.getTime() > nowMs) {
    return Math.max(1, Math.ceil((record.bloqueadoAte.getTime() - nowMs) / 1000));
  }

  const windowEndMs = record.janelaInicio.getTime() + windowMs;
  if (windowEndMs > nowMs && record.tentativas >= maxAttempts) {
    return Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000));
  }

  return 0;
}

export interface PrismaLoginRateLimiterOptions {
  readonly prismaClient?: PrismaClient | undefined;
  readonly policy?: LoginRateLimitPolicy | undefined;
  readonly secret?: string | undefined;
}

export class PrismaLoginRateLimiter implements LoginRateLimiter {
  private readonly prisma: PrismaClient;
  private readonly policy: LoginRateLimitPolicy;
  private readonly secret?: string | undefined;

  constructor(options?: PrismaLoginRateLimiterOptions) {
    this.prisma = options?.prismaClient ?? defaultPrisma;
    this.policy = options?.policy ?? LOGIN_RATE_LIMIT_POLICY;
    this.secret = options?.secret;
  }

  private buildTargetSpecs(email: string, clientIp: string): readonly [RateLimitTargetSpec, RateLimitTargetSpec] {
    return [
      {
        chaveHash: hashRateLimitKey('ip', clientIp, this.secret),
        maxAttempts: this.policy.MAX_ATTEMPTS_PER_IP,
      },
      {
        chaveHash: hashRateLimitKey('email', email, this.secret),
        maxAttempts: this.policy.MAX_ATTEMPTS_PER_EMAIL,
      },
    ] as const;
  }

  async check(context: LoginRateLimitContext): Promise<RateLimitCheckResult> {
    const now = context.now ?? new Date();
    const nowMs = now.getTime();
    const targets = this.buildTargetSpecs(context.email, context.clientIp);

    const rows = await this.prisma.tentativaLogin.findMany({
      where: {
        chaveHash: { in: targets.map((target) => target.chaveHash) },
      },
      select: {
        chaveHash: true,
        tentativas: true,
        janelaInicio: true,
        bloqueadoAte: true,
      },
    });

    const rowsByHash = new Map<string, RateLimitRowSnapshot>(
      rows.map((row) => [row.chaveHash, row])
    );

    let maxRetrySeconds = 0;
    for (const target of targets) {
      const retrySeconds = computeBlockedRetrySeconds(
        rowsByHash.get(target.chaveHash),
        target.maxAttempts,
        this.policy.WINDOW_MS,
        nowMs
      );
      if (retrySeconds > maxRetrySeconds) {
        maxRetrySeconds = retrySeconds;
      }
    }

    if (maxRetrySeconds > 0) {
      return { allowed: false, retryAfterSeconds: maxRetrySeconds };
    }

    return { allowed: true };
  }

  async recordFailure(context: LoginRateLimitContext): Promise<RateLimitCheckResult> {
    const now = context.now ?? new Date();
    const nowMs = now.getTime();
    const targets = this.buildTargetSpecs(context.email, context.clientIp);
    const staleCutoff = new Date(nowMs - this.policy.STALE_RETENTION_MS);

    return this.prisma.$transaction(async (tx) => {
      let maxRetrySeconds = 0;

      for (const target of targets) {
        const current = await tx.tentativaLogin.findUnique({
          where: { chaveHash: target.chaveHash },
          select: {
            id: true,
            tentativas: true,
            janelaInicio: true,
            bloqueadoAte: true,
          },
        });

        const isPreviousWindowExpired =
          !current ||
          (current.janelaInicio.getTime() + this.policy.WINDOW_MS <= nowMs &&
            (!current.bloqueadoAte || current.bloqueadoAte.getTime() <= nowMs));

        let nextTentativas: number;
        let nextJanelaInicio: Date;
        let nextBloqueadoAte: Date | null;

        if (isPreviousWindowExpired) {
          nextTentativas = 1;
          nextJanelaInicio = now;
          nextBloqueadoAte =
            nextTentativas >= target.maxAttempts
              ? new Date(nowMs + this.policy.LOCKOUT_MS)
              : null;

          if (!current) {
            await tx.tentativaLogin.create({
              data: {
                chaveHash: target.chaveHash,
                tentativas: nextTentativas,
                janelaInicio: nextJanelaInicio,
                bloqueadoAte: nextBloqueadoAte,
              },
            });
          } else {
            await tx.tentativaLogin.update({
              where: { id: current.id },
              data: {
                tentativas: nextTentativas,
                janelaInicio: nextJanelaInicio,
                bloqueadoAte: nextBloqueadoAte,
              },
            });
          }
        } else {
          nextTentativas = current.tentativas + 1;
          nextJanelaInicio = current.janelaInicio;
          const candidateLockout =
            nextTentativas >= target.maxAttempts
              ? new Date(nowMs + this.policy.LOCKOUT_MS)
              : current.bloqueadoAte;

          nextBloqueadoAte =
            current.bloqueadoAte &&
            candidateLockout &&
            current.bloqueadoAte.getTime() > candidateLockout.getTime()
              ? current.bloqueadoAte
              : candidateLockout;

          await tx.tentativaLogin.update({
            where: { id: current.id },
            data: {
              tentativas: nextTentativas,
              bloqueadoAte: nextBloqueadoAte,
            },
          });
        }

        const retrySeconds = computeBlockedRetrySeconds(
          {
            tentativas: nextTentativas,
            janelaInicio: nextJanelaInicio,
            bloqueadoAte: nextBloqueadoAte,
          },
          target.maxAttempts,
          this.policy.WINDOW_MS,
          nowMs
        );

        if (retrySeconds > maxRetrySeconds) {
          maxRetrySeconds = retrySeconds;
        }
      }

      // Limpeza oportunista de registros expirados fora da janela de retenção
      await tx.tentativaLogin.deleteMany({
        where: {
          janelaInicio: { lte: staleCutoff },
          OR: [{ bloqueadoAte: null }, { bloqueadoAte: { lte: now } }],
        },
      });

      if (maxRetrySeconds > 0) {
        return { allowed: false, retryAfterSeconds: maxRetrySeconds };
      }

      return { allowed: true };
    });
  }

  async resetOnSuccess(context: LoginRateLimitContext): Promise<void> {
    const emailKeyHash = hashRateLimitKey('email', context.email, this.secret);
    await this.prisma.tentativaLogin.deleteMany({
      where: { chaveHash: emailKeyHash },
    });
  }
}

export const loginRateLimiter = new PrismaLoginRateLimiter();
