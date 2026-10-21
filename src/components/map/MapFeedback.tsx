'use client';

/**
 * Nascentes do Cariri — Componente de Feedback Visual do Mapa
 * Renderiza estados de carregamento, erro com retry acessível e aviso de dataset vazio.
 */

import { useEffect, useState } from 'react';
import type { NascentesStatus } from '@/hooks/useNascentesPublicas';
import styles from './map.module.css';

export interface MapFeedbackProps {
  readonly status: NascentesStatus;
  readonly error?: string | null | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly autoDismissSeconds?: number | undefined;
}

export default function MapFeedback({
  status,
  error,
  onRetry,
  autoDismissSeconds = 6,
}: MapFeedbackProps) {
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  const [prevStatus, setPrevStatus] = useState<NascentesStatus>(status);

  // Ajusta estado durante a renderização quando o status muda (padrão oficial React)
  if (prevStatus !== status) {
    setPrevStatus(status);
    setIsDismissed(false);
  }

  // Auto-dismiss do aviso de dataset vazio após tempo determinado
  useEffect(() => {
    if (status !== 'empty' || isDismissed || autoDismissSeconds <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setIsDismissed(true);
    }, autoDismissSeconds * 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [status, isDismissed, autoDismissSeconds]);

  if (status === 'loading') {
    return (
      <div
        className={`${styles.feedbackCard} ${styles.feedbackLoading}`}
        role="status"
        aria-live="polite"
        data-testid="map-feedback-loading"
      >
        <span className={styles.feedbackLoadingIcon} aria-hidden="true">
          <span className={styles.feedbackSpinner} />
        </span>
        <span className={styles.feedbackMessage}>Carregando nascentes...</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className={`${styles.feedbackCard} ${styles.feedbackError}`}
        role="alert"
        aria-live="assertive"
        data-testid="map-feedback-error"
      >
        <span className={styles.feedbackErrorIcon} aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
        <span className={styles.feedbackMessage}>
          {error ?? 'Não foi possível carregar as nascentes no momento.'}
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={styles.feedbackRetryButton}
            aria-label="Tentar carregar as nascentes novamente"
            data-testid="map-feedback-retry-button"
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (status === 'empty' && !isDismissed) {
    return (
      <div
        className={`${styles.feedbackCard} ${styles.feedbackEmpty}`}
        role="status"
        aria-live="polite"
        data-testid="map-feedback-empty"
      >
        <span className={styles.feedbackInfoIcon} aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </span>
        <span className={styles.feedbackMessage}>
          Nenhuma nascente encontrada para esta região.
        </span>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className={styles.feedbackDismissButton}
          aria-label="Fechar aviso de nenhuma nascente encontrada"
          title="Fechar aviso"
          data-testid="map-feedback-dismiss-button"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  return null;
}
