/**
 * Nascentes do Cariri — Cards de Resumo e Diagnóstico da Prévia
 *
 * Apresenta a barra de metadados do arquivo, banner de diagnóstico e
 * 4 cards quantitativos com formatação tabular e semântica acessível.
 */

import type { TxtParseSummary } from '@/modules/importacoes/importacoes.contracts';
import type { PreviewClassification } from '@/services/importacoes.client';
import { formatFileSizeBytes } from '@/services/importacoes.client';
import styles from './ImportSummaryCards.module.css';

export interface ImportSummaryCardsProps {
  readonly summary: TxtParseSummary;
  readonly fileName: string;
  readonly fileSize?: number | undefined;
  readonly hashSha256?: string | undefined;
  readonly classification: PreviewClassification;
  readonly hasHeaderError?: boolean | undefined;
}

function getBannerStyleClass(kind: PreviewClassification['kind']): string {
  switch (kind) {
    case 'valid':
      return styles.bannerValid ?? '';
    case 'invalid':
      return styles.bannerInvalid ?? '';
    case 'empty':
      return styles.bannerEmpty ?? '';
  }
}

function renderBannerIcon(kind: PreviewClassification['kind']) {
  switch (kind) {
    case 'valid':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'invalid':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
        </svg>
      );
    case 'empty':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" strokeLinecap="round" />
        </svg>
      );
  }
}

export default function ImportSummaryCards({
  summary,
  fileName,
  fileSize,
  hashSha256,
  classification,
  hasHeaderError = false,
}: ImportSummaryCardsProps) {
  // Trunca visualmente o hash preservando início e fim
  const shortHash = hashSha256
    ? `${hashSha256.slice(0, 10)}...${hashSha256.slice(-8)}`
    : null;

  const hasValidas = summary.totalValidas > 0;
  const hasDuplicadas = summary.totalDuplicadas > 0;
  const hasInvalidas = summary.totalInvalidas > 0;

  return (
    <section className={styles.container} aria-labelledby="summary-section-heading">
      <h2 id="summary-section-heading" className={styles.srOnly}>
        Resumo e Diagnóstico do Lote
      </h2>

      {/* 1. Barra de Metadados do Arquivo */}
      <div className={styles.metadataBar} data-testid="summary-metadata-bar">
        <div className={styles.metadataGroup}>
          <span className={styles.metadataLabel}>Arquivo:</span>
          <span className={styles.metadataValue}>{fileName}</span>
          {fileSize !== undefined && (
            <span className={styles.tabularNum}>({formatFileSizeBytes(fileSize)})</span>
          )}
        </div>

        {shortHash && (
          <div className={styles.metadataGroup}>
            <span className={styles.metadataLabel}>SHA-256:</span>
            <span className={styles.hashTag} title={`Hash SHA-256: ${hashSha256}`}>
              {shortHash}
            </span>
            <span className={styles.srOnly}> (hash completo: {hashSha256})</span>
          </div>
        )}
      </div>

      {/* 2. Banner de Diagnóstico Acessível */}
      <div
        className={`${styles.banner} ${getBannerStyleClass(classification.kind)}`}
        role="status"
        aria-live="polite"
        data-testid={`diagnostic-banner-${classification.kind}`}
      >
        <span className={styles.bannerIcon} aria-hidden="true">
          {renderBannerIcon(classification.kind)}
        </span>

        <div className={styles.bannerContent}>
          <p className={styles.bannerTitle}>{classification.message}</p>
          {classification.blockingReason && (
            <p className={styles.bannerDescription}>{classification.blockingReason}</p>
          )}
        </div>
      </div>

      {/* 3. Grid dos 4 Cards de Resumo Numérico */}
      <div className={styles.cardsGrid}>
        {/* Card 1: Total de Linhas */}
        <article className={`${styles.card} ${styles.cardTotal}`} data-testid="card-total-linhas">
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Total Lido</h3>
            <span className={styles.cardIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </span>
          </div>
          <p className={styles.cardValue}>{summary.totalLinhas}</p>
          <p className={styles.cardFooter}>
            {hasHeaderError
              ? 'Falha estrutural na Linha 1 (cabeçalho)'
              : 'Linhas processadas no arquivo'}
          </p>
        </article>

        {/* Card 2: Novas Nascentes Válidas */}
        <article
          className={`${styles.card} ${hasValidas ? styles.cardValid : styles.cardNeutral}`}
          data-testid="card-validas"
        >
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Novas Nascentes</h3>
            <span className={styles.cardIcon} aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={hasValidas ? '#166534' : '#94a3b8'}
                strokeWidth="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </div>
          <p className={styles.cardValue}>{summary.totalValidas}</p>
          <p className={styles.cardFooter}>
            {hasValidas ? 'Válidas para inclusão na base' : 'Nenhum novo registro válido'}
          </p>
        </article>

        {/* Card 3: Registros Duplicados */}
        <article
          className={`${styles.card} ${hasDuplicadas ? styles.cardDuplicate : styles.cardNeutral}`}
          data-testid="card-duplicadas"
        >
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Duplicadas</h3>
            <span className={styles.cardIcon} aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={hasDuplicadas ? '#b45309' : '#94a3b8'}
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </span>
          </div>
          <p className={styles.cardValue}>{summary.totalDuplicadas}</p>
          <p className={styles.cardFooter}>
            {hasDuplicadas ? 'Ignoradas sem sobrescrever' : 'Nenhuma duplicidade detectada'}
          </p>
        </article>

        {/* Card 4: Linhas com Erro */}
        <article
          className={`${styles.card} ${hasInvalidas ? styles.cardInvalid : styles.cardNeutral}`}
          data-testid="card-invalidas"
        >
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Linhas com Erro</h3>
            <span className={styles.cardIcon} aria-hidden="true">
              {hasInvalidas ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
            </span>
          </div>
          <p className={styles.cardValue}>{summary.totalInvalidas}</p>
          <p className={styles.cardFooter}>
            {hasInvalidas ? 'Impedem confirmação definitiva' : 'Nenhuma falha encontrada'}
          </p>
        </article>
      </div>
    </section>
  );
}
