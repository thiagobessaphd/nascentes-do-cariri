/**
 * Nascentes do Cariri — Testes Unitários de QA: Route Handlers de Histórico e Detalhe
 *
 * Módulos:
 * - src/app/api/admin/importacoes/route.ts (GET)
 * - src/app/api/admin/importacoes/[id]/route.ts (GET)
 *
 * Cobertura:
 * - Métodos HTTP não permitidos (405 Method Not Allowed + Allow + Cache-Control: no-store);
 * - Guarda administrativa HMAC-SHA256 e bloqueio sem sessão (401) ou inativo (403);
 * - Validação estrita de query params e parâmetro dinâmico [id] (400 INVALID_IMPORTACAO_INPUT);
 * - Contratos 200 OK via Cookie HttpOnly e Authorization Bearer com cabeçalhos anti-cache;
 * - Omissão estrita de caminhoPrivadoArquivo, storageUrl e passwordHash;
 * - Propagação fiel de 404/422 e mascaramento 500 INTERNAL_SERVER_ERROR.
 */

import 'dotenv/config';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAMES } from '@/config/session-cookies';
import { prisma } from '@/lib/db/prisma';
import { AppError, type PublicErrorResponse } from '@/lib/errors';
import { createAdminSessionToken } from '@/lib/security/admin-guard';
import {
  IMPORTACAO_COMMIT_ERROR_CODES,
  StatusImportacao,
  importacaoHistoryService,
  type ImportacaoDetailResponseDto,
  type ImportacaoHistoryListResponseDto,
  type ImportacaoRouteContext,
} from '@/modules/importacoes';
import {
  DELETE as LIST_ROUTE_DELETE,
  GET as LIST_GET,
  PATCH as LIST_ROUTE_PATCH,
  POST as LIST_ROUTE_POST,
  PUT as LIST_ROUTE_PUT,
} from '@/app/api/admin/importacoes/route';
import { GET as ITEM_GET } from '@/app/api/admin/importacoes/[id]/route';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/modules/importacoes', async () => {
  const actual = await vi.importActual<typeof import('@/modules/importacoes')>(
    '@/modules/importacoes'
  );
  return {
    ...actual,
    importacaoHistoryService: {
      listHistory: vi.fn(),
      getById: vi.fn(),
    },
  };
});

function createRouteContext(id: string): ImportacaoRouteContext {
  return {
    params: Promise.resolve({ id }),
  };
}

describe('QA Unitário — Rotas GET /api/admin/importacoes e GET /api/admin/importacoes/[id]', () => {
  const ACTIVE_ADMIN = {
    id: 10,
    nome: 'Prof. Administrador UFCA',
    email: 'admin@ufca.edu.br',
    ativo: true,
  };

  const INACTIVE_ADMIN = {
    id: 11,
    nome: 'Ex-Administrador UFCA',
    email: 'inativo@ufca.edu.br',
    ativo: false,
  };

  const MOCK_HISTORY_LIST: ImportacaoHistoryListResponseDto = {
    data: [
      {
        id: 42,
        nomeArquivo: 'nascentes-cariri.txt',
        hashSha256: 'a'.repeat(64),
        status: StatusImportacao.CONCLUIDA,
        totalLinhas: 5,
        totalValidas: 4,
        totalInvalidas: 0,
        totalDuplicadas: 1,
        mensagemErro: null,
        createdAt: '2026-11-15T18:00:00.000Z',
        concluidaAt: '2026-11-15T18:05:00.000Z',
        usuario: {
          id: 10,
          nome: 'Prof. Administrador UFCA',
          email: 'admin@ufca.edu.br',
        },
      },
    ],
    meta: {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    },
  };

  const MOCK_DETAIL_DTO: ImportacaoDetailResponseDto = {
    ...MOCK_HISTORY_LIST.data[0]!,
    id: 88,
    status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
    concluidaAt: null,
    nascentesInseridasCount: 0,
    isOwner: true,
    preview: {
      importacaoId: 88,
      nomeArquivo: 'nascentes-cariri.txt',
      hashSha256: 'a'.repeat(64),
      tamanhoBytes: 256,
      status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
      canConfirm: true,
      summary: {
        totalLinhas: 5,
        totalValidas: 4,
        totalInvalidas: 0,
        totalDuplicadas: 1,
      },
      validRows: [],
      duplicateRows: [],
      invalidRows: [],
      allErrors: [],
      createdAt: '2026-11-15T18:00:00.000Z',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['SESSION_SECRET'] = 'vitest-admin-guard-secret-32-chars-minimum';

    vi.mocked(prisma.usuario.findUnique).mockImplementation(
      (async (args: { where?: { id?: number } }) => {
        const id = args.where?.id;
        if (id === ACTIVE_ADMIN.id) {
          return { ...ACTIVE_ADMIN };
        }
        if (id === INACTIVE_ADMIN.id) {
          return { ...INACTIVE_ADMIN };
        }
        return null;
      }) as never
    );
  });

  // 1. GET /api/admin/importacoes
  describe('GET /api/admin/importacoes', () => {
    it('deve responder 405 Method Not Allowed com Allow: GET para POST, PUT, DELETE e PATCH', async () => {
      const responses = await Promise.all([
        LIST_ROUTE_POST(),
        LIST_ROUTE_PUT(),
        LIST_ROUTE_DELETE(),
        LIST_ROUTE_PATCH(),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const body = (await response.json()) as PublicErrorResponse;
        expect(body.code).toBe('METHOD_NOT_ALLOWED');
      }
    });

    it('deve retornar 401 UNAUTHORIZED sem sessão administrativa e não invocar listHistory', async () => {
      const req = new NextRequest('http://localhost/api/admin/importacoes', {
        method: 'GET',
      });

      const response = await LIST_GET(req);
      expect(response.status).toBe(401);
      const body = (await response.json()) as PublicErrorResponse;
      expect(body.code).toBe('UNAUTHORIZED');
      expect(importacaoHistoryService.listHistory).not.toHaveBeenCalled();
    });

    it('deve retornar 401 UNAUTHORIZED para token inválido ou expirado', async () => {
      const expiredToken = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
        expiresInSeconds: -60,
      });

      for (const token of ['token.invalido.forjado', expiredToken]) {
        const req = new NextRequest('http://localhost/api/admin/importacoes', {
          method: 'GET',
          headers: {
            authorization: `Bearer ${token}`,
          },
        });

        const response = await LIST_GET(req);
        expect(response.status).toBe(401);
      }

      expect(importacaoHistoryService.listHistory).not.toHaveBeenCalled();
    });

    it('deve retornar 403 FORBIDDEN_INACTIVE_USER quando administrador estiver inativo', async () => {
      const token = createAdminSessionToken({
        userId: INACTIVE_ADMIN.id,
        email: INACTIVE_ADMIN.email,
      });

      const req = new NextRequest('http://localhost/api/admin/importacoes', {
        method: 'GET',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
        },
      });

      const response = await LIST_GET(req);
      expect(response.status).toBe(403);
      const body = (await response.json()) as PublicErrorResponse;
      expect(body.code).toBe('FORBIDDEN_INACTIVE_USER');
      expect(importacaoHistoryService.listHistory).not.toHaveBeenCalled();
    });

    it.each([
      'page=0',
      'page=-2',
      'page=abc',
      'pageSize=0',
      'pageSize=101',
      'limit=abc',
      'status=DESCONHECIDO',
    ])(
      'deve retornar 400 INVALID_IMPORTACAO_INPUT para query param inválido "%s"',
      async (query) => {
        const token = createAdminSessionToken({
          userId: ACTIVE_ADMIN.id,
          email: ACTIVE_ADMIN.email,
        });

        const req = new NextRequest(`http://localhost/api/admin/importacoes?${query}`, {
          method: 'GET',
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
          },
        });

        const response = await LIST_GET(req);
        expect(response.status).toBe(400);
        const body = (await response.json()) as PublicErrorResponse;
        expect(body.code).toBe(IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT);
        expect(importacaoHistoryService.listHistory).not.toHaveBeenCalled();
      }
    );

    it('deve retornar 200 OK com histórico paginado via Cookie HttpOnly e cabeçalhos anti-cache', async () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      vi.mocked(importacaoHistoryService.listHistory).mockResolvedValueOnce(
        MOCK_HISTORY_LIST
      );

      const req = new NextRequest(
        'http://localhost/api/admin/importacoes?page=1&pageSize=20&status=CONCLUIDA',
        {
          method: 'GET',
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
          },
        }
      );

      const response = await LIST_GET(req);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
      expect(response.headers.get('Pragma')).toBe('no-cache');

      const rawText = await response.text();
      expect(rawText).not.toContain('caminhoPrivadoArquivo');
      expect(rawText).not.toContain('storageUrl');
      expect(rawText).not.toContain('passwordHash');

      const body = JSON.parse(rawText) as ImportacaoHistoryListResponseDto;
      expect(body).toEqual(MOCK_HISTORY_LIST);
      expect(importacaoHistoryService.listHistory).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        status: 'CONCLUIDA',
      });
    });

    it('deve aceitar Authorization Bearer e aplicar defaults quando query params forem omitidos', async () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      vi.mocked(importacaoHistoryService.listHistory).mockResolvedValueOnce(
        MOCK_HISTORY_LIST
      );

      const req = new NextRequest('http://localhost/api/admin/importacoes', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const response = await LIST_GET(req);
      expect(response.status).toBe(200);
      expect(importacaoHistoryService.listHistory).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
      });
    });

    it('deve mascarar falha inesperada do banco em 500 INTERNAL_SERVER_ERROR', async () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      vi.mocked(importacaoHistoryService.listHistory).mockRejectedValueOnce(
        new Error('MySQL connection error mysql://root:supersecret@db:3306')
      );

      const req = new NextRequest('http://localhost/api/admin/importacoes', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const response = await LIST_GET(req);
      expect(response.status).toBe(500);
      const rawText = await response.text();
      expect(rawText).not.toContain('supersecret');
      expect(JSON.parse(rawText)).toEqual({
        error: 'Ocorreu um erro interno ao processar a solicitação.',
        code: 'INTERNAL_SERVER_ERROR',
      });
    });
  });

  // 2. GET /api/admin/importacoes/[id]
  describe('GET /api/admin/importacoes/[id]', () => {
    it('deve retornar 401 UNAUTHORIZED sem sessão administrativa e 403 FORBIDDEN_INACTIVE_USER para inativo', async () => {
      const anonReq = new NextRequest('http://localhost/api/admin/importacoes/88', {
        method: 'GET',
      });
      const anonRes = await ITEM_GET(anonReq, createRouteContext('88'));
      expect(anonRes.status).toBe(401);

      const inactiveToken = createAdminSessionToken({
        userId: INACTIVE_ADMIN.id,
        email: INACTIVE_ADMIN.email,
      });
      const inactiveReq = new NextRequest('http://localhost/api/admin/importacoes/88', {
        method: 'GET',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${inactiveToken}`,
        },
      });
      const inactiveRes = await ITEM_GET(inactiveReq, createRouteContext('88'));
      expect(inactiveRes.status).toBe(403);
      expect(importacaoHistoryService.getById).not.toHaveBeenCalled();
    });

    it.each(['0', '-3', 'abc', '1.5', '9007199254740993'])(
      'deve retornar 400 INVALID_IMPORTACAO_INPUT para [id] inválido "%s"',
      async (invalidId) => {
        const token = createAdminSessionToken({
          userId: ACTIVE_ADMIN.id,
          email: ACTIVE_ADMIN.email,
        });

        const req = new NextRequest(
          `http://localhost/api/admin/importacoes/${encodeURIComponent(invalidId)}`,
          {
            method: 'GET',
            headers: {
              cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
            },
          }
        );

        const response = await ITEM_GET(req, createRouteContext(invalidId));
        expect(response.status).toBe(400);
        const body = (await response.json()) as PublicErrorResponse;
        expect(body.code).toBe(IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT);
        expect(importacaoHistoryService.getById).not.toHaveBeenCalled();
      }
    );

    it('deve retornar 400 INVALID_IMPORTACAO_INPUT quando includePreview for inválido', async () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      const req = new NextRequest(
        'http://localhost/api/admin/importacoes/88?includePreview=talvez',
        {
          method: 'GET',
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
          },
        }
      );

      const response = await ITEM_GET(req, createRouteContext('88'));
      expect(response.status).toBe(400);
      const body = (await response.json()) as PublicErrorResponse;
      expect(body.code).toBe(IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT);
      expect(importacaoHistoryService.getById).not.toHaveBeenCalled();
    });

    it('deve retornar 200 OK com detalhe e prévia reconstruída via Cookie e Bearer', async () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      vi.mocked(importacaoHistoryService.getById).mockResolvedValueOnce(MOCK_DETAIL_DTO);
      const reqCookie = new NextRequest('http://localhost/api/admin/importacoes/88', {
        method: 'GET',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
        },
      });

      const resCookie = await ITEM_GET(reqCookie, createRouteContext('88'));
      expect(resCookie.status).toBe(200);
      expect(resCookie.headers.get('Cache-Control')).toContain('no-store');
      expect(resCookie.headers.get('Pragma')).toBe('no-cache');

      const rawText = await resCookie.text();
      expect(rawText).not.toContain('caminhoPrivadoArquivo');
      expect(rawText).not.toContain('storageUrl');
      expect(rawText).not.toContain('passwordHash');

      expect(JSON.parse(rawText)).toEqual(MOCK_DETAIL_DTO);
      expect(importacaoHistoryService.getById).toHaveBeenCalledWith({
        importacaoId: 88,
        usuarioId: ACTIVE_ADMIN.id,
      });

      vi.mocked(importacaoHistoryService.getById).mockResolvedValueOnce({
        ...MOCK_DETAIL_DTO,
        preview: null,
      });
      const reqBearer = new NextRequest(
        'http://localhost/api/admin/importacoes/88?includePreview=false',
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${token}`,
          },
        }
      );
      const resBearer = await ITEM_GET(reqBearer, createRouteContext('88'));
      expect(resBearer.status).toBe(200);
      expect(importacaoHistoryService.getById).toHaveBeenLastCalledWith({
        importacaoId: 88,
        usuarioId: ACTIVE_ADMIN.id,
        requirePreview: false,
      });

      vi.mocked(importacaoHistoryService.getById).mockResolvedValueOnce(MOCK_DETAIL_DTO);
      const reqRequireTrue = new NextRequest(
        'http://localhost/api/admin/importacoes/88?includePreview=true',
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${token}`,
          },
        }
      );
      const resRequireTrue = await ITEM_GET(reqRequireTrue, createRouteContext('88'));
      expect(resRequireTrue.status).toBe(200);
      expect(importacaoHistoryService.getById).toHaveBeenLastCalledWith({
        importacaoId: 88,
        usuarioId: ACTIVE_ADMIN.id,
        requirePreview: true,
      });
    });

    it.each([
      {
        status: 404,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_NOT_FOUND,
        message: 'Importação com ID 88 não foi encontrada.',
      },
      {
        status: 422,
        code: IMPORTACAO_COMMIT_ERROR_CODES.FILE_INTEGRITY_ERROR,
        message: 'A integridade do arquivo TXT original não confere com o hash SHA-256 registrado.',
      },
    ])(
      'deve propagar erro HTTP $status ($code) no detalhe',
      async ({ status, code, message }) => {
        const token = createAdminSessionToken({
          userId: ACTIVE_ADMIN.id,
          email: ACTIVE_ADMIN.email,
        });

        vi.mocked(importacaoHistoryService.getById).mockRejectedValueOnce(
          new AppError(message, status, code)
        );

        const req = new NextRequest('http://localhost/api/admin/importacoes/88', {
          method: 'GET',
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
          },
        });

        const response = await ITEM_GET(req, createRouteContext('88'));
        expect(response.status).toBe(status);
        const body = (await response.json()) as PublicErrorResponse;
        expect(body.code).toBe(code);
        expect(body.error).toBe(message);
      }
    );

    it('deve mascarar exceção inesperada no GET [id] em 500 INTERNAL_SERVER_ERROR', async () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      vi.mocked(importacaoHistoryService.getById).mockRejectedValueOnce(
        new Error('Prisma panic token=secret_db_pwd')
      );

      const req = new NextRequest('http://localhost/api/admin/importacoes/88', {
        method: 'GET',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
        },
      });

      const response = await ITEM_GET(req, createRouteContext('88'));
      expect(response.status).toBe(500);
      const rawText = await response.text();
      expect(rawText).not.toContain('secret_db_pwd');
      expect(JSON.parse(rawText)).toEqual({
        error: 'Ocorreu um erro interno ao processar a solicitação.',
        code: 'INTERNAL_SERVER_ERROR',
      });
    });
  });
});
