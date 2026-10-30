'use client';

/**
 * Nascentes do Cariri — Componente de Feedback Visual do Mapa (MapFeedback)
 * Renderiza estados de carregamento, erro com retry acessível e aviso de dataset vazio
 * com suporte a ação contextual de limpeza de filtros (US-8 / Task-16).
 */

import type { SyntheticEvent } from 'react';
import type { NascentesStatus } from '@/hooks/useNascentesPublicas';
import styles from './MapFeedback.module.css';

export interface MapFeedbackProps {
  readonly status: NascentesStatus;
  readonly error?: string | null | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly hasActiveFilters?: boolean | undefined;
  readonly onClearFilters?: (() => void) | undefined;
  readonly autoDismissSeconds?: number | undefined;
  readonly className?: string | undefined;
}

/**
 * Impede que cliques, toques ou eventos de rolagem sobre os cards de feedback
 * propaguem para o mapa Leaflet subjacente.
 */
function stopMapEventPropagation(event: SyntheticEvent): void {
  event.stopPropagation();
}

export default function MapFeedback({
  status,
  error,
  onRetry,
  hasActiveFilters = false,
  onClearFilters,
  className,
}: MapFeedbackProps) {
  if (status === 'loading') {
    const loadingCardClasses = [
      styles.feedbackCard,
      styles.feedbackLoading,
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        className={loadingCardClasses}
        role="status"
        aria-live="polite"
        onClick={stopMapEventPropagation}
        onMouseDown={stopMapEventPropagation}
        onTouchStart={stopMapEventPropagation}
        onWheel={stopMapEventPropagation}
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
    const errorCardClasses = [
      styles.feedbackCard,
      styles.feedbackError,
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        className={errorCardClasses}
        role="alert"
        aria-live="assertive"
        onClick={stopMapEventPropagation}
        onMouseDown={stopMapEventPropagation}
        onTouchStart={stopMapEventPropagation}
        onWheel={stopMapEventPropagation}
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

  if (status === 'empty') {
    const emptyCardClasses = [
      styles.feedbackCard,
      styles.feedbackEmpty,
      hasActiveFilters ? styles.feedbackEmptyFiltered : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    const emptyMessage = hasActiveFilters
      ? 'Nenhuma nascente encontrada para os filtros aplicados.'
      : 'Nenhuma nascente encontrada para esta região.';

    return (
      <div
        className={emptyCardClasses}
        role="status"
        aria-live="polite"
        onClick={stopMapEventPropagation}
        onMouseDown={stopMapEventPropagation}
        onTouchStart={stopMapEventPropagation}
        onWheel={stopMapEventPropagation}
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
        <span className={styles.feedbackMessage}>{emptyMessage}</span>

        {hasActiveFilters && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className={styles.feedbackClearButton}
            aria-label="Limpar filtros aplicados"
            data-testid="map-feedback-clear-filters-button"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span>Limpar filtros</span>
          </button>
        )}
      </div>
    );
  }

  return null;
}
