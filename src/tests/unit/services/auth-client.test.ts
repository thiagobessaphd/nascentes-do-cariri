/**
 * Suíte de Testes Unitários: Cliente HTTP de Autenticação (src/services/auth.client.ts)
 */

import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_ERROR_CODES,
  DEFAULT_RATE_LIMIT_FALLBACK_SECONDS,
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  MAX_RETRY_AFTER_SECONDS,
  RATE_LIMITED_LOGIN_MESSAGE,
  type LoginResponseDto,
} from '@/modules/auth/auth.contracts';
import {
  AuthClientError,
  loginAdmin,
  parseRetryAfterSeconds,
  validateLoginInput,
} from '@/services/auth.client';

describe('Cliente HTTP de Autenticação (src/services/auth.client.ts)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  describe('1. Isolamento de Fronteira Client-Side', () => {
    it('NÃO deve importar módulos de servidor/Prisma nem acessar localStorage/sessionStorage', () => {
      const clientSourcePath = path.resolve(process.cwd(), 'src/services/auth.client.ts');
      const source = fs.readFileSync(clientSourcePath, 'utf-8');

      expect(source).not.toMatch(/from\s+['"]@\/modules\/auth['"]/);
      expect(source).not.toContain('@prisma/client');
      expect(source).not.toContain('@/lib/db/prisma');
      expect(source).not.toContain('next/headers');
      expect(source).not.toContain('localStorage');
      expect(source).not.toContain('sessionStorage');
    });
  });

  describe('2. parseRetryAfterSeconds()', () => {
    it('deve interpretar segundos inteiros positivos e aplicar teto máximo', () => {
      expect(parseRetryAfterSeconds('900')).toBe(900);
      expect(parseRetryAfterSeconds('  45  ')).toBe(45);
      expect(parseRetryAfterSeconds('99999999')).toBe(MAX_RETRY_AFTER_SECONDS);
    });

    it('deve rejeitar zero, negativos, strings vazias e formatos inválidos', () => {
      expect(parseRetryAfterSeconds(null)).toBeUndefined();
      expect(parseRetryAfterSeconds(undefined)).toBeUndefined();
      expect(parseRetryAfterSeconds('')).toBeUndefined();
      expect(parseRetryAfterSeconds('   ')).toBeUndefined();
      expect(parseRetryAfterSeconds('0')).toBeUndefined();
      expect(parseRetryAfterSeconds('-30')).toBeUndefined();
      expect(parseRetryAfterSeconds('invalid-date')).toBeUndefined();
    });

    it('deve calcular segundos restantes para HTTP-date futura e ignorar datas passadas', () => {
      const nowBaseMs = Date.UTC(2026, 10, 25, 12, 0, 0);
      const futureDate = new Date(nowBaseMs + 125_000).toUTCString();
      const pastDate = new Date(nowBaseMs - 5_000).toUTCString();

      expect(parseRetryAfterSeconds(futureDate, nowBaseMs)).toBe(125);
      // Subsegundos de nowMs até a HTTP-date arredondam para cima com Math.ceil
      expect(parseRetryAfterSeconds(futureDate, nowBaseMs - 400)).toBe(126);
      expect(parseRetryAfterSeconds(pastDate, nowBaseMs)).toBeUndefined();
    });
  });

  describe('3. validateLoginInput() e Fail-Fast em loginAdmin()', () => {
    it('deve normalizar e-mail (trim e lowercase) preservando espaços legítimos na senha', () => {
      const result = validateLoginInput({
        email: '  Admin.UFCA@ufca.edu.br  ',
        password: '  Senha Com Espaços 123  ',
      });

      expect(result).toEqual({
        success: true,
        data: {
          email: 'admin.ufca@ufca.edu.br',
          password: '  Senha Com Espaços 123  ',
        },
      });
    });

    it('deve falhar no cliente sem chamar fetch quando e-mail ou senha forem inválidos e nunca vazar senha', async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      const secretPassword = 'MinhaSenhaSuperSecreta!@#999';

      await expect(
        loginAdmin({ email: 'email-invalido', password: '' })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: AUTH_ERROR_CODES.VALIDATION_ERROR,
        fieldErrors: {
          email: 'Informe um e-mail válido.',
          password: 'Informe a senha.',
        },
      });

      let caughtError: unknown;
      try {
        await loginAdmin({
          email: 'invalido',
          password: secretPassword,
        });
      } catch (err: unknown) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(AuthClientError);
      const serializedError = JSON.stringify(caughtError);
      expect((caughtError as Error).message).not.toContain(secretPassword);
      expect(serializedError).not.toContain(secretPassword);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('4. Fluxo de Sucesso (200 OK) e Validação Estrita do Contrato', () => {
    it('deve enviar POST em /api/admin/auth/login com credentials same-origin, no-store e validar DTO', async () => {
      const expectedPayload: LoginResponseDto = {
        user: {
          id: 7,
          nome: 'Administrador Cariri',
          email: 'admin@ufca.edu.br',
        },
        session: {
          expiresAt: '2026-12-25T12:00:00.000Z',
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(expectedPayload),
      });
      globalThis.fetch = mockFetch;

      const result = await loginAdmin({
        email: '  ADMIN@UFCA.EDU.BR ',
        password: 'SenhaForte123!',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({
            email: 'admin@ufca.edu.br',
            password: 'SenhaForte123!',
          }),
        })
      );
      expect(result).toEqual(expectedPayload);
    });

    it('deve rejeitar resposta 200 com JSON inválido ou campos extras proibidos', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      });

      await expect(
        loginAdmin({ email: 'admin@ufca.edu.br', password: 'SenhaForte123!' })
      ).rejects.toMatchObject({
        statusCode: 200,
        code: 'INVALID_SERVER_RESPONSE',
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          user: {
            id: 7,
            nome: 'Admin',
            email: 'admin@ufca.edu.br',
            passwordHash: 'hash-vazado',
          },
          session: {
            expiresAt: '2026-12-25T12:00:00.000Z',
          },
        }),
      });

      await expect(
        loginAdmin({ email: 'admin@ufca.edu.br', password: 'SenhaForte123!' })
      ).rejects.toMatchObject({
        statusCode: 200,
        code: 'INVALID_SERVER_RESPONSE',
      });
    });
  });

  describe('5. Anti-enumeração (401/403) e Rate Limit (429 Retry-After)', () => {
    it('deve unificar 401 e 403 com GENERIC_INVALID_CREDENTIALS_MESSAGE sem distinguir causa', async () => {
      for (const status of [401, 403]) {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status,
          headers: new Headers(),
          json: vi.fn().mockResolvedValue({
            error: status === 401 ? 'Senha incorreta' : 'Usuário desativado',
            code: status === 401 ? 'INVALID_CREDENTIALS' : 'FORBIDDEN_INACTIVE_USER',
          }),
        });

        await expect(
          loginAdmin({ email: 'admin@ufca.edu.br', password: 'errada' })
        ).rejects.toMatchObject({
          statusCode: status,
          code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
          message: GENERIC_INVALID_CREDENTIALS_MESSAGE,
        });
      }
    });

    it('deve extrair Retry-After em resposta 429 e aplicar fallback seguro quando ausente', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '420' }),
        json: vi.fn().mockResolvedValue({
          error: RATE_LIMITED_LOGIN_MESSAGE,
          code: AUTH_ERROR_CODES.RATE_LIMITED,
        }),
      });

      await expect(
        loginAdmin({ email: 'admin@ufca.edu.br', password: 'SenhaForte123!' })
      ).rejects.toMatchObject({
        statusCode: 429,
        code: AUTH_ERROR_CODES.RATE_LIMITED,
        message: RATE_LIMITED_LOGIN_MESSAGE,
        retryAfterSeconds: 420,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({
          error: RATE_LIMITED_LOGIN_MESSAGE,
          code: AUTH_ERROR_CODES.RATE_LIMITED,
        }),
      });

      await expect(
        loginAdmin({ email: 'admin@ufca.edu.br', password: 'SenhaForte123!' })
      ).rejects.toMatchObject({
        statusCode: 429,
        code: AUTH_ERROR_CODES.RATE_LIMITED,
        retryAfterSeconds: DEFAULT_RATE_LIMIT_FALLBACK_SECONDS,
      });
    });
  });

  describe('6. Erros 400, Mascaramento 5xx, Rede, AbortError e Timeout', () => {
    it('deve mapear details de validação em resposta 400 sem vazar credenciais', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({
          error: 'Os dados fornecidos são inválidos.',
          code: AUTH_ERROR_CODES.VALIDATION_ERROR,
          details: [
            { campo: 'email', mensagem: 'Informe um e-mail válido.' },
            { campo: 'password', mensagem: 'A senha deve conter no máximo 128 caracteres.' },
          ],
        }),
      });

      await expect(
        loginAdmin({ email: 'admin@ufca.edu.br', password: 'SenhaForte123!' })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: AUTH_ERROR_CODES.VALIDATION_ERROR,
        fieldErrors: {
          email: 'Informe um e-mail válido.',
          password: 'A senha deve conter no máximo 128 caracteres.',
        },
      });
    });

    it('deve mascarar mensagens internas em falhas 5xx (JSON ou HTML)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({
          error: 'SELECT * FROM sessoes failed: ECONNREFUSED 127.0.0.1:3306',
          code: 'DATABASE_ERROR',
        }),
      });

      await expect(
        loginAdmin({ email: 'admin@ufca.edu.br', password: 'SenhaForte123!' })
      ).rejects.toMatchObject({
        statusCode: 500,
        code: 'DATABASE_ERROR',
        message: 'Erro interno ao processar autenticação. Tente novamente em instantes.',
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: new Headers(),
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
      });

      await expect(
        loginAdmin({ email: 'admin@ufca.edu.br', password: 'SenhaForte123!' })
      ).rejects.toMatchObject({
        statusCode: 502,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro interno ao processar autenticação. Tente novamente em instantes.',
      });
    });

    it('deve lançar AuthClientError com isNetworkError=true em falha de transporte', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(
        loginAdmin({ email: 'admin@ufca.edu.br', password: 'SenhaForte123!' })
      ).rejects.toMatchObject({
        isNetworkError: true,
        isTimeout: false,
      });
    });

    it('deve propagar AbortError diretamente quando abortado por signal externo', async () => {
      const externalController = new AbortController();
      const abortError = new Error('The operation was aborted.');
      abortError.name = 'AbortError';

      globalThis.fetch = vi.fn().mockImplementation((_url, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(abortError);
          });
        });
      });

      const promise = loginAdmin(
        { email: 'admin@ufca.edu.br', password: 'SenhaForte123!' },
        { signal: externalController.signal, timeoutMs: 0 }
      );
      externalController.abort(abortError);

      await expect(promise).rejects.toBe(abortError);

      const preAbortedController = new AbortController();
      preAbortedController.abort(abortError);
      await expect(
        loginAdmin(
          { email: 'admin@ufca.edu.br', password: 'SenhaForte123!' },
          { signal: preAbortedController.signal }
        )
      ).rejects.toBe(abortError);
    });

    it('deve lançar AuthClientError de timeout (REQUEST_TIMEOUT) quando exceder timeoutMs', async () => {
      vi.useFakeTimers();

      globalThis.fetch = vi.fn().mockImplementation((_url, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('Aborted by timeout');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      });

      const loginPromise = loginAdmin(
        { email: 'admin@ufca.edu.br', password: 'SenhaForte123!' },
        { timeoutMs: 2500 }
      );

      const assertion = expect(loginPromise).rejects.toMatchObject({
        code: 'REQUEST_TIMEOUT',
        isNetworkError: true,
        isTimeout: true,
      });

      await vi.advanceTimersByTimeAsync(2500);
      await assertion;
    });
  });
});
