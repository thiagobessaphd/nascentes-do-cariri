/**
 * Nascentes do Cariri — Barra de Decisão e Ações da Importação
 *
 * Controla os botões Confirmar
 * e Cancelar/Nova Validação
 */

import styles from './ImportActionBar.module.css';

export interface ImportActionBarProps {
  readonly canConfirm: boolean;
  readonly totalValidas: number;
  readonly totalInvalidas?: number | undefined;
  readonly blockingReason?: string | undefined;
  readonly isConfirming?: boolean | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export default function ImportActionBar({
  canConfirm,
  totalValidas,
  totalInvalidas = 0,
  blockingReason,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ImportActionBarProps) {
  const hasBlockingErrors = totalInvalidas > 0;
  const confirmButtonLabel =
    totalValidas > 0
      ? `Confirmar e Adicionar ${totalValidas} ${totalValidas === 1 ? 'Nascente' : 'Nascentes'}`
      : 'Confirmar Importação';

  return (
    <aside className={styles.actionBar} aria-label="Barra de ações para confirmação ou cancelamento da importação">
      <div className={styles.statusMessageArea}>
        <span className={styles.statusIcon} aria-hidden="true">
          {canConfirm ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="8" />
            </svg>
          )}
        </span>

        <div className={styles.statusText}>
          <p className={styles.statusTitle}>
            {canConfirm
              ? 'Lote aprovado para integração'
              : 'Confirmação bloqueada por regras de integridade'}
          </p>
          <p id="action-bar-help-text" className={styles.statusHelp}>
            {canConfirm
              ? 'A importação é cumulativa e manterá os registros e arquivos de importações anteriores.'
              : blockingReason ||
                'A importação atômica requer que todos os erros sejam corrigidos antes da gravação.'}
          </p>
        </div>
      </div>

      <div className={styles.buttonsArea}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isConfirming}
          className={hasBlockingErrors ? styles.retryButton : styles.cancelButton}
          aria-label={
            hasBlockingErrors
              ? 'Enviar arquivo corrigido para nova validação'
              : 'Cancelar prévia e enviar outro arquivo'
          }
          data-testid="import-cancel-button"
        >
          {hasBlockingErrors ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>Enviar Arquivo Corrigido</span>
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>Cancelar / Enviar outro</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm || isConfirming}
          aria-disabled={!canConfirm || isConfirming}
          aria-describedby={!canConfirm ? 'action-bar-help-text' : undefined}
          className={styles.confirmButton}
          data-testid="import-confirm-button"
        >
          {isConfirming ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              <span>Confirmando...</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{confirmButtonLabel}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
