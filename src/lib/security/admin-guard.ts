/**
 * Nascentes do Cariri — Guarda de Autenticação Administrativa (Admin Auth Guard)
 *
 * Responsável pela emissão e verificação criptográfica (HMAC-SHA256) de tokens de
 * sessão administrativos vinculados a um registro persistido na tabela `sessoes`,
 * garantindo revogação server-side, controle de expiração e bloqueio de contas inativas.
 */

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { env } from '@/config/env';
import { extractSessionToken } from '@/config/session-cookies';
import { AppError } from '@/lib/errors';

export interface AdminSessionPayload {
  readonly sid: string;
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
  readonly sessionId: number;
  readonly sessionExpiresAt: Date;
}

export interface RequireAdminSessionOptions {
  readonly prismaClient?: PrismaClient | undefined;
  readonly now?: Date | undefined;
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
 * Gera um identificador único de sessão (UUID v4).
 */
export function generateSessionId(): string {
  return randomUUID();
}

/**
 * Type guard estrito para validar se um valor é um UUID v4 de sessão.
 */
export function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_UUID_V4_REGEX.test(value);
}

/**
 * Calcula o hash SHA-256 (64 caracteres hexadecimais) de um identificador de sessão
 * para armazenamento seguro na coluna `sessoes.token_hash`.
 */
export function hashSessionId(sid: string): string {
  if (!isValidSessionId(sid)) {
    throw new Error('Identificador de sessão inválido: esperado UUID v4.');
  }
  return createHash('sha256').update(sid, 'utf8').digest('hex');
}

/**
 * Gera um token de sessão administrativo assinado com HMAC-SHA256 (RFC 7519 / JWT standard)
 * contendo obrigatoriamente o identificador único `sid`.
 */
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

/**
 * Valida a integridade criptográfica, estrutura, `sid` e expiração de um token de sessão.
 * Retorna o payload decodificado se válido, ou null caso expirado, adulterado, sem `sid` ou malformado.
 */
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
 * Guarda autoritativa de autenticação e autorização administrativa.
 *
 * Valida a assinatura HMAC-SHA256 do token e executa uma única consulta indexada
 * na tabela `sessoes` associada ao `usuario`, verificando existência, vínculo de
 * autoria, ausência de revogação, expiração e conta ativa.
 *
 * @throws AppError 401 caso a sessão seja ausente, inválida, revogada ou expirada.
 * @throws AppError 403 caso a conta do administrador esteja inativa.
 */
export async function requireAdminSession(
  request: Request | Headers | string | null | undefined,
  options?: RequireAdminSessionOptions
): Promise<AdminUserSession> {
  const now = options?.now ?? new Date();
  const token = extractAuthTokenFromRequest(request);

  if (!token) {
    throw new AppError(
      'Acesso não autorizado: sessão de administrador ausente.',
      401,
      'UNAUTHORIZED'
    );
  }

  const payload = verifyAdminSessionToken(token, now);

  if (!payload) {
    throw new AppError(
      'Acesso não autorizado: sessão de administrador inválida ou expirada.',
      401,
      'UNAUTHORIZED'
    );
  }

  const prisma = options?.prismaClient ?? defaultPrisma;

  const sessionRecord = await prisma.sessao.findUnique({
    where: { tokenHash: hashSessionId(payload.sid) },
    select: {
      id: true,
      usuarioId: true,
      expiresAt: true,
      revokedAt: true,
      usuario: {
        select: {
          id: true,
          nome: true,
          email: true,
          ativo: true,
        },
      },
    },
  });

  if (!sessionRecord) {
    throw new AppError(
      'Acesso não autorizado: sessão administrativa não encontrada ou encerrada.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (
    sessionRecord.usuarioId !== payload.userId ||
    sessionRecord.usuario.id !== payload.userId
  ) {
    throw new AppError(
      'Acesso não autorizado: sessão incompatível com o usuário autenticado.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (sessionRecord.revokedAt !== null) {
    throw new AppError(
      'Acesso não autorizado: sessão administrativa revogada.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (sessionRecord.expiresAt.getTime() <= now.getTime()) {
    throw new AppError(
      'Acesso não autorizado: sessão administrativa expirada.',
      401,
      'UNAUTHORIZED'
    );
  }

  if (!sessionRecord.usuario.ativo) {
    throw new AppError(
      'Acesso proibido: conta de administrador inativa.',
      403,
      'FORBIDDEN_INACTIVE_USER'
    );
  }

  return {
    id: sessionRecord.usuario.id,
    nome: sessionRecord.usuario.nome,
    email: sessionRecord.usuario.email,
    ativo: sessionRecord.usuario.ativo,
    sessionId: sessionRecord.id,
    sessionExpiresAt: sessionRecord.expiresAt,
  };
}

/**
 * Variante não-bloqueante de verificação de sessão administrativa para uso em
 * contextos que precisam apenas identificar o usuário conectado (ou null).
 */
export async function getOptionalAdminSession(
  request: Request | Headers | string | null | undefined,
  options?: RequireAdminSessionOptions
): Promise<AdminUserSession | null> {
  const token = extractAuthTokenFromRequest(request);
  if (!token) {
    return null;
  }

  try {
    return await requireAdminSession(token, options);
  } catch (error: unknown) {
    if (error instanceof AppError && (error.statusCode === 401 || error.statusCode === 403)) {
      return null;
    }
    throw error;
  }
}
