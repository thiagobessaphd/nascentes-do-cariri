'use client';

/**
 * Nascentes do Cariri — Tabela de Prévia dos Dados de Nascentes
 *
 * Exibe as linhas válidas e duplicadas identificadas no TXT, com filtros
 * segmentados (Todos, Novos Válidos, Duplicadas), vazão em m³/s, coordenadas
 * e paginação para arquivos de milhares de linhas.
 */

import { useState, useMemo } from 'react';
import type {
  DuplicateTxtRow,
  ValidTxtRow,
} from '@/modules/importacoes/importacoes.types';
import {
  formatCoordinates,
  formatDuplicateReason,
  formatIsoDateToPtBr,
  formatVazaoMedia,
  paginateSlice,
} from '@/services/importacoes.client';
import styles from './ImportPreviewTable.module.css';

export interface ImportPreviewTableProps {
  readonly validRows: readonly ValidTxtRow[];
  readonly duplicateRows: readonly DuplicateTxtRow[];
  readonly pageSize?: number | undefined;
}

type FilterTab = 'all' | 'valid' | 'duplicate';

interface CombinedRow {
  readonly line: number;
  readonly isDuplicate: boolean;
  readonly data: ValidTxtRow['data'];
  readonly duplicateReason?: DuplicateTxtRow['reason'] | undefined;
}

export default function ImportPreviewTable({
  validRows,
  duplicateRows,
  pageSize = 25,
}: ImportPreviewTableProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Unifica e ordena cronologicamente pelo número da linha do arquivo
  const combinedRows = useMemo<readonly CombinedRow[]>(() => {
    const list: CombinedRow[] = [];

    for (const item of validRows) {
      list.push({
        line: item.line,
        isDuplicate: false,
        data: item.data,
      });
    }

    for (const item of duplicateRows) {
      list.push({
        line: item.line,
        isDuplicate: true,
        data: item.data,
        duplicateReason: item.reason,
      });
    }

    return list.sort((a, b) => a.line - b.line);
  }, [validRows, duplicateRows]);

  // Aplica o filtro da aba ativa
  const filteredRows = useMemo<readonly CombinedRow[]>(() => {
    if (activeTab === 'valid') {
      return combinedRows.filter((r) => !r.isDuplicate);
    }
    if (activeTab === 'duplicate') {
      return combinedRows.filter((r) => r.isDuplicate);
    }
    return combinedRows;
  }, [combinedRows, activeTab]);

  // Paginação determinística O(1)
  const pagination = paginateSlice(filteredRows, currentPage, pageSize);

  function handleTabChange(tab: FilterTab) {
    setActiveTab(tab);
    setCurrentPage(1);
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
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            onClick={() => handleTabChange('all')}
            className={`${styles.tabButton} ${activeTab === 'all' ? styles.tabActive : ''}`}
            data-testid="filter-tab-all"
          >
            Todos ({totalAll})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'valid'}
            onClick={() => handleTabChange('valid')}
            className={`${styles.tabButton} ${activeTab === 'valid' ? styles.tabActive : ''}`}
            data-testid="filter-tab-valid"
          >
            Novos Válidos ({totalValidas})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'duplicate'}
            onClick={() => handleTabChange('duplicate')}
            className={`${styles.tabButton} ${activeTab === 'duplicate' ? styles.tabActive : ''}`}
            data-testid="filter-tab-duplicate"
          >
            Duplicados ({totalDuplicadas})
          </button>
        </div>
      </div>

      {/* Tabela de Dados */}
      {filteredRows.length === 0 ? (
        <div className={styles.emptyState} data-testid="preview-empty-state">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="8" />
          </svg>
          <span>Nenhum registro encontrado para a categoria selecionada.</span>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table} data-testid="preview-table">
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
                const uniqueKey = `row-${row.line}-${row.data.latitude}-${row.data.longitude}`;

                return (
                  <tr key={uniqueKey} data-testid="preview-row">
                    <td className={styles.lineCol}>Linha {row.line}</td>
                    <td>
                      {row.isDuplicate ? (
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
                      <strong>{row.data.municipio}</strong> — {row.data.localidade}
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

      {/* Paginação */}
      {pagination.totalPages > 1 && (
        <div className={styles.pagination} aria-label="Navegação da tabela de prévia">
          <span className={styles.paginationInfo}>
            Exibindo página <strong>{pagination.currentPage}</strong> de{' '}
            <strong>{pagination.totalPages}</strong> ({pagination.totalItems} registros)
          </span>

          <div className={styles.paginationButtons}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={!pagination.hasPreviousPage}
              className={styles.pageButton}
              aria-label="Página anterior da prévia"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={!pagination.hasNextPage}
              className={styles.pageButton}
              aria-label="Próxima página da prévia"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
