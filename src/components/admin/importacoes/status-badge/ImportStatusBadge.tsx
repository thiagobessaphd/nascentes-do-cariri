/**
 * Nascentes do Cariri — Badge Semântico de Status da Importação
 *
 * Exibe obrigatoriamente ícone contextual + rótulo textual em português para cada
 * ImportacaoStatus, garantindo acessibilidade sem depender apenas de cor.
 */

import type { ImportacaoStatus } from '@/modules/importacoes/importacoes.contracts';
import {
  getImportacaoStatusMeta,
  type ImportacaoStatusTone,
} from '@/services/importacoes.client';
import styles from './ImportStatusBadge.module.css';

export interface ImportStatusBadgeProps {
  readonly status: ImportacaoStatus;
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
}

function getToneClass(tone: ImportacaoStatusTone): string {
  switch (tone) {
    case 'success':
      return styles.toneSuccess ?? '';
    case 'warning':
      return styles.toneWarning ?? '';
    case 'danger':
      return styles.toneDanger ?? '';
    case 'neutral':
      return styles.toneNeutral ?? '';
    case 'info':
      return styles.toneInfo ?? '';
  }
}

function getSizeClass(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return styles.sizeSm ?? '';
    case 'md':
      return styles.sizeMd ?? '';
    case 'lg':
      return styles.sizeLg ?? '';
  }
}

function renderStatusIcon(tone: ImportacaoStatusTone, iconSize: number) {
  switch (tone) {
    case 'success':
      return (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'warning':
      return (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'danger':
      return (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    case 'neutral':
      return (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      );
    case 'info':
      return (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" strokeLinecap="round" />
        </svg>
      );
  }
}

export default function ImportStatusBadge({
  status,
  size = 'md',
}: ImportStatusBadgeProps) {
  const meta = getImportacaoStatusMeta(status);
  const iconSize = size === 'sm' ? 13 : size === 'lg' ? 16 : 14;

  return (
    <span
      className={`${styles.badge} ${getToneClass(meta.tone)} ${getSizeClass(size)}`}
      data-status={status}
      data-testid={`status-badge-${status}`}
      title={meta.description}
    >
      <span className={styles.icon} aria-hidden="true">
        {renderStatusIcon(meta.tone, iconSize)}
      </span>
      <span className={styles.label}>{meta.label}</span>
    </span>
  );
}
