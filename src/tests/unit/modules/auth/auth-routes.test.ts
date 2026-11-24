/**
 * Nascentes do Cariri — Testes Unitários das Rotas HTTP de Autenticação
 *
 * Cobre POST /api/admin/auth/login e GET /api/admin/auth/me (contratos, headers, cookies e erros).
 */

import 'dotenv/config';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAMES } from '@/config/session-cookies';
import { AppError } from '@/lib/errors';
import {
  AUTH_ERROR_CODES,
  DEFAULT_ADMIN_SESSION_TTL_SECONDS,
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  LoginRateLimitError,
  authMeResponseSchema,
  loginResponseSchema,
} from '@/modules/auth';

const hoistedMocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  getAuthenticatedAdmin: vi.fn(),
  requireAdminSession: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/modules/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth')>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      authenticateAdmin: hoistedMocks.authenticateAdmin,
      getAuthenticatedAdmin: hoistedMocks.getAuthenticatedAdmin,
    },
  };
});

vi.mock('@/lib/security/admin-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/admin-guard')>();
  return {
    ...actual,
    requireAdminSession: hoistedMocks.requireAdminSession,
  };
});

vi.mock('@/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logger')>();
  return {
    ...actual,
    logger: {
      ...actual.logger,
      error: hoistedMocks.loggerError,
    },
  };
});

import {
  DELETE as loginDELETE,
  GET as loginGET,
  PATCH as loginPATCH,
  POST as loginPOST,
  PUT as loginPUT,
  dynamic as loginDynamic,
  runtime as loginRuntime,
} from '@/app/api/admin/auth/login/route';
import {
  DELETE as meDELETE,
  GET as meGET,
  PATCH as mePATCH,
  POST as mePOST,
  PUT as mePUT,
  dynamic as meDynamic,
  runtime as meRuntime,
} from '@/app/api/admin/auth/me/route';

function makeLoginRequest(
  body: string | Record<string, unknown>,
  headers?: Record<string, string>
): NextRequest {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return new NextRequest('http://localhost:3000/api/admin/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: payload,
  });
}

describe('Rotas HTTP de Autenticação Administrativa (/api/admin/auth/*)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('POST /api/admin/auth/login', () => {
    it('deve declarar dynamic=force-dynamic e runtime=nodejs', () => {
      expect(loginDynamic).toBe('force-dynamic');
      expect(loginRuntime).toBe('nodejs');
    });

    it('deve autenticar com sucesso (200), definir cookie HttpOnly seguro e retornar DTO estrito', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const expiresAt = new Date('2026-12-23T12:00:00.000Z');
      hoistedMocks.authenticateAdmin.mockResolvedValueOnce({
        user: {
          id: 7,
          nome: 'Administrador UFCA',
          email: 'admin@ufca.edu.br',
        },
        session: {
          expiresAt: expiresAt.toISOString(),
        },
        sessionId: 99,
        token: 'signed.jwt.token',
        expiresAt,
      });

      const req = makeLoginRequest(
        { email: '  ADMIN@UFCA.EDU.BR ', password: 'SenhaSuperSecreta!123' },
        { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' }
      );
      const res = await loginPOST(req);
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(loginResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        user: {
          id: 7,
          nome: 'Administrador UFCA',
          email: 'admin@ufca.edu.br',
        },
        session: {
          expiresAt: '2026-12-23T12:00:00.000Z',
        },
      });
      expect(JSON.stringify(body)).not.toContain('passwordHash');
      expect(JSON.stringify(body)).not.toContain('tokenHash');
      expect(JSON.stringify(body)).not.toContain('signed.jwt.token');

      expect(hoistedMocks.authenticateAdmin).toHaveBeenCalledWith({
        email: 'admin@ufca.edu.br',
        password: 'SenhaSuperSecreta!123',
        clientIp: '203.0.113.10',
      });

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain(`${SESSION_COOKIE_NAMES.DEVELOPMENT}=signed.jwt.token`);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).toContain(`Max-Age=${DEFAULT_ADMIN_SESSION_TTL_SECONDS}`);
      expect(setCookie).not.toContain('Secure');

      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(res.headers.get('pragma')).toBe('no-cache');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });

    it('deve emitir cookie com prefixo __Host- e flag Secure quando NODE_ENV=production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const expiresAt = new Date('2026-12-23T12:00:00.000Z');
      hoistedMocks.authenticateAdmin.mockResolvedValueOnce({
        user: {
          id: 1,
          nome: 'Coordenação',
          email: 'coord@ufca.edu.br',
        },
        session: {
          expiresAt: expiresAt.toISOString(),
        },
        sessionId: 12,
        token: 'prod.jwt.token',
        expiresAt,
      });

      const res = await loginPOST(
        makeLoginRequest({ email: 'coord@ufca.edu.br', password: 'SenhaValida!2026' })
      );

      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain(`${SESSION_COOKIE_NAMES.PRODUCTION}=prod.jwt.token`);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=Lax');
    });

    it('deve retornar 400 VALIDATION_ERROR para JSON malformado, body não-objeto ou schema inválido sem ecoar senha', async () => {
      const malformedRes = await loginPOST(makeLoginRequest('{json-quebrado'));
      expect(malformedRes.status).toBe(400);
      expect(malformedRes.headers.get('set-cookie')).toBeNull();
      expect(malformedRes.headers.get('cache-control')).toContain('no-store');
      const malformedBody = (await malformedRes.json()) as { code: string };
      expect(malformedBody.code).toBe(AUTH_ERROR_CODES.VALIDATION_ERROR);

      const arrayRes = await loginPOST(makeLoginRequest('["invalido"]'));
      expect(arrayRes.status).toBe(400);
      expect(arrayRes.headers.get('set-cookie')).toBeNull();

      const sensitiveSecret = 'MinhaSenhaUltrassecreta#9988';
      const invalidEmailRes = await loginPOST(
        makeLoginRequest({ email: 'nao-e-email', password: sensitiveSecret })
      );
      const invalidEmailText = await invalidEmailRes.text();
      expect(invalidEmailRes.status).toBe(400);
      expect(invalidEmailText).toContain(AUTH_ERROR_CODES.VALIDATION_ERROR);
      expect(invalidEmailText).not.toContain(sensitiveSecret);
      expect(invalidEmailRes.headers.get('set-cookie')).toBeNull();

      const extraFieldRes = await loginPOST(
        makeLoginRequest({
          email: 'admin@ufca.edu.br',
          password: sensitiveSecret,
          role: 'SUPERADMIN',
        })
      );
      const extraFieldText = await extraFieldRes.text();
      expect(extraFieldRes.status).toBe(400);
      expect(extraFieldText).toContain(AUTH_ERROR_CODES.VALIDATION_ERROR);
      expect(extraFieldText).not.toContain(sensitiveSecret);
      expect(hoistedMocks.authenticateAdmin).not.toHaveBeenCalled();
    });

    it('deve retornar 401 INVALID_CREDENTIALS genérico sem Set-Cookie quando credenciais falharem', async () => {
      hoistedMocks.authenticateAdmin.mockRejectedValueOnce(
        new AppError(
          GENERIC_INVALID_CREDENTIALS_MESSAGE,
          401,
          AUTH_ERROR_CODES.INVALID_CREDENTIALS
        )
      );

      const res = await loginPOST(
        makeLoginRequest({ email: 'admin@ufca.edu.br', password: 'errada' })
      );
      const body = (await res.json()) as { error: string; code: string };

      expect(res.status).toBe(401);
      expect(body).toEqual({
        error: GENERIC_INVALID_CREDENTIALS_MESSAGE,
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      });
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });

    it('deve retornar 429 RATE_LIMITED com cabeçalho Retry-After e no-store quando bloqueado', async () => {
      hoistedMocks.authenticateAdmin.mockRejectedValueOnce(new LoginRateLimitError(540));

      const res = await loginPOST(
        makeLoginRequest({ email: 'admin@ufca.edu.br', password: 'errada' })
      );
      const body = (await res.json()) as { code: string };

      expect(res.status).toBe(429);
      expect(body.code).toBe(AUTH_ERROR_CODES.RATE_LIMITED);
      expect(res.headers.get('retry-after')).toBe('540');
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });

    it('deve mascarar erros inesperados como 500 INTERNAL_SERVER_ERROR sem vazar detalhes internos', async () => {
      hoistedMocks.authenticateAdmin.mockRejectedValueOnce(
        new Error('ER_CON_COUNT_ERROR: secret db host')
      );

      const res = await loginPOST(
        makeLoginRequest({ email: 'admin@ufca.edu.br', password: 'SenhaValida!2026' })
      );
      const text = await res.text();

      expect(res.status).toBe(500);
      expect(text).toContain('INTERNAL_SERVER_ERROR');
      expect(text).not.toContain('ER_CON_COUNT_ERROR');
      expect(text).not.toContain('secret db host');
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('deve retornar 405 METHOD_NOT_ALLOWED com Allow=POST para métodos não suportados', async () => {
      for (const handler of [loginGET, loginPUT, loginDELETE, loginPATCH]) {
        const res = await handler();
        const body = (await res.json()) as { code: string };

        expect(res.status).toBe(405);
        expect(body.code).toBe('METHOD_NOT_ALLOWED');
        expect(res.headers.get('allow')).toBe('POST');
        expect(res.headers.get('cache-control')).toContain('no-store');
      }
    });
  });

  describe('GET /api/admin/auth/me', () => {
    it('deve declarar dynamic=force-dynamic e runtime=nodejs', () => {
      expect(meDynamic).toBe('force-dynamic');
      expect(meRuntime).toBe('nodejs');
    });

    it('deve retornar 200 com dados públicos do admin autenticado e expiração da sessão', async () => {
      const expiresAt = new Date('2026-12-23T12:00:00.000Z');
      const session = {
        id: 10,
        nome: 'Thiago Bessa',
        email: 'thiago.bessa@ufca.edu.br',
        ativo: true,
        sessionId: 55,
        sessionExpiresAt: expiresAt,
      };
      hoistedMocks.requireAdminSession.mockResolvedValueOnce(session);
      hoistedMocks.getAuthenticatedAdmin.mockReturnValueOnce({
        user: {
          id: session.id,
          nome: session.nome,
          email: session.email,
        },
        session: {
          expiresAt: expiresAt.toISOString(),
        },
      });

      const req = new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=valid.jwt.token`,
        },
      });
      const res = await meGET(req);
      const body = (await res.json()) as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(authMeResponseSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        user: {
          id: 10,
          nome: 'Thiago Bessa',
          email: 'thiago.bessa@ufca.edu.br',
        },
        session: {
          expiresAt: '2026-12-23T12:00:00.000Z',
        },
      });
      expect(JSON.stringify(body)).not.toContain('passwordHash');
      expect(JSON.stringify(body)).not.toContain('tokenHash');
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(res.headers.get('pragma')).toBe('no-cache');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(hoistedMocks.requireAdminSession).toHaveBeenCalledWith(req);
      expect(hoistedMocks.getAuthenticatedAdmin).toHaveBeenCalledWith(session);
    });

    it('deve retornar 401 UNAUTHORIZED quando sessão estiver ausente, revogada ou expirada', async () => {
      hoistedMocks.requireAdminSession.mockRejectedValueOnce(
        new AppError(
          'Acesso não autorizado: sessão administrativa revogada.',
          401,
          AUTH_ERROR_CODES.UNAUTHORIZED
        )
      );

      const req = new NextRequest('http://localhost:3000/api/admin/auth/me');
      const res = await meGET(req);
      const body = (await res.json()) as { code: string };

      expect(res.status).toBe(401);
      expect(body.code).toBe(AUTH_ERROR_CODES.UNAUTHORIZED);
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    });

    it('deve retornar 403 FORBIDDEN_INACTIVE_USER quando administrador foi desativado', async () => {
      hoistedMocks.requireAdminSession.mockRejectedValueOnce(
        new AppError(
          'Acesso proibido: conta de administrador inativa.',
          403,
          AUTH_ERROR_CODES.FORBIDDEN_INACTIVE_USER
        )
      );

      const req = new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: {
          authorization: 'Bearer valid.token.for.inactive.user',
        },
      });
      const res = await meGET(req);
      const body = (await res.json()) as { code: string };

      expect(res.status).toBe(403);
      expect(body.code).toBe(AUTH_ERROR_CODES.FORBIDDEN_INACTIVE_USER);
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('deve mascarar erros inesperados em /me como 500 INTERNAL_SERVER_ERROR', async () => {
      hoistedMocks.requireAdminSession.mockRejectedValueOnce(
        new Error('Connection refused to internal mysql')
      );

      const req = new NextRequest('http://localhost:3000/api/admin/auth/me');
      const res = await meGET(req);
      const text = await res.text();

      expect(res.status).toBe(500);
      expect(text).toContain('INTERNAL_SERVER_ERROR');
      expect(text).not.toContain('Connection refused');
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('deve retornar 405 METHOD_NOT_ALLOWED com Allow=GET para métodos não suportados', async () => {
      for (const handler of [mePOST, mePUT, meDELETE, mePATCH]) {
        const res = await handler();
        const body = (await res.json()) as { code: string };

        expect(res.status).toBe(405);
        expect(body.code).toBe('METHOD_NOT_ALLOWED');
        expect(res.headers.get('allow')).toBe('GET');
        expect(res.headers.get('cache-control')).toContain('no-store');
      }
    });
  });
});
