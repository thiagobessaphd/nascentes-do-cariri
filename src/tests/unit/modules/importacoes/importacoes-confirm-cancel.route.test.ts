/**
 * Nascentes do Cariri — Testes Unitários de QA: Route Handlers de Confirmação e Cancelamento
 *
 * Módulos:
 * - src/app/api/admin/importacoes/[id]/confirmar/route.ts
 * - src/app/api/admin/importacoes/[id]/route.ts
 *
 * Cobertura:
 * - Métodos HTTP não permitidos (405 Method Not Allowed + Allow + Cache-Control: no-store);
 * - Guarda administrativa HMAC-SHA256 e bloqueio de usuários sem sessão (401) ou inativos (403);
 * - Validação estrita do parâmetro dinâmico [id] via parseImportacaoRouteId real (400 INVALID_IMPORTACAO_INPUT);
 * - Contratos 200 OK via Cookie HttpOnly e Authorization Bearer com cabeçalhos anti-cache;
 * - Omissão de privacidade (ausência de caminhoPrivadoArquivo e storageUrl nas respostas JSON);
 * - Propagação fiel de 403 Ownership, 404 Not Found, 409 Conflict e 422 Integridade;
 * - Mascaramento de falhas internas inesperadas em 500 INTERNAL_SERVER_ERROR.
 */

import 'dotenv/config';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAMES } from '@/config/session-cookies';
import { prisma } from '@/lib/db/prisma';
import { AppError, type PublicErrorResponse } from '@/lib/errors';
import {
  createAdminSessionToken,
  hashSessionId,
} from '@/lib/security/admin-guard';
import {
  CANCELLED_IMPORTACAO_DEFAULT_MESSAGE,
  IMPORTACAO_COMMIT_ERROR_CODES,
  StatusImportacao,
  importacaoCommitService,
  type ImportacaoCancelResponseDto,
  type ImportacaoConfirmResponseDto,
  type ImportacaoRouteContext,
} from '@/modules/importacoes';
import {
  DELETE as CONFIRM_ROUTE_DELETE,
  GET as CONFIRM_ROUTE_GET,
  PATCH as CONFIRM_ROUTE_PATCH,
  POST as CONFIRM_POST,
  PUT as CONFIRM_ROUTE_PUT,
} from '@/app/api/admin/importacoes/[id]/confirmar/route';
import {
  DELETE as CANCEL_DELETE,
  PATCH as ITEM_ROUTE_PATCH,
  POST as ITEM_ROUTE_POST,
  PUT as ITEM_ROUTE_PUT,
} from '@/app/api/admin/importacoes/[id]/route';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    sessao: {
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
    importacaoCommitService: {
      confirmImportacao: vi.fn(),
      cancelImportacao: vi.fn(),
    },
  };
});

function createRouteContext(id: string): ImportacaoRouteContext {
  return {
    params: Promise.resolve({ id }),
  };
}

describe('QA Unitário — Rotas POST /confirmar e DELETE /importacoes/[id]', () => {
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

  const MOCK_CONFIRM_DTO: ImportacaoConfirmResponseDto = {
    importacaoId: 42,
    nomeArquivo: 'nascentes-cariri-valido.txt',
    hashSha256: 'a'.repeat(64),
    status: StatusImportacao.CONCLUIDA,
    summary: {
      totalLinhas: 5,
      totalInseridas: 4,
      totalDuplicadas: 1,
      totalInvalidas: 0,
    },
    cacheInvalidated: true,
    concluidaAt: '2026-11-15T18:00:00.000Z',
  };

  const MOCK_CANCEL_DTO: ImportacaoCancelResponseDto = {
    importacaoId: 88,
    nomeArquivo: 'nascentes-cariri-pendente.txt',
    hashSha256: 'b'.repeat(64),
    status: StatusImportacao.CANCELADA,
    mensagemErro: CANCELLED_IMPORTACAO_DEFAULT_MESSAGE,
    concluidaAt: '2026-11-15T18:05:00.000Z',
  };

  const ACTIVE_SESSION_SID = '11111111-1111-4111-8111-111111111111';
  const INACTIVE_SESSION_SID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();

    const activeTokenHash = hashSessionId(ACTIVE_SESSION_SID);
    const inactiveTokenHash = hashSessionId(INACTIVE_SESSION_SID);
    const futureExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    vi.mocked(prisma.sessao.findUnique).mockImplementation(
      (async (args: { where?: { tokenHash?: string } }) => {
        const tokenHash = args?.where?.tokenHash;
        if (tokenHash === activeTokenHash) {
          return {
            id: 501,
            usuarioId: ACTIVE_ADMIN.id,
            expiresAt: futureExpiresAt,
            revokedAt: null,
            usuario: { ...ACTIVE_ADMIN },
          };
        }
        if (tokenHash === inactiveTokenHash) {
          return {
            id: 502,
            usuarioId: INACTIVE_ADMIN.id,
            expiresAt: futureExpiresAt,
            revokedAt: null,
            usuario: { ...INACTIVE_ADMIN },
          };
        }
        return null;
      }) as never
    );

    vi.mocked(importacaoCommitService.confirmImportacao).mockResolvedValue(MOCK_CONFIRM_DTO);
    vi.mocked(importacaoCommitService.cancelImportacao).mockResolvedValue(MOCK_CANCEL_DTO);
  });

  // 1. POST /api/admin/importacoes/[id]/confirmar
  describe('POST /api/admin/importacoes/[id]/confirmar', () => {
    it('deve responder 405 Method Not Allowed com Allow: POST para GET, PUT, DELETE e PATCH', async () => {
      const responses = await Promise.all([
        CONFIRM_ROUTE_GET(),
        CONFIRM_ROUTE_PUT(),
        CONFIRM_ROUTE_DELETE(),
        CONFIRM_ROUTE_PATCH(),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('POST');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const body = (await response.json()) as PublicErrorResponse;
        expect(body.code).toBe('METHOD_NOT_ALLOWED');
      }
    });

    it('deve retornar 401 UNAUTHORIZED sem sessão administrativa e não invocar confirmImportacao', async () => {
      const req = new NextRequest('http://localhost/api/admin/importacoes/42/confirmar', {
        method: 'POST',
      });

      const response = await CONFIRM_POST(req, createRouteContext('42'));
      expect(response.status).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      const body = (await response.json()) as PublicErrorResponse;
      expect(body.code).toBe('UNAUTHORIZED');
      expect(importacaoCommitService.confirmImportacao).not.toHaveBeenCalled();
    });

    it('deve retornar 401 UNAUTHORIZED para token adulterado ou expirado', async () => {
      const expiredToken = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
        expiresInSeconds: -60,
      });

      const reqExpired = new NextRequest('http://localhost/api/admin/importacoes/42/confirmar', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${expiredToken}`,
        },
      });

      const resExpired = await CONFIRM_POST(reqExpired, createRouteContext('42'));
      expect(resExpired.status).toBe(401);

      const reqForged = new NextRequest('http://localhost/api/admin/importacoes/42/confirmar', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token.forjado.invalido',
        },
      });

      const resForged = await CONFIRM_POST(reqForged, createRouteContext('42'));
      expect(resForged.status).toBe(401);

      const unpersistedToken = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });
      const reqUnpersisted = new NextRequest(
        'http://localhost/api/admin/importacoes/42/confirmar',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${unpersistedToken}`,
          },
        }
      );
      const resUnpersisted = await CONFIRM_POST(reqUnpersisted, createRouteContext('42'));
      expect(resUnpersisted.status).toBe(401);
      expect(importacaoCommitService.confirmImportacao).not.toHaveBeenCalled();
    });

    it('deve retornar 403 FORBIDDEN_INACTIVE_USER quando administrador estiver inativo', async () => {
      const inactiveToken = createAdminSessionToken({
        sid: INACTIVE_SESSION_SID,
        userId: INACTIVE_ADMIN.id,
        email: INACTIVE_ADMIN.email,
      });

      const req = new NextRequest('http://localhost/api/admin/importacoes/42/confirmar', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${inactiveToken}`,
        },
      });

      const response = await CONFIRM_POST(req, createRouteContext('42'));
      expect(response.status).toBe(403);
      const body = (await response.json()) as PublicErrorResponse;
      expect(body.code).toBe('FORBIDDEN_INACTIVE_USER');
      expect(importacaoCommitService.confirmImportacao).not.toHaveBeenCalled();
    });

    it.each(['0', '-5', 'abc', '1.5', '9007199254740993'])(
      'deve rejeitar parâmetro de rota inválido (%s) com 400 INVALID_IMPORTACAO_INPUT sem chamar serviço',
      async (invalidId) => {
        const token = createAdminSessionToken({
          sid: ACTIVE_SESSION_SID,
          userId: ACTIVE_ADMIN.id,
          email: ACTIVE_ADMIN.email,
        });

        const req = new NextRequest(`http://localhost/api/admin/importacoes/${invalidId}/confirmar`, {
          method: 'POST',
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
          },
        });

        const response = await CONFIRM_POST(req, createRouteContext(invalidId));
        expect(response.status).toBe(400);
        const body = (await response.json()) as PublicErrorResponse;
        expect(body.code).toBe(IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT);
        expect(importacaoCommitService.confirmImportacao).not.toHaveBeenCalled();
      }
    );

    it('deve confirmar com sucesso (200 OK) via cookie de sessão, aplicando cabeçalhos anti-cache e omitindo paths privados', async () => {
      const token = createAdminSessionToken({
        sid: ACTIVE_SESSION_SID,
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      const req = new NextRequest('http://localhost/api/admin/importacoes/42/confirmar', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
        },
      });

      const response = await CONFIRM_POST(req, createRouteContext('42'));
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe(
        'no-store, no-cache, must-revalidate, private'
      );
      expect(response.headers.get('Pragma')).toBe('no-cache');

      expect(importacaoCommitService.confirmImportacao).toHaveBeenCalledWith({
        importacaoId: 42,
        usuarioId: ACTIVE_ADMIN.id,
      });

      const body = (await response.json()) as ImportacaoConfirmResponseDto & Record<string, unknown>;
      expect(body).toEqual(MOCK_CONFIRM_DTO);
      expect('caminhoPrivadoArquivo' in body).toBe(false);
      expect('storageUrl' in body).toBe(false);
    });

    it('deve aceitar autenticação via Authorization Bearer e propagar importacaoId numérico', async () => {
      const token = createAdminSessionToken({
        sid: ACTIVE_SESSION_SID,
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      const req = new NextRequest('http://localhost/api/admin/importacoes/77/confirmar', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const response = await CONFIRM_POST(req, createRouteContext('77'));
      expect(response.status).toBe(200);
      expect(importacaoCommitService.confirmImportacao).toHaveBeenCalledWith({
        importacaoId: 77,
        usuarioId: ACTIVE_ADMIN.id,
      });
    });

    it.each([
      {
        status: 403,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_OWNERSHIP_FORBIDDEN,
        message: 'Acesso negado: a importação 42 pertence a outro administrador.',
      },
      {
        status: 404,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_NOT_FOUND,
        message: 'Importação com ID 42 não foi encontrada.',
      },
      {
        status: 409,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED,
        message: 'A importação 42 já foi processada.',
      },
      {
        status: 409,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_STATE,
        message: 'A importação 42 possui inconsistências e não pode ser confirmada.',
      },
      {
        status: 422,
        code: IMPORTACAO_COMMIT_ERROR_CODES.FILE_INTEGRITY_ERROR,
        message: 'Falha de integridade SHA-256.',
      },
    ])(
      'deve propagar erro de domínio HTTP $status ($code) do ImportacaoCommitService',
      async ({ status, code, message }) => {
        const token = createAdminSessionToken({
          sid: ACTIVE_SESSION_SID,
          userId: ACTIVE_ADMIN.id,
          email: ACTIVE_ADMIN.email,
        });

        vi.mocked(importacaoCommitService.confirmImportacao).mockRejectedValueOnce(
          new AppError(message, status, code)
        );

        const req = new NextRequest('http://localhost/api/admin/importacoes/42/confirmar', {
          method: 'POST',
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
          },
        });

        const response = await CONFIRM_POST(req, createRouteContext('42'));
        expect(response.status).toBe(status);
        const body = (await response.json()) as PublicErrorResponse;
        expect(body.code).toBe(code);
        expect(body.error).toBe(message);
      }
    );

    it('deve mascarar exceções internas inesperadas em 500 INTERNAL_SERVER_ERROR sem vazar segredos', async () => {
      const token = createAdminSessionToken({
        sid: ACTIVE_SESSION_SID,
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      vi.mocked(importacaoCommitService.confirmImportacao).mockRejectedValueOnce(
        new Error('ER_ACCESS_DENIED: mysql://root:supersecret@127.0.0.1:3307/db')
      );

      const req = new NextRequest('http://localhost/api/admin/importacoes/42/confirmar', {
        method: 'POST',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
        },
      });

      const response = await CONFIRM_POST(req, createRouteContext('42'));
      expect(response.status).toBe(500);
      const rawText = await response.text();
      expect(rawText).not.toContain('supersecret');
      expect(rawText).not.toContain('ER_ACCESS_DENIED');

      const body = JSON.parse(rawText) as PublicErrorResponse;
      expect(body).toEqual({
        error: 'Ocorreu um erro interno ao processar a solicitação.',
        code: 'INTERNAL_SERVER_ERROR',
      });
    });
  });

  // 2. DELETE /api/admin/importacoes/[id]
  describe('DELETE /api/admin/importacoes/[id]', () => {
    it('deve responder 405 Method Not Allowed com Allow: GET, DELETE para POST, PUT e PATCH', async () => {
      const responses = await Promise.all([
        ITEM_ROUTE_POST(),
        ITEM_ROUTE_PUT(),
        ITEM_ROUTE_PATCH(),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET, DELETE');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const body = (await response.json()) as PublicErrorResponse;
        expect(body.code).toBe('METHOD_NOT_ALLOWED');
      }
    });

    it('deve retornar 401 UNAUTHORIZED sem sessão administrativa e não invocar cancelImportacao', async () => {
      const req = new NextRequest('http://localhost/api/admin/importacoes/88', {
        method: 'DELETE',
      });

      const response = await CANCEL_DELETE(req, createRouteContext('88'));
      expect(response.status).toBe(401);
      const body = (await response.json()) as PublicErrorResponse;
      expect(body.code).toBe('UNAUTHORIZED');
      expect(importacaoCommitService.cancelImportacao).not.toHaveBeenCalled();
    });

    it('deve retornar 403 FORBIDDEN_INACTIVE_USER para administrador inativo', async () => {
      const inactiveToken = createAdminSessionToken({
        sid: INACTIVE_SESSION_SID,
        userId: INACTIVE_ADMIN.id,
        email: INACTIVE_ADMIN.email,
      });

      const req = new NextRequest('http://localhost/api/admin/importacoes/88', {
        method: 'DELETE',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${inactiveToken}`,
        },
      });

      const response = await CANCEL_DELETE(req, createRouteContext('88'));
      expect(response.status).toBe(403);
      const body = (await response.json()) as PublicErrorResponse;
      expect(body.code).toBe('FORBIDDEN_INACTIVE_USER');
      expect(importacaoCommitService.cancelImportacao).not.toHaveBeenCalled();
    });

    it.each(['0', '-1', 'abc'])(
      'deve rejeitar parâmetro de rota inválido (%s) com 400 INVALID_IMPORTACAO_INPUT sem chamar serviço',
      async (invalidId) => {
        const token = createAdminSessionToken({
          sid: ACTIVE_SESSION_SID,
          userId: ACTIVE_ADMIN.id,
          email: ACTIVE_ADMIN.email,
        });

        const req = new NextRequest(`http://localhost/api/admin/importacoes/${invalidId}`, {
          method: 'DELETE',
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
          },
        });

        const response = await CANCEL_DELETE(req, createRouteContext(invalidId));
        expect(response.status).toBe(400);
        const body = (await response.json()) as PublicErrorResponse;
        expect(body.code).toBe(IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_INPUT);
        expect(importacaoCommitService.cancelImportacao).not.toHaveBeenCalled();
      }
    );

    it('deve cancelar com sucesso (200 OK) via cookie de sessão, aplicando cabeçalhos anti-cache e omitindo paths privados', async () => {
      const token = createAdminSessionToken({
        sid: ACTIVE_SESSION_SID,
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      const req = new NextRequest('http://localhost/api/admin/importacoes/88', {
        method: 'DELETE',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
        },
      });

      const response = await CANCEL_DELETE(req, createRouteContext('88'));
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe(
        'no-store, no-cache, must-revalidate, private'
      );
      expect(response.headers.get('Pragma')).toBe('no-cache');

      expect(importacaoCommitService.cancelImportacao).toHaveBeenCalledWith({
        importacaoId: 88,
        usuarioId: ACTIVE_ADMIN.id,
      });

      const body = (await response.json()) as ImportacaoCancelResponseDto & Record<string, unknown>;
      expect(body).toEqual(MOCK_CANCEL_DTO);
      expect('caminhoPrivadoArquivo' in body).toBe(false);
      expect('storageUrl' in body).toBe(false);
    });

    it('deve aceitar autenticação via Authorization Bearer no DELETE /api/admin/importacoes/[id]', async () => {
      const token = createAdminSessionToken({
        sid: ACTIVE_SESSION_SID,
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      const req = new NextRequest('http://localhost/api/admin/importacoes/95', {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const response = await CANCEL_DELETE(req, createRouteContext('95'));
      expect(response.status).toBe(200);
      expect(importacaoCommitService.cancelImportacao).toHaveBeenCalledWith({
        importacaoId: 95,
        usuarioId: ACTIVE_ADMIN.id,
      });
    });

    it.each([
      {
        status: 403,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_OWNERSHIP_FORBIDDEN,
        message: 'Acesso negado: a importação 88 pertence a outro administrador.',
      },
      {
        status: 404,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_NOT_FOUND,
        message: 'Importação com ID 88 não foi encontrada.',
      },
      {
        status: 409,
        code: IMPORTACAO_COMMIT_ERROR_CODES.IMPORTACAO_ALREADY_PROCESSED,
        message: 'A importação 88 já está cancelada.',
      },
      {
        status: 409,
        code: IMPORTACAO_COMMIT_ERROR_CODES.INVALID_IMPORTACAO_STATE,
        message: 'A importação 88 não está pendente de confirmação.',
      },
    ])(
      'deve propagar erro de domínio HTTP $status ($code) no cancelamento',
      async ({ status, code, message }) => {
        const token = createAdminSessionToken({
          sid: ACTIVE_SESSION_SID,
          userId: ACTIVE_ADMIN.id,
          email: ACTIVE_ADMIN.email,
        });

        vi.mocked(importacaoCommitService.cancelImportacao).mockRejectedValueOnce(
          new AppError(message, status, code)
        );

        const req = new NextRequest('http://localhost/api/admin/importacoes/88', {
          method: 'DELETE',
          headers: {
            cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
          },
        });

        const response = await CANCEL_DELETE(req, createRouteContext('88'));
        expect(response.status).toBe(status);
        const body = (await response.json()) as PublicErrorResponse;
        expect(body.code).toBe(code);
        expect(body.error).toBe(message);
      }
    );

    it('deve mascarar exceção inesperada no DELETE em 500 INTERNAL_SERVER_ERROR', async () => {
      const token = createAdminSessionToken({
        sid: ACTIVE_SESSION_SID,
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      vi.mocked(importacaoCommitService.cancelImportacao).mockRejectedValueOnce(
        new Error('Connection lost to mysql://admin:password@localhost:3307')
      );

      const req = new NextRequest('http://localhost/api/admin/importacoes/88', {
        method: 'DELETE',
        headers: {
          cookie: `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${token}`,
        },
      });

      const response = await CANCEL_DELETE(req, createRouteContext('88'));
      expect(response.status).toBe(500);
      const rawText = await response.text();
      expect(rawText).not.toContain('password');

      const body = JSON.parse(rawText) as PublicErrorResponse;
      expect(body).toEqual({
        error: 'Ocorreu um erro interno ao processar a solicitação.',
        code: 'INTERNAL_SERVER_ERROR',
      });
    });
  });
});
