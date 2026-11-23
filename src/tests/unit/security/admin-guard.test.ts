/**
 * Nascentes do Cariri — Testes Unitários da Camada de Guarda Administrativa
 *
 * Módulos cobertos:
 * - src/lib/security/admin-guard.ts
 * - src/lib/security/admin-redirect.ts
 * - src/lib/security/admin-page-guard.ts
 */

import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAMES } from '@/config/session-cookies';
import { AppError } from '@/lib/errors';

const TEST_AUTH_SECRET = 'nascentes-cariri-test-secret-key-min-32-bytes!';

const { RedirectSignal, mockCookiesGet, mockRedirect, mockDefaultFindUnique } = vi.hoisted(() => {
  class RedirectSignalError extends Error {
    public readonly url: string;

    constructor(url: string) {
      super(`NEXT_REDIRECT:${url}`);
      this.name = 'RedirectSignal';
      this.url = url;
    }
  }

  return {
    RedirectSignal: RedirectSignalError,
    mockCookiesGet: vi.fn(),
    mockRedirect: vi.fn((url: string): never => {
      throw new RedirectSignalError(url);
    }),
    mockDefaultFindUnique: vi.fn(),
  };
});

vi.mock('@/config/env', () => ({
  env: {
    AUTH_SECRET: 'nascentes-cariri-test-secret-key-min-32-bytes!',
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    sessao: {
      findUnique: mockDefaultFindUnique,
    },
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mockCookiesGet,
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

import {
  createAdminSessionToken,
  extractAuthTokenFromRequest,
  generateSessionId,
  getOptionalAdminSession,
  hashSessionId,
  isValidSessionId,
  requireAdminSession,
  verifyAdminSessionToken,
} from '@/lib/security/admin-guard';
import {
  extractSessionTokenFromCookieStore,
  getOptionalAdminPageSession,
  requireAdminPageSession,
  type CookieReader,
} from '@/lib/security/admin-page-guard';
import {
  ADMIN_LOGIN_PATH,
  DEFAULT_ADMIN_REDIRECT_PATH,
  buildAdminLoginRedirectUrl,
  sanitizeAdminRedirectPath,
} from '@/lib/security/admin-redirect';

function signRawJwt(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>): string =>
    Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64url');
  const message = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', TEST_AUTH_SECRET)
    .update(message)
    .digest('base64url');
  return `${message}.${signature}`;
}

function createPrismaMock() {
  const findUnique = vi.fn();
  const prismaClient = {
    sessao: {
      findUnique,
    },
  } as unknown as PrismaClient;

  return { prismaClient, findUnique };
}

function createCookieReader(entries: Record<string, string>): CookieReader {
  return {
    get: (name: string) => {
      const value = entries[name];
      return value !== undefined ? { value } : undefined;
    },
  };
}

describe('Camada de Guarda Administrativa (Etapa 2)', () => {
  const ACTIVE_USER = {
    id: 1,
    nome: 'Admin UFCA',
    email: 'admin@ufca.edu.br',
    ativo: true,
  };

  const INACTIVE_USER = {
    id: 2,
    nome: 'Admin Inativo',
    email: 'inativo@ufca.edu.br',
    ativo: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Utilitários de Identificador de Sessão (sid / SHA-256)', () => {
    it('deve gerar UUID v4 válido e validar estritamente formato UUID v4', () => {
      const sid1 = generateSessionId();
      const sid2 = generateSessionId();

      expect(sid1).not.toBe(sid2);
      expect(isValidSessionId(sid1)).toBe(true);
      expect(isValidSessionId(sid2)).toBe(true);

      // Rejeita UUID v1/v3/v5, strings inválidas e tipos não string
      expect(isValidSessionId('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
      expect(isValidSessionId('550e8400-e29b-41d4-0716-446655440000')).toBe(false);
      expect(isValidSessionId('')).toBe(false);
      expect(isValidSessionId('nao-eh-uuid')).toBe(false);
      expect(isValidSessionId(null)).toBe(false);
      expect(isValidSessionId(123)).toBe(false);
    });

    it('deve calcular hash SHA-256 determinístico de 64 hex minúsculos e rejeitar sid inválido', () => {
      const sid = '11111111-2222-4333-8444-555555555555';
      const hash1 = hashSessionId(sid);
      const hash2 = hashSessionId(sid);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
      expect(hash1).not.toBe(sid);

      expect(() => hashSessionId('')).toThrow();
      expect(() => hashSessionId('sid-invalido')).toThrow();
    });
  });

  describe('2. Emissão e Verificação Criptográfica de Tokens (HMAC-SHA256 + sid)', () => {
    it('deve emitir e verificar token com sid automático ou explícito', () => {
      const tokenAuto = createAdminSessionToken({
        userId: ACTIVE_USER.id,
        email: ACTIVE_USER.email,
        role: 'ADMIN',
        expiresInSeconds: 3600,
      });
      const payloadAuto = verifyAdminSessionToken(tokenAuto);

      expect(payloadAuto).not.toBeNull();
      expect(isValidSessionId(payloadAuto?.sid)).toBe(true);
      expect(payloadAuto?.userId).toBe(ACTIVE_USER.id);
      expect(payloadAuto?.email).toBe(ACTIVE_USER.email);
      expect(payloadAuto?.role).toBe('ADMIN');
      expect(payloadAuto?.exp).toBe((payloadAuto?.iat ?? 0) + 3600);

      const explicitSid = generateSessionId();
      const tokenExplicit = createAdminSessionToken({
        sid: explicitSid,
        userId: ACTIVE_USER.id,
        email: `  ${ACTIVE_USER.email}  `,
      });
      const payloadExplicit = verifyAdminSessionToken(tokenExplicit);

      expect(payloadExplicit?.sid).toBe(explicitSid);
      expect(payloadExplicit?.email).toBe(ACTIVE_USER.email);
    });

    it('deve validar parâmetros de entrada na emissão de token', () => {
      expect(() =>
        createAdminSessionToken({
          sid: 'invalido',
          userId: 1,
          email: 'admin@ufca.edu.br',
        })
      ).toThrow();

      expect(() =>
        createAdminSessionToken({
          userId: 0,
          email: 'admin@ufca.edu.br',
        })
      ).toThrow();

      expect(() =>
        createAdminSessionToken({
          userId: 1,
          email: '   ',
        })
      ).toThrow();

      expect(() =>
        createAdminSessionToken({
          userId: 1,
          email: 'admin@ufca.edu.br',
          expiresInSeconds: Number.POSITIVE_INFINITY,
        })
      ).toThrow();
    });

    it('deve rejeitar token legado sem sid, sid malformado, header inválido e tipos coercíveis', () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const validSid = generateSessionId();

      // Token legado assinado com AUTH_SECRET, mas sem sid
      const legacyToken = signRawJwt(
        { alg: 'HS256', typ: 'JWT' },
        { userId: 1, email: 'admin@ufca.edu.br', iat: nowSec, exp: nowSec + 3600 }
      );
      expect(verifyAdminSessionToken(legacyToken)).toBeNull();

      // sid não UUID v4
      const nonV4SidToken = signRawJwt(
        { alg: 'HS256', typ: 'JWT' },
        {
          sid: '550e8400-e29b-11d4-a716-446655440000',
          userId: 1,
          email: 'admin@ufca.edu.br',
          iat: nowSec,
          exp: nowSec + 3600,
        }
      );
      expect(verifyAdminSessionToken(nonV4SidToken)).toBeNull();

      // Header com alg !== HS256
      const wrongAlgToken = signRawJwt(
        { alg: 'none', typ: 'JWT' },
        { sid: validSid, userId: 1, email: 'admin@ufca.edu.br', iat: nowSec, exp: nowSec + 3600 }
      );
      expect(verifyAdminSessionToken(wrongAlgToken)).toBeNull();

      // userId enviado como string ("1") — rejeita sem coerção silenciosa
      const stringUserIdToken = signRawJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sid: validSid, userId: '1', email: 'admin@ufca.edu.br', iat: nowSec, exp: nowSec + 3600 }
      );
      expect(verifyAdminSessionToken(stringUserIdToken)).toBeNull();

      // role não string
      const invalidRoleToken = signRawJwt(
        { alg: 'HS256', typ: 'JWT' },
        {
          sid: validSid,
          userId: 1,
          email: 'admin@ufca.edu.br',
          role: 123,
          iat: nowSec,
          exp: nowSec + 3600,
        }
      );
      expect(verifyAdminSessionToken(invalidRoleToken)).toBeNull();
    });

    it('deve rejeitar token adulterado, malformado, vazio ou expirado (por offset ou relógio determinístico)', () => {
      const expiredToken = createAdminSessionToken({
        userId: 1,
        email: 'admin@ufca.edu.br',
        expiresInSeconds: -10,
      });
      expect(verifyAdminSessionToken(expiredToken)).toBeNull();

      const validToken = createAdminSessionToken({
        userId: 1,
        email: 'admin@ufca.edu.br',
        expiresInSeconds: 60,
      });
      const decoded = verifyAdminSessionToken(validToken);
      expect(decoded).not.toBeNull();

      const exactExpiration = new Date((decoded?.exp ?? 0) * 1000);
      expect(verifyAdminSessionToken(validToken, exactExpiration)).toBeNull();

      const tampered = `${validToken.slice(0, -4)}zzzz`;
      expect(verifyAdminSessionToken(tampered)).toBeNull();
      expect(verifyAdminSessionToken('')).toBeNull();
      expect(verifyAdminSessionToken('   ')).toBeNull();
      expect(verifyAdminSessionToken('parte1.parte2')).toBeNull();
    });
  });

  describe('3. Extração de Token da Requisição HTTP', () => {
    it('deve extrair token de cookie __Host-, cookie dev, Authorization Bearer e string direta', () => {
      const token = createAdminSessionToken({
        userId: 1,
        email: 'admin@ufca.edu.br',
      });

      expect(
        extractAuthTokenFromRequest(
          new Headers({ cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${token}` })
        )
      ).toBe(token);

      expect(
        extractAuthTokenFromRequest(
          new Headers({ cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}` })
        )
      ).toBe(token);

      expect(
        extractAuthTokenFromRequest(new Headers({ authorization: `Bearer ${token}` }))
      ).toBe(token);

      expect(extractAuthTokenFromRequest(`${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`)).toBe(
        token
      );
      expect(extractAuthTokenFromRequest(`Bearer ${token}`)).toBe(token);
      expect(extractAuthTokenFromRequest(token)).toBe(token);
      expect(extractAuthTokenFromRequest(null)).toBeNull();
      expect(extractAuthTokenFromRequest(undefined)).toBeNull();
      expect(extractAuthTokenFromRequest(new Headers())).toBeNull();
    });
  });

  describe('4. requireAdminSession — Validação Autoritativa em Sessao + Usuario', () => {
    it('deve executar uma única consulta por tokenHash com select mínimo e retornar sessão ativa', async () => {
      const { prismaClient, findUnique } = createPrismaMock();
      const sid = generateSessionId();
      const token = createAdminSessionToken({
        sid,
        userId: ACTIVE_USER.id,
        email: ACTIVE_USER.email,
        expiresInSeconds: 3600,
      });
      const now = new Date();
      const sessionExpiresAt = new Date(now.getTime() + 3600 * 1000);

      findUnique.mockResolvedValueOnce({
        id: 42,
        usuarioId: ACTIVE_USER.id,
        expiresAt: sessionExpiresAt,
        revokedAt: null,
        usuario: ACTIVE_USER,
      });

      const session = await requireAdminSession(
        new Headers({ cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${token}` }),
        { prismaClient, now }
      );

      expect(session).toEqual({
        id: ACTIVE_USER.id,
        nome: ACTIVE_USER.nome,
        email: ACTIVE_USER.email,
        ativo: true,
        sessionId: 42,
        sessionExpiresAt,
      });

      expect(findUnique).toHaveBeenCalledTimes(1);
      const queryArg = findUnique.mock.calls[0]?.[0] as {
        where: { tokenHash: string };
        select: Record<string, unknown>;
      };
      expect(queryArg.where).toEqual({ tokenHash: hashSessionId(sid) });
      expect(queryArg.where.tokenHash).not.toBe(sid);
      expect(queryArg.select).toEqual({
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
      });
      expect(JSON.stringify(queryArg.select)).not.toContain('passwordHash');
      expect(JSON.stringify(queryArg.select)).not.toContain('tokenHash');
    });

    it('deve bloquear com 401 UNAUTHORIZED quando token está ausente, inválido ou sem sid (sem consultar banco)', async () => {
      const { prismaClient, findUnique } = createPrismaMock();

      await expect(
        requireAdminSession(new Headers(), { prismaClient })
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      const nowSec = Math.floor(Date.now() / 1000);
      const legacyToken = signRawJwt(
        { alg: 'HS256', typ: 'JWT' },
        { userId: 1, email: ACTIVE_USER.email, iat: nowSec, exp: nowSec + 3600 }
      );
      await expect(
        requireAdminSession(`Bearer ${legacyToken}`, { prismaClient })
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      await expect(
        requireAdminSession('Bearer token.adulterado.invalido', { prismaClient })
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      expect(findUnique).not.toHaveBeenCalled();
    });

    it('deve bloquear com 401 quando sessão não existe, foi revogada, expirou no banco ou diverge do usuário', async () => {
      const { prismaClient, findUnique } = createPrismaMock();
      const now = new Date('2026-11-23T12:00:00.000Z');
      const token = createAdminSessionToken({
        userId: ACTIVE_USER.id,
        email: ACTIVE_USER.email,
        expiresInSeconds: 86400,
      });

      // Sessão ausente no banco
      findUnique.mockResolvedValueOnce(null);
      await expect(
        requireAdminSession(token, { prismaClient, now })
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      // Divergência entre usuarioId do registro e payload.userId
      findUnique.mockResolvedValueOnce({
        id: 10,
        usuarioId: 999,
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        usuario: { ...ACTIVE_USER, id: 999 },
      });
      await expect(
        requireAdminSession(token, { prismaClient, now })
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      // Sessão revogada no servidor (logout prévio)
      findUnique.mockResolvedValueOnce({
        id: 10,
        usuarioId: ACTIVE_USER.id,
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: new Date(now.getTime() - 1000),
        usuario: ACTIVE_USER,
      });
      await expect(
        requireAdminSession(token, { prismaClient, now })
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      // Sessão expirada no banco mesmo com JWT válido
      findUnique.mockResolvedValueOnce({
        id: 10,
        usuarioId: ACTIVE_USER.id,
        expiresAt: new Date(now.getTime() - 1000),
        revokedAt: null,
        usuario: ACTIVE_USER,
      });
      await expect(
        requireAdminSession(token, { prismaClient, now })
      ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    });

    it('deve bloquear com 403 FORBIDDEN_INACTIVE_USER quando administrador estiver inativo', async () => {
      const { prismaClient, findUnique } = createPrismaMock();
      const now = new Date();
      const token = createAdminSessionToken({
        userId: INACTIVE_USER.id,
        email: INACTIVE_USER.email,
      });

      findUnique.mockResolvedValueOnce({
        id: 77,
        usuarioId: INACTIVE_USER.id,
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        usuario: INACTIVE_USER,
      });

      await expect(
        requireAdminSession(token, { prismaClient, now })
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_INACTIVE_USER',
      });
    });
  });

  describe('5. getOptionalAdminSession', () => {
    it('deve retornar null para ausência/401/403, sessão para válido e propagar erro de banco', async () => {
      const { prismaClient, findUnique } = createPrismaMock();
      const now = new Date();
      const activeToken = createAdminSessionToken({
        userId: ACTIVE_USER.id,
        email: ACTIVE_USER.email,
      });

      // Ausente -> null sem consultar banco
      await expect(getOptionalAdminSession(null, { prismaClient })).resolves.toBeNull();
      await expect(getOptionalAdminSession(new Headers(), { prismaClient })).resolves.toBeNull();
      expect(findUnique).not.toHaveBeenCalled();

      // Revogada (401) -> null
      findUnique.mockResolvedValueOnce({
        id: 10,
        usuarioId: ACTIVE_USER.id,
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: new Date(),
        usuario: ACTIVE_USER,
      });
      await expect(getOptionalAdminSession(activeToken, { prismaClient, now })).resolves.toBeNull();

      // Inativa (403) -> null
      findUnique.mockResolvedValueOnce({
        id: 11,
        usuarioId: ACTIVE_USER.id,
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        usuario: { ...ACTIVE_USER, ativo: false },
      });
      await expect(getOptionalAdminSession(activeToken, { prismaClient, now })).resolves.toBeNull();

      // Válida -> retorna sessão completa
      const expiresAt = new Date(now.getTime() + 60_000);
      findUnique.mockResolvedValueOnce({
        id: 12,
        usuarioId: ACTIVE_USER.id,
        expiresAt,
        revokedAt: null,
        usuario: ACTIVE_USER,
      });
      await expect(getOptionalAdminSession(activeToken, { prismaClient, now })).resolves.toEqual({
        ...ACTIVE_USER,
        sessionId: 12,
        sessionExpiresAt: expiresAt,
      });

      // Erro inesperado de infraestrutura -> propaga
      findUnique.mockRejectedValueOnce(new Error('MySQL pool exhausted'));
      await expect(getOptionalAdminSession(activeToken, { prismaClient, now })).rejects.toThrow(
        'MySQL pool exhausted'
      );
    });
  });

  describe('6. Sanitização de Redirecionamentos Administrativos (admin-redirect.ts)', () => {
    it('deve aceitar exclusivamente rotas administrativas válidas fora da tela de login', () => {
      expect(sanitizeAdminRedirectPath('/admin')).toBe('/admin');
      expect(sanitizeAdminRedirectPath('/admin/')).toBe('/admin/');
      expect(sanitizeAdminRedirectPath('/admin/importacoes')).toBe('/admin/importacoes');
      expect(sanitizeAdminRedirectPath('  /admin/importacoes/historico?page=2#topo  ')).toBe(
        '/admin/importacoes/historico?page=2#topo'
      );
      expect(sanitizeAdminRedirectPath('/admin?tab=resumo')).toBe('/admin?tab=resumo');
      expect(sanitizeAdminRedirectPath('/admin#conteudo')).toBe('/admin#conteudo');
    });

    it('deve bloquear open redirects, prefixos enganosos, rotas fora de /admin e loops de login', () => {
      const invalidTargets = [
        null,
        undefined,
        '',
        '   ',
        'https://evil.com',
        'http://evil.com/admin',
        '//evil.com',
        '/admin//evil',
        '/\\evil.com',
        '/admin\\evil',
        '/administrator',
        '/admin-painel',
        '/mapa',
        '/',
        '/admin\n',
        '/admin\x00/importacoes',
        ADMIN_LOGIN_PATH,
        `${ADMIN_LOGIN_PATH}/`,
        `${ADMIN_LOGIN_PATH}/callback`,
        `${ADMIN_LOGIN_PATH}?next=/admin`,
        `${ADMIN_LOGIN_PATH}#erro`,
      ];

      for (const target of invalidTargets) {
        expect(sanitizeAdminRedirectPath(target)).toBe(DEFAULT_ADMIN_REDIRECT_PATH);
        expect(buildAdminLoginRedirectUrl(target)).toBe(ADMIN_LOGIN_PATH);
      }
    });

    it('deve anexar ?next codificado apenas quando o destino for válido', () => {
      expect(buildAdminLoginRedirectUrl()).toBe(ADMIN_LOGIN_PATH);
      expect(buildAdminLoginRedirectUrl('/admin/importacoes/historico?page=2')).toBe(
        '/admin/login?next=%2Fadmin%2Fimportacoes%2Fhistorico%3Fpage%3D2'
      );
    });
  });

  describe('7. Guarda de Páginas App Router (admin-page-guard.ts)', () => {
    it('deve extrair token do cookieStore priorizando __Host- sobre desenvolvimento', () => {
      const both = createCookieReader({
        [SESSION_COOKIE_NAMES.PRODUCTION]: 'prod-token',
        [SESSION_COOKIE_NAMES.DEVELOPMENT]: 'dev-token',
      });
      expect(extractSessionTokenFromCookieStore(both)).toBe('prod-token');

      const devOnly = createCookieReader({
        [SESSION_COOKIE_NAMES.DEVELOPMENT]: 'dev-token',
      });
      expect(extractSessionTokenFromCookieStore(devOnly)).toBe('dev-token');

      expect(extractSessionTokenFromCookieStore(createCookieReader({}))).toBeNull();
    });

    it('requireAdminPageSession deve redirecionar para /admin/login em 401/403 e retornar sessão quando válida', async () => {
      const { prismaClient, findUnique } = createPrismaMock();
      const now = new Date();

      // Sem cookie -> redireciona para /admin/login sem ?next quando nextPath omitido
      await expect(
        requireAdminPageSession({
          prismaClient,
          cookieStore: createCookieReader({}),
        })
      ).rejects.toBeInstanceOf(RedirectSignal);
      expect(mockRedirect).toHaveBeenLastCalledWith('/admin/login');

      // Cookie inválido + nextPath válido -> redireciona preservando ?next
      await expect(
        requireAdminPageSession({
          prismaClient,
          cookieStore: createCookieReader({ [SESSION_COOKIE_NAMES.DEVELOPMENT]: 'invalido' }),
          nextPath: '/admin/importacoes/15',
        })
      ).rejects.toBeInstanceOf(RedirectSignal);
      expect(mockRedirect).toHaveBeenLastCalledWith(
        '/admin/login?next=%2Fadmin%2Fimportacoes%2F15'
      );

      // Conta inativa (403) + nextPath malicioso -> redireciona para /admin/login sem ?next
      const inactiveToken = createAdminSessionToken({
        userId: INACTIVE_USER.id,
        email: INACTIVE_USER.email,
      });
      findUnique.mockResolvedValueOnce({
        id: 21,
        usuarioId: INACTIVE_USER.id,
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        usuario: INACTIVE_USER,
      });
      await expect(
        requireAdminPageSession({
          prismaClient,
          cookieStore: createCookieReader({ [SESSION_COOKIE_NAMES.PRODUCTION]: inactiveToken }),
          nextPath: 'https://evil.com',
        })
      ).rejects.toBeInstanceOf(RedirectSignal);
      expect(mockRedirect).toHaveBeenLastCalledWith('/admin/login');

      // Sessão válida usando fallback padrão de next/headers (cookies()) e prisma padrão
      const activeToken = createAdminSessionToken({
        userId: ACTIVE_USER.id,
        email: ACTIVE_USER.email,
      });
      const expiresAt = new Date(now.getTime() + 60_000);
      mockCookiesGet.mockImplementation((name: string) =>
        name === SESSION_COOKIE_NAMES.PRODUCTION ? { value: activeToken } : undefined
      );
      mockDefaultFindUnique.mockResolvedValueOnce({
        id: 33,
        usuarioId: ACTIVE_USER.id,
        expiresAt,
        revokedAt: null,
        usuario: ACTIVE_USER,
      });

      const session = await requireAdminPageSession({ now });
      expect(session).toEqual({
        ...ACTIVE_USER,
        sessionId: 33,
        sessionExpiresAt: expiresAt,
      });
    });

    it('requireAdminPageSession deve propagar erro inesperado de banco sem mascarar como redirect', async () => {
      const { prismaClient, findUnique } = createPrismaMock();
      const token = createAdminSessionToken({
        userId: ACTIVE_USER.id,
        email: ACTIVE_USER.email,
      });
      findUnique.mockRejectedValueOnce(new Error('Database unreachable'));

      await expect(
        requireAdminPageSession({
          prismaClient,
          cookieStore: createCookieReader({ [SESSION_COOKIE_NAMES.DEVELOPMENT]: token }),
        })
      ).rejects.toThrow('Database unreachable');
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('getOptionalAdminPageSession deve retornar null quando não autenticado e sessão quando válida', async () => {
      const { prismaClient, findUnique } = createPrismaMock();
      const now = new Date();

      await expect(
        getOptionalAdminPageSession({
          prismaClient,
          cookieStore: createCookieReader({}),
        })
      ).resolves.toBeNull();

      const token = createAdminSessionToken({
        userId: ACTIVE_USER.id,
        email: ACTIVE_USER.email,
      });
      const expiresAt = new Date(now.getTime() + 60_000);
      findUnique.mockResolvedValueOnce({
        id: 55,
        usuarioId: ACTIVE_USER.id,
        expiresAt,
        revokedAt: null,
        usuario: ACTIVE_USER,
      });

      const session = await getOptionalAdminPageSession({
        prismaClient,
        cookieStore: createCookieReader({ [SESSION_COOKIE_NAMES.DEVELOPMENT]: token }),
        now,
      });
      expect(session).toEqual({
        ...ACTIVE_USER,
        sessionId: 55,
        sessionExpiresAt: expiresAt,
      });
    });
  });

  it('AppError deve manter instância em falhas de guarda', async () => {
    const { prismaClient } = createPrismaMock();
    try {
      await requireAdminSession(null, { prismaClient });
      expect.unreachable('Deveria ter lançado AppError');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AppError);
    }
  });
});
