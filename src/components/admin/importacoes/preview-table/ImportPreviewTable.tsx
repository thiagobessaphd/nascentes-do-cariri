'use client';

/**
 * Nascentes do Cariri — Tabela de Prévia dos Dados de Nascentes
 *
 * Exibe as linhas válidas e duplicadas identificadas no TXT, com filtros
 * segmentados (Todos, Novos Válidos, Duplicadas), vazão em m³/s, coordenadas
 * e paginação para arquivos de milhares de linhas.
 */

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type {
  DuplicateTxtPreviewRow,
  ValidTxtPreviewRow,
} from '@/modules/importacoes/importacoes.contracts';
import {
  formatCoordinates,
  formatDuplicateReason,
  formatIsoDateToPtBr,
  formatVazaoMedia,
  paginateSlice,
} from '@/services/importacoes.client';
import styles from './ImportPreviewTable.module.css';

export interface ImportPreviewTableProps {
  readonly validRows: readonly ValidTxtPreviewRow[];
  readonly duplicateRows: readonly DuplicateTxtPreviewRow[];
  readonly pageSize?: number | undefined;
}

type FilterTab = 'all' | 'valid' | 'duplicate';

const FILTER_TABS: readonly FilterTab[] = ['all', 'valid', 'duplicate'];

type CombinedRow =
  | {
      readonly kind: 'valid';
      readonly line: number;
      readonly data: ValidTxtPreviewRow['data'];
    }
  | {
      readonly kind: 'duplicate';
      readonly line: number;
      readonly data: DuplicateTxtPreviewRow['data'];
      readonly duplicateReason: DuplicateTxtPreviewRow['reason'];
    };

export default function ImportPreviewTable({
  validRows,
  duplicateRows,
  pageSize = 25,
}: ImportPreviewTableProps) {
  const [prevRowsKey, setPrevRowsKey] = useState<{
    readonly validRows: readonly ValidTxtPreviewRow[];
    readonly duplicateRows: readonly DuplicateTxtPreviewRow[];
  }>({ validRows, duplicateRows });
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const tabRefs = useRef<Partial<Record<FilterTab, HTMLButtonElement | null>>>({});

  if (prevRowsKey.validRows !== validRows || prevRowsKey.duplicateRows !== duplicateRows) {
    setPrevRowsKey({ validRows, duplicateRows });
    setCurrentPage(1);
  }

  // Unifica e ordena cronologicamente pelo número da linha do arquivo
  const combinedRows = useMemo<readonly CombinedRow[]>(() => {
    const list: CombinedRow[] = [];

    for (const item of validRows) {
      list.push({
        kind: 'valid',
        line: item.line,
        data: item.data,
      });
    }

    for (const item of duplicateRows) {
      list.push({
        kind: 'duplicate',
        line: item.line,
        data: item.data,
        duplicateReason: item.reason,
      });
    }

    return list.sort((a, b) => a.line - b.line);
  }, [validRows, duplicateRows]);

  // Aplica o filtro da aba ativa
  const filteredRows = useMemo<readonly CombinedRow[]>(() => {
    if (activeTab === 'valid') {
      return combinedRows.filter((r) => r.kind === 'valid');
    }
    if (activeTab === 'duplicate') {
      return combinedRows.filter((r) => r.kind === 'duplicate');
    }
    return combinedRows;
  }, [combinedRows, activeTab]);

  // Paginação determinística O(1)
  const pagination = paginateSlice(filteredRows, currentPage, pageSize);
  const startItem =
    pagination.totalItems === 0 ? 0 : (pagination.currentPage - 1) * pagination.pageSize + 1;
  const endItem = Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems);

  function handleTabChange(tab: FilterTab) {
    setActiveTab(tab);
    setCurrentPage(1);
  }

  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, currentTab: FilterTab) {
    const currentIndex = FILTER_TABS.indexOf(currentTab);
    if (currentIndex === -1) return;

    let nextTab: FilterTab | undefined;
    if (e.key === 'ArrowRight') {
      nextTab = FILTER_TABS[(currentIndex + 1) % FILTER_TABS.length];
    } else if (e.key === 'ArrowLeft') {
      nextTab = FILTER_TABS[(currentIndex - 1 + FILTER_TABS.length) % FILTER_TABS.length];
    } else if (e.key === 'Home') {
      nextTab = FILTER_TABS[0];
    } else if (e.key === 'End') {
      nextTab = FILTER_TABS[FILTER_TABS.length - 1];
    }

    if (nextTab) {
      e.preventDefault();
      handleTabChange(nextTab);
      tabRefs.current[nextTab]?.focus();
    }
  }

  const totalAll = combinedRows.length;
  const totalValidas = validRows.length;
  const totalDuplicadas = duplicateRows.length;

  return (
    <section className={styles.container} aria-label="Tabela de prévia dos dados de nascentes">
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>Prévia dos Dados Mapeados</h2>
          <p className={styles.description}>
            Exibindo dados cadastrais extraídos do arquivo. Registros duplicados serão ignorados com segurança na confirmação.
          </p>
        </div>

        {/* Filtros por Segmento */}
        <div className={styles.filterTabs} role="tablist" aria-label="Filtrar tipo de registro na prévia">
          <button
            ref={(el) => {
              tabRefs.current.all = el;
            }}
            id="preview-tab-all"
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            aria-controls="preview-tabpanel"
            tabIndex={activeTab === 'all' ? 0 : -1}
            onClick={() => handleTabChange('all')}
            onKeyDown={(e) => handleTabKeyDown(e, 'all')}
            className={`${styles.tabButton} ${activeTab === 'all' ? styles.tabActive : ''}`}
            data-testid="filter-tab-all"
          >
            Todos ({totalAll})
          </button>
          <button
            ref={(el) => {
              tabRefs.current.valid = el;
            }}
            id="preview-tab-valid"
            type="button"
            role="tab"
            aria-selected={activeTab === 'valid'}
            aria-controls="preview-tabpanel"
            tabIndex={activeTab === 'valid' ? 0 : -1}
            onClick={() => handleTabChange('valid')}
            onKeyDown={(e) => handleTabKeyDown(e, 'valid')}
            className={`${styles.tabButton} ${activeTab === 'valid' ? styles.tabActive : ''}`}
            data-testid="filter-tab-valid"
          >
            Novos Válidos ({totalValidas})
          </button>
          <button
            ref={(el) => {
              tabRefs.current.duplicate = el;
            }}
            id="preview-tab-duplicate"
            type="button"
            role="tab"
            aria-selected={activeTab === 'duplicate'}
            aria-controls="preview-tabpanel"
            tabIndex={activeTab === 'duplicate' ? 0 : -1}
            onClick={() => handleTabChange('duplicate')}
            onKeyDown={(e) => handleTabKeyDown(e, 'duplicate')}
            className={`${styles.tabButton} ${activeTab === 'duplicate' ? styles.tabActive : ''}`}
            data-testid="filter-tab-duplicate"
          >
            Duplicados ({totalDuplicadas})
          </button>
        </div>
      </div>

      {/* Painel de Conteúdo Associado às Abas */}
      <div
        id="preview-tabpanel"
        role="tabpanel"
        aria-labelledby={`preview-tab-${activeTab}`}
      >
        {/* Tabela de Dados */}
        {filteredRows.length === 0 ? (
          <div className={styles.emptyState} data-testid="preview-empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
            </svg>
            <span>Nenhum registro encontrado para a categoria selecionada.</span>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table} data-testid="preview-table">
              <caption className={styles.srOnly}>
                Prévia tabular das nascentes válidas e duplicadas detectadas no arquivo
              </caption>
              <thead>
                <tr>
                  <th scope="col">Linha</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Fonte / Nascente</th>
                  <th scope="col">Município / Localidade</th>
                  <th scope="col">Coordenadas</th>
                  <th scope="col">Data de Criação</th>
                  <th scope="col">Vazão Média</th>
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((row) => {
                  const uniqueKey = `row-${row.kind}-${row.line}-${row.data.latitude}-${row.data.longitude}`;

                  return (
                    <tr key={uniqueKey} data-testid="preview-row">
                      <td className={styles.lineCol}>Linha {row.line}</td>
                      <td>
                        {row.kind === 'duplicate' ? (
                          <div className={styles.badgeDuplicate}>
                            <span className={styles.badgeDuplicatePill}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              Duplicada
                            </span>
                            <span className={styles.duplicateReason}>
                              {formatDuplicateReason(row.duplicateReason)}
                            </span>
                          </div>
                        ) : (
                          <span className={styles.badgeNew}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Nova
                          </span>
                        )}
                      </td>
                      <td className={styles.fonteText}>{row.data.fonte}</td>
                      <td className={styles.locationText}>
                        <strong>{row.data.municipio}</strong> - {row.data.localidade}
                      </td>
                      <td className={styles.tabularNum}>
                        {formatCoordinates(row.data.latitude, row.data.longitude)}
                      </td>
                      <td className={styles.tabularNum}>
                        {formatIsoDateToPtBr(row.data.dataCriacaoIso)}
                      </td>
                      <td className={styles.vazaoText}>
                        {formatVazaoMedia(row.data.vazaoMedia)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {filteredRows.length > 0 && (
        <div className={styles.pagination} aria-label="Navegação da tabela de prévia">
          <span className={styles.paginationInfo}>
            Exibindo <strong>{startItem}–{endItem}</strong> de{' '}
            <strong>{pagination.totalItems}</strong>{' '}
            {pagination.totalItems === 1 ? 'registro' : 'registros'} (Página{' '}
            <strong>{pagination.currentPage}</strong> de{' '}
            <strong>{pagination.totalPages}</strong>)
          </span>

          {pagination.totalPages > 1 && (
            <div className={styles.paginationButtons}>
              <button
                type="button"
                onClick={() => setCurrentPage(Math.max(1, pagination.currentPage - 1))}
                disabled={!pagination.hasPreviousPage}
                className={styles.pageButton}
                aria-label="Página anterior da prévia"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage(Math.min(pagination.totalPages, pagination.currentPage + 1))
                }
                disabled={!pagination.hasNextPage}
                className={styles.pageButton}
                aria-label="Próxima página da prévia"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
