/**
 * Nascentes do Cariri — Cliente HTTP Frontend
 * Consome o endpoint público /api/public/nascentes
*/

import type { NascentesPublicResponse, NascentesQueryParams } from '@/modules/nascentes/nascentes.dto';

export interface FetchNascentesOptions {
  readonly params?: NascentesQueryParams | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Erro customizado com metadados para falhas de requisição à API pública.
 */
export class NascentesClientError extends Error {
  public readonly statusCode?: number | undefined;
  public readonly isNetworkError: boolean;
  public readonly code?: string | undefined;

  constructor(
    message: string,
    options?: {
      readonly statusCode?: number | undefined;
      readonly isNetworkError?: boolean;
      readonly code?: string | undefined;
      readonly cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'NascentesClientError';
    this.statusCode = options?.statusCode;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.code = options?.code;
  }
}

/**
 - Realiza a consulta GET ao endpoint /api/public/nascentes.
 - Aplica serialização de query params e validação defensiva do envelope retornado.
*/
export async function fetchNascentesPublicas(
  options?: FetchNascentesOptions
): Promise<NascentesPublicResponse> {
  const query = new URLSearchParams();

  if (options?.params?.municipio) {
    query.set('municipio', options.params.municipio);
  }
  if (options?.params?.q) {
    query.set('q', options.params.q);
  }
  if (
    options?.params?.north !== undefined &&
    options?.params?.south !== undefined &&
    options?.params?.east !== undefined &&
    options?.params?.west !== undefined
  ) {
    query.set('north', String(options.params.north));
    query.set('south', String(options.params.south));
    query.set('east', String(options.params.east));
    query.set('west', String(options.params.west));
  }

  const queryString = query.toString();
  const url = queryString ? `/api/public/nascentes?${queryString}` : '/api/public/nascentes';

  try {
    const requestInit: RequestInit = {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    };

    if (options?.signal) {
      requestInit.signal = options.signal;
    }

    const response = await fetch(url, requestInit);

    if (!response.ok) {
      let errorMessage = 'Não foi possível obter os dados das nascentes.';
      let errorCode: string | undefined;

      try {
        const errorBody: unknown = await response.json();
        if (
          typeof errorBody === 'object' &&
          errorBody !== null &&
          'error' in errorBody &&
          typeof (errorBody as { readonly error: unknown }).error === 'string'
        ) {
          errorMessage = (errorBody as { readonly error: string }).error;
        }
        if (
          typeof errorBody === 'object' &&
          errorBody !== null &&
          'code' in errorBody &&
          typeof (errorBody as { readonly code: unknown }).code === 'string'
        ) {
          errorCode = (errorBody as { readonly code: string }).code;
        }
      } catch {
        // Fallback quando a resposta de erro não for JSON válido
      }

      throw new NascentesClientError(errorMessage, {
        statusCode: response.status,
        code: errorCode,
      });
    }

    const payload: unknown = await response.json();

    // Validação defensiva de runtime do envelope retornado
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('data' in payload) ||
      !Array.isArray((payload as { readonly data: unknown }).data)
    ) {
      throw new NascentesClientError('Formato de resposta inválido retornado pela API pública.');
    }

    return payload as NascentesPublicResponse;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    if (error instanceof NascentesClientError) {
      throw error;
    }
    throw new NascentesClientError('Falha de conexão com a API de nascentes.', {
      isNetworkError: true,
      cause: error,
    });
  }
}
