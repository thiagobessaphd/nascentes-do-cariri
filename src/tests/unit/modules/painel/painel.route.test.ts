/**
 * Nascentes do Cariri — Testes Unitários: Route Handler GET /api/admin/resumo
 *
 * Cobre `src/app/api/admin/resumo/route.ts`:
 * - Exports Next.js (`dynamic = 'force-dynamic'`, `runtime = 'nodejs'`);
 * - Proteção obrigatória via `requireAdminSession` (`401` sem sessão, `403` inativo);
 * - Resposta `200 OK` com `AdminResumoResponseDto` e cabeçalhos `no-store`;
 * - `NO_STORE_HEADERS` preservados também em erros (`401`, `403`, `500`) e `405`;
 * - Mascaramento de falhas internas (`500 INTERNAL_SERVER_ERROR`) sem vazamento técnico;
 * - Contrato fechado no MVP (ignora query params arbitrários e chama `getResumo()` padrão).
 */

import 'dotenv/config';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAMES } from '@/config/session-cookies';
import { prisma } from '@/lib/db/prisma';
import { type PublicErrorResponse } from '@/lib/errors';
import {
  createAdminSessionToken,
  generateSessionId,
  hashSessionId,
} from '@/lib/security/admin-guard';
import {
  painelService,
  type AdminResumoResponseDto,
} from '@/modules/painel';
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
  dynamic as routeDynamic,
  runtime as routeRuntime,
} from '@/app/api/admin/resumo/route';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    sessao: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/modules/painel', async () => {
  const actual = await vi.importActual<typeof import('@/modules/painel')>(
    '@/modules/painel'
  );
  return {
    ...actual,
    painelService: {
      getResumo: vi.fn(),
    },
  };
});

describe('Route Handler GET /api/admin/resumo (Task-31 / Etapa 1)', () => {
  const ACTIVE_ADMIN = {
    id: 10,
    nome: 'Prof. Administrador UFCA',
    email: 'admin@ufca.edu.br',
    ativo: true,
  };

  const INACTIVE_ADMIN = {
    id: 11,
    nome: 'Conta Inativa',
    email: 'inativo@ufca.edu.br',
    ativo: false,
  };

  const MOCK_RESUMO: AdminResumoResponseDto = {
    indicadores: {
      totalNascentesAtivas: 84,
      totalImportacoes: 6,
      ultimaImportacao: {
        id: 12,
        nomeArquivo: 'nascentes-cariri-2026.txt',
        status: 'CONCLUIDA',
        totalLinhas: 20,
        totalValidas: 19,
        totalInvalidas: 0,
        totalDuplicadas: 1,
        createdAt: '2026-11-26T10:00:00.000Z',
        concluidaAt: '2026-11-26T10:02:00.000Z',
        usuario: {
          id: 10,
          nome: 'Prof. Administrador UFCA',
        },
      },
    },
    historicoRecente: [
      {
        id: 12,
        nomeArquivo: 'nascentes-cariri-2026.txt',
        status: 'CONCLUIDA',
        totalLinhas: 20,
        totalValidas: 19,
        totalInvalidas: 0,
        totalDuplicadas: 1,
        createdAt: '2026-11-26T10:00:00.000Z',
        concluidaAt: '2026-11-26T10:02:00.000Z',
        usuario: {
          id: 10,
          nome: 'Prof. Administrador UFCA',
        },
      },
    ],
    meta: {
      recentLimit: 5,
      generatedAt: '2026-11-26T14:00:00.000Z',
    },
  };

  function mockPersistedSession(
    sid: string,
    usuario: typeof ACTIVE_ADMIN | typeof INACTIVE_ADMIN
  ) {
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue({
      id: 501,
      usuarioId: usuario.id,
      tokenHash: hashSessionId(sid),
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: null,
      createdAt: new Date(),
      usuario,
    } as never);
  }

  function expectNoStoreHeaders(response: Response) {
    expect(response.headers.get('cache-control')).toBe(
      'no-store, no-cache, must-revalidate, private'
    );
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve exportar dynamic = "force-dynamic" e runtime = "nodejs"', () => {
    expect(routeDynamic).toBe('force-dynamic');
    expect(routeRuntime).toBe('nodejs');
  });

  it('deve retornar 401 com cabeçalhos no-store quando não houver sessão', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/resumo');

    const response = await GET(request);
    const body = (await response.json()) as PublicErrorResponse;

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
    expectNoStoreHeaders(response);
    expect(painelService.getResumo).not.toHaveBeenCalled();
  });

  it('deve retornar 403 com cabeçalhos no-store quando o administrador estiver inativo', async () => {
    const sid = generateSessionId();
    const token = createAdminSessionToken({
      userId: INACTIVE_ADMIN.id,
      email: INACTIVE_ADMIN.email,
      sid,
    });
    mockPersistedSession(sid, INACTIVE_ADMIN);

    const request = new NextRequest('http://localhost:3000/api/admin/resumo', {
      headers: {
        cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
      },
    });

    const response = await GET(request);
    const body = (await response.json()) as PublicErrorResponse;

    expect(response.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN_INACTIVE_USER');
    expectNoStoreHeaders(response);
    expect(painelService.getResumo).not.toHaveBeenCalled();
  });

  it('deve retornar 200 OK com AdminResumoResponseDto via Cookie HttpOnly e ignorar query params arbitrários', async () => {
    const sid = generateSessionId();
    const token = createAdminSessionToken({
      userId: ACTIVE_ADMIN.id,
      email: ACTIVE_ADMIN.email,
      sid,
    });
    mockPersistedSession(sid, ACTIVE_ADMIN);
    vi.mocked(painelService.getResumo).mockResolvedValue(MOCK_RESUMO);

    const request = new NextRequest(
      'http://localhost:3000/api/admin/resumo?limit=999&recentLimit=50',
      {
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
        },
      }
    );

    const response = await GET(request);
    const body = (await response.json()) as AdminResumoResponseDto;

    expect(response.status).toBe(200);
    expectNoStoreHeaders(response);
    expect(painelService.getResumo).toHaveBeenCalledTimes(1);
    expect(painelService.getResumo).toHaveBeenCalledWith();
    expect(body).toEqual(MOCK_RESUMO);
  });

  it('deve retornar 200 OK quando autenticado via Authorization Bearer válido', async () => {
    const sid = generateSessionId();
    const token = createAdminSessionToken({
      userId: ACTIVE_ADMIN.id,
      email: ACTIVE_ADMIN.email,
      sid,
    });
    mockPersistedSession(sid, ACTIVE_ADMIN);
    vi.mocked(painelService.getResumo).mockResolvedValue(MOCK_RESUMO);

    const request = new NextRequest('http://localhost:3000/api/admin/resumo', {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    expectNoStoreHeaders(response);
  });

  it('deve mascarar erros inesperados de banco com 500 e cabeçalhos no-store sem vazar detalhes técnicos', async () => {
    const sid = generateSessionId();
    const token = createAdminSessionToken({
      userId: ACTIVE_ADMIN.id,
      email: ACTIVE_ADMIN.email,
      sid,
    });
    mockPersistedSession(sid, ACTIVE_ADMIN);
    vi.mocked(painelService.getResumo).mockRejectedValue(
      new Error('ER_ACCESS_DENIED_ERROR SELECT * FROM nascentes /var/private/uploads')
    );

    const request = new NextRequest('http://localhost:3000/api/admin/resumo', {
      headers: {
        cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
      },
    });

    const response = await GET(request);
    const body = (await response.json()) as PublicErrorResponse;

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error).not.toContain('ER_ACCESS_DENIED_ERROR');
    expect(body.error).not.toContain('SELECT');
    expect(body.error).not.toContain('/var/private');
    expectNoStoreHeaders(response);
  });

  it('deve retornar 405 Method Not Allowed com Allow: GET e no-store para POST, PUT, DELETE e PATCH', async () => {
    for (const handler of [POST, PUT, DELETE, PATCH]) {
      const response = await handler();
      const body = (await response.json()) as PublicErrorResponse;

      expect(response.status).toBe(405);
      expect(body.code).toBe('METHOD_NOT_ALLOWED');
      expect(response.headers.get('allow')).toBe('GET');
      expectNoStoreHeaders(response);
    }
  });
});
