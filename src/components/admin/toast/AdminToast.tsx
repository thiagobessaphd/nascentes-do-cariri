'use client';

/**
 * Nascentes do Cariri — Toast Discreto e Acessível (WCAG 2.1 AA)
 *
 * Usado exclusivamente em confirmações finais positivas (ex.: login concluído e logout
 * intencional), evitando empurrar o conteúdo principal com novos banners estáticos.
 * Avisos involuntários críticos (sessão expirada / erro ao sair) permanecem em banners fixos.
 */

import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react';
import styles from './AdminToast.module.css';

export const DEFAULT_ADMIN_TOAST_DURATION_MS = 3_500 as const;
export const ADMIN_TOAST_EXIT_DURATION_MS = 200 as const;

export type AdminToastTone = 'success' | 'info';

export interface AdminToastViewProps {
  readonly tone: AdminToastTone;
  readonly title: string;
  readonly message: string;
  readonly onDismiss: () => void;
  readonly isExiting?: boolean | undefined;
  readonly dataReason?: string | undefined;
  readonly onPause?: (() => void) | undefined;
  readonly onResume?: (() => void) | undefined;
  readonly onBlurContainer?: ((event: FocusEvent<HTMLDivElement>) => void) | undefined;
}

/**
 * Camada de apresentação pura e acessível do Toast administrativo.
 */
export function AdminToastView({
  tone,
  title,
  message,
  onDismiss,
  isExiting = false,
  dataReason,
  onPause,
  onResume,
  onBlurContainer,
}: AdminToastViewProps) {
  const isSuccess = tone === 'success';

  return (
    <div className={styles.toastViewport}>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`${styles.toastCard} ${
          isSuccess ? styles.toastCardSuccess : styles.toastCardInfo
        }${isExiting ? ` ${styles.toastCardExit}` : ''}`}
        data-testid="admin-toast"
        data-tone={tone}
        data-reason={dataReason}
        data-exiting={isExiting ? 'true' : undefined}
        onMouseEnter={onPause}
        onMouseLeave={onResume}
        onFocus={onPause}
        onBlur={onBlurContainer}
      >
        <span
          className={`${styles.toastIcon} ${
            isSuccess ? styles.toastIconSuccess : styles.toastIconInfo
          }`}
          aria-hidden="true"
        >
          {isSuccess ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )}
        </span>

        <div className={styles.toastBody}>
          <p className={styles.toastTitle}>{title}</p>
          <p className={styles.toastMessage}>{message}</p>
        </div>

        <button
          type="button"
          className={styles.toastCloseButton}
          onClick={onDismiss}
          aria-label="Fechar notificação"
          data-testid="admin-toast-close"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export interface AdminToastProps {
  readonly open: boolean;
  readonly tone: AdminToastTone;
  readonly title: string;
  readonly message: string;
  readonly onDismiss: () => void;
  readonly durationMs?: number | undefined;
  readonly dataReason?: string | undefined;
}

export function AdminToast({
  open,
  tone,
  title,
  message,
  onDismiss,
  durationMs = DEFAULT_ADMIN_TOAST_DURATION_MS,
  dataReason,
}: AdminToastProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const remainingMsRef = useRef<number>(durationMs);
  const timerStartedAtRef = useRef<number>(0);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerDismiss = useCallback(() => {
    if (isExiting) {
      return;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      onDismiss();
      return;
    }

    setIsExiting(true);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      setIsExiting(false);
      onDismiss();
    }, ADMIN_TOAST_EXIT_DURATION_MS);
  }, [isExiting, onDismiss]);

  useEffect(() => {
    remainingMsRef.current = durationMs;
  }, [open, durationMs]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open || isExiting || durationMs <= 0 || isPaused) {
      return;
    }

    const timeoutDuration = Math.max(0, remainingMsRef.current);
    timerStartedAtRef.current = Date.now();

    const timerId = setTimeout(() => {
      remainingMsRef.current = 0;
      triggerDismiss();
    }, timeoutDuration);

    return () => {
      clearTimeout(timerId);
      if (timerStartedAtRef.current > 0) {
        const elapsed = Date.now() - timerStartedAtRef.current;
        remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed);
        timerStartedAtRef.current = 0;
      }
    };
  }, [open, isExiting, durationMs, isPaused, triggerDismiss]);

  if (!open && !isExiting) {
    return null;
  }

  return (
    <AdminToastView
      tone={tone}
      title={title}
      message={message}
      isExiting={isExiting}
      onDismiss={triggerDismiss}
      dataReason={dataReason}
      onPause={() => setIsPaused(true)}
      onResume={() => setIsPaused(false)}
      onBlurContainer={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsPaused(false);
        }
      }}
    />
  );
}
