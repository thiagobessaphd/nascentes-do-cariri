/**
 * Nascentes do Cariri — Cliente HTTP Frontend de Autenticação Administrativa
 *
 * Consome POST /api/admin/auth/login, POST /api/admin/auth/logout e GET /api/admin/auth/me
 * com validação Zod em runtime, controle de timeout/AbortSignal, leitura de Retry-After e anti-enumeração.
 */

import {
  AUTH_ERROR_CODES,
  DEFAULT_AUTH_REQUEST_TIMEOUT_MS,
  DEFAULT_RATE_LIMIT_FALLBACK_SECONDS,
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  MAX_RETRY_AFTER_SECONDS,
  RATE_LIMITED_LOGIN_MESSAGE,
  authMeResponseSchema,
  authPublicErrorPayloadSchema,
  authValidationIssueSchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
  type AuthFieldErrors,
  type AuthMeResponseDto,
  type LoginRequestDto,
  type LoginResponseDto,
  type LogoutResponseDto,
} from '@/modules/auth/auth.contracts';

export interface LoginCredentialsInput {
  readonly email: string;
  readonly password: string;
}

export interface AuthRequestOptions {
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
}

export type LoginInputValidationResult =
  | {
      readonly success: true;
      readonly data: LoginRequestDto;
    }
  | {
      readonly success: false;
      readonly message: string;
      readonly fieldErrors: AuthFieldErrors;
    };

/**
 * Erro tipado para falhas de validação, autenticação, rate limit, timeout ou rede.
 */
export class AuthClientError extends Error {
  public readonly statusCode?: number | undefined;
  public readonly code?: string | undefined;
  public readonly retryAfterSeconds?: number | undefined;
  public readonly fieldErrors?: AuthFieldErrors | undefined;
  public readonly isNetworkError: boolean;
  public readonly isTimeout: boolean;

  constructor(
    message: string,
    options?: {
      readonly statusCode?: number | undefined;
      readonly code?: string | undefined;
      readonly retryAfterSeconds?: number | undefined;
      readonly fieldErrors?: AuthFieldErrors | undefined;
      readonly isNetworkError?: boolean | undefined;
      readonly isTimeout?: boolean | undefined;
      readonly cause?: unknown;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AuthClientError';
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.fieldErrors = options?.fieldErrors;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isTimeout = options?.isTimeout ?? false;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const LOGIN_API_PATH = '/api/admin/auth/login';
const LOGOUT_API_PATH = '/api/admin/auth/logout';
const SESSION_ME_API_PATH = '/api/admin/auth/me';
const STRICT_POSITIVE_DIGITS_REGEX = /^\d+$/;

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

  const abortError = new Error('Requisição de autenticação cancelada.');
  abortError.name = 'AbortError';
  return abortError;
}

function extractFieldErrorsFromDetails(details: unknown): AuthFieldErrors | undefined {
  if (!Array.isArray(details)) {
    return undefined;
  }

  let emailError: string | undefined;
  let passwordError: string | undefined;

  for (const item of details) {
    const parsed = authValidationIssueSchema.safeParse(item);
    if (!parsed.success) {
      continue;
    }

    if (parsed.data.campo === 'email' && emailError === undefined) {
      emailError = parsed.data.mensagem;
    } else if (parsed.data.campo === 'password' && passwordError === undefined) {
      passwordError = parsed.data.mensagem;
    }
  }

  if (emailError === undefined && passwordError === undefined) {
    return undefined;
  }

  return {
    ...(emailError !== undefined ? { email: emailError } : {}),
    ...(passwordError !== undefined ? { password: passwordError } : {}),
  };
}

/**
 * Interpreta o cabeçalho HTTP `Retry-After` em segundos inteiros ou HTTP-date,
 * limitando o resultado ao teto seguro de MAX_RETRY_AFTER_SECONDS.
 */
export function parseRetryAfterSeconds(
  headerValue: string | null | undefined,
  nowMs: number = Date.now()
): number | undefined {
  if (typeof headerValue !== 'string') {
    return undefined;
  }

  const trimmed = headerValue.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (STRICT_POSITIVE_DIGITS_REGEX.test(trimmed)) {
    const parsedSeconds = Number(trimmed);
    if (!Number.isSafeInteger(parsedSeconds) || parsedSeconds <= 0) {
      return undefined;
    }
    return Math.min(parsedSeconds, MAX_RETRY_AFTER_SECONDS);
  }

  const targetMs = Date.parse(trimmed);
  if (Number.isNaN(targetMs)) {
    return undefined;
  }

  const diffSeconds = Math.ceil((targetMs - nowMs) / 1000);
  if (diffSeconds <= 0) {
    return undefined;
  }

  return Math.min(diffSeconds, MAX_RETRY_AFTER_SECONDS);
}

/**
 * Valida e normaliza localmente as credenciais de login sem expor valores digitados.
 */
export function validateLoginInput(
  input: LoginCredentialsInput
): LoginInputValidationResult {
  const parsed = loginRequestSchema.safeParse(input);
  if (parsed.success) {
    return {
      success: true,
      data: parsed.data,
    };
  }

  let emailError: string | undefined;
  let passwordError: string | undefined;

  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'email' && emailError === undefined) {
      emailError = issue.message;
    } else if (field === 'password' && passwordError === undefined) {
      passwordError = issue.message;
    }
  }

  const fieldErrors: AuthFieldErrors = {
    ...(emailError !== undefined ? { email: emailError } : {}),
    ...(passwordError !== undefined ? { password: passwordError } : {}),
  };

  const firstMessage =
    emailError ?? passwordError ?? 'Verifique os campos informados.';

  return {
    success: false,
    message: firstMessage,
    fieldErrors,
  };
}

async function buildHttpErrorFromResponse(response: Response): Promise<AuthClientError> {
  let parsedCode: string | undefined;
  let parsedDetails: unknown;

  try {
    const rawErrorBody: unknown = await response.json();
    const parsedBody = authPublicErrorPayloadSchema.safeParse(rawErrorBody);
    if (parsedBody.success) {
      parsedCode = parsedBody.data.code;
      parsedDetails = parsedBody.data.details;
    }
  } catch {
    // Resposta sem JSON válido (ex.: proxy/HTML 502)
  }

  if (response.status === 401 || response.status === 403) {
    return new AuthClientError(GENERIC_INVALID_CREDENTIALS_MESSAGE, {
      statusCode: response.status,
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    });
  }

  if (response.status === 429) {
    const headerValue = response.headers?.get?.('Retry-After');
    const retryAfterSeconds =
      parseRetryAfterSeconds(headerValue) ?? DEFAULT_RATE_LIMIT_FALLBACK_SECONDS;

    return new AuthClientError(RATE_LIMITED_LOGIN_MESSAGE, {
      statusCode: 429,
      code: AUTH_ERROR_CODES.RATE_LIMITED,
      retryAfterSeconds,
    });
  }

  if (response.status === 400) {
    const fieldErrors = extractFieldErrorsFromDetails(parsedDetails);
    const firstFieldMessage = fieldErrors?.email ?? fieldErrors?.password;

    return new AuthClientError(
      firstFieldMessage ?? 'Os dados de acesso informados são inválidos.',
      {
        statusCode: 400,
        code: parsedCode ?? AUTH_ERROR_CODES.VALIDATION_ERROR,
        fieldErrors,
      }
    );
  }

  if (response.status >= 500) {
    return new AuthClientError(
      'Erro interno ao processar autenticação. Tente novamente em instantes.',
      {
        statusCode: response.status,
        code: parsedCode ?? 'INTERNAL_SERVER_ERROR',
      }
    );
  }

  return new AuthClientError(
    'Não foi possível concluir a autenticação. Tente novamente.',
    {
      statusCode: response.status,
      code: parsedCode,
    }
  );
}

type SessionAuthOperation = 'logout' | 'session_me';

async function buildSessionHttpErrorFromResponse(
  response: Response,
  operation: SessionAuthOperation
): Promise<AuthClientError> {
  let parsedCode: string | undefined;

  try {
    const rawErrorBody: unknown = await response.json();
    const parsedBody = authPublicErrorPayloadSchema.safeParse(rawErrorBody);
    if (parsedBody.success) {
      parsedCode = parsedBody.data.code;
    }
  } catch {
    // Resposta sem JSON válido (ex.: proxy/HTML 502)
  }

  if (response.status === 401) {
    return new AuthClientError(
      'Sua sessão administrativa expirou ou não é mais válida.',
      {
        statusCode: 401,
        code: AUTH_ERROR_CODES.UNAUTHORIZED,
      }
    );
  }

  if (response.status === 403) {
    if (parsedCode === AUTH_ERROR_CODES.FORBIDDEN_CROSS_ORIGIN) {
      return new AuthClientError(
        'Origem da requisição não autorizada para encerrar a sessão.',
        {
          statusCode: 403,
          code: AUTH_ERROR_CODES.FORBIDDEN_CROSS_ORIGIN,
        }
      );
    }

    return new AuthClientError(
      'Sua conta administrativa não possui permissão ativa.',
      {
        statusCode: 403,
        code: parsedCode ?? AUTH_ERROR_CODES.FORBIDDEN_INACTIVE_USER,
      }
    );
  }

  if (response.status >= 500) {
    const message =
      operation === 'logout'
        ? 'Não foi possível encerrar sua sessão agora. Verifique a conexão e tente novamente.'
        : 'Não foi possível verificar sua sessão administrativa no momento.';

    return new AuthClientError(message, {
      statusCode: response.status,
      code: 'INTERNAL_SERVER_ERROR',
    });
  }

  const fallbackMessage =
    operation === 'logout'
      ? 'Não foi possível encerrar sua sessão agora. Tente novamente.'
      : 'Não foi possível verificar sua sessão administrativa no momento.';

  return new AuthClientError(fallbackMessage, {
    statusCode: response.status,
    code: parsedCode,
  });
}

async function executeAuthRequest<T>(params: {
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string | undefined;
  readonly options?: AuthRequestOptions | undefined;
  readonly buildHttpError: (response: Response) => Promise<AuthClientError>;
  readonly parsePayload: (rawPayload: unknown) =>
    | { readonly success: true; readonly data: T }
    | { readonly success: false };
}): Promise<T> {
  if (params.options?.signal?.aborted) {
    throw createAbortError(params.options.signal.reason);
  }

  const controller = new AbortController();
  const timeoutMs = params.options?.timeoutMs ?? DEFAULT_AUTH_REQUEST_TIMEOUT_MS;
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const onExternalAbort = (): void => {
    controller.abort(params.options?.signal?.reason);
  };

  if (params.options?.signal) {
    params.options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  }

  try {
    const requestInit: RequestInit = {
      method: params.method,
      headers: params.headers,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    };

    if (params.body !== undefined) {
      requestInit.body = params.body;
    }

    const response = await fetch(params.url, requestInit);

    if (!response.ok) {
      throw await params.buildHttpError(response);
    }

    let rawPayload: unknown;
    try {
      rawPayload = await response.json();
    } catch (parseError: unknown) {
      if (didTimeout || isAbortError(parseError) || params.options?.signal?.aborted) {
        throw parseError;
      }

      throw new AuthClientError(
        'Formato inesperado na resposta do servidor de autenticação.',
        {
          statusCode: response.status,
          code: 'INVALID_SERVER_RESPONSE',
          cause: parseError,
        }
      );
    }

    const parsedPayload = params.parsePayload(rawPayload);
    if (!parsedPayload.success) {
      throw new AuthClientError(
        'Formato inesperado na resposta do servidor de autenticação.',
        {
          statusCode: response.status,
          code: 'INVALID_SERVER_RESPONSE',
        }
      );
    }

    return parsedPayload.data;
  } catch (error: unknown) {
    if (error instanceof AuthClientError) {
      throw error;
    }

    if (didTimeout) {
      throw new AuthClientError(
        'O servidor demorou muito para responder. Verifique sua conexão e tente novamente.',
        {
          code: 'REQUEST_TIMEOUT',
          isNetworkError: true,
          isTimeout: true,
          cause: error,
        }
      );
    }

    if (isAbortError(error) || params.options?.signal?.aborted) {
      throw error;
    }

    throw new AuthClientError(
      'Falha de conexão com o servidor. Verifique sua internet e tente novamente.',
      {
        isNetworkError: true,
        isTimeout: false,
        cause: error,
      }
    );
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (params.options?.signal) {
      params.options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Autentica um administrador via POST /api/admin/auth/login.
 */
export async function loginAdmin(
  credentials: LoginCredentialsInput,
  options?: AuthRequestOptions
): Promise<LoginResponseDto> {
  const validation = validateLoginInput(credentials);
  if (!validation.success) {
    throw new AuthClientError(validation.message, {
      statusCode: 400,
      code: AUTH_ERROR_CODES.VALIDATION_ERROR,
      fieldErrors: validation.fieldErrors,
    });
  }

  return executeAuthRequest({
    url: LOGIN_API_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(validation.data),
    options,
    buildHttpError: buildHttpErrorFromResponse,
    parsePayload: (rawPayload) => loginResponseSchema.safeParse(rawPayload),
  });
}

/**
 * Encerra a sessão administrativa atual via POST /api/admin/auth/logout.
 * Nunca simula sucesso em falhas de rede ou 5xx.
 */
export async function logoutAdmin(
  options?: AuthRequestOptions
): Promise<LogoutResponseDto> {
  return executeAuthRequest({
    url: LOGOUT_API_PATH,
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    options,
    buildHttpError: (response) => buildSessionHttpErrorFromResponse(response, 'logout'),
    parsePayload: (rawPayload) => logoutResponseSchema.safeParse(rawPayload),
  });
}

/**
 * Revalida a sessão administrativa atual via GET /api/admin/auth/me (sempre no-store).
 * Preserva 401 UNAUTHORIZED e 403 FORBIDDEN_INACTIVE_USER separadamente de erros 5xx/rede.
 */
export async function fetchAdminSessionMe(
  options?: AuthRequestOptions
): Promise<AuthMeResponseDto> {
  return executeAuthRequest({
    url: SESSION_ME_API_PATH,
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    options,
    buildHttpError: (response) =>
      buildSessionHttpErrorFromResponse(response, 'session_me'),
    parsePayload: (rawPayload) => authMeResponseSchema.safeParse(rawPayload),
  });
}
