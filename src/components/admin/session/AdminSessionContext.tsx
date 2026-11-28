'use client';

/**
 * Nascentes do Cariri — Contexto de Sessão do Shell Administrativo
 *
 * Coordena o estado de logout (botão no cabeçalho + alerta de falha abaixo do header)
 * sem obrigar o Server Layout inteiro a virar Client Component.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { ADMIN_LOGIN_REASONS } from '@/modules/auth/auth.contracts';
import { AuthClientError, logoutAdmin } from '@/services/auth.client';
import { terminateClientAdminSession } from '@/services/admin-session-events';
import styles from './AdminSessionShell.module.css';

export const DEFAULT_LOGOUT_FAILURE_MESSAGE =
  'Não foi possível encerrar sua sessão agora. Verifique a conexão e tente novamente.' as const;

export interface AdminSessionContextValue {
  readonly isLoggingOut: boolean;
  readonly logoutError: string | null;
  readonly logoutErrorTick: number;
  readonly triggerLogout: () => Promise<void>;
  readonly clearLogoutError: () => void;
}

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export interface AdminSessionProviderProps {
  readonly children: ReactNode;
}

export function AdminSessionProvider({ children }: AdminSessionProviderProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutErrorTick, setLogoutErrorTick] = useState(0);

  const inFlightRef = useRef(false);

  const clearLogoutError = useCallback(() => {
    setLogoutError(null);
  }, []);

  const triggerLogout = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      await logoutAdmin();
      terminateClientAdminSession(ADMIN_LOGIN_REASONS.LOGOUT);
    } catch (error: unknown) {
      const safeMessage =
        error instanceof AuthClientError && error.message.trim().length > 0
          ? error.message
          : DEFAULT_LOGOUT_FAILURE_MESSAGE;

      inFlightRef.current = false;
      setIsLoggingOut(false);
      setLogoutError(safeMessage);
      setLogoutErrorTick((prev) => prev + 1);
    }
  }, []);

  return (
    <AdminSessionContext.Provider
      value={{
        isLoggingOut,
        logoutError,
        logoutErrorTick,
        triggerLogout,
        clearLogoutError,
      }}
    >
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSessionContext(): AdminSessionContextValue | null {
  return useContext(AdminSessionContext);
}

export interface AdminLogoutErrorBannerViewProps {
  readonly message: string;
  readonly onDismiss: () => void;
  readonly alertRef?: RefObject<HTMLDivElement | null> | undefined;
}

/**
 * Apresentação pura e acessível da faixa de erro de logout posicionada abaixo do header.
 */
export function AdminLogoutErrorBannerView({
  message,
  onDismiss,
  alertRef,
}: AdminLogoutErrorBannerViewProps) {
  return (
    <div className={styles.logoutAlertWrapper} data-testid="admin-logout-error-wrapper">
      <div
        ref={alertRef}
        role="alert"
        aria-live="assertive"
        tabIndex={-1}
        className={styles.logoutAlertContainer}
        data-testid="admin-logout-error-alert"
      >
        <div className={styles.logoutAlertBody}>
          <span className={styles.logoutAlertIcon} aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <p className={styles.logoutAlertMessage}>{message}</p>
        </div>

        <button
          type="button"
          className={styles.logoutAlertDismiss}
          onClick={onDismiss}
          aria-label="Fechar aviso de erro ao sair"
          data-testid="admin-logout-error-dismiss"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

export function AdminLogoutErrorBanner() {
  const ctx = useAdminSessionContext();
  const alertRef = useRef<HTMLDivElement | null>(null);

  const errorMessage = ctx?.logoutError ?? null;
  const errorTick = ctx?.logoutErrorTick ?? 0;

  useEffect(() => {
    if (errorMessage !== null && errorTick > 0) {
      alertRef.current?.focus();
    }
  }, [errorMessage, errorTick]);

  if (!ctx || !errorMessage) {
    return null;
  }

  return (
    <AdminLogoutErrorBannerView
      message={errorMessage}
      onDismiss={ctx.clearLogoutError}
      alertRef={alertRef}
    />
  );
}
