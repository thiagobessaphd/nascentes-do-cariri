/**
 * Nascentes do Cariri — Teste de Integração Backend: Login e Rate Limit no MySQL (CT-BE-01)
 *
 * Valida POST /api/admin/auth/login integrado ao authService, PrismaLoginRateLimiter e MySQL real.
 */

import 'dotenv/config';
import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it } from 'vitest';
import { POST as loginPOST } from '@/app/api/admin/auth/login/route';
import { extractSessionToken } from '@/config/session-cookies';
import { prisma } from '@/lib/db/prisma';
import { hashSessionId, verifyAdminSessionToken } from '@/lib/security/admin-guard';
import { hashPassword } from '@/lib/security/password';
import {
  AUTH_ERROR_CODES,
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  LOGIN_RATE_LIMIT_POLICY,
  hashRateLimitKey,
  loginResponseSchema,
} from '@/modules/auth';

function buildLoginRequest(
  body: Record<string, unknown>,
  clientIp: string
): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': clientIp,
    },
    body: JSON.stringify(body),
  });
}

describe('CT-BE-01 — Integração Login Administrativo, Sessões e Rate Limit no MySQL', () => {
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdUserIds: number[] = [];
  const trackedRateLimitHashes = new Set<string>();

  function trackRateLimit(email: string, clientIp: string): { emailHash: string; ipHash: string } {
    const emailHash = hashRateLimitKey('email', email);
    const ipHash = hashRateLimitKey('ip', clientIp);
    trackedRateLimitHashes.add(emailHash);
    trackedRateLimitHashes.add(ipHash);
    return { emailHash, ipHash };
  }

  afterAll(async () => {
    const hashList = Array.from(trackedRateLimitHashes);
    if (hashList.length > 0) {
      await prisma.tentativaLogin.deleteMany({
        where: { chaveHash: { in: hashList } },
      });
    }

    if (createdUserIds.length > 0) {
      await prisma.sessao.deleteMany({
        where: { usuarioId: { in: createdUserIds } },
      });
      await prisma.usuario.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  it('deve autenticar admin ativo, persistir sessão com tokenHash e atualizar lastLoginAt', async () => {
    const email = `ct_be_01_valid_${uniqueSuffix}@ufca.edu.br`;
    const rawPassword = 'SenhaAdminValida#2026';
    const clientIp = '198.51.100.10';
    trackRateLimit(email, clientIp);

    const passwordHash = await hashPassword(rawPassword);
    const admin = await prisma.usuario.create({
      data: {
        nome: 'Admin Integração Válido',
        email,
        passwordHash,
        ativo: true,
        lastLoginAt: null,
      },
    });
    createdUserIds.push(admin.id);

    const response = await loginPOST(
      buildLoginRequest(
        { email: `  ${email.toUpperCase()}  `, password: rawPassword },
        clientIp
      )
    );
    const rawText = await response.text();
    const body = JSON.parse(rawText) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(loginResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      user: {
        id: admin.id,
        nome: 'Admin Integração Válido',
        email,
      },
    });
    expect(rawText).not.toContain('passwordHash');
    expect(rawText).not.toContain('tokenHash');

    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');

    const setCookieHeader = response.headers.get('set-cookie');
    expect(setCookieHeader).toBeTruthy();
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('SameSite=Lax');

    const extractedToken = extractSessionToken(setCookieHeader);
    expect(extractedToken).toBeTruthy();
    expect(rawText).not.toContain(extractedToken!);

    const payload = verifyAdminSessionToken(extractedToken!);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(admin.id);

    const persistedSession = await prisma.sessao.findUnique({
      where: { tokenHash: hashSessionId(payload!.sid) },
    });
    expect(persistedSession).not.toBeNull();
    expect(persistedSession?.usuarioId).toBe(admin.id);
    expect(persistedSession?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(persistedSession?.tokenHash).not.toBe(extractedToken);
    expect(persistedSession?.revokedAt).toBeNull();
    expect(persistedSession!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const updatedAdmin = await prisma.usuario.findUnique({
      where: { id: admin.id },
      select: { lastLoginAt: true },
    });
    expect(updatedAdmin?.lastLoginAt).toBeInstanceOf(Date);
  });

  it(
    'deve retornar 401 genérico sem vazar existência/inatividade e gravar chaves pseudonimizadas no MySQL',
    { timeout: 20000 },
    async () => {
      const activeEmail = `ct_be_01_wrong_pwd_${uniqueSuffix}@ufca.edu.br`;
      const inactiveEmail = `ct_be_01_inactive_${uniqueSuffix}@ufca.edu.br`;
      const nonexistentEmail = `ct_be_01_missing_${uniqueSuffix}@ufca.edu.br`;
      const rawPassword = 'SenhaComumTeste#2026';
      const clientIp = '198.51.100.20';

      const { emailHash: activeEmailHash, ipHash } = trackRateLimit(activeEmail, clientIp);
      const { emailHash: inactiveEmailHash } = trackRateLimit(inactiveEmail, clientIp);
      const { emailHash: missingEmailHash } = trackRateLimit(nonexistentEmail, clientIp);

      const passwordHash = await hashPassword(rawPassword);
      const [activeAdmin, inactiveAdmin] = await Promise.all([
        prisma.usuario.create({
          data: {
            nome: 'Admin Senha Errada',
            email: activeEmail,
            passwordHash,
            ativo: true,
            lastLoginAt: null,
          },
        }),
        prisma.usuario.create({
          data: {
            nome: 'Admin Desativado Login',
            email: inactiveEmail,
            passwordHash,
            ativo: false,
            lastLoginAt: null,
          },
        }),
      ]);
      createdUserIds.push(activeAdmin.id, inactiveAdmin.id);

      const responses = [
        await loginPOST(
          buildLoginRequest({ email: activeEmail, password: 'SenhaIncorreta!999' }, clientIp)
        ),
        await loginPOST(
          buildLoginRequest({ email: nonexistentEmail, password: rawPassword }, clientIp)
        ),
        await loginPOST(
          buildLoginRequest({ email: inactiveEmail, password: rawPassword }, clientIp)
        ),
      ];

      for (const res of responses) {
        expect(res.status).toBe(401);
        expect(res.headers.get('set-cookie')).toBeNull();
        expect(res.headers.get('cache-control')).toContain('no-store');
        const body = (await res.json()) as { error: string; code: string };
        expect(body).toEqual({
          error: GENERIC_INVALID_CREDENTIALS_MESSAGE,
          code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        });
      }

      const sessionsCount = await prisma.sessao.count({
        where: { usuarioId: { in: [activeAdmin.id, inactiveAdmin.id] } },
      });
      expect(sessionsCount).toBe(0);

      const usersAfter = await prisma.usuario.findMany({
        where: { id: { in: [activeAdmin.id, inactiveAdmin.id] } },
        select: { lastLoginAt: true },
      });
      for (const u of usersAfter) {
        expect(u.lastLoginAt).toBeNull();
      }

      const rateLimitRows = await prisma.tentativaLogin.findMany({
        where: {
          chaveHash: { in: [activeEmailHash, inactiveEmailHash, missingEmailHash, ipHash] },
        },
      });
      expect(rateLimitRows).toHaveLength(4);

      const serializedRows = JSON.stringify(rateLimitRows);
      expect(serializedRows).not.toContain(activeEmail);
      expect(serializedRows).not.toContain(inactiveEmail);
      expect(serializedRows).not.toContain(nonexistentEmail);
      expect(serializedRows).not.toContain(clientIp);
      for (const row of rateLimitRows) {
        expect(row.chaveHash).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  );

  it(
    'deve bloquear após 5 falhas por e-mail com 429 + Retry-After e resetar contador de e-mail após sucesso',
    { timeout: 25000 },
    async () => {
      const email = `ct_be_01_rl_email_${uniqueSuffix}@ufca.edu.br`;
      const rawPassword = 'SenhaRateLimitEmail#2026';
      const clientIp = '198.51.100.30';
      const { emailHash, ipHash } = trackRateLimit(email, clientIp);

      const passwordHash = await hashPassword(rawPassword);
      const admin = await prisma.usuario.create({
        data: {
          nome: 'Admin Rate Limit E-mail',
          email,
          passwordHash,
          ativo: true,
        },
      });
      createdUserIds.push(admin.id);

      for (let attempt = 1; attempt <= LOGIN_RATE_LIMIT_POLICY.MAX_ATTEMPTS_PER_EMAIL; attempt += 1) {
        const res = await loginPOST(
          buildLoginRequest({ email, password: `SenhaErrada#${attempt}` }, clientIp)
        );
        expect(res.status).toBe(401);
      }

      const lockedRow = await prisma.tentativaLogin.findUnique({
        where: { chaveHash: emailHash },
      });
      expect(lockedRow?.tentativas).toBe(LOGIN_RATE_LIMIT_POLICY.MAX_ATTEMPTS_PER_EMAIL);
      expect(lockedRow?.bloqueadoAte).toBeInstanceOf(Date);

      // 6ª tentativa deve ser bloqueada mesmo com a senha correta
      const blockedRes = await loginPOST(
        buildLoginRequest({ email, password: rawPassword }, clientIp)
      );
      const blockedBody = (await blockedRes.json()) as { code: string };
      expect(blockedRes.status).toBe(429);
      expect(blockedBody.code).toBe(AUTH_ERROR_CODES.RATE_LIMITED);
      expect(blockedRes.headers.get('set-cookie')).toBeNull();

      const retryAfter = Number(blockedRes.headers.get('retry-after'));
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThan(0);

      const sessionsBeforeUnlock = await prisma.sessao.count({
        where: { usuarioId: admin.id },
      });
      expect(sessionsBeforeUnlock).toBe(0);

      // Simula passagem do tempo de bloqueio no MySQL sem sleep real
      const pastWindow = new Date(Date.now() - 20 * 60 * 1000);
      await prisma.tentativaLogin.update({
        where: { chaveHash: emailHash },
        data: {
          janelaInicio: pastWindow,
          bloqueadoAte: pastWindow,
        },
      });

      const unlockedRes = await loginPOST(
        buildLoginRequest({ email, password: rawPassword }, clientIp)
      );
      expect(unlockedRes.status).toBe(200);
      expect(unlockedRes.headers.get('set-cookie')).toBeTruthy();

      const emailRowAfterSuccess = await prisma.tentativaLogin.findUnique({
        where: { chaveHash: emailHash },
      });
      expect(emailRowAfterSuccess).toBeNull();

      const ipRowAfterSuccess = await prisma.tentativaLogin.findUnique({
        where: { chaveHash: ipHash },
      });
      expect(ipRowAfterSuccess).not.toBeNull();
      expect(ipRowAfterSuccess?.tentativas).toBe(LOGIN_RATE_LIMIT_POLICY.MAX_ATTEMPTS_PER_EMAIL);
    }
  );

  it(
    'deve bloquear por IP (15 tentativas) entre e-mails distintos e remover registros obsoletos (>24h)',
    { timeout: 15000 },
    async () => {
      const clientIp = '198.51.100.40';
      const staleIp = '198.51.100.250';
      const firstEmail = `ct_be_01_ip_1_${uniqueSuffix}@ufca.edu.br`;
      const secondEmail = `ct_be_01_ip_2_${uniqueSuffix}@ufca.edu.br`;
      const rawPassword = 'SenhaRateLimitIp#2026';

      const { ipHash } = trackRateLimit(firstEmail, clientIp);
      trackRateLimit(secondEmail, clientIp);
      const staleHash = hashRateLimitKey('ip', staleIp);
      trackedRateLimitHashes.add(staleHash);

      const passwordHash = await hashPassword(rawPassword);
      const secondAdmin = await prisma.usuario.create({
        data: {
          nome: 'Outro Admin Mesmo IP',
          email: secondEmail,
          passwordHash,
          ativo: true,
        },
      });
      createdUserIds.push(secondAdmin.id);

      const now = new Date();
      const staleCutoffPast = new Date(
        now.getTime() - LOGIN_RATE_LIMIT_POLICY.STALE_RETENTION_MS - 60 * 60 * 1000
      );

      await prisma.tentativaLogin.createMany({
        data: [
          {
            chaveHash: staleHash,
            tentativas: 3,
            janelaInicio: staleCutoffPast,
            bloqueadoAte: null,
          },
          {
            chaveHash: ipHash,
            tentativas: LOGIN_RATE_LIMIT_POLICY.MAX_ATTEMPTS_PER_IP - 1,
            janelaInicio: now,
            bloqueadoAte: null,
          },
        ],
      });

      const triggeringFailureRes = await loginPOST(
        buildLoginRequest({ email: firstEmail, password: 'SenhaErrada' }, clientIp)
      );
      expect(triggeringFailureRes.status).toBe(401);

      const [updatedIpRow, deletedStaleRow] = await Promise.all([
        prisma.tentativaLogin.findUnique({ where: { chaveHash: ipHash } }),
        prisma.tentativaLogin.findUnique({ where: { chaveHash: staleHash } }),
      ]);
      expect(updatedIpRow?.tentativas).toBe(LOGIN_RATE_LIMIT_POLICY.MAX_ATTEMPTS_PER_IP);
      expect(updatedIpRow?.bloqueadoAte).toBeInstanceOf(Date);
      expect(deletedStaleRow).toBeNull();

      // Outro administrador com credenciais válidas vindo do mesmo IP também recebe 429
      const blockedByIpRes = await loginPOST(
        buildLoginRequest({ email: secondEmail, password: rawPassword }, clientIp)
      );
      const blockedBody = (await blockedByIpRes.json()) as { code: string };
      expect(blockedByIpRes.status).toBe(429);
      expect(blockedBody.code).toBe(AUTH_ERROR_CODES.RATE_LIMITED);
      expect(Number(blockedByIpRes.headers.get('retry-after'))).toBeGreaterThan(0);

      const secondAdminSessions = await prisma.sessao.count({
        where: { usuarioId: secondAdmin.id },
      });
      expect(secondAdminSessions).toBe(0);
    }
  );
});
