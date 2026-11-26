/**
 * Nascentes do Cariri — Seção de Histórico Recente do Painel Administrativo
 *
 * Exibe os últimos lotes enviados (até 5 no MVP) em tabela semântica no desktop
 * e em cards empilhados no mobile (<= 768px) sem overflow horizontal em 360px,
 * com acesso direto aos detalhes de cada lote e ao histórico completo.
 */

import Link from 'next/link';
import type { AdminResumoImportacaoItemDto } from '@/modules/painel/painel.contracts';
import { formatDateTimePtBr } from '@/services/importacoes.client';
import ImportStatusBadge from '@/components/admin/importacoes/status-badge/ImportStatusBadge';
import styles from './RecentImportacoesSection.module.css';

export interface RecentImportacoesSectionProps {
  readonly items: readonly AdminResumoImportacaoItemDto[];
  readonly totalImportacoes: number;
}

function buildSectionSubtitle(shownCount: number, totalImportacoes: number): string {
  if (shownCount === 0) {
    return 'Nenhum lote registrado até o momento.';
  }

  if (totalImportacoes > shownCount) {
    return `Exibindo as ${shownCount} mais recentes de ${totalImportacoes.toLocaleString('pt-BR')} importações registradas.`;
  }

  return shownCount === 1
    ? 'Exibindo 1 importação registrada.'
    : `Exibindo todas as ${shownCount} importações registradas.`;
}

export default function RecentImportacoesSection({
  items,
  totalImportacoes,
}: RecentImportacoesSectionProps) {
  const subtitle = buildSectionSubtitle(items.length, totalImportacoes);

  return (
    <section
      className={styles.sectionCard}
      aria-labelledby="recent-imports-heading"
      data-testid="dashboard-recent-imports"
    >
      <header className={styles.sectionHeader}>
        <div className={styles.sectionTitleGroup}>
          <h2 id="recent-imports-heading" className={styles.sectionTitle}>
            Histórico Recente
          </h2>
          <p className={styles.sectionSubtitle}>{subtitle}</p>
        </div>

        <Link
          href="/admin/importacoes/historico"
          className={styles.viewAllLink}
          data-testid="dashboard-view-full-history-link"
        >
          <span>Ver histórico completo</span>
          <span aria-hidden="true">→</span>
        </Link>
      </header>

      {items.length === 0 ? (
        <div
          className={styles.partialEmptyState}
          role="status"
          aria-live="polite"
          data-testid="dashboard-recent-empty"
        >
          <p className={styles.partialEmptyTitle}>
            Nenhuma importação registrada no histórico recente
          </p>
          <p className={styles.partialEmptyDescription}>
            Quando novos arquivos .txt forem validados ou publicados, os lotes mais
            recentes aparecerão listados aqui para consulta rápida.
          </p>
          <Link href="/admin/importacoes" className={styles.partialEmptyCta}>
            Nova Importação (.txt)
          </Link>
        </div>
      ) : (
        <>
          {/* Tabela Desktop (> 768px) */}
          <div
            className={styles.tableScrollContainer}
            role="region"
            aria-label="Tabela de importações recentes"
            tabIndex={0}
          >
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                Lista resumida das importações mais recentes de arquivos de nascentes
              </caption>
              <thead>
                <tr>
                  <th scope="col">Arquivo e Lote</th>
                  <th scope="col">Responsável</th>
                  <th scope="col">Data de Envio</th>
                  <th scope="col">Resumo</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} data-testid={`recent-import-row-${item.id}`}>
                    <td>
                      <div className={styles.fileCell}>
                        <span className={styles.fileName} title={item.nomeArquivo}>
                          {item.nomeArquivo}
                        </span>
                        <span className={styles.lotIdTag}>Lote #{item.id}</span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.authorName} title={item.usuario.nome}>
                        {item.usuario.nome}
                      </span>
                    </td>
                    <td>
                      <span className={styles.dateValue}>
                        {formatDateTimePtBr(item.createdAt)}
                      </span>
                    </td>
                    <td>
                      <div className={styles.totalsGrid}>
                        <span className={styles.totalItem}>
                          Lidas: <strong>{item.totalLinhas.toLocaleString('pt-BR')}</strong>
                        </span>
                        <span className={`${styles.totalItem} ${styles.totalValid}`}>
                          Válidas: <strong>{item.totalValidas.toLocaleString('pt-BR')}</strong>
                        </span>
                        <span className={`${styles.totalItem} ${styles.totalDuplicate}`}>
                          Dupl.: <strong>{item.totalDuplicadas.toLocaleString('pt-BR')}</strong>
                        </span>
                        <span className={`${styles.totalItem} ${styles.totalInvalid}`}>
                          Erros: <strong>{item.totalInvalidas.toLocaleString('pt-BR')}</strong>
                        </span>
                      </div>
                    </td>
                    <td>
                      <ImportStatusBadge status={item.status} size="sm" />
                    </td>
                    <td>
                      <Link
                        href={`/admin/importacoes/${item.id}`}
                        className={styles.detailLinkButton}
                        aria-label={`Ver detalhes do lote #${item.id} (${item.nomeArquivo})`}
                      >
                        Ver detalhes
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lista em Cards Mobile (<= 768px) */}
          <ul
            className={styles.mobileCardsList}
            aria-label="Lista de importações recentes"
          >
            {items.map((item) => (
              <li key={item.id} className={styles.mobileCardItem}>
                <article className={styles.mobileCard}>
                  <div className={styles.mobileCardHeader}>
                    <div className={styles.mobileTitleGroup}>
                      <h3 className={styles.mobileFileName}>{item.nomeArquivo}</h3>
                      <span className={styles.lotIdTag}>Lote #{item.id}</span>
                    </div>
                    <ImportStatusBadge status={item.status} size="sm" />
                  </div>

                  <div className={styles.mobileMetaList}>
                    <div className={styles.mobileMetaRow}>
                      <span className={styles.mobileMetaLabel}>Responsável</span>
                      <span className={styles.mobileMetaValue}>{item.usuario.nome}</span>
                    </div>
                    <div className={styles.mobileMetaRow}>
                      <span className={styles.mobileMetaLabel}>Data de envio</span>
                      <span className={styles.mobileMetaValue}>
                        {formatDateTimePtBr(item.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className={styles.mobileTotalsGrid}>
                    <div className={styles.mobileTotalBox}>
                      <span className={styles.mobileTotalLabel}>Lidas</span>
                      <span className={styles.mobileTotalNum}>
                        {item.totalLinhas.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className={styles.mobileTotalBox}>
                      <span className={styles.mobileTotalLabel}>Válidas</span>
                      <span className={`${styles.mobileTotalNum} ${styles.totalValid}`}>
                        {item.totalValidas.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className={styles.mobileTotalBox}>
                      <span className={styles.mobileTotalLabel}>Duplicadas</span>
                      <span className={`${styles.mobileTotalNum} ${styles.totalDuplicate}`}>
                        {item.totalDuplicadas.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className={styles.mobileTotalBox}>
                      <span className={styles.mobileTotalLabel}>Erros</span>
                      <span className={`${styles.mobileTotalNum} ${styles.totalInvalid}`}>
                        {item.totalInvalidas.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  <div className={styles.mobileCardActions}>
                    <Link
                      href={`/admin/importacoes/${item.id}`}
                      className={styles.mobileDetailLink}
                      aria-label={`Ver detalhes do lote #${item.id} (${item.nomeArquivo})`}
                    >
                      Ver detalhes
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
