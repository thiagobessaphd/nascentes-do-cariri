'use client';

/**
 * Nascentes do Cariri — Guarda Client-Side de Sessão Administrativa
 *
 * Protege páginas autenticadas em `/admin/*` contra:
 * 1. Restauração de snapshot via BFCache (`pageshow` com `event.persisted`);
 * 2. Retorno à aba após expiração/revogação (`visibilitychange` / `focus` com throttle de 15s);
 * 3. Encerramento em outra aba (`BroadcastChannel('nascentes-admin-auth')`);
 * 4. Perda de sessão detectada em chamadas client-side (`401` / `403 FORBIDDEN_INACTIVE_USER`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ADMIN_LOGIN_REASONS,
  buildAdminLoginRedirectUrl,
} from '@/modules/auth/auth.contracts';
import { AuthClientError, fetchAdminSessionMe } from '@/services/auth.client';
import {
  consumeAdminLoginSuccessToast,
  subscribeAdminSessionBroadcast,
  subscribeAdminSessionEvents,
  terminateClientAdminSession,
} from '@/services/admin-session-events';
import { AdminToast } from '@/components/admin/toast';
import styles from './AdminSessionShell.module.css';

export const SESSION_REVALIDATION_THROTTLE_MS = 15_000 as const;

export type BfcacheCurtainState = 'idle' | 'checking' | 'error';

/**
 * Indica se já transcorreu o intervalo mínimo de throttle para revalidação em segundo plano.
 */
export function shouldRevalidateSessionOnFocus(
  lastCheckAtMs: number,
  nowMs: number,
  throttleMs: number = SESSION_REVALIDATION_THROTTLE_MS
): boolean {
  if (lastCheckAtMs <= 0) {
    return true;
  }

  return nowMs - lastCheckAtMs >= throttleMs;
}

/**
 * Identifica estritamente falhas autoritativas de sessão (`401` ou `403`),
 * impedindo falso logout diante de oscilações momentâneas de rede ou `5xx`.
 */
export function isConfirmedSessionAuthFailure(error: unknown): boolean {
  return (
    error instanceof AuthClientError &&
    (error.statusCode === 401 || error.statusCode === 403)
  );
}

export interface AdminBfcacheCurtainViewProps {
  readonly state: Exclude<BfcacheCurtainState, 'idle'>;
  readonly onRetry: () => void;
  readonly loginHref?: string | undefined;
}

/**
 * Cortina opaca sem spinner giratório exibida ao restaurar rota administrativa do BFCache.
 */
export function AdminBfcacheCurtainView({
  state,
  onRetry,
  loginHref = buildAdminLoginRedirectUrl(null, {
    reason: ADMIN_LOGIN_REASONS.SESSION_EXPIRED,
  }),
}: AdminBfcacheCurtainViewProps) {
  const isChecking = state === 'checking';

  return (
    <div
      className={styles.bfcacheCurtain}
      role={isChecking ? 'status' : 'alert'}
      aria-live={isChecking ? 'polite' : 'assertive'}
      aria-busy={isChecking ? 'true' : 'false'}
      data-testid="admin-bfcache-curtain"
    >
      <div className={styles.bfcacheCard}>
        <p className={styles.bfcacheTitle}>
          {isChecking
            ? 'Verificando sua sessão administrativa...'
            : 'Não foi possível confirmar sua sessão agora.'}
        </p>
        <p className={styles.bfcacheDescription}>
          {isChecking
            ? 'Aguarde um instante enquanto confirmamos o acesso com segurança.'
            : 'Houve uma falha de conexão ao revalidar sua sessão. Tente novamente ou faça login outra vez.'}
        </p>

        {!isChecking ? (
          <div className={styles.bfcacheActions}>
            <button
              type="button"
              className={styles.bfcachePrimaryButton}
              onClick={onRetry}
              data-testid="admin-bfcache-retry-button"
            >
              Tentar novamente
            </button>
            <a
              href={loginHref}
              className={styles.bfcacheSecondaryLink}
              data-testid="admin-bfcache-login-link"
            >
              Ir para o login
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminSessionGuard() {
  const [bfcacheState, setBfcacheState] = useState<BfcacheCurtainState>('idle');
  const [showLoginSuccessToast, setShowLoginSuccessToast] = useState(false);

  const lastCheckAtRef = useRef<number>(0);
  const revalidationInFlightRef = useRef<boolean>(false);
  const bfcacheStateRef = useRef<BfcacheCurtainState>('idle');

  useEffect(() => {
    bfcacheStateRef.current = bfcacheState;
  }, [bfcacheState]);

  const revalidateSession = useCallback(async (mode: 'bfcache' | 'background'): Promise<void> => {
    if (revalidationInFlightRef.current) {
      return;
    }

    revalidationInFlightRef.current = true;
    if (mode === 'bfcache') {
      setBfcacheState('checking');
    }

    try {
      await fetchAdminSessionMe();
      lastCheckAtRef.current = Date.now();
      if (mode === 'bfcache') {
        setBfcacheState('idle');
      }
    } catch (error: unknown) {
      if (isConfirmedSessionAuthFailure(error)) {
        terminateClientAdminSession(ADMIN_LOGIN_REASONS.SESSION_EXPIRED);
        return;
      }

      if (mode === 'bfcache') {
        setBfcacheState('error');
      }
    } finally {
      revalidationInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    lastCheckAtRef.current = Date.now();
    const loginToastTimerId = window.setTimeout(() => {
      if (consumeAdminLoginSuccessToast()) {
        setShowLoginSuccessToast(true);
      }
    }, 0);

    const unsubscribeLocal = subscribeAdminSessionEvents((event) => {
      terminateClientAdminSession(event.type, { broadcast: true });
    });

    const unsubscribeBroadcast = subscribeAdminSessionBroadcast((event) => {
      terminateClientAdminSession(event.type, { broadcast: false });
    });

    const handlePageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) {
        void revalidateSession('bfcache');
      }
    };

    const handleVisibilityOrFocus = (): void => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (bfcacheStateRef.current !== 'idle') {
        return;
      }

      const nowMs = Date.now();
      if (!shouldRevalidateSessionOnFocus(lastCheckAtRef.current, nowMs)) {
        return;
      }

      lastCheckAtRef.current = nowMs;
      void revalidateSession('background');
    };

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.clearTimeout(loginToastTimerId);
      unsubscribeLocal();
      unsubscribeBroadcast();
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [revalidateSession]);

  return (
    <>
      <AdminToast
        open={showLoginSuccessToast && bfcacheState === 'idle'}
        tone="success"
        title="Login realizado"
        message="Seja bem-vindo à área administrativa"
        dataReason="login"
        onDismiss={() => setShowLoginSuccessToast(false)}
      />

      {bfcacheState !== 'idle' ? (
        <AdminBfcacheCurtainView
          state={bfcacheState}
          onRetry={() => {
            void revalidateSession('bfcache');
          }}
        />
      ) : null}
    </>
  );
}
