import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchNascentesPublicas, NascentesClientError } from '@/services/nascentes.client';
import type { NascentesPublicResponse } from '@/modules/nascentes/nascentes.dto';

describe('Cliente HTTP de Nascentes Públicas', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('deve realizar a requisição GET na URL correta sem parâmetros quando nenhum for informado', async () => {
    const mockResponsePayload: NascentesPublicResponse = {
      data: [
        {
          id: 1,
          latitude: -7.2,
          longitude: -39.3,
          municipio: 'Crato',
          fonte: 'Nascente do Granjeiro',
          localidade: 'Serra do Araripe',
          data_criacao: '2023-05-10',
          vazao_media: 0.85,
          unidade_vazao: 'm³/s',
        },
      ],
      meta: {
        total: 1,
        updated_at: '2026-10-20T12:00:00.000Z',
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockResponsePayload),
    });

    globalThis.fetch = mockFetch;

    const result = await fetchNascentesPublicas();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/public/nascentes',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
    );
    expect(result).toEqual(mockResponsePayload);
  });

  it('deve serializar corretamente query params com município, q e bounding box', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, updated_at: null } }),
    });

    globalThis.fetch = mockFetch;

    await fetchNascentesPublicas({
      params: {
        municipio: 'Barbalha',
        q: 'Arajara',
        north: -7.1,
        south: -7.5,
        east: -39.1,
        west: -39.6,
      },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/public/nascentes?municipio=Barbalha&q=Arajara&north=-7.1&south=-7.5&east=-39.1&west=-39.6',
      expect.any(Object)
    );
  });

  it('deve extrair mensagem e código de erro ao receber 400 Bad Request com payload estruturado', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: 'Filtros geográficos inválidos: north deve ser maior que south.',
        code: 'VALIDATION_ERROR',
      }),
    });

    globalThis.fetch = mockFetch;

    await expect(fetchNascentesPublicas()).rejects.toThrow(NascentesClientError);
    await expect(fetchNascentesPublicas()).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Filtros geográficos inválidos: north deve ser maior que south.',
    });
  });

  it('deve lançar NascentesClientError com statusCode quando a API retornar status não-2xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('no json')),
    });

    globalThis.fetch = mockFetch;

    await expect(fetchNascentesPublicas()).rejects.toThrow(NascentesClientError);
    await expect(fetchNascentesPublicas()).rejects.toMatchObject({
      statusCode: 500,
      message: 'Não foi possível obter os dados das nascentes.',
    });
  });

  it('deve lançar NascentesClientError com isNetworkError quando fetch falhar por erro de rede', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    globalThis.fetch = mockFetch;

    await expect(fetchNascentesPublicas()).rejects.toThrow(NascentesClientError);
    await expect(fetchNascentesPublicas()).rejects.toMatchObject({
      isNetworkError: true,
      message: 'Falha de conexão com a API de nascentes.',
    });
  });

  it('deve propagar AbortError sem encapsular quando a requisição for abortada', async () => {
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';

    const mockFetch = vi.fn().mockRejectedValue(abortError);

    globalThis.fetch = mockFetch;

    const controller = new AbortController();
    controller.abort();

    await expect(fetchNascentesPublicas({ signal: controller.signal })).rejects.toThrow('The user aborted a request.');
  });

  it('deve lançar erro se o payload retornado pela API não contiver a estrutura esperada de array data', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ error: 'formato inesperado' }),
    });

    globalThis.fetch = mockFetch;

    await expect(fetchNascentesPublicas()).rejects.toThrow(NascentesClientError);
    await expect(fetchNascentesPublicas()).rejects.toMatchObject({
      message: 'Formato de resposta inválido retornado pela API pública.',
    });
  });
});
