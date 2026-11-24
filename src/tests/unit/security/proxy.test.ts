/**
 * Nascentes do Cariri — Testes Unitários do Proxy de Proteção Administrativa (Next.js 16)
 *
 * Cobre `src/proxy.ts` para rotas `/admin/*`, `/api/admin/*`, isenções e rotas públicas.
 */

import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '@/config/env';
import { SESSION_COOKIE_NAMES } from '@/config/session-cookies';
import { createAdminSessionToken } from '@/lib/security/admin-session-token';
import { config as proxyConfig, proxy } from '@/proxy';

function createLegacyTokenWithoutSid(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      userId: 1,
      email: 'admin@ufca.edu.br',
      iat: nowSec,
      exp: nowSec + 3600,
    })
  ).toString('base64url');
  const message = `${header}.${payload}`;
  const sig = createHmac('sha256', env.AUTH_SECRET).update(message).digest('base64url');
  return `${message}.${sig}`;
}

describe('Proxy de Proteção Administrativa (src/proxy.ts)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('deve declarar matcher cobrindo /admin, /admin/:path* e /api/admin/:path*', () => {
    expect(proxyConfig.matcher).toEqual(['/admin', '/admin/:path*', '/api/admin/:path*']);
  });

  describe('Páginas administrativas (/admin e /admin/*)', () => {
    it('deve redirecionar (307) requisições sem cookie para /admin/login preservando ?next=', () => {
      const rootRes = proxy(new NextRequest('http://localhost:3000/admin'));
      expect(rootRes.status).toBe(307);
      expect(rootRes.headers.get('location')).toBe(
        'http://localhost:3000/admin/login?next=%2Fadmin'
      );
      expect(rootRes.headers.get('cache-control')).toContain('no-store');
      expect(rootRes.headers.get('pragma')).toBe('no-cache');

      const nestedRes = proxy(
        new NextRequest(
          'http://localhost:3000/admin/importacoes/historico?page=2&status=CONCLUIDA'
        )
      );
      expect(nestedRes.status).toBe(307);
      expect(nestedRes.headers.get('location')).toBe(
        'http://localhost:3000/admin/login?next=%2Fadmin%2Fimportacoes%2Fhistorico%3Fpage%3D2%26status%3DCONCLUIDA'
      );
    });

    it('deve redirecionar (307) quando o cookie estiver expirado, adulterado ou sem sid', () => {
      const expiredToken = createAdminSessionToken({
        userId: 1,
        email: 'admin@ufca.edu.br',
        expiresInSeconds: -60,
      });
      const validToken = createAdminSessionToken({
        userId: 1,
        email: 'admin@ufca.edu.br',
      });
      const tamperedToken = `${validToken.slice(0, -4)}AAAA`;
      const legacyToken = createLegacyTokenWithoutSid();

      for (const badToken of [expiredToken, tamperedToken, legacyToken]) {
        const req = new NextRequest('http://localhost:3000/admin/importacoes', {
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${badToken}`,
          },
        });
        const res = proxy(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe(
          'http://localhost:3000/admin/login?next=%2Fadmin%2Fimportacoes'
        );
      }
    });

    it('deve exigir cookie (não aceitar apenas Bearer) em páginas HTML de /admin/*', () => {
      const validToken = createAdminSessionToken({
        userId: 1,
        email: 'admin@ufca.edu.br',
      });

      const req = new NextRequest('http://localhost:3000/admin/importacoes', {
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });
      const res = proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe(
        'http://localhost:3000/admin/login?next=%2Fadmin%2Fimportacoes'
      );
    });

    it('deve permitir acesso a /admin/* quando houver cookie de sessão válido (dev ou __Host-)', () => {
      const validToken = createAdminSessionToken({
        userId: 5,
        email: 'admin@ufca.edu.br',
      });

      for (const cookieName of [
        SESSION_COOKIE_NAMES.DEVELOPMENT,
        SESSION_COOKIE_NAMES.PRODUCTION,
      ]) {
        const req = new NextRequest('http://localhost:3000/admin/importacoes', {
          headers: {
            cookie: `${cookieName}=${validToken}`,
          },
        });
        const res = proxy(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
        expect(res.headers.get('x-middleware-next')).toBe('1');
      }
    });

    it('não deve criar loop de redirecionamento em /admin/login e /admin/login/', () => {
      for (const url of [
        'http://localhost:3000/admin/login',
        'http://localhost:3000/admin/login/',
        'http://localhost:3000/admin/login?next=%2Fadmin%2Fimportacoes',
      ]) {
        const res = proxy(new NextRequest(url));
        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
        expect(res.headers.get('x-middleware-next')).toBe('1');
      }
    });

    it('deve sanitizar destinos suspeitos com barras duplas evitando Open Redirect no ?next=', () => {
      const req = new NextRequest('http://localhost:3000/admin//evil.com');
      const res = proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/admin/login');
    });

    it('deve redirecionar 307 sem lançar URIError em cookies malformados e priorizar __Host- sobre cookie dev', () => {
      const malformedRes = proxy(
        new NextRequest('http://localhost:3000/admin/importacoes', {
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=%E0%A4%A`,
          },
        })
      );
      expect(malformedRes.status).toBe(307);
      expect(malformedRes.headers.get('location')).toBe(
        'http://localhost:3000/admin/login?next=%2Fadmin%2Fimportacoes'
      );

      const expiredDevToken = createAdminSessionToken({
        userId: 5,
        email: 'admin@ufca.edu.br',
        expiresInSeconds: -60,
      });
      const validProdToken = createAdminSessionToken({
        userId: 5,
        email: 'admin@ufca.edu.br',
      });

      const mixedCookieRes = proxy(
        new NextRequest('http://localhost:3000/admin/importacoes', {
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${expiredDevToken}; ${SESSION_COOKIE_NAMES.PRODUCTION}=${validProdToken}`,
          },
        })
      );
      expect(mixedCookieRes.status).toBe(200);
      expect(mixedCookieRes.headers.get('x-middleware-next')).toBe('1');
    });
  });

  describe('Endpoints administrativos (/api/admin/*)', () => {
    it('deve liberar /api/admin/auth/login sem autenticação', () => {
      const req = new NextRequest('http://localhost:3000/api/admin/auth/login', {
        method: 'POST',
      });
      const res = proxy(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('deve liberar /api/admin/dev-session apenas em development e bloquear nos demais ambientes', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const devRes = proxy(
        new NextRequest('http://localhost:3000/api/admin/dev-session?token=abc')
      );
      expect(devRes.status).toBe(200);
      expect(devRes.headers.get('x-middleware-next')).toBe('1');

      for (const envName of ['production', 'test'] as const) {
        vi.stubEnv('NODE_ENV', envName);
        const blockedRes = proxy(
          new NextRequest('http://localhost:3000/api/admin/dev-session?token=abc')
        );
        const body = (await blockedRes.json()) as { code: string };

        expect(blockedRes.status).toBe(401);
        expect(body.code).toBe('UNAUTHORIZED');
        expect(blockedRes.headers.get('cache-control')).toContain('no-store');
      }
    });

    it('deve retornar 401 JSON com no-store em /api/admin/* sem credencial ou com token inválido', async () => {
      const missingRes = proxy(new NextRequest('http://localhost:3000/api/admin/auth/me'));
      const missingBody = (await missingRes.json()) as { code: string };
      expect(missingRes.status).toBe(401);
      expect(missingBody.code).toBe('UNAUTHORIZED');
      expect(missingRes.headers.get('cache-control')).toContain('no-store');

      const legacyRes = proxy(
        new NextRequest('http://localhost:3000/api/admin/importacoes', {
          headers: {
            authorization: `Bearer ${createLegacyTokenWithoutSid()}`,
          },
        })
      );
      expect(legacyRes.status).toBe(401);

      const malformedApiRes = proxy(
        new NextRequest('http://localhost:3000/api/admin/auth/me', {
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=%E0%A4%A`,
          },
        })
      );
      expect(malformedApiRes.status).toBe(401);
    });

    it('deve permitir /api/admin/* com cookie assinado ou Authorization Bearer válido', () => {
      const validToken = createAdminSessionToken({
        userId: 3,
        email: 'admin@ufca.edu.br',
      });

      const cookieRes = proxy(
        new NextRequest('http://localhost:3000/api/admin/auth/me', {
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${validToken}`,
          },
        })
      );
      expect(cookieRes.status).toBe(200);
      expect(cookieRes.headers.get('x-middleware-next')).toBe('1');

      const bearerRes = proxy(
        new NextRequest('http://localhost:3000/api/admin/importacoes', {
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        })
      );
      expect(bearerRes.status).toBe(200);
      expect(bearerRes.headers.get('x-middleware-next')).toBe('1');
    });
  });

  describe('Rotas públicas (não interferência)', () => {
    it('nunca deve bloquear /mapa, /api/public/* ou /', () => {
      for (const url of [
        'http://localhost:3000/',
        'http://localhost:3000/mapa',
        'http://localhost:3000/api/public/nascentes',
      ]) {
        const res = proxy(new NextRequest(url));
        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
        expect(res.headers.get('x-middleware-next')).toBe('1');
      }
    });
  });
});
