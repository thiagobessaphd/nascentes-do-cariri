/**
 * Nascentes do Cariri — Cards de Indicadores Operacionais do Painel Administrativo
 *
 * Exibe em destaque os dois KPIs essenciais do MVP:
 * 1. Total de nascentes ativas publicadas no mapa público;
 * 2. Situação e metadados da última importação registrada.
 */

import Link from 'next/link';
import type { AdminResumoIndicadoresDto } from '@/modules/painel/painel.contracts';
import { formatDateTimePtBr } from '@/services/importacoes.client';
import ImportStatusBadge from '@/components/admin/importacoes/status-badge/ImportStatusBadge';
import styles from './PainelKpiCards.module.css';

export interface PainelKpiCardsProps {
  readonly indicadores: AdminResumoIndicadoresDto;
}

export default function PainelKpiCards({ indicadores }: PainelKpiCardsProps) {
  const { totalNascentesAtivas, totalImportacoes, ultimaImportacao } = indicadores;
  const hasActiveSprings = totalNascentesAtivas > 0;
  const formattedSpringsCount = totalNascentesAtivas.toLocaleString('pt-BR');
  const springsUnitLabel =
    totalNascentesAtivas === 1 ? 'nascente publicada' : 'nascentes publicadas';
  const totalLotsLabel =
    totalImportacoes === 1
      ? '1 lote registrado no histórico'
      : `${totalImportacoes.toLocaleString('pt-BR')} lotes registrados no histórico`;

  return (
    <section
      className={styles.kpiGrid}
      aria-label="Indicadores operacionais do painel"
      data-testid="dashboard-kpi-cards"
    >
      {/* KPI 1 — Nascentes Ativas no Mapa Público */}
      <article
        className={`${styles.card} ${styles.springsCard}`}
        data-testid="kpi-nascentes-ativas"
      >
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderText}>
            <h2 className={styles.cardTitle}>Nascentes Ativas no Mapa</h2>
            <span className={styles.cardMetaBadge}>{totalLotsLabel}</span>
          </div>

          <span className={styles.springsIconBox} aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
            >
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </span>
        </div>

        <div className={styles.springsMetricBody}>
          <p
            className={hasActiveSprings ? styles.heroValueActive : styles.heroValueEmpty}
            data-testid="kpi-nascentes-ativas-valor"
          >
            {formattedSpringsCount}
          </p>
          <span className={styles.heroUnit}>{springsUnitLabel}</span>
          <p className={styles.cardDescription}>
            {hasActiveSprings
              ? 'Registros validados e disponíveis para consulta pública no mapa do Cariri.'
              : 'Nenhuma nascente publicada no mapa ainda. Envie um arquivo .txt para iniciar.'}
          </p>
        </div>

        <div className={styles.cardFooter}>
          <Link
            href="/mapa"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.cardActionLink}
            aria-label="Abrir mapa público interativo em nova aba"
          >
            <span>Abrir mapa público</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </article>

      {/* KPI 2 — Situação da Última Importação */}
      <article
        className={`${styles.card} ${styles.lastImportCard}`}
        data-testid="kpi-ultima-importacao"
      >
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Última Importação</h2>

          {ultimaImportacao ? (
            <ImportStatusBadge status={ultimaImportacao.status} size="sm" />
          ) : (
            <span className={styles.emptyPill}>Sem registros</span>
          )}
        </div>

        {ultimaImportacao ? (
          <>
            <div className={styles.lastImportBody}>
              <div className={styles.fileIdentity}>
                <span
                  className={styles.fileName}
                  title={ultimaImportacao.nomeArquivo}
                >
                  {ultimaImportacao.nomeArquivo}
                </span>
                <span className={styles.lotIdTag}>Lote #{ultimaImportacao.id}</span>
              </div>

              <dl className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <dt className={styles.metaLabel}>Data de envio</dt>
                  <dd className={styles.metaValue}>
                    {formatDateTimePtBr(ultimaImportacao.createdAt)}
                  </dd>
                </div>

                <div className={styles.metaItem}>
                  <dt className={styles.metaLabel}>Responsável</dt>
                  <dd
                    className={styles.metaValue}
                    title={ultimaImportacao.usuario.nome}
                  >
                    {ultimaImportacao.usuario.nome}
                  </dd>
                </div>
              </dl>

              <div
                className={styles.countsStrip}
                aria-label="Resumo quantitativo da última importação"
              >
                <div className={styles.countTile}>
                  <span className={styles.countLabel}>Lidas</span>
                  <span className={styles.countNumber}>
                    {ultimaImportacao.totalLinhas.toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className={styles.countTile}>
                  <span className={styles.countLabel}>Válidas</span>
                  <span
                    className={
                      ultimaImportacao.totalValidas > 0
                        ? `${styles.countNumber} ${styles.countValid}`
                        : styles.countNumberMuted
                    }
                  >
                    {ultimaImportacao.totalValidas.toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className={styles.countTile}>
                  <span className={styles.countLabel}>Duplicadas</span>
                  <span
                    className={
                      ultimaImportacao.totalDuplicadas > 0
                        ? `${styles.countNumber} ${styles.countDuplicate}`
                        : styles.countNumberMuted
                    }
                  >
                    {ultimaImportacao.totalDuplicadas.toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className={styles.countTile}>
                  <span className={styles.countLabel}>Erros</span>
                  <span
                    className={
                      ultimaImportacao.totalInvalidas > 0
                        ? `${styles.countNumber} ${styles.countInvalid}`
                        : styles.countNumberMuted
                    }
                  >
                    {ultimaImportacao.totalInvalidas.toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.cardFooter}>
              <Link
                href={`/admin/importacoes/${ultimaImportacao.id}`}
                className={styles.cardActionLink}
              >
                <span>Ver detalhes do lote</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className={styles.lastImportEmptyBody}>
              <p className={styles.emptyHeadline}>
                Nenhuma importação realizada até o momento.
              </p>
              <p className={styles.cardDescription}>
                Envie um arquivo .txt com os dados das nascentes para validar a prévia e
                acompanhar aqui a situação do lote mais recente.
              </p>
            </div>

            <div className={styles.cardFooter}>
              <Link href="/admin/importacoes" className={styles.cardActionLink}>
                <span>Iniciar nova importação</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </>
        )}
      </article>
    </section>
  );
}
