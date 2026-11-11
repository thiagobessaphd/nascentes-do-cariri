/**
 * Nascentes do Cariri — Guarda de Autenticação Administrativa (Admin Auth Guard)
 *
 * Responsável pela emissão e verificação de tokens de sessão administrativos
 * assinados com HMAC-SHA256 via AUTH_SECRET e pela autorização obrigatória
 * de acesso do usuário.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { env } from '@/config/env';
import { extractSessionToken } from '@/config/session-cookies';
import { AppError } from '@/lib/errors';

export interface AdminSessionPayload {
  readonly userId: number;
  readonly email: string;
  readonly role?: string | undefined;
  readonly exp: number;
  readonly iat: number;
}

export interface AdminUserSession {
  readonly id: number;
  readonly nome: string;
  readonly email: string;
  readonly ativo: boolean;
}

export interface RequireAdminSessionOptions {
  readonly prismaClient?: PrismaClient | undefined;
}

export interface CreateAdminSessionTokenParams {
  readonly userId: number;
  readonly email: string;
  readonly role?: string | undefined;
  readonly expiresInSeconds?: number | undefined;
}

const DEFAULT_SESSION_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 dias

/**
 * Codifica uma string em formato Base64URL seguro para cabeçalhos HTTP e URLs.
 */
function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Decodifica uma string Base64URL para UTF-8.
 */
function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Gera um token de sessão administrativo assinado com HMAC-SHA256 (RFC 7519 / JWT standard).
 */
export function createAdminSessionToken(params: CreateAdminSessionTokenParams): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (params.expiresInSeconds ?? DEFAULT_SESSION_EXPIRY_SECONDS);

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: AdminSessionPayload = {
    userId: params.userId,
    email: params.email,
    ...(params.role !== undefined ? { role: params.role } : {}),
    iat,
    exp,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', env.AUTH_SECRET)
    .update(message)
    .digest('base64url');

  return `${message}.${signature}`;
}

/**
 * Valida a integridade criptográfica e expiração de um token de sessão administrativo.
 * Retorna o payload decodificado se válido, ou null caso expirado, adulterado ou malformado.
 */
export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  if (typeof token !== 'string' || !token.trim()) {
    return null;
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return null;
  }

  const message = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac('sha256', env.AUTH_SECRET)
    .update(message)
    .digest('base64url');

  const sigBuffer = Buffer.from(encodedSignature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (
    sigBuffer.byteLength !== expectedSigBuffer.byteLength ||
    !timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    return null;
  }

  try {
    const payloadRaw = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;
    if (typeof payloadRaw !== 'object' || payloadRaw === null) {
      return null;
    }

    const payload = payloadRaw as Record<string, unknown>;
    const userId = Number(payload['userId']);
    const email = String(payload['email'] ?? '');
    const exp = Number(payload['exp']);
    const iat = Number(payload['iat']);

    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      !email ||
      !Number.isFinite(exp) ||
      !Number.isFinite(iat)
    ) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp <= nowSeconds) {
      return null;
    }

    return {
      userId,
      email,
      ...(typeof payload['role'] === 'string' ? { role: payload['role'] } : {}),
      exp,
      iat,
    };
  } catch {
    return null;
  }
}

/**
 * Extrai o token de autenticação de uma requisição HTTP a partir de:
 * 1. Cookie seguro de sessão (via extractSessionToken);
 * 2. Cabeçalho Authorization: Bearer <token>.
 */
export function extractAuthTokenFromRequest(
  request: Request | Headers | string | null | undefined
): string | null {
  if (!request) {
    return null;
  }

  // Caso seja uma string direta de cookie ou token
  if (typeof request === 'string') {
    const fromCookie = extractSessionToken(request);
    if (fromCookie) return fromCookie;
    if (request.startsWith('Bearer ')) {
      return request.slice(7).trim();
    }
    return request.trim();
  }

  const headers = request instanceof Headers ? request : request.headers;

  // Extração via Cookie
  const cookieHeader = headers.get('cookie');
  const tokenFromCookie = extractSessionToken(cookieHeader);
  if (tokenFromCookie) {
    return tokenFromCookie;
  }

  // Extração via Authorization: Bearer <token>
  const authHeader = headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

/**
 * Guarda de autenticação e autorização administrativa.
 *
 * Valida a sessão do administrador, verifica sua existência no banco de dados
 * e assegura que a conta está ativa.
 *
 * @throws AppError 401 caso a sessão seja ausente, inválida, expirada ou usuário não exista.
 * @throws AppError 403 caso a conta do administrador esteja inativa.
 */
export async function requireAdminSession(
  request: Request | Headers | string | null | undefined,
  options?: RequireAdminSessionOptions
): Promise<AdminUserSession> {
  const token = extractAuthTokenFromRequest(request);

  if (!token) {
    throw new AppError(
      'Acesso não autorizado: sessão de administrador ausente.',
      401,
      'UNAUTHORIZED'
    );
  }

  const payload = verifyAdminSessionToken(token);

  if (!payload) {
    throw new AppError(
      'Acesso não autorizado: sessão de administrador inválida ou expirada.',
      401,
      'UNAUTHORIZED'
    );
  }

  const prisma = options?.prismaClient ?? defaultPrisma;

  const user = await prisma.usuario.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      nome: true,
      email: true,
      ativo: true,
    },
  });

  if (!user) {
    throw new AppError(
      'Acesso não autorizado: usuário administrador não encontrado.',
      401,
      'USER_NOT_FOUND'
    );
  }

  if (!user.ativo) {
    throw new AppError(
      'Acesso proibido: conta de administrador inativa.',
      403,
      'FORBIDDEN_INACTIVE_USER'
    );
  }

  return user;
}

