/**
 * Suíte de Testes Unitários de QA: Guarda Admin, Serviço Orquestrador e Rota de Validação (CT-BE-02)
 *
 * Módulos:
 * - src/lib/security/admin-guard.ts
 * - src/modules/importacoes/importacoes-validation.service.ts
 * - src/app/api/admin/importacoes/validar/route.ts
 *
 * Cobertura:
 * - CT-BE-02: Bloqueio de acesso não autenticado (401) e administrador inativo (403);
 * - Validação criptográfica HMAC-SHA256 de tokens de sessão e extração de Cookie / Bearer;
 * - Métodos HTTP não permitidos (405 Method Not Allowed para GET, PUT, DELETE, PATCH);
 * - Validação de Content-Type (400 INVALID_CONTENT_TYPE) e FormData malformado (400 MALFORMED_FORM_DATA);
 * - Rejeição fail-fast de uploads preliminares inválidos sem gravar no storage ou banco;
 * - Fluxo 200 OK com arquivo 100% válido (status AGUARDANDO_CONFIRMACAO, canConfirm=true);
 * - Fluxo 200 OK com inconsistências de negócio (status FALHOU, canConfirm=false, preservação no storage para auditoria);
 * - Detecção de duplicidades internas e cruzadas com o banco MySQL;
 * - Proteção de privacidade: omissão estrita de caminhoPrivadoArquivo e storageUrl na resposta da API.
 */

import 'dotenv/config';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  createAdminSessionToken,
  extractAuthTokenFromRequest,
  requireAdminSession,
  verifyAdminSessionToken,
} from '@/lib/security/admin-guard';
import { SESSION_COOKIE_NAMES } from '@/config/session-cookies';
import type { PublicErrorResponse } from '@/lib/errors';
import { MemoryStorageDriver } from '@/lib/storage/drivers/memory-storage.driver';
import { ImportacaoStorageService } from '@/modules/importacoes/importacoes-storage.service';
import { ImportacaoValidationService } from '@/modules/importacoes/importacoes-validation.service';
import {
  DUPLICATE_REASONS,
  EXPECTED_TXT_HEADER_STRING,
  IMPORT_ERROR_CODES,
  StatusImportacao,
  type ImportacaoValidationResponseDto,
} from '@/modules/importacoes/importacoes.types';
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from '@/app/api/admin/importacoes/validar/route';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
    },
    importacao: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    nascente: {
      findMany: vi.fn(),
    },
  },
}));

describe('QA Unitário — Guarda Admin, Orquestrador e Rota POST /api/admin/importacoes/validar (CT-BE-02)', () => {
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

  const VALID_ROW_CRATO =
    '-7.228900;-39.414400;Crato;Fonte da Batateira;Sítio Fundão;2024-05-10;0.450';
  const VALID_ROW_BARBALHA =
    '-7.311200;-39.301500;Barbalha;Fonte do Caldas;Estância Hidromineral;2023-11-20;1.250';
  const INVALID_ROW_OUTSIDE_CARIRI =
    '-3.717220;-38.543060;Fortaleza;Fonte Litoral;Beira Mar;2024-01-15;-0.500';

  const VALID_TXT_TWO_ROWS = [
    EXPECTED_TXT_HEADER_STRING,
    VALID_ROW_CRATO,
    VALID_ROW_BARBALHA,
  ].join('\n');

  const INVALID_TXT_CONTENT = [
    EXPECTED_TXT_HEADER_STRING,
    VALID_ROW_CRATO,
    INVALID_ROW_OUTSIDE_CARIRI,
  ].join('\n');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildMultipartRequest(options?: {
    readonly files?: ReadonlyArray<{
      readonly fieldName?: string;
      readonly filename: string;
      readonly content: string | Uint8Array;
      readonly type?: string;
    }>;
    readonly textFields?: Readonly<Record<string, string>>;
    readonly sessionToken?: string | null;
    readonly authorizationHeader?: string;
  }): NextRequest {
    const formData = new FormData();

    if (options?.textFields) {
      for (const [key, val] of Object.entries(options.textFields)) {
        formData.append(key, val);
      }
    }

    if (options?.files) {
      for (const f of options.files) {
        const blobPart =
          typeof f.content === 'string' ? f.content : Buffer.from(f.content);
        const file = new File([blobPart], f.filename, {
          type: f.type ?? 'text/plain',
        });
        formData.append(f.fieldName ?? 'file', file);
      }
    }

    const headers = new Headers();
    if (options?.sessionToken) {
      headers.set(
        'cookie',
        `${SESSION_COOKIE_NAMES.DEVELOPMENT}=${encodeURIComponent(options.sessionToken)}`
      );
    }
    if (options?.authorizationHeader) {
      headers.set('authorization', options.authorizationHeader);
    }

    return new NextRequest('http://localhost:3000/api/admin/importacoes/validar', {
      method: 'POST',
      headers,
      body: formData,
    });
  }

  describe('1. Guarda de Sessão Administrativa (admin-guard.ts)', () => {
    it('deve emitir e verificar com sucesso um token HMAC-SHA256 válido', () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
        role: 'ADMIN',
        expiresInSeconds: 3600,
      });

      const payload = verifyAdminSessionToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(ACTIVE_ADMIN.id);
      expect(payload?.email).toBe(ACTIVE_ADMIN.email);
      expect(payload?.role).toBe('ADMIN');
      expect(payload?.exp).toBeGreaterThan(payload?.iat ?? 0);
    });

    it('deve rejeitar token expirado, adulterado, malformado ou vazio', () => {
      const expiredToken = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
        expiresInSeconds: -10,
      });
      expect(verifyAdminSessionToken(expiredToken)).toBeNull();

      const validToken = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });
      const tamperedToken = `${validToken.slice(0, -4)}xxxx`;
      expect(verifyAdminSessionToken(tamperedToken)).toBeNull();

      expect(verifyAdminSessionToken('')).toBeNull();
      expect(verifyAdminSessionToken('   ')).toBeNull();
      expect(verifyAdminSessionToken('apenas.duas')).toBeNull();
    });

    it('deve extrair o token tanto de Cookie (__Host- e dev) quanto de Authorization Bearer', () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      const prodHeaders = new Headers({
        cookie: `${SESSION_COOKIE_NAMES.PRODUCTION}=${token}`,
      });
      expect(extractAuthTokenFromRequest(prodHeaders)).toBe(token);

      const bearerHeaders = new Headers({
        authorization: `Bearer ${token}`,
      });
      expect(extractAuthTokenFromRequest(bearerHeaders)).toBe(token);

      expect(extractAuthTokenFromRequest(null)).toBeNull();
      expect(extractAuthTokenFromRequest(new Headers())).toBeNull();
    });

    it('requireAdminSession deve bloquear falta de token (401), usuário inexistente (401) e conta inativa (403)', async () => {
      // Sem token -> 401
      await expect(requireAdminSession(new Headers())).rejects.toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
      });

      const token = createAdminSessionToken({
        userId: 999,
        email: 'fantasma@ufca.edu.br',
      });

      // Usuário não encontrado no banco -> 401 USER_NOT_FOUND
      vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(null);
      await expect(
        requireAdminSession(new Headers({ authorization: `Bearer ${token}` }))
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'USER_NOT_FOUND',
      });

      // Usuário inativo -> 403 FORBIDDEN_INACTIVE_USER
      const inactiveToken = createAdminSessionToken({
        userId: INACTIVE_ADMIN.id,
        email: INACTIVE_ADMIN.email,
      });
      vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(
        INACTIVE_ADMIN as unknown as Awaited<ReturnType<typeof prisma.usuario.findUnique>>
      );
      await expect(
        requireAdminSession(
          new Headers({ authorization: `Bearer ${inactiveToken}` })
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN_INACTIVE_USER',
      });
    });
  });

  describe('2. Serviço Orquestrador (ImportacaoValidationService)', () => {
    it('não deve gravar no storage nem no banco quando a validação preliminar fail-fast falhar', async () => {
      const memoryDriver = new MemoryStorageDriver();
      const mockPrismaClient = {
        importacao: {
          create: vi.fn(),
          update: vi.fn(),
        },
        nascente: {
          findMany: vi.fn(),
        },
      } as unknown as PrismaClient;

      const storageService = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrismaClient,
      });
      const validationService = new ImportacaoValidationService({
        prismaClient: mockPrismaClient,
        storageService,
      });

      await expect(
        validationService.validateAndPreview({
          usuarioId: ACTIVE_ADMIN.id,
          files: [
            {
              filename: 'invalido.csv',
              sizeBytes: 20,
              mimeType: 'text/csv',
              content: Buffer.from('col1;col2\n1;2', 'utf-8'),
            },
          ],
        })
      ).rejects.toThrowError();

      expect(memoryDriver.size()).toBe(0);
      expect(mockPrismaClient.importacao.create).not.toHaveBeenCalled();
    });

    it('deve preservar o arquivo original no storage e marcar status FALHOU quando houver erros nas linhas do TXT', async () => {
      const memoryDriver = new MemoryStorageDriver();
      const createdAt = new Date('2026-11-05T12:00:00.000Z');
      let capturedPathname = '';

      const mockPrismaClient = {
        importacao: {
          create: vi.fn().mockImplementation(async ({ data }: { data: { caminhoPrivadoArquivo: string; nomeArquivo: string; hashArquivo: string } }) => {
            capturedPathname = data.caminhoPrivadoArquivo;
            return {
              id: 501,
              usuarioId: ACTIVE_ADMIN.id,
              nomeArquivo: data.nomeArquivo,
              caminhoPrivadoArquivo: data.caminhoPrivadoArquivo,
              hashArquivo: data.hashArquivo,
              status: StatusImportacao.VALIDANDO,
              totalLinhas: 0,
              totalValidas: 0,
              totalInvalidas: 0,
              totalDuplicadas: 0,
              mensagemErro: null,
              createdAt,
              concluidaAt: null,
            };
          }),
          update: vi.fn().mockImplementation(async ({ data }: { data: { status: StatusImportacao; totalLinhas: number; totalValidas: number; totalInvalidas: number; totalDuplicadas: number; mensagemErro: string | null } }) => ({
            id: 501,
            usuarioId: ACTIVE_ADMIN.id,
            nomeArquivo: 'lote_com_erros.txt',
            caminhoPrivadoArquivo: capturedPathname,
            hashArquivo: 'a'.repeat(64),
            status: data.status,
            totalLinhas: data.totalLinhas,
            totalValidas: data.totalValidas,
            totalInvalidas: data.totalInvalidas,
            totalDuplicadas: data.totalDuplicadas,
            mensagemErro: data.mensagemErro,
            createdAt,
            concluidaAt: null,
          })),
        },
        nascente: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaClient;

      const storageService = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrismaClient,
      });
      const validationService = new ImportacaoValidationService({
        prismaClient: mockPrismaClient,
        storageService,
      });

      const buffer = Buffer.from(INVALID_TXT_CONTENT, 'utf-8');
      const result = await validationService.validateAndPreview({
        usuarioId: ACTIVE_ADMIN.id,
        files: [
          {
            filename: 'lote_com_erros.txt',
            sizeBytes: buffer.byteLength,
            mimeType: 'text/plain',
            content: buffer,
          },
        ],
      });

      expect(result.status).toBe(StatusImportacao.FALHOU);
      expect(result.canConfirm).toBe(false);
      expect(result.summary).toEqual({
        totalLinhas: 2,
        totalValidas: 1,
        totalInvalidas: 1,
        totalDuplicadas: 0,
      });
      expect(result.invalidRows).toHaveLength(1);
      expect(result.invalidRows[0]?.line).toBe(3);

      // Garante que o arquivo permanece preservado no storage para auditoria
      expect(memoryDriver.size()).toBe(1);
      expect(await memoryDriver.exists(capturedPathname)).toBe(true);

      // Garante que caminhoPrivadoArquivo e storageUrl foram omitidos do DTO
      expect(result).not.toHaveProperty('caminhoPrivadoArquivo');
      expect(result).not.toHaveProperty('storageUrl');
    });

    it('deve marcar importação como FALHOU no banco se ocorrer exceção inesperada após salvar no storage', async () => {
      const memoryDriver = new MemoryStorageDriver();
      const createdAt = new Date('2026-11-05T12:00:00.000Z');

      const mockPrismaClient = {
        importacao: {
          create: vi.fn().mockResolvedValue({
            id: 777,
            usuarioId: ACTIVE_ADMIN.id,
            nomeArquivo: 'falha_db.txt',
            caminhoPrivadoArquivo: 'importacoes/2026/11/falha.txt',
            hashArquivo: 'b'.repeat(64),
            status: StatusImportacao.VALIDANDO,
            createdAt,
          }),
          update: vi.fn().mockResolvedValue({ id: 777 }),
        },
        nascente: {
          findMany: vi
            .fn()
            .mockRejectedValue(new Error('Conexão perdida com o MySQL')),
        },
      } as unknown as PrismaClient;

      const storageService = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrismaClient,
      });
      const validationService = new ImportacaoValidationService({
        prismaClient: mockPrismaClient,
        storageService,
      });

      const buffer = Buffer.from(VALID_TXT_TWO_ROWS, 'utf-8');

      await expect(
        validationService.validateAndPreview({
          usuarioId: ACTIVE_ADMIN.id,
          files: [
            {
              filename: 'falha_db.txt',
              sizeBytes: buffer.byteLength,
              content: buffer,
            },
          ],
        })
      ).rejects.toThrow('Conexão perdida com o MySQL');

      expect(mockPrismaClient.importacao.update).toHaveBeenCalledWith({
        where: { id: 777 },
        data: {
          status: StatusImportacao.FALHOU,
          mensagemErro: 'Conexão perdida com o MySQL',
        },
      });
    });
  });

  describe('3. Route Handler: Métodos 405 e Proteção de Acesso (CT-BE-02)', () => {
    it.each([
      ['GET', GET],
      ['PUT', PUT],
      ['DELETE', DELETE],
      ['PATCH', PATCH],
    ])(
      'deve retornar 405 Method Not Allowed com cabeçalho Allow: POST para o método %s',
      async (_methodName, handler) => {
        const response = await handler();
        const body = (await response.json()) as PublicErrorResponse;

        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('POST');
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(body.code).toBe('METHOD_NOT_ALLOWED');
      }
    );

    it('CT-BE-02: deve retornar 401 UNAUTHORIZED quando a requisição não possuir sessão de administrador', async () => {
      const request = buildMultipartRequest({
        files: [{ filename: 'nascentes.txt', content: VALID_TXT_TWO_ROWS }],
        sessionToken: null,
      });

      const response = await POST(request);
      const body = (await response.json()) as PublicErrorResponse;

      expect(response.status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
      expect(prisma.importacao.create).not.toHaveBeenCalled();
    });

    it('CT-BE-02: deve retornar 403 FORBIDDEN_INACTIVE_USER quando o administrador estiver inativo no banco', async () => {
      const token = createAdminSessionToken({
        userId: INACTIVE_ADMIN.id,
        email: INACTIVE_ADMIN.email,
      });

      vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(
        INACTIVE_ADMIN as unknown as Awaited<ReturnType<typeof prisma.usuario.findUnique>>
      );

      const request = buildMultipartRequest({
        files: [{ filename: 'nascentes.txt', content: VALID_TXT_TWO_ROWS }],
        sessionToken: token,
      });

      const response = await POST(request);
      const body = (await response.json()) as PublicErrorResponse;

      expect(response.status).toBe(403);
      expect(body.code).toBe('FORBIDDEN_INACTIVE_USER');
      expect(prisma.importacao.create).not.toHaveBeenCalled();
    });
  });

  describe('4. Route Handler: Validações de Protocolo e Preliminares (400)', () => {
    function setupAuthenticatedAdmin(): string {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(
        ACTIVE_ADMIN as unknown as Awaited<ReturnType<typeof prisma.usuario.findUnique>>
      );
      return token;
    }

    it('deve retornar 400 INVALID_CONTENT_TYPE quando o Content-Type não for multipart/form-data', async () => {
      const token = setupAuthenticatedAdmin();

      const request = new NextRequest(
        'http://localhost:3000/api/admin/importacoes/validar',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ file: 'dados' }),
        }
      );

      const response = await POST(request);
      const body = (await response.json()) as PublicErrorResponse;

      expect(response.status).toBe(400);
      expect(body.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('deve retornar 400 MALFORMED_FORM_DATA quando o corpo multipart estiver corrompido', async () => {
      const token = setupAuthenticatedAdmin();

      const request = new NextRequest(
        'http://localhost:3000/api/admin/importacoes/validar',
        {
          method: 'POST',
          headers: {
            'content-type': 'multipart/form-data; boundary=---boundaryInvalido',
            authorization: `Bearer ${token}`,
          },
          body: 'corpo-multipart-corrompido-sem-boundary-fechado',
        }
      );

      const response = await POST(request);
      const body = (await response.json()) as PublicErrorResponse;

      expect(response.status).toBe(400);
      expect(body.code).toBe('MALFORMED_FORM_DATA');
    });

    it('deve retornar 400 NO_FILE_UPLOADED quando nenhum arquivo for enviado no FormData', async () => {
      const token = setupAuthenticatedAdmin();

      const request = buildMultipartRequest({
        textFields: { observacao: 'sem arquivo' },
        sessionToken: token,
      });

      const response = await POST(request);
      const body = (await response.json()) as PublicErrorResponse;

      expect(response.status).toBe(400);
      expect(body.code).toBe('NO_FILE_UPLOADED');
      expect(prisma.importacao.create).not.toHaveBeenCalled();
    });

    it('deve retornar 400 MULTIPLE_FILES_NOT_ALLOWED quando mais de um arquivo for enviado', async () => {
      const token = setupAuthenticatedAdmin();

      const request = buildMultipartRequest({
        files: [
          { filename: 'lote1.txt', content: VALID_TXT_TWO_ROWS },
          { filename: 'lote2.txt', content: VALID_TXT_TWO_ROWS },
        ],
        sessionToken: token,
      });

      const response = await POST(request);
      const body = (await response.json()) as PublicErrorResponse;

      expect(response.status).toBe(400);
      expect(body.code).toBe('MULTIPLE_FILES_NOT_ALLOWED');
      expect(prisma.importacao.create).not.toHaveBeenCalled();
    });

    it('CT-BE-03 / CT-BE-05: deve rejeitar com 400 arquivo .csv, arquivo de 0 bytes ou arquivo binário com byte nulo', async () => {
      const token = setupAuthenticatedAdmin();

      // 1. Extensão .csv
      const csvReq = buildMultipartRequest({
        files: [{ filename: 'planilha.csv', content: VALID_TXT_TWO_ROWS }],
        sessionToken: token,
      });
      const csvRes = await POST(csvReq);
      expect(csvRes.status).toBe(400);
      expect(((await csvRes.json()) as PublicErrorResponse).code).toBe(
        'INVALID_FILENAME'
      );

      // 2. Arquivo vazio (0 bytes)
      const emptyReq = buildMultipartRequest({
        files: [{ filename: 'vazio.txt', content: '' }],
        sessionToken: token,
      });
      const emptyRes = await POST(emptyReq);
      expect(emptyRes.status).toBe(400);
      expect(((await emptyRes.json()) as PublicErrorResponse).code).toBe(
        'EMPTY_FILE'
      );

      // 3. Arquivo binário com byte nulo
      const binReq = buildMultipartRequest({
        files: [
          {
            filename: 'binario.txt',
            content: new Uint8Array([0x61, 0x00, 0x62]),
          },
        ],
        sessionToken: token,
      });
      const binRes = await POST(binReq);
      expect(binRes.status).toBe(400);
      expect(((await binRes.json()) as PublicErrorResponse).code).toBe(
        'BINARY_FILE_NOT_ALLOWED'
      );

      expect(prisma.importacao.create).not.toHaveBeenCalled();
    });
  });
  
  describe('5. Route Handler: Processamento Completo, Deduplicação e Privacidade (200 OK)', () => {
    it('deve retornar 200 OK com status AGUARDANDO_CONFIRMACAO, canConfirm=true, headers anti-cache e sem caminhoPrivadoArquivo', async () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(
        ACTIVE_ADMIN as unknown as Awaited<ReturnType<typeof prisma.usuario.findUnique>>
      );

      const createdAt = new Date('2026-11-05T13:00:00.000Z');

      vi.mocked(prisma.importacao.create).mockImplementationOnce(
        (async ({ data }: { data: { nomeArquivo: string; caminhoPrivadoArquivo: string; hashArquivo: string } }) => ({
          id: 1001,
          usuarioId: ACTIVE_ADMIN.id,
          nomeArquivo: data.nomeArquivo,
          caminhoPrivadoArquivo: data.caminhoPrivadoArquivo,
          hashArquivo: data.hashArquivo,
          status: StatusImportacao.VALIDANDO,
          totalLinhas: 0,
          totalValidas: 0,
          totalInvalidas: 0,
          totalDuplicadas: 0,
          mensagemErro: null,
          createdAt,
          concluidaAt: null,
        })) as unknown as typeof prisma.importacao.create
      );

      vi.mocked(prisma.nascente.findMany).mockResolvedValueOnce([]);

      vi.mocked(prisma.importacao.update).mockImplementationOnce(
        (async ({ data }: { data: { status: StatusImportacao; totalLinhas: number; totalValidas: number; totalInvalidas: number; totalDuplicadas: number; mensagemErro: string | null } }) => ({
          id: 1001,
          usuarioId: ACTIVE_ADMIN.id,
          nomeArquivo: 'nascentes_validas.txt',
          caminhoPrivadoArquivo: 'importacoes/2026/11/privado.txt',
          hashArquivo: 'c'.repeat(64),
          status: data.status,
          totalLinhas: data.totalLinhas,
          totalValidas: data.totalValidas,
          totalInvalidas: data.totalInvalidas,
          totalDuplicadas: data.totalDuplicadas,
          mensagemErro: data.mensagemErro,
          createdAt,
          concluidaAt: null,
        })) as unknown as typeof prisma.importacao.update
      );

      const request = buildMultipartRequest({
        files: [
          {
            filename: 'nascentes_validas.txt',
            content: VALID_TXT_TWO_ROWS,
          },
        ],
        sessionToken: token,
      });

      const response = await POST(request);
      const body = (await response.json()) as ImportacaoValidationResponseDto;

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe(
        'no-store, no-cache, must-revalidate, private'
      );
      expect(response.headers.get('Pragma')).toBe('no-cache');

      expect(body.importacaoId).toBe(1001);
      expect(body.nomeArquivo).toBe('nascentes_validas.txt');
      expect(body.status).toBe(StatusImportacao.AGUARDANDO_CONFIRMACAO);
      expect(body.canConfirm).toBe(true);
      expect(body.summary).toEqual({
        totalLinhas: 2,
        totalValidas: 2,
        totalInvalidas: 0,
        totalDuplicadas: 0,
      });
      expect(body.validRows).toHaveLength(2);
      expect(body.invalidRows).toHaveLength(0);
      expect(body.duplicateRows).toHaveLength(0);
      expect(body.allErrors).toHaveLength(0);
      expect(body.createdAt).toBe(createdAt.toISOString());

      // Invariante de segurança: caminho privado jamais deve ser exposto na resposta
      expect(body).not.toHaveProperty('caminhoPrivadoArquivo');
      expect(body).not.toHaveProperty('storageUrl');
    });

    it('deve classificar duplicatas internas (DUPLICATE_INTERNAL) e contra o banco (DUPLICATE_DATABASE) corretamente', async () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(
        ACTIVE_ADMIN as unknown as Awaited<ReturnType<typeof prisma.usuario.findUnique>>
      );

      const createdAt = new Date('2026-11-05T13:10:00.000Z');

      vi.mocked(prisma.importacao.create).mockResolvedValueOnce({
        id: 1002,
        usuarioId: ACTIVE_ADMIN.id,
        nomeArquivo: 'com_duplicatas.txt',
        caminhoPrivadoArquivo: 'importacoes/2026/11/dup.txt',
        hashArquivo: 'd'.repeat(64),
        status: StatusImportacao.VALIDANDO,
        totalLinhas: 0,
        totalValidas: 0,
        totalInvalidas: 0,
        totalDuplicadas: 0,
        mensagemErro: null,
        createdAt,
        concluidaAt: null,
      });

      // Simula que a nascente de Barbalha já existe ativa no MySQL
      vi.mocked(prisma.nascente.findMany).mockResolvedValueOnce([
        {
          latitude: -7.3112,
          longitude: -39.3015,
          fonte: 'Fonte do Caldas',
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.nascente.findMany>>);

      vi.mocked(prisma.importacao.update).mockImplementationOnce(
        (async ({ data }: { data: { status: StatusImportacao; totalLinhas: number; totalValidas: number; totalInvalidas: number; totalDuplicadas: number; mensagemErro: string | null } }) => ({
          id: 1002,
          usuarioId: ACTIVE_ADMIN.id,
          nomeArquivo: 'com_duplicatas.txt',
          caminhoPrivadoArquivo: 'importacoes/2026/11/dup.txt',
          hashArquivo: 'd'.repeat(64),
          status: data.status,
          totalLinhas: data.totalLinhas,
          totalValidas: data.totalValidas,
          totalInvalidas: data.totalInvalidas,
          totalDuplicadas: data.totalDuplicadas,
          mensagemErro: data.mensagemErro,
          createdAt,
          concluidaAt: null,
        })) as unknown as typeof prisma.importacao.update
      );

      // TXT contém:
      // Linha 2: Crato (nova -> válida)
      // Linha 3: Crato repetida no próprio arquivo (duplicata interna)
      // Linha 4: Barbalha (já existente no banco -> duplicata de banco)
      const txtWithDuplicates = [
        EXPECTED_TXT_HEADER_STRING,
        VALID_ROW_CRATO,
        VALID_ROW_CRATO,
        VALID_ROW_BARBALHA,
      ].join('\n');

      const request = buildMultipartRequest({
        files: [{ filename: 'com_duplicatas.txt', content: txtWithDuplicates }],
        sessionToken: token,
      });

      const response = await POST(request);
      const body = (await response.json()) as ImportacaoValidationResponseDto;

      expect(response.status).toBe(200);
      expect(body.canConfirm).toBe(true);
      expect(body.status).toBe(StatusImportacao.AGUARDANDO_CONFIRMACAO);
      expect(body.summary).toEqual({
        totalLinhas: 3,
        totalValidas: 1,
        totalInvalidas: 0,
        totalDuplicadas: 2,
      });
      expect(body.duplicateRows).toHaveLength(2);
      expect(body.duplicateRows[0]?.reason).toBe(DUPLICATE_REASONS.INTERNAL);
      expect(body.duplicateRows[0]?.duplicateOfLine).toBe(2);
      expect(body.duplicateRows[1]?.reason).toBe(DUPLICATE_REASONS.DATABASE);
    });

    it('deve retornar 200 OK com status FALHOU e detalhamento de erros quando houver linhas inválidas no TXT', async () => {
      const token = createAdminSessionToken({
        userId: ACTIVE_ADMIN.id,
        email: ACTIVE_ADMIN.email,
      });

      vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce(
        ACTIVE_ADMIN as unknown as Awaited<ReturnType<typeof prisma.usuario.findUnique>>
      );

      const createdAt = new Date('2026-11-05T13:20:00.000Z');

      vi.mocked(prisma.importacao.create).mockResolvedValueOnce({
        id: 1003,
        usuarioId: ACTIVE_ADMIN.id,
        nomeArquivo: 'inconsistente.txt',
        caminhoPrivadoArquivo: 'importacoes/2026/11/inc.txt',
        hashArquivo: 'e'.repeat(64),
        status: StatusImportacao.VALIDANDO,
        totalLinhas: 0,
        totalValidas: 0,
        totalInvalidas: 0,
        totalDuplicadas: 0,
        mensagemErro: null,
        createdAt,
        concluidaAt: null,
      });

      vi.mocked(prisma.nascente.findMany).mockResolvedValueOnce([]);

      vi.mocked(prisma.importacao.update).mockImplementationOnce(
        (async ({ data }: { data: { status: StatusImportacao; totalLinhas: number; totalValidas: number; totalInvalidas: number; totalDuplicadas: number; mensagemErro: string | null } }) => ({
          id: 1003,
          usuarioId: ACTIVE_ADMIN.id,
          nomeArquivo: 'inconsistente.txt',
          caminhoPrivadoArquivo: 'importacoes/2026/11/inc.txt',
          hashArquivo: 'e'.repeat(64),
          status: data.status,
          totalLinhas: data.totalLinhas,
          totalValidas: data.totalValidas,
          totalInvalidas: data.totalInvalidas,
          totalDuplicadas: data.totalDuplicadas,
          mensagemErro: data.mensagemErro,
          createdAt,
          concluidaAt: null,
        })) as unknown as typeof prisma.importacao.update
      );

      const request = buildMultipartRequest({
        files: [{ filename: 'inconsistente.txt', content: INVALID_TXT_CONTENT }],
        sessionToken: token,
      });

      const response = await POST(request);
      const body = (await response.json()) as ImportacaoValidationResponseDto;

      expect(response.status).toBe(200);
      expect(body.status).toBe(StatusImportacao.FALHOU);
      expect(body.canConfirm).toBe(false);
      expect(body.summary).toEqual({
        totalLinhas: 2,
        totalValidas: 1,
        totalInvalidas: 1,
        totalDuplicadas: 0,
      });

      const errorCodes = body.allErrors.map((e) => e.code);
      expect(errorCodes).toContain(IMPORT_ERROR_CODES.OUT_OF_BOUNDS_CARIRI);
      expect(errorCodes).toContain(IMPORT_ERROR_CODES.NEGATIVE_FLOW);
    });
  });
});