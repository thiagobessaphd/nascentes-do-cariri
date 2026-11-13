'use client';

/**
 * Nascentes do Cariri — Tabela e Lista Acessível de Erros de Validação
 *
 * Renderiza em primeiro plano os erros de validação por linha e campo,
 * associados via WAI-ARIA (role="alert", aria-live="assertive"), foco assistivo
 * e paginação para arquivos com muitos erros.
 */

import { useState, type RefObject } from 'react';
import type { ImportRowError } from '@/modules/importacoes/importacoes.types';
import {
  formatErrorCodeLabel,
  formatFieldLabel,
  paginateSlice,
} from '@/services/importacoes.client';
import styles from './ImportErrorsList.module.css';

export interface ImportErrorsListProps {
  readonly errors: readonly ImportRowError[];
  readonly containerRef?: RefObject<HTMLDivElement | null> | undefined;
  readonly pageSize?: number | undefined;
}

export default function ImportErrorsList({
  errors,
  containerRef,
  pageSize = 25,
}: ImportErrorsListProps) {
  const [currentPage, setCurrentPage] = useState<number>(1);

  if (!errors || errors.length === 0) {
    return null;
  }

  const pagination = paginateSlice(errors, currentPage, pageSize);

  return (
    <section
      ref={containerRef}
      className={styles.container}
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      aria-labelledby="errors-section-title"
      data-testid="import-errors-list"
    >
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.titleIcon} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <h2 id="errors-section-title" className={styles.title}>
            Inconsistências Identificadas no Arquivo
          </h2>
          <span className={styles.badgeCount}>
            {errors.length} {errors.length === 1 ? 'erro impeditivo' : 'erros impeditivos'}
          </span>
        </div>

        <p className={styles.description}>
          A importação é atômica e exige que todas as linhas estejam corretas. Corrija cada apontamento no arquivo TXT e realize um novo envio.
        </p>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Linha</th>
              <th scope="col">Campo</th>
              <th scope="col">Motivo do Erro</th>
              <th scope="col">Conteúdo Informado</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((err, index) => {
              const uniqueKey = `${err.line}-${err.field}-${err.code}-${index}`;

              return (
                <tr key={uniqueKey} data-testid="error-row">
                  <td className={styles.lineCol}>Linha {err.line}</td>
                  <td>
                    <span className={styles.fieldTag}>{formatFieldLabel(err.field)}</span>
                  </td>
                  <td>
                    <div className={styles.errorTitle}>{formatErrorCodeLabel(err.code)}</div>
                    <div className={styles.errorMessage}>{err.message}</div>
                  </td>
                  <td>
                    {err.rawValue ? (
                      <code className={styles.rawCode} title={err.rawValue}>
                        {err.rawValue}
                      </code>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className={styles.pagination} aria-label="Navegação da lista de erros">
          <span className={styles.paginationInfo}>
            Exibindo página <strong>{pagination.currentPage}</strong> de{' '}
            <strong>{pagination.totalPages}</strong> ({pagination.totalItems} erros no total)
          </span>

          <div className={styles.paginationButtons}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={!pagination.hasPreviousPage}
              className={styles.pageButton}
              aria-label="Página anterior de erros"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={!pagination.hasNextPage}
              className={styles.pageButton}
              aria-label="Próxima página de erros"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
