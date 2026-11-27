/**
 * Nascentes do Cariri — Teste de Integração Backend: Guarda e Proxy Administrativo no MySQL (CT-BE-02)
 *
 * Valida proteção integrada de rotas administrativas, proxy Next.js 16 e ciclo de vida real em `sessoes`.
 */

import 'dotenv/config';
import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it } from 'vitest';
import { GET as meGET } from '@/app/api/admin/auth/me/route';
import { GET as importacoesGET } from '@/app/api/admin/importacoes/route';
import { POST as importacoesValidarPOST } from '@/app/api/admin/importacoes/validar/route';
import { GET as resumoGET } from '@/app/api/admin/resumo/route';
import { SESSION_COOKIE_NAMES } from '@/config/session-cookies';
import { prisma } from '@/lib/db/prisma';
import {
  createAdminSessionToken,
  hashSessionId,
  verifyAdminSessionToken,
} from '@/lib/security/admin-guard';
import { hashPassword } from '@/lib/security/password';
import {
  AUTH_ERROR_CODES,
  authMeResponseSchema,
  authService,
} from '@/modules/auth';
import { proxy } from '@/proxy';

describe('CT-BE-02 — Integração Guarda Administrativa, Sessões Persistidas e Proxy no MySQL', () => {
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdUserIds: number[] = [];

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.sessao.deleteMany({
        where: { usuarioId: { in: createdUserIds } },
      });
      await prisma.usuario.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  });

  async function createTestAdmin(label: string, ativo = true) {
    const email = `ct_be_02_${label}_${uniqueSuffix}@ufca.edu.br`;
    const passwordHash = await hashPassword('SenhaIntegracaoGuard#2026');
    const user = await prisma.usuario.create({
      data: {
        nome: `Admin Guard ${label}`,
        email,
        passwordHash,
        ativo,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  it('deve bloquear rotas administrativas sem autenticação (401 nas APIs e 307 no Proxy)', async () => {
    const meRes = await meGET(new NextRequest('http://localhost:3000/api/admin/auth/me'));
    const listRes = await importacoesGET(
      new NextRequest('http://localhost:3000/api/admin/importacoes')
    );
    const validarRes = await importacoesValidarPOST(
      new NextRequest('http://localhost:3000/api/admin/importacoes/validar', {
        method: 'POST',
      })
    );
    const resumoRes = await resumoGET(
      new NextRequest('http://localhost:3000/api/admin/resumo')
    );

    for (const res of [meRes, listRes, validarRes, resumoRes]) {
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toContain('no-store');
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe(AUTH_ERROR_CODES.UNAUTHORIZED);
    }

    const proxyDashboardRes = proxy(new NextRequest('http://localhost:3000/admin'));
    expect(proxyDashboardRes.status).toBe(307);
    expect(proxyDashboardRes.headers.get('location')).toBe(
      'http://localhost:3000/admin/login?next=%2Fadmin'
    );

    const proxyPageRes = proxy(new NextRequest('http://localhost:3000/admin/importacoes'));
    expect(proxyPageRes.status).toBe(307);
    expect(proxyPageRes.headers.get('location')).toBe(
      'http://localhost:3000/admin/login?next=%2Fadmin%2Fimportacoes'
    );
  });

  it('deve barrar token adulterado e token assinado não persistido em sessoes (Defesa em Profundidade)', async () => {
    const admin = await createTestAdmin('unpersisted');
    const validButUnpersistedToken = createAdminSessionToken({
      userId: admin.id,
      email: admin.email,
      role: 'ADMIN',
    });
    const tamperedToken = `${validButUnpersistedToken.slice(0, -4)}AAAA`;

    const proxyTampered = proxy(
      new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${tamperedToken}`,
        },
      })
    );
    expect(proxyTampered.status).toBe(401);

    // Token assinado mas ausente do MySQL passa na borda criptográfica e cai no Route Handler
    const proxyCryptoOk = proxy(
      new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${validButUnpersistedToken}`,
        },
      })
    );
    expect(proxyCryptoOk.status).toBe(200);
    expect(proxyCryptoOk.headers.get('x-middleware-next')).toBe('1');

    const meUnpersisted = await meGET(
      new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${validButUnpersistedToken}`,
        },
      })
    );
    const listUnpersisted = await importacoesGET(
      new NextRequest('http://localhost:3000/api/admin/importacoes', {
        headers: {
          authorization: `Bearer ${validButUnpersistedToken}`,
        },
      })
    );

    expect(meUnpersisted.status).toBe(401);
    expect(listUnpersisted.status).toBe(401);
  });

  it('deve autorizar sessão persistida válida via Cookie e Bearer sem vazar campos sensíveis', async () => {
    const admin = await createTestAdmin('authorized');
    const persisted = await authService.createPersistedSession({
      userId: admin.id,
      email: admin.email,
      role: 'ADMIN',
    });

    const meRes = await meGET(
      new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${persisted.token}`,
        },
      })
    );
    const meRawText = await meRes.text();
    const meBody = JSON.parse(meRawText) as Record<string, unknown>;

    expect(meRes.status).toBe(200);
    expect(authMeResponseSchema.safeParse(meBody).success).toBe(true);
    expect(meBody).toEqual({
      user: {
        id: admin.id,
        nome: admin.nome,
        email: admin.email,
      },
      session: {
        expiresAt: persisted.expiresAt.toISOString(),
      },
    });
    expect(meRawText).not.toContain('passwordHash');
    expect(meRawText).not.toContain('tokenHash');

    const listRes = await importacoesGET(
      new NextRequest('http://localhost:3000/api/admin/importacoes?page=1&pageSize=5', {
        headers: {
          authorization: `Bearer ${persisted.token}`,
        },
      })
    );
    expect(listRes.status).toBe(200);
    const listRawText = await listRes.text();
    expect(listRawText).not.toContain('passwordHash');
    expect(listRawText).not.toContain('tokenHash');
  });

  it('deve rejeitar com 401 sessão expirada no banco (expiresAt <= now) mesmo com JWT ainda válido', async () => {
    const admin = await createTestAdmin('db_expired');
    const persisted = await authService.createPersistedSession({
      userId: admin.id,
      email: admin.email,
      role: 'ADMIN',
      ttlSeconds: 3600,
    });

    await prisma.sessao.update({
      where: { id: persisted.sessionId },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) },
    });

    const meRes = await meGET(
      new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${persisted.token}`,
        },
      })
    );
    const listRes = await importacoesGET(
      new NextRequest('http://localhost:3000/api/admin/importacoes', {
        headers: {
          authorization: `Bearer ${persisted.token}`,
        },
      })
    );

    expect(meRes.status).toBe(401);
    expect(listRes.status).toBe(401);
  });

  it('deve suportar revogação individual e em lote no MySQL sem afetar outras sessões até revogação global', async () => {
    const admin = await createTestAdmin('revocation');
    const [sessionA, sessionB] = await Promise.all([
      authService.createPersistedSession({
        userId: admin.id,
        email: admin.email,
        role: 'ADMIN',
      }),
      authService.createPersistedSession({
        userId: admin.id,
        email: admin.email,
        role: 'ADMIN',
      }),
    ]);

    const revokedSingle = await authService.revokeSessionByToken(sessionA.token);
    expect(revokedSingle).toBe(true);

    const [rowA, rowB] = await Promise.all([
      prisma.sessao.findUnique({ where: { id: sessionA.sessionId } }),
      prisma.sessao.findUnique({ where: { id: sessionB.sessionId } }),
    ]);
    expect(rowA?.revokedAt).toBeInstanceOf(Date);
    expect(rowB?.revokedAt).toBeNull();

    const meAfterSingleA = await meGET(
      new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: { authorization: `Bearer ${sessionA.token}` },
      })
    );
    const meAfterSingleB = await meGET(
      new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: { authorization: `Bearer ${sessionB.token}` },
      })
    );
    expect(meAfterSingleA.status).toBe(401);
    expect(meAfterSingleB.status).toBe(200);

    const revokedCount = await authService.revokeAllUserSessions(admin.id);
    expect(revokedCount).toBe(1);

    const meAfterGlobalB = await meGET(
      new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: { authorization: `Bearer ${sessionB.token}` },
      })
    );
    expect(meAfterGlobalB.status).toBe(401);

    const decodedA = verifyAdminSessionToken(sessionA.token);
    expect(decodedA).not.toBeNull();
    expect(rowA?.tokenHash).toBe(hashSessionId(decodedA!.sid));
  });

  it('deve invalidar imediatamente com 403 FORBIDDEN_INACTIVE_USER quando administrador for desativado', async () => {
    const admin = await createTestAdmin('deactivated');
    const persisted = await authService.createPersistedSession({
      userId: admin.id,
      email: admin.email,
      role: 'ADMIN',
    });

    const initialRes = await meGET(
      new NextRequest('http://localhost:3000/api/admin/auth/me', {
        headers: { cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${persisted.token}` },
      })
    );
    expect(initialRes.status).toBe(200);

    await prisma.usuario.update({
      where: { id: admin.id },
      data: { ativo: false },
    });

    const [meRes, listRes, validarRes, resumoRes] = await Promise.all([
      meGET(
        new NextRequest('http://localhost:3000/api/admin/auth/me', {
          headers: { cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${persisted.token}` },
        })
      ),
      importacoesGET(
        new NextRequest('http://localhost:3000/api/admin/importacoes', {
          headers: { authorization: `Bearer ${persisted.token}` },
        })
      ),
      importacoesValidarPOST(
        new NextRequest('http://localhost:3000/api/admin/importacoes/validar', {
          method: 'POST',
          headers: { authorization: `Bearer ${persisted.token}` },
        })
      ),
      resumoGET(
        new NextRequest('http://localhost:3000/api/admin/resumo', {
          headers: { cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${persisted.token}` },
        })
      ),
    ]);

    for (const res of [meRes, listRes, validarRes, resumoRes]) {
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe(AUTH_ERROR_CODES.FORBIDDEN_INACTIVE_USER);
    }
  });
});
