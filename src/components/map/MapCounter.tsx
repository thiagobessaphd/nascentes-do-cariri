'use client';

/**
 * Nascentes do Cariri — Componente Acessível de Contagem e Legenda do Mapa (MapCounter)
 * Exibe o total de nascentes visíveis e filtradas com suporte semântico WAI-ARIA,
 * exibição uniforme de contagem numérica em todos os estados e isolamento de eventos do Leaflet.
 */

import type { SyntheticEvent } from 'react';
import styles from './MapCounter.module.css';

export interface MapCounterProps {
  readonly count: number;
  readonly total?: number | undefined;
  readonly hasActiveFilters?: boolean | undefined;
  readonly isLoading?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Impede que cliques, toques ou eventos de rolagem sobre o contador
 * propaguem para o canvas do Leaflet subjacente.
 */
function stopMapEventPropagation(event: SyntheticEvent): void {
  event.stopPropagation();
}

/**
 * Gera a descrição em texto puro do contador para leitores de tela e acessibilidade.
 */
export function formatCounterAccessibleText(
  count: number,
  total?: number,
  hasActiveFilters: boolean = false,
  isLoading: boolean = false
): string {
  if (isLoading && count <= 0 && total === undefined) {
    return 'Carregando nascentes no mapa...';
  }

  if (hasActiveFilters && typeof total === 'number' && total > 0) {
    const termNascente = total === 1 ? 'nascente' : 'nascentes';
    return `Exibindo ${count} de ${total} ${termNascente} com filtros aplicados.`;
  }

  if (hasActiveFilters) {
    const termNascente = count === 1 ? 'nascente' : 'nascentes';
    return `${count} ${termNascente} exibidas com filtros aplicados.`;
  }

  if (count === 1) {
    return '1 nascente exibida no mapa do Cariri.';
  }

  return `${count} nascentes exibidas no mapa do Cariri.`;
}

export default function MapCounter({
  count,
  total,
  hasActiveFilters = false,
  isLoading = false,
  className,
}: MapCounterProps) {
  const safeCount = Math.max(0, count);
  const isFilteredRatio =
    hasActiveFilters &&
    typeof total === 'number' &&
    total > 0;

  const accessibleText = formatCounterAccessibleText(
    safeCount,
    total,
    hasActiveFilters,
    isLoading
  );

  const containerClasses = [
    styles.counterContainer,
    hasActiveFilters ? styles.counterFiltered : '',
    isLoading ? styles.counterLoading : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={accessibleText}
      className={containerClasses}
      onClick={stopMapEventPropagation}
      onDoubleClick={stopMapEventPropagation}
      onMouseDown={stopMapEventPropagation}
      onTouchStart={stopMapEventPropagation}
      onWheel={stopMapEventPropagation}
      data-testid="map-counter"
    >
      <span className={styles.counterIcon} aria-hidden="true">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      </span>

      <span className={styles.counterBody} aria-hidden="true">
        {isLoading && safeCount === 0 && total === undefined ? (
          <span className={styles.counterEmptyText}>Carregando...</span>
        ) : isFilteredRatio ? (
          <span className={styles.counterText}>
            <strong className={styles.countHighlight}>{safeCount}</strong>
            <span className={styles.ratioSeparator}>de</span>
            <span className={styles.totalNumber}>{total}</span>
            <span className={styles.nounText}>
              {total === 1 ? 'nascente' : 'nascentes'}
            </span>
          </span>
        ) : (
          <span className={styles.counterText}>
            <strong className={styles.countHighlight}>{safeCount}</strong>
            <span className={styles.nounText}>
              {hasActiveFilters
                ? safeCount === 1
                  ? 'nascente'
                  : 'nascentes'
                : safeCount === 1
                  ? 'nascente no Cariri'
                  : 'nascentes no Cariri'}
            </span>
          </span>
        )}
      </span>

      {hasActiveFilters && (
        <span
          className={styles.filteredBadge}
          title="Filtros de município ou busca ativos"
          aria-hidden="true"
        >
          Filtrado
        </span>
      )}
    </aside>
  );
}
