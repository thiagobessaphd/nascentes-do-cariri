/**
 * Nascentes do Cariri — Cliente HTTP Frontend do Resumo do Painel Administrativo
 *
 * Consome GET /api/admin/resumo com validação Zod v4 (.strict()) em runtime,
 * controle de timeout/AbortSignal e mascaramento defensivo de respostas 5xx.
 */

import {
  DEFAULT_PAINEL_REQUEST_TIMEOUT_MS,
  FORBIDDEN_PAINEL_ERROR_MESSAGE,
  GENERIC_PAINEL_LOAD_ERROR_MESSAGE,
  PAINEL_ERROR_CODES,
  UNAUTHORIZED_PAINEL_ERROR_MESSAGE,
  adminResumoResponseSchema,
  type AdminResumoResponseDto,
} from '@/modules/painel/painel.contracts';
import { notifyAdminSessionExpired } from './admin-session-events';

export interface FetchAdminResumoOptions {
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
}

/**
 * Erro tipado para falhas de autenticação, contrato, timeout ou rede no painel `/admin`.
 */
export class PainelClientError extends Error {
  public readonly statusCode?: number | undefined;
  public readonly code?: string | undefined;
  public readonly isNetworkError: boolean;
  public readonly isTimeout: boolean;
  public readonly isAuthError: boolean;

  constructor(
    message: string,
    options?: {
      readonly statusCode?: number | undefined;
      readonly code?: string | undefined;
      readonly isNetworkError?: boolean | undefined;
      readonly isTimeout?: boolean | undefined;
      readonly isAuthError?: boolean | undefined;
      readonly cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'PainelClientError';
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isTimeout = options?.isTimeout ?? false;
    this.isAuthError = options?.isAuthError ?? false;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const ADMIN_RESUMO_API_PATH = '/api/admin/resumo';

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { readonly name: unknown }).name === 'AbortError'
  );
}

function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }

  const abortError = new Error('Requisição de resumo administrativo cancelada.');
  abortError.name = 'AbortError';
  return abortError;
}

function buildHttpErrorFromResponse(response: Response): PainelClientError {
  if (response.status === 401) {
    return new PainelClientError(UNAUTHORIZED_PAINEL_ERROR_MESSAGE, {
      statusCode: 401,
      code: PAINEL_ERROR_CODES.UNAUTHORIZED,
      isAuthError: true,
    });
  }

  if (response.status === 403) {
    return new PainelClientError(FORBIDDEN_PAINEL_ERROR_MESSAGE, {
      statusCode: 403,
      code: PAINEL_ERROR_CODES.FORBIDDEN_INACTIVE_USER,
      isAuthError: true,
    });
  }

  if (response.status >= 500) {
    return new PainelClientError(GENERIC_PAINEL_LOAD_ERROR_MESSAGE, {
      statusCode: response.status,
      code: PAINEL_ERROR_CODES.INTERNAL_SERVER_ERROR,
    });
  }

  return new PainelClientError(GENERIC_PAINEL_LOAD_ERROR_MESSAGE, {
    statusCode: response.status,
  });
}

/**
 * Consulta o resumo operacional do painel via GET /api/admin/resumo.
 * Nunca interpola payloads crus de erro do servidor nem aceita campos internos fora do schema.
 */
export async function fetchAdminResumo(
  options?: FetchAdminResumoOptions
): Promise<AdminResumoResponseDto> {
  if (options?.signal?.aborted) {
    throw createAbortError(options.signal.reason);
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PAINEL_REQUEST_TIMEOUT_MS;
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const onExternalAbort = (): void => {
    controller.abort(options?.signal?.reason);
  };

  if (options?.signal) {
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  }

  try {
    const response = await fetch(ADMIN_RESUMO_API_PATH, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      const httpError = buildHttpErrorFromResponse(response);
      if (httpError.isAuthError) {
        notifyAdminSessionExpired();
      }
      throw httpError;
    }

    let rawPayload: unknown;
    try {
      rawPayload = await response.json();
    } catch (parseError: unknown) {
      if (didTimeout || isAbortError(parseError) || options?.signal?.aborted) {
        throw parseError;
      }

      throw new PainelClientError(GENERIC_PAINEL_LOAD_ERROR_MESSAGE, {
        statusCode: response.status,
        code: PAINEL_ERROR_CODES.INVALID_SERVER_RESPONSE,
        cause: parseError,
      });
    }

    const parsedPayload = adminResumoResponseSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      throw new PainelClientError(GENERIC_PAINEL_LOAD_ERROR_MESSAGE, {
        statusCode: response.status,
        code: PAINEL_ERROR_CODES.INVALID_SERVER_RESPONSE,
      });
    }

    return parsedPayload.data;
  } catch (error: unknown) {
    if (error instanceof PainelClientError) {
      throw error;
    }

    if (didTimeout) {
      throw new PainelClientError(
        'O servidor demorou muito para responder. Verifique sua conexão e tente novamente.',
        {
          code: PAINEL_ERROR_CODES.REQUEST_TIMEOUT,
          isNetworkError: true,
          isTimeout: true,
          cause: error,
        }
      );
    }

    if (isAbortError(error) || options?.signal?.aborted) {
      throw error;
    }

    throw new PainelClientError(
      'Falha de conexão com o servidor. Verifique sua internet e tente novamente.',
      {
        code: PAINEL_ERROR_CODES.NETWORK_ERROR,
        isNetworkError: true,
        isTimeout: false,
        cause: error,
      }
    );
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (options?.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}
