'use client';

/**
 * Nascentes do Cariri — Componente Acessível de Controles de Filtro do Mapa (MapFilters)
 * Permite filtrar nascentes por município (dropdown customizado acessível WAI-ARIA Listbox),
 * busca textual em fonte/localidade (<input type="search">)
 * e restaurar o conjunto inicial por meio de ação única ("Limpar filtros").
 */

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
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

interface MunicipioOption {
  readonly value: string;
  readonly label: string;
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
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLUListElement | null>(null);

  const isFilterActive =
    hasActiveFilters ?? hasActiveMapFilters({ municipio, searchInput });

  const hasSelectedMunicipio = municipio.trim().length > 0;
  const hasSearchText = searchInput.trim().length > 0;

  // Garante que um município já selecionado continue visível na lista mesmo durante carregamento
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

  const defaultOptionLabel =
    isLoadingMunicipios && normalizedOptions.length === 0
      ? 'Carregando municípios...'
      : 'Todos os municípios';

  const allOptions: readonly MunicipioOption[] = [
    { value: '', label: defaultOptionLabel },
    ...normalizedOptions.map((nomeMunicipio) => ({
      value: nomeMunicipio,
      label: nomeMunicipio,
    })),
  ];

  const selectedOptionIndex = Math.max(
    0,
    allOptions.findIndex((opt) => opt.value === municipio.trim())
  );

  const selectedDisplayLabel =
    allOptions[selectedOptionIndex]?.label ?? defaultOptionLabel;

  // Fecha o menu de opções ao clicar/tocar fora do componente
  useEffect(() => {
    if (!isDropdownOpen) {
      return;
    }

    function handleOutsidePointer(event: MouseEvent | TouchEvent): void {
      const target = event.target as Node | null;
      if (
        dropdownContainerRef.current &&
        target &&
        !dropdownContainerRef.current.contains(target)
      ) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsidePointer);
    document.addEventListener('touchstart', handleOutsidePointer);

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('touchstart', handleOutsidePointer);
    };
  }, [isDropdownOpen]);

  // Garante que o item destacado fique visível dentro da lista com scroll
  useEffect(() => {
    if (!isDropdownOpen || !listboxRef.current) {
      return;
    }

    const activeItem = listboxRef.current.children[highlightedIndex] as
      | HTMLElement
      | undefined;
    if (activeItem && typeof activeItem.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [isDropdownOpen, highlightedIndex]);

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  const openDropdown = (): void => {
    setHighlightedIndex(selectedOptionIndex);
    setIsDropdownOpen(true);
  };

  const closeDropdown = (): void => {
    setIsDropdownOpen(false);
  };

  const handleToggleDropdown = (): void => {
    if (isDropdownOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  };

  const handleSelectOption = (nextMunicipio: string): void => {
    onMunicipioChange(nextMunicipio);
    closeDropdown();
    triggerButtonRef.current?.focus();
  };

  const handleTriggerKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>
  ): void => {
    event.stopPropagation();

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!isDropdownOpen) {
          openDropdown();
        } else {
          setHighlightedIndex((prev) =>
            prev + 1 < allOptions.length ? prev + 1 : 0
          );
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!isDropdownOpen) {
          openDropdown();
        } else {
          setHighlightedIndex((prev) =>
            prev - 1 >= 0 ? prev - 1 : allOptions.length - 1
          );
        }
        break;
      }
      case 'Home': {
        if (isDropdownOpen) {
          event.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      }
      case 'End': {
        if (isDropdownOpen) {
          event.preventDefault();
          setHighlightedIndex(allOptions.length - 1);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (!isDropdownOpen) {
          openDropdown();
        } else {
          const chosen = allOptions[highlightedIndex];
          if (chosen) {
            handleSelectOption(chosen.value);
          }
        }
        break;
      }
      case 'Escape': {
        if (isDropdownOpen) {
          event.preventDefault();
          closeDropdown();
        }
        break;
      }
      case 'Tab': {
        if (isDropdownOpen) {
          closeDropdown();
        }
        break;
      }
      default:
        break;
    }
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

  const handleClearAllClick = (): void => {
    closeDropdown();
    onClearFilters();
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
    isDropdownOpen ? styles.selectControlOpen : '',
  ]
    .filter(Boolean)
    .join(' ');

  const chevronClassNames = [
    styles.selectChevron,
    isDropdownOpen ? styles.selectChevronOpen : '',
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
      {/* Controle 1: Filtro por Município (Dropdown Customizado Estilizado e Acessível) */}
      <div className={styles.filterField} ref={dropdownContainerRef}>
        <label
          id="filtro-municipio-label"
          htmlFor="filtro-municipio"
          className={styles.filterLabel}
        >
          Município
        </label>
        <input type="hidden" name="municipio" value={municipio} />
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
          <button
            ref={triggerButtonRef}
            id="filtro-municipio"
            type="button"
            role="combobox"
            aria-autocomplete="none"
            aria-haspopup="listbox"
            aria-expanded={isDropdownOpen}
            aria-controls="filtro-municipio-listbox"
            aria-labelledby="filtro-municipio-label filtro-municipio"
            aria-activedescendant={
              isDropdownOpen
                ? `filtro-municipio-opt-${highlightedIndex}`
                : undefined
            }
            aria-busy={isLoadingMunicipios}
            onClick={handleToggleDropdown}
            onKeyDown={handleTriggerKeyDown}
            className={selectClassNames}
            data-testid="map-filter-municipio-select"
          >
            <span className={styles.selectValueText}>
              {selectedDisplayLabel}
            </span>
          </button>
          <span className={chevronClassNames} aria-hidden="true">
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

          {isDropdownOpen && (
            <ul
              ref={listboxRef}
              id="filtro-municipio-listbox"
              role="listbox"
              aria-labelledby="filtro-municipio-label"
              className={styles.dropdownMenu}
              onWheel={stopMapEventPropagation}
              onTouchMove={stopMapEventPropagation}
              data-testid="map-filter-municipio-listbox"
            >
              {allOptions.map((option, index) => {
                const isSelected = option.value === municipio.trim();
                const isHighlighted = index === highlightedIndex;
                const optionClassNames = [
                  styles.dropdownOption,
                  isSelected ? styles.dropdownOptionSelected : '',
                  isHighlighted ? styles.dropdownOptionHighlighted : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <li
                    key={option.value || '__all__'}
                    id={`filtro-municipio-opt-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    className={optionClassNames}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelectOption(option.value)}
                    data-testid={
                      option.value
                        ? `map-filter-municipio-option-${option.value}`
                        : 'map-filter-municipio-option-all'
                    }
                  >
                    <span className={styles.dropdownOptionLabel}>
                      {option.label}
                    </span>
                    {isSelected && (
                      <span
                        className={styles.dropdownOptionCheck}
                        aria-hidden="true"
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
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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
            onFocus={closeDropdown}
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
        onClick={handleClearAllClick}
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
