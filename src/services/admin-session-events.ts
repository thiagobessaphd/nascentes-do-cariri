/**
 * Nascentes do Cariri — Barramento de Eventos, Multi-Aba e Limpeza de Sessão Administrativa
 *
 * Isola BroadcastChannel, limpeza de estado transitório em sessionStorage,
 * trava single-flight e redirecionamento hard para `/admin/login`, mantendo
 * `auth.client.ts` completamente livre de Web Storage.
 */

import {
  ADMIN_LOGIN_REASONS,
  buildAdminLoginRedirectUrl,
  resolveAdminLoginReason,
  type AdminLoginReason,
} from '@/modules/auth/auth.contracts';

export const ADMIN_SESSION_CHANNEL_NAME = 'nascentes-admin-auth' as const;

export const IMPORTACAO_PREVIEW_STORAGE_KEY =
  'nascentes_cariri:admin_importacao_preview_v1' as const;

export const LOGIN_SUCCESS_TOAST_STORAGE_KEY =
  'nascentes_cariri:admin_login_success_toast_v1' as const;

export const LOGIN_SUCCESS_TOAST_MAX_AGE_MS = 60_000 as const;

export type AdminSessionTerminationReason = AdminLoginReason;

export interface AdminSessionEvent {
  readonly type: AdminSessionTerminationReason;
}

export type AdminSessionEventListener = (event: AdminSessionEvent) => void;

export interface TerminateClientAdminSessionOptions {
  readonly currentPath?: string | null | undefined;
  readonly broadcast?: boolean | undefined;
  readonly navigate?: ((destinationUrl: string) => void) | undefined;
}

const localListeners = new Set<AdminSessionEventListener>();
let terminationInFlight = false;

function getBrowserSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Remove a prévia salva da sessão do navegador (`sessionStorage`).
 */
export function clearPreviewSession(): void {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(IMPORTACAO_PREVIEW_STORAGE_KEY);
    storage.removeItem(LOGIN_SUCCESS_TOAST_STORAGE_KEY);
  } catch {
    // Ignora falhas de acesso ao storage em ambientes restritos
  }
}

/**
 * Sinaliza em sessionStorage (com validade curta de 60s) que o administrador acabou
 * de autenticar-se, permitindo exibir o toast de sucesso após o redirect para `/admin`.
 */
export function markAdminLoginSuccessToast(nowMs: number = Date.now()): void {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LOGIN_SUCCESS_TOAST_STORAGE_KEY, String(nowMs));
  } catch {
    // Ignora falhas de acesso ao storage em ambientes restritos
  }
}

/**
 * Consome de forma única e atômica o sinal de login recém-realizado.
 */
export function consumeAdminLoginSuccessToast(
  nowMs: number = Date.now(),
  maxAgeMs: number = LOGIN_SUCCESS_TOAST_MAX_AGE_MS
): boolean {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return false;
  }

  try {
    const rawValue = storage.getItem(LOGIN_SUCCESS_TOAST_STORAGE_KEY);
    if (!rawValue) {
      return false;
    }

    storage.removeItem(LOGIN_SUCCESS_TOAST_STORAGE_KEY);
    const markedAtMs = Number(rawValue);
    if (!Number.isFinite(markedAtMs) || markedAtMs <= 0) {
      return false;
    }

    return nowMs >= markedAtMs && nowMs - markedAtMs <= maxAgeMs;
  } catch {
    return false;
  }
}

/**
 * Inscreve um listener local para eventos de encerramento/expiração de sessão.
 */
export function subscribeAdminSessionEvents(
  listener: AdminSessionEventListener
): () => void {
  localListeners.add(listener);
  return () => {
    localListeners.delete(listener);
  };
}

/**
 * Emite evento local de sessão expirada ou conta administrativa inativa.
 * Seguro em SSR/Node (torna-se no-op quando não há assinantes montados).
 */
export function notifyAdminSessionExpired(): void {
  const event: AdminSessionEvent = {
    type: ADMIN_LOGIN_REASONS.SESSION_EXPIRED,
  };

  for (const listener of Array.from(localListeners)) {
    try {
      listener(event);
    } catch {
      // Falha em um listener não pode impedir os demais guardas de reagirem
    }
  }
}

/**
 * Propaga evento de encerramento de sessão para outras abas abertas da mesma origem.
 */
export function broadcastAdminSessionEvent(
  reason: AdminSessionTerminationReason
): void {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(ADMIN_SESSION_CHANNEL_NAME);
    const payload: AdminSessionEvent = { type: reason };
    channel.postMessage(payload);
  } catch {
    // Contextos sem suporte ou bloqueados para BroadcastChannel
  } finally {
    try {
      channel?.close();
    } catch {
      // Ignora erro ao fechar canal temporário
    }
  }
}

/**
 * Assina eventos de encerramento enviados por outras abas via BroadcastChannel.
 */
export function subscribeAdminSessionBroadcast(
  listener: AdminSessionEventListener
): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => {};
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(ADMIN_SESSION_CHANNEL_NAME);
  } catch {
    return () => {};
  }

  const handleMessage = (messageEvent: MessageEvent<unknown>): void => {
    const data = messageEvent.data;
    if (typeof data !== 'object' || data === null || !('type' in data)) {
      return;
    }

    const validReason = resolveAdminLoginReason(
      (data as { readonly type?: unknown }).type
    );
    if (!validReason) {
      return;
    }

    listener({ type: validReason });
  };

  channel.addEventListener('message', handleMessage);

  return () => {
    try {
      channel?.removeEventListener('message', handleMessage);
      channel?.close();
    } catch {
      // Ignora erro ao encerrar assinatura
    }
  };
}

function resolveCurrentBrowserPath(): string | null {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }

  const pathname = window.location.pathname ?? '';
  const search = window.location.search ?? '';
  return pathname ? `${pathname}${search}` : null;
}

/**
 * Encerra o estado administrativo no navegador de forma idempotente (single-flight):
 * limpa a prévia em `sessionStorage`, propaga via `BroadcastChannel` (opcional)
 * e executa navegação hard (`window.location.replace`) para destruir caches em memória.
 *
 * Retorna a URL de destino ou `null` caso outro encerramento já esteja em curso.
 */
export function terminateClientAdminSession(
  reason: AdminSessionTerminationReason,
  options?: TerminateClientAdminSessionOptions
): string | null {
  if (terminationInFlight) {
    return null;
  }

  terminationInFlight = true;

  clearPreviewSession();

  if (options?.broadcast !== false) {
    broadcastAdminSessionEvent(reason);
  }

  const nextPath =
    reason === ADMIN_LOGIN_REASONS.LOGOUT
      ? null
      : (options?.currentPath ?? resolveCurrentBrowserPath());

  const destinationUrl = buildAdminLoginRedirectUrl(nextPath, { reason });

  if (options?.navigate) {
    options.navigate(destinationUrl);
  } else if (
    typeof window !== 'undefined' &&
    window.location &&
    typeof window.location.replace === 'function'
  ) {
    window.location.replace(destinationUrl);
  }

  return destinationUrl;
}

/**
 * Utilitário para resetar a trava single-flight e listeners entre testes automatizados.
 */
export function resetAdminSessionEventsState(): void {
  terminationInFlight = false;
  localListeners.clear();
}
