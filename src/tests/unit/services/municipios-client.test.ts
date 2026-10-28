import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchMunicipiosPublicos,
  MunicipiosClientError,
} from '@/services/municipios.client';
import type { MunicipiosPublicResponse } from '@/modules/municipios/municipios.dto';

describe('Cliente HTTP de Municípios Públicos (src/services/municipios.client.ts)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deve realizar a requisição GET em /api/public/municipios e retornar a lista validada pelo contrato', async () => {
    const mockResponsePayload: MunicipiosPublicResponse = {
      data: ['Barbalha', 'Crato', 'Jardim', 'Missão Velha', 'Santana do Cariri'],
      meta: {
        total: 5,
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockResponsePayload),
    });

    globalThis.fetch = mockFetch;

    const result = await fetchMunicipiosPublicos();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/public/municipios',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
    );
    expect(result).toEqual(mockResponsePayload);
  });

  it('deve repassar o AbortSignal para o fetch quando fornecido', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    });

    globalThis.fetch = mockFetch;
    const controller = new AbortController();

    await fetchMunicipiosPublicos({ signal: controller.signal });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/public/municipios',
      expect.objectContaining({
        signal: controller.signal,
      })
    );
  });

  it('deve extrair mensagem e código de erro quando a API retornar status não-2xx com JSON estruturado', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({
        error: 'Serviço de municípios temporariamente indisponível.',
        code: 'SERVICE_UNAVAILABLE',
      }),
    });

    globalThis.fetch = mockFetch;

    await expect(fetchMunicipiosPublicos()).rejects.toThrow(MunicipiosClientError);
    await expect(fetchMunicipiosPublicos()).rejects.toMatchObject({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Serviço de municípios temporariamente indisponível.',
      isNetworkError: false,
    });
  });

  it('deve usar mensagem padrão segura quando a resposta de erro não contiver JSON válido', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
    });

    globalThis.fetch = mockFetch;

    await expect(fetchMunicipiosPublicos()).rejects.toThrow(MunicipiosClientError);
    await expect(fetchMunicipiosPublicos()).rejects.toMatchObject({
      statusCode: 500,
      message: 'Não foi possível obter a lista de municípios.',
    });
  });

  it('deve lançar MunicipiosClientError com isNetworkError=true quando ocorrer falha de rede', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    globalThis.fetch = mockFetch;

    await expect(fetchMunicipiosPublicos()).rejects.toThrow(MunicipiosClientError);
    await expect(fetchMunicipiosPublicos()).rejects.toMatchObject({
      isNetworkError: true,
      message: 'Falha de conexão com a API de municípios.',
    });
  });

  it('deve propagar AbortError diretamente sem encapsular em MunicipiosClientError', async () => {
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';

    const mockFetch = vi.fn().mockRejectedValue(abortError);
    globalThis.fetch = mockFetch;

    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchMunicipiosPublicos({ signal: controller.signal })
    ).rejects.toThrow('The operation was aborted.');
  });

  it('deve rejeitar com MunicipiosClientError quando o payload 200 OK violar o contrato Zod esperado', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        data: [123, null], // inválido: deveria ser array de strings não vazias
        meta: { total: 'invalido' },
      }),
    });

    globalThis.fetch = mockFetch;

    await expect(fetchMunicipiosPublicos()).rejects.toThrow(MunicipiosClientError);
    await expect(fetchMunicipiosPublicos()).rejects.toMatchObject({
      message: 'Formato de resposta inválido retornado pela API pública de municípios.',
    });
  });
});
