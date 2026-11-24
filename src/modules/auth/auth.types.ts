/**
 * Nascentes do Cariri — Tipos Server-Side e Erros de Autenticação
 */

import { AppError } from '@/lib/errors';
import {
  AUTH_ERROR_CODES,
  RATE_LIMITED_LOGIN_MESSAGE,
  type AdminPublicUserDto,
  type AuthSessionMetaDto,
} from './auth.contracts';

export type RateLimitCheckResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export class LoginRateLimitError extends AppError {
  public readonly retryAfterSeconds: number;

  constructor(
    retryAfterSeconds: number,
    message: string = RATE_LIMITED_LOGIN_MESSAGE
  ) {
    super(message, 429, AUTH_ERROR_CODES.RATE_LIMITED);
    this.name = 'LoginRateLimitError';
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export interface LoginRateLimitPolicy {
  readonly WINDOW_MS: number;
  readonly LOCKOUT_MS: number;
  readonly MAX_ATTEMPTS_PER_EMAIL: number;
  readonly MAX_ATTEMPTS_PER_IP: number;
  readonly STALE_RETENTION_MS: number;
}

export interface LoginRateLimitContext {
  readonly email: string;
  readonly clientIp: string;
  readonly now?: Date | undefined;
}

export interface LoginRateLimiter {
  check(context: LoginRateLimitContext): Promise<RateLimitCheckResult>;
  recordFailure(context: LoginRateLimitContext): Promise<RateLimitCheckResult>;
  resetOnSuccess(context: LoginRateLimitContext): Promise<void>;
}

export interface AuthenticateAdminInput {
  readonly email: string;
  readonly password: string;
  readonly clientIp: string;
  readonly now?: Date | undefined;
  readonly ttlSeconds?: number | undefined;
}

export interface AuthenticateAdminResult {
  readonly user: AdminPublicUserDto;
  readonly session: AuthSessionMetaDto;
  readonly sessionId: number;
  readonly token: string;
  readonly expiresAt: Date;
}

export interface CreatePersistedSessionInput {
  readonly userId: number;
  readonly email: string;
  readonly role?: string | undefined;
  readonly ttlSeconds?: number | undefined;
  readonly now?: Date | undefined;
}

export interface CreatePersistedSessionResult {
  readonly sessionId: number;
  readonly token: string;
  readonly expiresAt: Date;
}
