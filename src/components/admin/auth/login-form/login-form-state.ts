/**
 * Nascentes do Cariri — Máquina de Estado Pura da Tela de Login
 *
 * Centraliza cálculo de backoff progressivo client-side, contagem regressiva de
 * rate limit (429 Retry-After) e tradução segura de erros para UI/leitores de tela.
 */

import {
  AUTH_ERROR_CODES,
  DEFAULT_RATE_LIMIT_FALLBACK_SECONDS,
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  RATE_LIMITED_LOGIN_MESSAGE,
} from '@/modules/auth/auth.contracts';

export const PROGRESSIVE_BACKOFF_SCHEDULE_SECONDS = {
  THIRD_FAILURE: 3,
  FOURTH_FAILURE: 6,
  FIFTH_OR_MORE_FAILURE: 10,
} as const;

export type LoginCooldownReason = 'progressive_backoff' | 'rate_limit';

export interface LoginGlobalAlert {
  readonly kind: 'error' | 'rate_limit';
  readonly message: string;
}

export interface ResolveLoginFailureParams {
  readonly statusCode?: number | undefined;
  readonly code?: string | undefined;
  readonly message: string;
  readonly retryAfterSeconds?: number | undefined;
  readonly isNetworkError?: boolean | undefined;
  readonly isTimeout?: boolean | undefined;
  readonly previousConsecutiveFailures: number;
  readonly previousCooldownUntilMs: number | null;
  readonly nowMs?: number | undefined;
}

export interface ResolvedLoginFailureState {
  readonly consecutiveAuthFailures: number;
  readonly cooldownUntilMs: number | null;
  readonly cooldownReason: LoginCooldownReason | null;
  readonly alert: LoginGlobalAlert;
}

/**
 * Calcula o intervalo progressivo local em segundos após falhas 401/403 consecutivas:
 * permite 2 erros de digitação sem atraso e aplica backoff leve a partir da 3ª falha.
 */
export function calculateProgressiveBackoffSeconds(
  consecutiveAuthFailures: number
): number {
  if (!Number.isFinite(consecutiveAuthFailures) || consecutiveAuthFailures < 3) {
    return 0;
  }

  if (consecutiveAuthFailures === 3) {
    return PROGRESSIVE_BACKOFF_SCHEDULE_SECONDS.THIRD_FAILURE;
  }

  if (consecutiveAuthFailures === 4) {
    return PROGRESSIVE_BACKOFF_SCHEDULE_SECONDS.FOURTH_FAILURE;
  }

  return PROGRESSIVE_BACKOFF_SCHEDULE_SECONDS.FIFTH_OR_MORE_FAILURE;
}

/**
 * Calcula quantos segundos restam até o desbloqueio do formulário.
 */
export function getCooldownRemainingSeconds(
  cooldownUntilMs: number | null,
  nowMs: number = Date.now()
): number {
  if (cooldownUntilMs === null || !Number.isFinite(cooldownUntilMs)) {
    return 0;
  }

  const diffMs = cooldownUntilMs - nowMs;
  if (diffMs <= 0) {
    return 0;
  }

  return Math.ceil(diffMs / 1000);
}

/**
 * Formata a contagem regressiva restante em português legível.
 */
export function formatCooldownRemainingPtBr(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0 s';
  }

  const safeSeconds = Math.ceil(totalSeconds);
  if (safeSeconds < 60) {
    return `${safeSeconds} s`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remSeconds = safeSeconds % 60;

  if (remSeconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes} min ${remSeconds} s`;
}

/**
 * Resolve o próximo estado anti-abuso e a mensagem segura de alerta após erro no login.
 */
export function resolveLoginFailureState(
  params: ResolveLoginFailureParams
): ResolvedLoginFailureState {
  const nowMs = params.nowMs ?? Date.now();
  const activeCooldownRemaining = getCooldownRemainingSeconds(
    params.previousCooldownUntilMs,
    nowMs
  );
  const existingValidUntil =
    activeCooldownRemaining > 0 ? params.previousCooldownUntilMs : null;

  if (
    params.statusCode === 429 ||
    params.code === AUTH_ERROR_CODES.RATE_LIMITED
  ) {
    const seconds =
      params.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_FALLBACK_SECONDS;
    const candidateUntilMs = nowMs + seconds * 1000;
    const cooldownUntilMs =
      existingValidUntil !== null
        ? Math.max(existingValidUntil, candidateUntilMs)
        : candidateUntilMs;

    return {
      consecutiveAuthFailures: params.previousConsecutiveFailures + 1,
      cooldownUntilMs,
      cooldownReason: 'rate_limit',
      alert: {
        kind: 'rate_limit',
        message: RATE_LIMITED_LOGIN_MESSAGE,
      },
    };
  }

  if (
    params.statusCode === 401 ||
    params.statusCode === 403 ||
    params.code === AUTH_ERROR_CODES.INVALID_CREDENTIALS
  ) {
    const nextFailures = params.previousConsecutiveFailures + 1;
    const backoffSeconds = calculateProgressiveBackoffSeconds(nextFailures);

    if (backoffSeconds > 0) {
      const candidateUntilMs = nowMs + backoffSeconds * 1000;
      const cooldownUntilMs =
        existingValidUntil !== null
          ? Math.max(existingValidUntil, candidateUntilMs)
          : candidateUntilMs;

      return {
        consecutiveAuthFailures: nextFailures,
        cooldownUntilMs,
        cooldownReason: 'progressive_backoff',
        alert: {
          kind: 'error',
          message: `${GENERIC_INVALID_CREDENTIALS_MESSAGE} Aguarde alguns segundos antes de tentar novamente.`,
        },
      };
    }

    return {
      consecutiveAuthFailures: nextFailures,
      cooldownUntilMs: existingValidUntil,
      cooldownReason: existingValidUntil !== null ? 'progressive_backoff' : null,
      alert: {
        kind: 'error',
        message: GENERIC_INVALID_CREDENTIALS_MESSAGE,
      },
    };
  }

  return {
    consecutiveAuthFailures: params.previousConsecutiveFailures,
    cooldownUntilMs: existingValidUntil,
    cooldownReason: existingValidUntil !== null ? 'progressive_backoff' : null,
    alert: {
      kind: 'error',
      message: params.message,
    },
  };
}

/**
 * Define o rótulo do botão principal de autenticação conforme o estado atual.
 */
export function getSubmitButtonLabel(params: {
  readonly isSubmitting: boolean;
  readonly isRedirecting: boolean;
  readonly cooldownRemainingSeconds: number;
}): string {
  if (params.isRedirecting) {
    return 'Redirecionando...';
  }

  if (params.isSubmitting) {
    return 'Entrando...';
  }

  if (params.cooldownRemainingSeconds > 0) {
    return `Aguarde ${formatCooldownRemainingPtBr(params.cooldownRemainingSeconds)}`;
  }

  return 'Entrar';
}
