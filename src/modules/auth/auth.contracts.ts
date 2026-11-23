/**
 * Nascentes do Cariri — Contratos Client-Safe de Autenticação
 *
 * Constantes, schemas Zod e DTOs serializáveis sem dependências de Node.js ou Prisma.
 */

import { z } from 'zod';
import {
  ADMIN_LOGIN_PATH,
  DEFAULT_ADMIN_REDIRECT_PATH,
  buildAdminLoginRedirectUrl,
  sanitizeAdminRedirectPath,
} from '@/lib/security/admin-redirect';

export {
  ADMIN_LOGIN_PATH,
  DEFAULT_ADMIN_REDIRECT_PATH,
  buildAdminLoginRedirectUrl,
  sanitizeAdminRedirectPath,
};

// 30 dias (alinhado ao cookie de sessão)
export const DEFAULT_ADMIN_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export const LOGIN_RATE_LIMIT_POLICY = {
  WINDOW_MS: 15 * 60 * 1000,
  LOCKOUT_MS: 15 * 60 * 1000,
  MAX_ATTEMPTS_PER_EMAIL: 5,
  MAX_ATTEMPTS_PER_IP: 15,
  STALE_RETENTION_MS: 24 * 60 * 60 * 1000,
} as const;

export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN_INACTIVE_USER: 'FORBIDDEN_INACTIVE_USER',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export const GENERIC_INVALID_CREDENTIALS_MESSAGE = 'E-mail ou senha inválidos.' as const;
export const RATE_LIMITED_LOGIN_MESSAGE =
  'Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.' as const;

export const loginRequestSchema = z
  .object({
    email: z
      .string({ error: 'Informe o e-mail.' })
      .trim()
      .toLowerCase()
      .min(1, 'Informe o e-mail.')
      .max(255, 'O e-mail deve conter no máximo 255 caracteres.')
      .email('Informe um e-mail válido.'),
    password: z
      .string({ error: 'Informe a senha.' })
      .min(1, 'Informe a senha.')
      .max(128, 'A senha deve conter no máximo 128 caracteres.'),
  })
  .strict();

export const adminPublicUserSchema = z
  .object({
    id: z.number().int().positive(),
    nome: z.string().min(1).max(255),
    email: z.string().email().max(255),
  })
  .strict();

export const authSessionMetaSchema = z
  .object({
    expiresAt: z.string().datetime(),
  })
  .strict();

export const authSessionResponseSchema = z
  .object({
    user: adminPublicUserSchema,
    session: authSessionMetaSchema,
  })
  .strict();

export const loginResponseSchema = authSessionResponseSchema;
export const authMeResponseSchema = authSessionResponseSchema;

export type LoginRequestDto = z.infer<typeof loginRequestSchema>;
export type AdminPublicUserDto = z.infer<typeof adminPublicUserSchema>;
export type AuthSessionMetaDto = z.infer<typeof authSessionMetaSchema>;
export type AuthSessionResponseDto = z.infer<typeof authSessionResponseSchema>;
export type LoginResponseDto = AuthSessionResponseDto;
export type AuthMeResponseDto = AuthSessionResponseDto;

export function toAdminPublicUserDto(row: {
  readonly id: number;
  readonly nome: string;
  readonly email: string;
}): AdminPublicUserDto {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
  };
}
