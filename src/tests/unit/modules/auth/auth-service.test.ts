/**
 * Nascentes do Cariri — Testes Unitários do Domínio de Autenticação e Rate Limit
 */

import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrismaStub } = vi.hoisted(() => ({
  mockPrismaStub: {
    usuario: { findUnique: vi.fn(), update: vi.fn() },
    sessao: { create: vi.fn(), updateMany: vi.fn() },
    tentativaLogin: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/config/env', () => ({
  env: {
    AUTH_SECRET: 'nascentes-cariri-test-secret-key-min-32-bytes!',
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: mockPrismaStub,
}));

import { logger } from '@/lib/logger';
import { hashSessionId, verifyAdminSessionToken } from '@/lib/security/admin-guard';
import {
  AUTH_ERROR_CODES,
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  LOGIN_RATE_LIMIT_POLICY,
  adminPublicUserSchema,
  loginRequestSchema,
  loginResponseSchema,
  toAdminPublicUserDto,
} from '@/modules/auth/auth.contracts';
import { LoginRateLimitError, type LoginRateLimiter } from '@/modules/auth/auth.types';
import { AuthService, DUMMY_BCRYPT_HASH } from '@/modules/auth/auth.service';
import {
  PrismaLoginRateLimiter,
  extractClientIpFromHeaders,
  hashRateLimitKey,
} from '@/modules/auth/login-rate-limit.service';

interface InMemoryTentativaRow {
  id: number;
  chaveHash: string;
  tentativas: number;
  janelaInicio: Date;
  bloqueadoAte: Date | null;
  updatedAt: Date;
}

function createInMemoryRateLimitPrisma() {
  let nextId = 1;
  const store = new Map<string, InMemoryTentativaRow>();

  const tentativaLogin = {
    findMany: vi.fn(
      async (args: { where: { chaveHash: { in: string[] } } }) => {
        const targets = new Set(args.where.chaveHash.in);
        return Array.from(store.values())
          .filter((row) => targets.has(row.chaveHash))
          .map((row) => ({ ...row }));
      }
    ),
    findUnique: vi.fn(async (args: { where: { chaveHash: string } }) => {
      const found = store.get(args.where.chaveHash);
      return found ? { ...found } : null;
    }),
    create: vi.fn(
      async (args: {
        data: {
          chaveHash: string;
          tentativas: number;
          janelaInicio: Date;
          bloqueadoAte: Date | null;
        };
      }) => {
        const row: InMemoryTentativaRow = {
          id: nextId++,
          chaveHash: args.data.chaveHash,
          tentativas: args.data.tentativas,
          janelaInicio: args.data.janelaInicio,
          bloqueadoAte: args.data.bloqueadoAte,
          updatedAt: new Date(),
        };
        store.set(row.chaveHash, row);
        return { ...row };
      }
    ),
    update: vi.fn(
      async (args: {
        where: { id: number };
        data: {
          tentativas?: number;
          janelaInicio?: Date;
          bloqueadoAte?: Date | null;
        };
      }) => {
        for (const row of store.values()) {
          if (row.id === args.where.id) {
            if (args.data.tentativas !== undefined) row.tentativas = args.data.tentativas;
            if (args.data.janelaInicio !== undefined) row.janelaInicio = args.data.janelaInicio;
            if (args.data.bloqueadoAte !== undefined) row.bloqueadoAte = args.data.bloqueadoAte;
            row.updatedAt = new Date();
            return { ...row };
          }
        }
        throw new Error(`Registro TentativaLogin id=${args.where.id} não encontrado.`);
      }
    ),
    deleteMany: vi.fn(
      async (args: {
        where: {
          chaveHash?: string;
          janelaInicio?: { lte: Date };
          OR?: Array<{ bloqueadoAte: null } | { bloqueadoAte: { lte: Date } }>;
        };
      }) => {
        let deleted = 0;
        for (const [key, row] of Array.from(store.entries())) {
          if (args.where.chaveHash !== undefined) {
            if (row.chaveHash === args.where.chaveHash) {
              store.delete(key);
              deleted++;
            }
            continue;
          }

          if (args.where.janelaInicio?.lte && args.where.OR) {
            const isJanelaStale =
              row.janelaInicio.getTime() <= args.where.janelaInicio.lte.getTime();
            const isLockExpired = args.where.OR.some((cond) => {
              if ('bloqueadoAte' in cond && cond.bloqueadoAte === null) {
                return row.bloqueadoAte === null;
              }
              if (
                'bloqueadoAte' in cond &&
                cond.bloqueadoAte !== null &&
                'lte' in cond.bloqueadoAte
              ) {
                return (
                  row.bloqueadoAte !== null &&
                  row.bloqueadoAte.getTime() <= cond.bloqueadoAte.lte.getTime()
                );
              }
              return false;
            });

            if (isJanelaStale && isLockExpired) {
              store.delete(key);
              deleted++;
            }
          }
        }
        return { count: deleted };
      }
    ),
  };

  const prismaClient = {
    tentativaLogin,
    $transaction: vi.fn(async <T>(fn: (tx: { tentativaLogin: typeof tentativaLogin }) => Promise<T>) =>
      fn({ tentativaLogin })
    ),
  } as unknown as PrismaClient;

  return { prismaClient, store, tentativaLogin };
}

function createAuthPrismaMock() {
  const usuario = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const sessao = {
    create: vi.fn(),
    updateMany: vi.fn(),
  };

  const prismaClient = {
    usuario,
    sessao,
    $transaction: vi.fn(
      async <T>(fn: (tx: { usuario: typeof usuario; sessao: typeof sessao }) => Promise<T>) =>
        fn({ usuario, sessao })
    ),
  } as unknown as PrismaClient;

  return { prismaClient, usuario, sessao };
}

function createRateLimiterStub(): {
  rateLimiter: LoginRateLimiter;
  check: ReturnType<typeof vi.fn>;
  recordFailure: ReturnType<typeof vi.fn>;
  resetOnSuccess: ReturnType<typeof vi.fn>;
} {
  const check = vi.fn().mockResolvedValue({ allowed: true });
  const recordFailure = vi.fn().mockResolvedValue({ allowed: true });
  const resetOnSuccess = vi.fn().mockResolvedValue(undefined);

  return {
    rateLimiter: { check, recordFailure, resetOnSuccess },
    check,
    recordFailure,
    resetOnSuccess,
  };
}

describe('QA Unitário — Domínio de Autenticação Administrativa (Etapa 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Contratos, Schemas e Mapeadores (auth.contracts.ts)', () => {
    it('loginRequestSchema deve normalizar e-mail e rejeitar formatos inválidos ou campos extras', () => {
      const parsed = loginRequestSchema.parse({
        email: '  Admin.UFCA@ufca.edu.br  ',
        password: 'SenhaForte2026!',
      });

      expect(parsed).toEqual({
        email: 'admin.ufca@ufca.edu.br',
        password: 'SenhaForte2026!',
      });

      expect(loginRequestSchema.safeParse({ email: 'invalido', password: '123' }).success).toBe(
        false
      );
      expect(
        loginRequestSchema.safeParse({ email: 'admin@ufca.edu.br', password: '' }).success
      ).toBe(false);
      expect(
        loginRequestSchema.safeParse({
          email: 'admin@ufca.edu.br',
          password: 'x'.repeat(129),
        }).success
      ).toBe(false);
      expect(
        loginRequestSchema.safeParse({
          email: `${'a'.repeat(250)}@ufca.edu.br`,
          password: '123',
        }).success
      ).toBe(false);
      expect(
        loginRequestSchema.safeParse({
          email: 'admin@ufca.edu.br',
          password: '123',
          role: 'SUPERADMIN',
        }).success
      ).toBe(false);
    });

    it('toAdminPublicUserDto deve projetar apenas id, nome e email sem expor campos internos', () => {
      const dto = toAdminPublicUserDto({
        id: 7,
        nome: 'Prof. Administrador',
        email: 'admin@ufca.edu.br',
        passwordHash: '$2b$12$segredo',
        ativo: true,
        lastLoginAt: new Date(),
        tokenHash: 'hash',
      } as unknown as { id: number; nome: string; email: string });

      expect(dto).toEqual({
        id: 7,
        nome: 'Prof. Administrador',
        email: 'admin@ufca.edu.br',
      });
      expect(adminPublicUserSchema.safeParse(dto).success).toBe(true);
      expect(Object.keys(dto)).toEqual(['id', 'nome', 'email']);
    });
  });

  describe('2. Pseudonimização LGPD e Rate Limiter MySQL (login-rate-limit.service.ts)', () => {
    it('hashRateLimitKey deve gerar SHA-256 de 64 hex, isolar escopos e não vazar dados brutos', () => {
      const rawIp = '200.129.10.42';
      const rawEmail = 'Admin@ufca.edu.br';

      const ipHash = hashRateLimitKey('ip', `  ${rawIp}  `);
      const emailHash = hashRateLimitKey('email', `  ${rawEmail} `);
      const emailLowerHash = hashRateLimitKey('email', rawEmail.toLowerCase());

      expect(ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(emailHash).toMatch(/^[0-9a-f]{64}$/);
      expect(emailHash).toBe(emailLowerHash);
      expect(ipHash).not.toBe(emailHash);
      expect(ipHash).not.toContain(rawIp);
      expect(emailHash).not.toContain('ufca.edu.br');
      expect(hashRateLimitKey('ip', '10.0.0.1')).not.toBe(hashRateLimitKey('email', '10.0.0.1'));
      expect(hashRateLimitKey('ip', '   ')).toBe(hashRateLimitKey('ip', 'unknown'));
    });

    it('extractClientIpFromHeaders deve priorizar x-forwarded-for, aceitar x-real-ip e truncar excessos', () => {
      expect(
        extractClientIpFromHeaders(
          new Headers({ 'x-forwarded-for': ' 187.10.20.30 , 10.0.0.1 ' })
        )
      ).toBe('187.10.20.30');

      expect(
        extractClientIpFromHeaders(new Headers({ 'x-real-ip': ' 2001:DB8::1 ' }))
      ).toBe('2001:db8::1');

      expect(
        extractClientIpFromHeaders(new Headers({ 'x-real-ip': 'a'.repeat(120) }))
      ).toHaveLength(64);

      expect(extractClientIpFromHeaders(new Headers())).toBe('unknown');
      expect(extractClientIpFromHeaders(null)).toBe('unknown');
    });

    it('deve bloquear na 5ª tentativa falha por e-mail, respeitar expiração de janela e resetar apenas e-mail no sucesso', async () => {
      const { prismaClient, store } = createInMemoryRateLimitPrisma();
      const limiter = new PrismaLoginRateLimiter({ prismaClient });
      const baseTime = new Date('2026-11-23T12:00:00.000Z');
      const email = 'admin@ufca.edu.br';
      const clientIp = '192.0.2.50';

      expect(await limiter.check({ email, clientIp, now: baseTime })).toEqual({ allowed: true });

      for (let i = 1; i <= 4; i++) {
        const res = await limiter.recordFailure({
          email,
          clientIp,
          now: new Date(baseTime.getTime() + i * 1000),
        });
        expect(res).toEqual({ allowed: true });
      }

      const fifthTime = new Date(baseTime.getTime() + 5000);
      const fifthResult = await limiter.recordFailure({ email, clientIp, now: fifthTime });
      expect(fifthResult).toEqual({
        allowed: false,
        retryAfterSeconds: LOGIN_RATE_LIMIT_POLICY.LOCKOUT_MS / 1000,
      });

      const checkDuringLock = await limiter.check({
        email,
        clientIp,
        now: new Date(fifthTime.getTime() + 30_000),
      });
      expect(checkDuringLock).toEqual({
        allowed: false,
        retryAfterSeconds: 870,
      });

      const checkOtherIp = await limiter.check({
        email,
        clientIp: '198.51.100.77',
        now: new Date(fifthTime.getTime() + 30_000),
      });
      expect(checkOtherIp.allowed).toBe(false);

      const afterExpiry = new Date(fifthTime.getTime() + LOGIN_RATE_LIMIT_POLICY.LOCKOUT_MS + 1000);
      expect(await limiter.check({ email, clientIp, now: afterExpiry })).toEqual({ allowed: true });

      const restarted = await limiter.recordFailure({ email, clientIp, now: afterExpiry });
      expect(restarted).toEqual({ allowed: true });

      const emailHash = hashRateLimitKey('email', email);
      const ipHash = hashRateLimitKey('ip', clientIp);
      expect(store.get(emailHash)?.tentativas).toBe(1);
      expect(store.get(ipHash)?.tentativas).toBe(1);

      await limiter.recordFailure({
        email,
        clientIp,
        now: new Date(afterExpiry.getTime() + 1000),
      });
      expect(store.get(emailHash)?.tentativas).toBe(2);
      expect(store.get(ipHash)?.tentativas).toBe(2);

      // resetOnSuccess limpa só o e-mail; IP permanece intacto
      await limiter.resetOnSuccess({ email, clientIp, now: afterExpiry });
      expect(store.has(emailHash)).toBe(false);
      expect(store.get(ipHash)?.tentativas).toBe(2);
    });

    it('deve bloquear na 15ª tentativa falha por IP mesmo variando e-mails', async () => {
      const { prismaClient } = createInMemoryRateLimitPrisma();
      const limiter = new PrismaLoginRateLimiter({ prismaClient });
      const baseTime = new Date('2026-11-23T13:00:00.000Z');
      const attackerIp = '203.0.113.99';

      for (let i = 1; i <= 14; i++) {
        const res = await limiter.recordFailure({
          email: `user${i}@ufca.edu.br`,
          clientIp: attackerIp,
          now: new Date(baseTime.getTime() + i * 1000),
        });
        expect(res).toEqual({ allowed: true });
      }

      const fifteenth = await limiter.recordFailure({
        email: 'user15@ufca.edu.br',
        clientIp: attackerIp,
        now: new Date(baseTime.getTime() + 15_000),
      });
      expect(fifteenth).toEqual({
        allowed: false,
        retryAfterSeconds: LOGIN_RATE_LIMIT_POLICY.LOCKOUT_MS / 1000,
      });

      const checkFreshEmail = await limiter.check({
        email: 'admin-real@ufca.edu.br',
        clientIp: attackerIp,
        now: new Date(baseTime.getTime() + 16_000),
      });
      expect(checkFreshEmail.allowed).toBe(false);
    });

    it('deve executar limpeza oportunista de registros expirados fora da retenção de 24h', async () => {
      const { prismaClient, store } = createInMemoryRateLimitPrisma();
      const limiter = new PrismaLoginRateLimiter({ prismaClient });
      const now = new Date('2026-11-24T12:00:00.000Z');
      const staleTime = new Date(now.getTime() - LOGIN_RATE_LIMIT_POLICY.STALE_RETENTION_MS - 60_000);

      const staleHash = hashRateLimitKey('email', 'antigo@ufca.edu.br');
      store.set(staleHash, {
        id: 999,
        chaveHash: staleHash,
        tentativas: 3,
        janelaInicio: staleTime,
        bloqueadoAte: null,
        updatedAt: staleTime,
      });

      await limiter.recordFailure({
        email: 'novo@ufca.edu.br',
        clientIp: '192.0.2.10',
        now,
      });

      expect(store.has(staleHash)).toBe(false);
    });
  });

  describe('3. AuthService.authenticateAdmin — Segurança, Timing Safety e Sessão', () => {
    const ACTIVE_USER = {
      id: 10,
      nome: 'Administrador Cariri',
      email: 'admin@ufca.edu.br',
      passwordHash: '$2b$12$storedValidHashExample123456789012345678901234567890',
      ativo: true,
    };

    it('deve autenticar com e-mail normalizado, gravar tokenHash em sessoes, atualizar lastLoginAt e resetar rate limit', async () => {
      const { prismaClient, usuario, sessao } = createAuthPrismaMock();
      const { rateLimiter, check, recordFailure, resetOnSuccess } = createRateLimiterStub();
      const verifyPasswordFn = vi.fn().mockResolvedValue(true);
      const service = new AuthService({ prismaClient, rateLimiter, verifyPasswordFn });

      const now = new Date();
      const expectedExpiresAt = new Date(now.getTime() + 3600 * 1000);

      usuario.findUnique.mockResolvedValueOnce(ACTIVE_USER);
      sessao.create.mockResolvedValueOnce({ id: 501, expiresAt: expectedExpiresAt });
      usuario.update.mockResolvedValueOnce({ id: ACTIVE_USER.id });

      const result = await service.authenticateAdmin({
        email: '  ADMIN@UFCA.EDU.BR  ',
        password: 'SenhaSuperSecreta123!',
        clientIp: '198.51.100.20',
        now,
        ttlSeconds: 3600,
      });

      expect(check).toHaveBeenCalledWith({
        email: 'admin@ufca.edu.br',
        clientIp: '198.51.100.20',
        now,
      });
      expect(usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@ufca.edu.br' },
        select: {
          id: true,
          nome: true,
          email: true,
          passwordHash: true,
          ativo: true,
        },
      });
      expect(verifyPasswordFn).toHaveBeenCalledWith(
        'SenhaSuperSecreta123!',
        ACTIVE_USER.passwordHash
      );

      const decoded = verifyAdminSessionToken(result.token);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(ACTIVE_USER.id);
      expect(decoded?.email).toBe(ACTIVE_USER.email);
      expect(decoded?.role).toBe('ADMIN');

      const createdData = sessao.create.mock.calls[0]?.[0]?.data as {
        usuarioId: number;
        tokenHash: string;
        expiresAt: Date;
      };
      expect(createdData.usuarioId).toBe(ACTIVE_USER.id);
      expect(createdData.tokenHash).toBe(hashSessionId(decoded!.sid));
      expect(createdData.tokenHash).not.toBe(result.token);
      expect(createdData.tokenHash).not.toBe(decoded?.sid);
      expect(createdData.expiresAt).toEqual(expectedExpiresAt);

      expect(usuario.update).toHaveBeenCalledWith({
        where: { id: ACTIVE_USER.id },
        data: { lastLoginAt: now },
      });
      expect(recordFailure).not.toHaveBeenCalled();
      expect(resetOnSuccess).toHaveBeenCalledWith({
        email: 'admin@ufca.edu.br',
        clientIp: '198.51.100.20',
        now,
      });

      const httpPayload = { user: result.user, session: result.session };
      expect(loginResponseSchema.safeParse(httpPayload).success).toBe(true);
      expect(JSON.stringify(httpPayload)).not.toContain('passwordHash');
      expect(JSON.stringify(httpPayload)).not.toContain('tokenHash');
    });

    it('deve rejeitar senha incorreta com 401 genérico sem criar sessão e registrando falha', async () => {
      const { prismaClient, usuario, sessao } = createAuthPrismaMock();
      const { rateLimiter, recordFailure } = createRateLimiterStub();
      const verifyPasswordFn = vi.fn().mockResolvedValue(false);
      const service = new AuthService({ prismaClient, rateLimiter, verifyPasswordFn });

      usuario.findUnique.mockResolvedValueOnce(ACTIVE_USER);

      await expect(
        service.authenticateAdmin({
          email: 'admin@ufca.edu.br',
          password: 'senha-errada',
          clientIp: '198.51.100.21',
        })
      ).rejects.toMatchObject({
        statusCode: 401,
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: GENERIC_INVALID_CREDENTIALS_MESSAGE,
      });

      expect(verifyPasswordFn).toHaveBeenCalledWith('senha-errada', ACTIVE_USER.passwordHash);
      expect(recordFailure).toHaveBeenCalledTimes(1);
      expect(sessao.create).not.toHaveBeenCalled();
      expect(usuario.update).not.toHaveBeenCalled();
    });

    it('deve executar verifyPassword contra DUMMY_BCRYPT_HASH para e-mail inexistente (timing safety)', async () => {
      const { prismaClient, usuario, sessao } = createAuthPrismaMock();
      const { rateLimiter, recordFailure } = createRateLimiterStub();
      const verifyPasswordFn = vi.fn().mockResolvedValue(false);
      const service = new AuthService({ prismaClient, rateLimiter, verifyPasswordFn });

      usuario.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.authenticateAdmin({
          email: 'naoexiste@ufca.edu.br',
          password: 'QualquerSenha123!',
          clientIp: '198.51.100.22',
        })
      ).rejects.toMatchObject({
        statusCode: 401,
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: GENERIC_INVALID_CREDENTIALS_MESSAGE,
      });

      expect(verifyPasswordFn).toHaveBeenCalledTimes(1);
      expect(verifyPasswordFn).toHaveBeenCalledWith('QualquerSenha123!', DUMMY_BCRYPT_HASH);
      expect(recordFailure).toHaveBeenCalledTimes(1);
      expect(sessao.create).not.toHaveBeenCalled();
    });

    it('deve responder 401 genérico idêntico para conta inativa no login (anti-enumeração)', async () => {
      const { prismaClient, usuario, sessao } = createAuthPrismaMock();
      const { rateLimiter, recordFailure } = createRateLimiterStub();
      const verifyPasswordFn = vi.fn().mockResolvedValue(true);
      const service = new AuthService({ prismaClient, rateLimiter, verifyPasswordFn });

      usuario.findUnique.mockResolvedValueOnce({ ...ACTIVE_USER, ativo: false });

      await expect(
        service.authenticateAdmin({
          email: 'admin@ufca.edu.br',
          password: 'SenhaCorretaDeContaInativa!',
          clientIp: '198.51.100.23',
        })
      ).rejects.toMatchObject({
        statusCode: 401,
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: GENERIC_INVALID_CREDENTIALS_MESSAGE,
      });

      expect(verifyPasswordFn).toHaveBeenCalledTimes(1);
      expect(recordFailure).toHaveBeenCalledTimes(1);
      expect(sessao.create).not.toHaveBeenCalled();
    });

    it('deve lançar LoginRateLimitError (429) antes de consultar usuário ou rodar bcrypt quando bloqueado', async () => {
      const { prismaClient, usuario } = createAuthPrismaMock();
      const { rateLimiter, check, recordFailure } = createRateLimiterStub();
      const verifyPasswordFn = vi.fn();
      const service = new AuthService({ prismaClient, rateLimiter, verifyPasswordFn });

      check.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 420 });

      try {
        await service.authenticateAdmin({
          email: 'admin@ufca.edu.br',
          password: 'Senha',
          clientIp: '198.51.100.24',
        });
        expect.unreachable('Deveria ter lançado LoginRateLimitError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(LoginRateLimitError);
        expect(error).toMatchObject({
          statusCode: 429,
          code: AUTH_ERROR_CODES.RATE_LIMITED,
          retryAfterSeconds: 420,
        });
      }

      expect(usuario.findUnique).not.toHaveBeenCalled();
      expect(verifyPasswordFn).not.toHaveBeenCalled();
      expect(recordFailure).not.toHaveBeenCalled();
    });

    it('nunca deve expor senha, hash, token, sid, IP bruto ou e-mail completo nos logs', async () => {
      const infoSpy = vi.spyOn(logger, 'info');
      const warnSpy = vi.spyOn(logger, 'warn');

      const { prismaClient, usuario, sessao } = createAuthPrismaMock();
      const { rateLimiter } = createRateLimiterStub();
      const secretPassword = 'MinhaSenhaUltrassecreta!999';
      const verifyPasswordFn = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const service = new AuthService({ prismaClient, rateLimiter, verifyPasswordFn });

      usuario.findUnique.mockResolvedValueOnce(ACTIVE_USER);
      await expect(
        service.authenticateAdmin({
          email: 'administrador@ufca.edu.br',
          password: secretPassword,
          clientIp: '200.129.10.55',
        })
      ).rejects.toBeDefined();

      usuario.findUnique.mockResolvedValueOnce({
        ...ACTIVE_USER,
        email: 'administrador@ufca.edu.br',
      });
      const now = new Date();
      sessao.create.mockResolvedValueOnce({
        id: 88,
        expiresAt: new Date(now.getTime() + 3600 * 1000),
      });
      usuario.update.mockResolvedValueOnce({ id: ACTIVE_USER.id });

      const okResult = await service.authenticateAdmin({
        email: 'administrador@ufca.edu.br',
        password: secretPassword,
        clientIp: '200.129.10.55',
        now,
        ttlSeconds: 3600,
      });

      const allLogs = JSON.stringify([
        ...warnSpy.mock.results.map((r) => r.value),
        ...infoSpy.mock.results.map((r) => r.value),
      ]);
      const sid = verifyAdminSessionToken(okResult.token)?.sid ?? 'unknown-sid';

      expect(allLogs).not.toContain(secretPassword);
      expect(allLogs).not.toContain(ACTIVE_USER.passwordHash);
      expect(allLogs).not.toContain(okResult.token);
      expect(allLogs).not.toContain(sid);
      expect(allLogs).not.toContain('200.129.10.55');
      expect(allLogs).toContain('200.129.10.0');
      expect(allLogs).not.toContain('administrador@ufca.edu.br');
      expect(allLogs).toContain('ad***@ufca.edu.br');
    });
  });

  describe('4. Gestão, Projeção e Revogação de Sessões (Preparação Task-32)', () => {
    it('getAuthenticatedAdmin deve retornar apenas projeção segura de usuário e expiração', () => {
      const service = new AuthService();
      const expiresAt = new Date('2026-12-23T12:00:00.000Z');

      const dto = service.getAuthenticatedAdmin({
        id: 1,
        nome: 'Admin UFCA',
        email: 'admin@ufca.edu.br',
        ativo: true,
        sessionId: 42,
        sessionExpiresAt: expiresAt,
      });

      expect(dto).toEqual({
        user: {
          id: 1,
          nome: 'Admin UFCA',
          email: 'admin@ufca.edu.br',
        },
        session: {
          expiresAt: '2026-12-23T12:00:00.000Z',
        },
      });
    });

    it('createPersistedSession deve gravar tokenHash e emitir JWT válido correspondente', async () => {
      const { prismaClient, sessao } = createAuthPrismaMock();
      const service = new AuthService({ prismaClient });
      const now = new Date();
      const expectedExpiresAt = new Date(now.getTime() + 7200 * 1000);

      sessao.create.mockResolvedValueOnce({ id: 300, expiresAt: expectedExpiresAt });

      const created = await service.createPersistedSession({
        userId: 5,
        email: '  DevAdmin@UFCA.EDU.BR ',
        role: 'ADMIN',
        ttlSeconds: 7200,
        now,
      });

      expect(created.sessionId).toBe(300);
      expect(created.expiresAt).toEqual(expectedExpiresAt);

      const decoded = verifyAdminSessionToken(created.token);
      expect(decoded?.userId).toBe(5);
      expect(decoded?.email).toBe('devadmin@ufca.edu.br');

      const persistedData = sessao.create.mock.calls[0]?.[0]?.data as { tokenHash: string };
      expect(persistedData.tokenHash).toBe(hashSessionId(decoded!.sid));
    });

    it('revokeSessionById, revokeSessionByToken e revokeAllUserSessions devem operar de forma idempotente', async () => {
      const { prismaClient, sessao } = createAuthPrismaMock();
      const service = new AuthService({ prismaClient });
      const now = new Date();

      expect(await service.revokeSessionById(0, now)).toBe(false);
      sessao.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      expect(await service.revokeSessionById(12, now)).toBe(true);
      expect(await service.revokeSessionById(12, now)).toBe(false);

      sessao.updateMany.mockClear();
      expect(await service.revokeSessionByToken(null, now)).toBe(false);
      expect(await service.revokeSessionByToken('token.invalido.hmac', now)).toBe(false);
      expect(sessao.updateMany).not.toHaveBeenCalled();

      const { prismaClient: dummyPrisma } = createAuthPrismaMock();
      expect(dummyPrisma).toBeDefined();
      const sid = '11111111-2222-4333-8444-555555555555';
      const created = await (async () => {
        sessao.create.mockResolvedValueOnce({
          id: 99,
          expiresAt: new Date(now.getTime() + 3600 * 1000),
        });
        return service.createPersistedSession({
          userId: 1,
          email: 'admin@ufca.edu.br',
          ttlSeconds: 3600,
          now,
        });
      })();

      sessao.updateMany.mockResolvedValueOnce({ count: 1 });
      expect(
        await service.revokeSessionByToken(
          new Headers({ authorization: `Bearer ${created.token}` }),
          now
        )
      ).toBe(true);

      const updateCall = sessao.updateMany.mock.calls[0]?.[0] as {
        where: { tokenHash: string; revokedAt: null };
        data: { revokedAt: Date };
      };
      const tokenSid = verifyAdminSessionToken(created.token)!.sid;
      expect(updateCall.where).toEqual({
        tokenHash: hashSessionId(tokenSid),
        revokedAt: null,
      });
      expect(updateCall.data).toEqual({ revokedAt: now });
      expect(tokenSid).not.toBe(sid);

      expect(await service.revokeAllUserSessions(-1, now)).toBe(0);
      sessao.updateMany.mockResolvedValueOnce({ count: 3 });
      expect(await service.revokeAllUserSessions(1, now)).toBe(3);
    });
  });
});
