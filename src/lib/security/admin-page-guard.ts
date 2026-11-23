/**
 * Nascentes do Cariri — Guarda de Sessão para Server Components (App Router)
 *
 * Isola o acoplamento com `next/headers` e `next/navigation` fora de `admin-guard.ts`,
 * garantindo que páginas administrativas protegidas validem a sessão persistida no
 * servidor (defesa em profundidade além do proxy) e redirecionem para `/admin/login`.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAMES } from '@/config/session-cookies';
import { AppError } from '@/lib/errors';
import {
  getOptionalAdminSession,
  requireAdminSession,
  type AdminUserSession,
  type RequireAdminSessionOptions,
} from './admin-guard';
import { buildAdminLoginRedirectUrl } from './admin-redirect';

export interface CookieReader {
  get(name: string): { readonly value: string } | undefined;
}

export interface GetOptionalAdminPageSessionOptions extends RequireAdminSessionOptions {
  readonly cookieStore?: CookieReader | undefined;
}

export interface RequireAdminPageSessionOptions extends GetOptionalAdminPageSessionOptions {
  readonly nextPath?: string | null | undefined;
}

/**
 * Extrai o token de sessão do cookie store do Next.js priorizando o cookie de produção (`__Host-`).
 */
export function extractSessionTokenFromCookieStore(cookieStore: CookieReader): string | null {
  const prodToken = cookieStore.get(SESSION_COOKIE_NAMES.PRODUCTION)?.value;
  if (prodToken && prodToken.trim().length > 0) {
    return prodToken;
  }

  const devToken = cookieStore.get(SESSION_COOKIE_NAMES.DEVELOPMENT)?.value;
  if (devToken && devToken.trim().length > 0) {
    return devToken;
  }

  return null;
}

/**
 * Exige sessão administrativa válida em um Server Component protegido.
 * Em falha de autenticação/autorização (401/403), redireciona para `/admin/login`.
 * Falhas inesperadas de infraestrutura são propagadas ao Error Boundary.
 */
export async function requireAdminPageSession(
  options?: RequireAdminPageSessionOptions
): Promise<AdminUserSession> {
  const cookieStore = options?.cookieStore ?? (await cookies());
  const token = extractSessionTokenFromCookieStore(cookieStore);

  try {
    return await requireAdminSession(token, {
      prismaClient: options?.prismaClient,
      now: options?.now,
    });
  } catch (error: unknown) {
    if (error instanceof AppError && (error.statusCode === 401 || error.statusCode === 403)) {
      return redirect(buildAdminLoginRedirectUrl(options?.nextPath));
    }
    throw error;
  }
}

/**
 * Variante não-bloqueante para Server Components que precisam apenas consultar se há
 * sessão administrativa válida no momento (ex.: redirecionar usuário já logado em `/admin/login`).
 */
export async function getOptionalAdminPageSession(
  options?: GetOptionalAdminPageSessionOptions
): Promise<AdminUserSession | null> {
  const cookieStore = options?.cookieStore ?? (await cookies());
  const token = extractSessionTokenFromCookieStore(cookieStore);

  return getOptionalAdminSession(token, {
    prismaClient: options?.prismaClient,
    now: options?.now,
  });
}
