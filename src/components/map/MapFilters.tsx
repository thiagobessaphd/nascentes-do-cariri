'use client';

/**
 * Nascentes do Cariri — Componente Acessível de Controles de Filtro do Mapa (MapFilters)
 * Permite filtrar nascentes por município (<select>), busca textual em fonte/localidade (<input type="search">)
 * e restaurar o conjunto inicial por meio de ação única ("Limpar filtros").
 */

import type { ChangeEvent, FormEvent, KeyboardEvent, SyntheticEvent } from 'react';
import {
  MAX_SEARCH_QUERY_LENGTH,
  hasActiveMapFilters,
} from './map-filters';
import styles from './MapFilters.module.css';

export interface MapFiltersProps {
  readonly municipio: string;
  readonly searchInput: string;
  readonly municipios: readonly string[];
  readonly isLoadingMunicipios?: boolean | undefined;
  readonly municipiosError?: string | null | undefined;
  readonly hasActiveFilters?: boolean | undefined;
  readonly onMunicipioChange: (municipio: string) => void;
  readonly onSearchInputChange: (searchInput: string) => void;
  readonly onClearFilters: () => void;
  readonly className?: string | undefined;
}

/**
 * Impede que eventos de clique, rolagem ou teclado nos controles de filtro
 * propaguem para o container do Leaflet subjacente.
 */
function stopMapEventPropagation(event: SyntheticEvent): void {
  event.stopPropagation();
}

export default function MapFilters({
  municipio,
  searchInput,
  municipios,
  isLoadingMunicipios = false,
  municipiosError = null,
  hasActiveFilters,
  onMunicipioChange,
  onSearchInputChange,
  onClearFilters,
  className,
}: MapFiltersProps) {
  const isFilterActive =
    hasActiveFilters ?? hasActiveMapFilters({ municipio, searchInput });

  const hasSelectedMunicipio = municipio.trim().length > 0;
  const hasSearchText = searchInput.trim().length > 0;

  // Garante que um município já selecionado continue visível no <select> mesmo durante carregamento
  const normalizedOptions = Array.from(
    new Set(
      municipios
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );

  if (hasSelectedMunicipio && !normalizedOptions.includes(municipio.trim())) {
    normalizedOptions.unshift(municipio.trim());
  }

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleMunicipioSelect = (event: ChangeEvent<HTMLSelectElement>): void => {
    onMunicipioChange(event.target.value);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onSearchInputChange(event.target.value);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape' && searchInput.length > 0) {
      event.preventDefault();
      onSearchInputChange('');
    }
  };

  const barClassNames = [
    styles.filterBar,
    isFilterActive ? styles.filterBarActive : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const selectClassNames = [
    styles.selectControl,
    hasSelectedMunicipio ? styles.controlActive : '',
  ]
    .filter(Boolean)
    .join(' ');

  const searchClassNames = [
    styles.searchControl,
    hasSearchText ? styles.controlActive : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <form
      role="search"
      aria-label="Filtros de nascentes no mapa"
      className={barClassNames}
      onSubmit={handleFormSubmit}
      onClick={stopMapEventPropagation}
      onDoubleClick={stopMapEventPropagation}
      onMouseDown={stopMapEventPropagation}
      onTouchStart={stopMapEventPropagation}
      onWheel={stopMapEventPropagation}
      onKeyDown={stopMapEventPropagation}
      data-testid="map-filters-form"
    >
      {/* Controle 1: Filtro por Município */}
      <div className={styles.filterField}>
        <label htmlFor="filtro-municipio" className={styles.filterLabel}>
          Município
        </label>
        <div className={styles.inputWrapper}>
          <span className={styles.fieldIcon} aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </span>
          <select
            id="filtro-municipio"
            name="municipio"
            value={municipio}
            onChange={handleMunicipioSelect}
            className={selectClassNames}
            aria-label="Filtrar por município"
            aria-busy={isLoadingMunicipios}
            data-testid="map-filter-municipio-select"
          >
            <option value="">
              {isLoadingMunicipios && normalizedOptions.length === 0
                ? 'Carregando municípios...'
                : 'Todos os municípios'}
            </option>
            {normalizedOptions.map((nomeMunicipio) => (
              <option key={nomeMunicipio} value={nomeMunicipio}>
                {nomeMunicipio}
              </option>
            ))}
          </select>
          <span className={styles.selectChevron} aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
        {municipiosError && (
          <span
            className={styles.municipiosErrorHint}
            role="status"
            aria-live="polite"
            data-testid="map-filter-municipios-error"
          >
            Lista de municípios indisponível
          </span>
        )}
      </div>

      {/* Controle 2: Busca Textual por Fonte ou Localidade */}
      <div className={styles.filterFieldSearch}>
        <label htmlFor="filtro-busca" className={styles.filterLabel}>
          Fonte ou localidade
        </label>
        <div className={styles.inputWrapper}>
          <span className={styles.fieldIcon} aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            id="filtro-busca"
            name="q"
            type="search"
            value={searchInput}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar por fonte ou localidade..."
            maxLength={MAX_SEARCH_QUERY_LENGTH}
            autoComplete="off"
            spellCheck={false}
            className={searchClassNames}
            aria-label="Buscar por fonte ou localidade"
            data-testid="map-filter-search-input"
          />
        </div>
      </div>

      {/* Controle 3: Ação Única para Limpar Filtros */}
      <button
        type="button"
        onClick={onClearFilters}
        disabled={!isFilterActive}
        className={styles.clearButton}
        aria-label="Limpar filtros"
        title="Limpar filtros aplicados"
        data-testid="map-filter-clear-button"
      >
        <span className={styles.clearButtonIcon} aria-hidden="true">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
        <span className={styles.clearButtonText}>Limpar filtros</span>
      </button>
    </form>
  );
}

