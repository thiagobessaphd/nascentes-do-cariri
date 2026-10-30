'use client';

/**
 * Nascentes do Cariri — Componente Acessível de Contagem e Legenda do Mapa (MapCounter)
 * Exibe o total de nascentes visíveis e filtradas, com semântica WCAG 2.1 AA (role="status" e aria-live="polite"),
 * diferenciação entre total geral e filtrado e isolamento de eventos do Leaflet.
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
  hasActiveFilters: boolean = false
): string {
  if (count <= 0) {
    return hasActiveFilters
      ? 'Nenhuma nascente encontrada para os filtros aplicados.'
      : 'Nenhuma nascente cadastrada nesta região.';
  }

  if (hasActiveFilters && typeof total === 'number' && total > count) {
    const termNascente = count === 1 ? 'nascente' : 'nascentes';
    return `Exibindo ${count} de ${total} ${termNascente} com filtros aplicados.`;
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
    hasActiveFilters && typeof total === 'number' && total > safeCount && safeCount > 0;

  const accessibleText = formatCounterAccessibleText(
    safeCount,
    total,
    hasActiveFilters
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
        {safeCount === 0 ? (
          <span className={styles.counterEmptyText}>
            {hasActiveFilters ? 'Nenhuma nascente encontrada' : 'Nenhuma nascente'}
          </span>
        ) : isFilteredRatio ? (
          <span className={styles.counterText}>
            <strong className={styles.countHighlight}>{safeCount}</strong>
            <span className={styles.ratioSeparator}>de</span>
            <span className={styles.totalNumber}>{total}</span>
            <span className={styles.nounText}>
              {safeCount === 1 ? 'nascente' : 'nascentes'}
            </span>
          </span>
        ) : (
          <span className={styles.counterText}>
            <strong className={styles.countHighlight}>{safeCount}</strong>
            <span className={styles.nounText}>
              {safeCount === 1 ? 'nascente no Cariri' : 'nascentes no Cariri'}
            </span>
          </span>
        )}
      </span>

      {hasActiveFilters && safeCount > 0 && (
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

