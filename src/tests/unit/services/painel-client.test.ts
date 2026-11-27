/**
 * Nascentes do Cariri — Testes Unitários: Cliente HTTP do Painel Administrativo
 *
 * Cobre `src/services/painel.client.ts`:
 * - Requisição `GET /api/admin/resumo` com `credentials: 'same-origin'` e `cache: 'no-store'`;
 * - Validação Zod v4 `.strict()` rejeitando qualquer campo privado vazado;
 * - Mapeamento de 401/403 (`isAuthError`), 5xx mascarado, JSON malformado, rede, timeout e AbortSignal.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FORBIDDEN_PAINEL_ERROR_MESSAGE,
  GENERIC_PAINEL_LOAD_ERROR_MESSAGE,
  PAINEL_ERROR_CODES,
  UNAUTHORIZED_PAINEL_ERROR_MESSAGE,
  type AdminResumoResponseDto,
} from '@/modules/painel/painel.contracts';
import {
  PainelClientError,
  fetchAdminResumo,
} from '@/services/painel.client';

const VALID_RESUMO_PAYLOAD: AdminResumoResponseDto = {
  indicadores: {
    totalNascentesAtivas: 45,
    totalImportacoes: 3,
    ultimaImportacao: {
      id: 9,
      nomeArquivo: 'lote-cariri.txt',
      status: 'CONCLUIDA',
      totalLinhas: 15,
      totalValidas: 15,
      totalInvalidas: 0,
      totalDuplicadas: 0,
      createdAt: '2026-11-26T10:00:00.000Z',
      concluidaAt: '2026-11-26T10:01:00.000Z',
      usuario: {
        id: 1,
        nome: 'Administrador UFCA',
      },
    },
  },
  historicoRecente: [
    {
      id: 9,
      nomeArquivo: 'lote-cariri.txt',
      status: 'CONCLUIDA',
      totalLinhas: 15,
      totalValidas: 15,
      totalInvalidas: 0,
      totalDuplicadas: 0,
      createdAt: '2026-11-26T10:00:00.000Z',
      concluidaAt: '2026-11-26T10:01:00.000Z',
      usuario: {
        id: 1,
        nome: 'Administrador UFCA',
      },
    },
  ],
  meta: {
    recentLimit: 5,
    generatedAt: '2026-11-26T14:00:00.000Z',
  },
};

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

describe('Cliente HTTP fetchAdminResumo (Task-31 / Etapa 1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('deve consultar GET /api/admin/resumo com same-origin/no-store e retornar DTO validado', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(createJsonResponse(VALID_RESUMO_PAYLOAD, 200));

    const result = await fetchAdminResumo();

    expect(result).toEqual(VALID_RESUMO_PAYLOAD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/admin/resumo');
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('same-origin');
    expect(init?.cache).toBe('no-store');
    expect(init?.headers).toEqual({ Accept: 'application/json' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('deve rejeitar payload 200 que vaze campos privados/extras via Zod .strict()', async () => {
    const leakedPayloads = [
      {
        ...VALID_RESUMO_PAYLOAD,
        indicadores: {
          ...VALID_RESUMO_PAYLOAD.indicadores,
          ultimaImportacao: {
            ...VALID_RESUMO_PAYLOAD.indicadores.ultimaImportacao,
            caminhoPrivadoArquivo: 'private/importacoes/segredo.txt',
          },
        },
      },
      {
        ...VALID_RESUMO_PAYLOAD,
        indicadores: {
          ...VALID_RESUMO_PAYLOAD.indicadores,
          ultimaImportacao: {
            ...VALID_RESUMO_PAYLOAD.indicadores.ultimaImportacao,
            mensagemErro: 'PrismaClientKnownRequestError',
          },
        },
      },
      {
        ...VALID_RESUMO_PAYLOAD,
        indicadores: {
          ...VALID_RESUMO_PAYLOAD.indicadores,
          ultimaImportacao: {
            ...VALID_RESUMO_PAYLOAD.indicadores.ultimaImportacao,
            usuario: {
              id: 1,
              nome: 'Admin',
              passwordHash: '$2b$12$vazado',
            },
          },
        },
      },
    ];

    for (const leakedPayload of leakedPayloads) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        createJsonResponse(leakedPayload, 200)
      );

      await expect(fetchAdminResumo()).rejects.toMatchObject({
        name: 'PainelClientError',
        statusCode: 200,
        code: PAINEL_ERROR_CODES.INVALID_SERVER_RESPONSE,
        message: GENERIC_PAINEL_LOAD_ERROR_MESSAGE,
      });
    }
  });

  it('deve rejeitar resposta 200 com JSON inválido usando INVALID_SERVER_RESPONSE', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>502 Bad Gateway</html>', { status: 200 })
    );

    await expect(fetchAdminResumo()).rejects.toMatchObject({
      name: 'PainelClientError',
      statusCode: 200,
      code: PAINEL_ERROR_CODES.INVALID_SERVER_RESPONSE,
    });
  });

  it('deve mapear 401 e 403 para PainelClientError com isAuthError = true sem vazar corpo do servidor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createJsonResponse({ error: 'Token HMAC expirado: sid=123', code: 'UNAUTHORIZED' }, 401)
    );

    await expect(fetchAdminResumo()).rejects.toMatchObject({
      name: 'PainelClientError',
      statusCode: 401,
      code: PAINEL_ERROR_CODES.UNAUTHORIZED,
      isAuthError: true,
      message: UNAUTHORIZED_PAINEL_ERROR_MESSAGE,
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createJsonResponse({ error: 'Usuario id=99 inativo', code: 'FORBIDDEN' }, 403)
    );

    await expect(fetchAdminResumo()).rejects.toMatchObject({
      name: 'PainelClientError',
      statusCode: 403,
      code: PAINEL_ERROR_CODES.FORBIDDEN_INACTIVE_USER,
      isAuthError: true,
      message: FORBIDDEN_PAINEL_ERROR_MESSAGE,
    });
  });

  it('deve mascarar respostas 5xx sem interpolar mensagens técnicas do servidor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonResponse({ error: 'ECONNREFUSED mysql://root@127.0.0.1:3306' }, 503)
    );

    try {
      await fetchAdminResumo();
      expect.unreachable('Deveria lançar PainelClientError em 503');
    } catch (error) {
      expect(error).toBeInstanceOf(PainelClientError);
      const clientError = error as PainelClientError;
      expect(clientError.statusCode).toBe(503);
      expect(clientError.code).toBe(PAINEL_ERROR_CODES.INTERNAL_SERVER_ERROR);
      expect(clientError.isAuthError).toBe(false);
      expect(clientError.message).toBe(GENERIC_PAINEL_LOAD_ERROR_MESSAGE);
      expect(clientError.message).not.toContain('ECONNREFUSED');
    }
  });

  it('deve classificar erro de rede como isNetworkError = true', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchAdminResumo()).rejects.toMatchObject({
      name: 'PainelClientError',
      code: PAINEL_ERROR_CODES.NETWORK_ERROR,
      isNetworkError: true,
      isTimeout: false,
      isAuthError: false,
    });
  });

  it('deve abortar por timeout e sinalizar isTimeout = true', async () => {
    vi.useFakeTimers();

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        })
    );

    const pending = fetchAdminResumo({ timeoutMs: 250 });
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'PainelClientError',
      code: PAINEL_ERROR_CODES.REQUEST_TIMEOUT,
      isNetworkError: true,
      isTimeout: true,
    });

    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });

  it('deve propagar AbortError quando o AbortSignal externo já estiver abortado', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const externalController = new AbortController();
    externalController.abort();

    await expect(
      fetchAdminResumo({ signal: externalController.signal })
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deve propagar AbortError quando o AbortSignal externo cancelar a requisição em voo ou durante response.json()', async () => {
    const inFlightController = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortError = new Error('Cancelled in flight');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        })
    );

    const inFlightPromise = fetchAdminResumo({ signal: inFlightController.signal });
    inFlightController.abort();
    await expect(inFlightPromise).rejects.toMatchObject({ name: 'AbortError' });

    const jsonAbortController = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        jsonAbortController.abort();
        const abortError = new Error('Aborted during JSON parse');
        abortError.name = 'AbortError';
        throw abortError;
      },
    } as unknown as Response);

    await expect(
      fetchAdminResumo({ signal: jsonAbortController.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
