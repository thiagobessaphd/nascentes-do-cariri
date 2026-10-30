/**
 * Nascentes do Cariri — Cliente HTTP Frontend de Municípios
 * Consome o endpoint público GET /api/public/municipios
 */

import type { MunicipiosPublicResponse } from '@/modules/municipios/municipios.dto';
import { municipiosPublicResponseContractSchema } from '@/modules/municipios/municipios.schema';

export interface FetchMunicipiosOptions {
  readonly signal?: AbortSignal | undefined;
}

/**
 * Erro customizado com metadados para falhas de requisição à API pública de municípios.
 */
export class MunicipiosClientError extends Error {
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
    this.name = 'MunicipiosClientError';
    this.statusCode = options?.statusCode;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.code = options?.code;
  }
}

/**
 * Realiza a consulta GET ao endpoint /api/public/municipios.
 * Valida defensivamente o contrato do envelope retornado em runtime via Zod.
 */
export async function fetchMunicipiosPublicos(
  options?: FetchMunicipiosOptions
): Promise<MunicipiosPublicResponse> {
  const url = '/api/public/municipios';

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
      let errorMessage = 'Não foi possível obter a lista de municípios.';
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

      throw new MunicipiosClientError(errorMessage, {
        statusCode: response.status,
        code: errorCode,
      });
    }

    const payload: unknown = await response.json();

    // Validação em runtime do contrato público de municípios
    const parsed = municipiosPublicResponseContractSchema.safeParse(payload);
    if (!parsed.success) {
      throw new MunicipiosClientError(
        'Formato de resposta inválido retornado pela API pública de municípios.'
      );
    }

    return parsed.data;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    if (error instanceof MunicipiosClientError) {
      throw error;
    }
    throw new MunicipiosClientError('Falha de conexão com a API de municípios.', {
      isNetworkError: true,
      cause: error,
    });
  }
}

