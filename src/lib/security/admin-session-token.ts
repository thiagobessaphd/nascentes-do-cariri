/**
 * Nascentes do Cariri — Emissão e Verificação de Tokens de Sessão Administrativa
 *
 * Operações criptográficas HMAC-SHA256 puras (sem dependências de Prisma ou Next.js),
 * compartilhadas entre `src/proxy.ts` e `src/lib/security/admin-guard.ts`.
 */

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';
import { extractSessionToken } from '@/config/session-cookies';

export interface AdminSessionPayload {
  readonly sid: string;
  readonly userId: number;
  readonly email: string;
  readonly role?: string | undefined;
  readonly exp: number;
  readonly iat: number;
}

export interface CreateAdminSessionTokenParams {
  readonly sid?: string | undefined;
  readonly userId: number;
  readonly email: string;
  readonly role?: string | undefined;
  readonly expiresInSeconds?: number | undefined;
}

const DEFAULT_SESSION_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 dias
const SESSION_ID_UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export function generateSessionId(): string {
  return randomUUID();
}

export function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_UUID_V4_REGEX.test(value);
}

export function hashSessionId(sid: string): string {
  if (!isValidSessionId(sid)) {
    throw new Error('Identificador de sessão inválido: esperado UUID v4.');
  }
  return createHash('sha256').update(sid, 'utf8').digest('hex');
}

export function createAdminSessionToken(params: CreateAdminSessionTokenParams): string {
  const sid = params.sid ?? generateSessionId();
  if (!isValidSessionId(sid)) {
    throw new Error('O identificador de sessão (sid) deve ser um UUID v4 válido.');
  }

  if (!Number.isSafeInteger(params.userId) || params.userId <= 0) {
    throw new Error('userId deve ser um inteiro positivo.');
  }

  const normalizedEmail = params.email.trim();
  if (!normalizedEmail) {
    throw new Error('email é obrigatório para emitir token administrativo.');
  }

  const expiresInSeconds = params.expiresInSeconds ?? DEFAULT_SESSION_EXPIRY_SECONDS;
  if (!Number.isFinite(expiresInSeconds)) {
    throw new Error('expiresInSeconds deve ser um número finito.');
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + Math.trunc(expiresInSeconds);

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: AdminSessionPayload = {
    sid,
    userId: params.userId,
    email: normalizedEmail,
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

export function verifyAdminSessionToken(
  token: string,
  now?: Date
): AdminSessionPayload | null {
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
    const headerRaw = JSON.parse(base64UrlDecode(encodedHeader)) as unknown;
    if (!isPlainRecord(headerRaw)) {
      return null;
    }

    if (headerRaw['alg'] !== 'HS256' || headerRaw['typ'] !== 'JWT') {
      return null;
    }

    const payloadRaw = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;
    if (!isPlainRecord(payloadRaw)) {
      return null;
    }

    const sid = payloadRaw['sid'];
    const userId = payloadRaw['userId'];
    const email = payloadRaw['email'];
    const exp = payloadRaw['exp'];
    const iat = payloadRaw['iat'];

    if (
      !isValidSessionId(sid) ||
      typeof userId !== 'number' ||
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      typeof email !== 'string' ||
      !email.trim() ||
      typeof exp !== 'number' ||
      !Number.isSafeInteger(exp) ||
      typeof iat !== 'number' ||
      !Number.isSafeInteger(iat)
    ) {
      return null;
    }

    const referenceTime = now ?? new Date();
    const nowSeconds = Math.floor(referenceTime.getTime() / 1000);
    if (exp <= nowSeconds) {
      return null;
    }

    const roleValue = payloadRaw['role'];
    if (roleValue !== undefined && typeof roleValue !== 'string') {
      return null;
    }

    return {
      sid,
      userId,
      email,
      ...(typeof roleValue === 'string' ? { role: roleValue } : {}),
      exp,
      iat,
    };
  } catch {
    return null;
  }
}

export function extractAuthTokenFromRequest(
  request: Request | Headers | string | null | undefined
): string | null {
  if (!request) {
    return null;
  }

  if (typeof request === 'string') {
    const fromCookie = extractSessionToken(request);
    if (fromCookie) return fromCookie;
    if (request.startsWith('Bearer ')) {
      return request.slice(7).trim();
    }
    return request.trim();
  }

  const headers = request instanceof Headers ? request : request.headers;

  const cookieHeader = headers.get('cookie');
  const tokenFromCookie = extractSessionToken(cookieHeader);
  if (tokenFromCookie) {
    return tokenFromCookie;
  }

  const authHeader = headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}
