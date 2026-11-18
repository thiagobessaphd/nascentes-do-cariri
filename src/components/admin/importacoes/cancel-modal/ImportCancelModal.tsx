'use client';

/**
 * Nascentes do Cariri — Modal Acessível de Confirmação de Cancelamento
 *
 * Implementa diálogo modal com papel ARIA `dialog`, travamento de foco (Tab/Shift+Tab),
 * bloqueio de fechamento durante requisição em curso (`isCanceling`), foco inicial no
 * botão seguro ("Manter importação") e restauração de foco ao gatilho original ao fechar.
 */

import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import styles from './ImportCancelModal.module.css';

export interface ImportCancelModalProps {
  readonly isOpen: boolean;
  readonly importacaoId: number | null;
  readonly nomeArquivo: string;
  readonly isCanceling: boolean;
  readonly errorMessage?: string | null | undefined;
  readonly onConfirmCancel: () => Promise<void> | void;
  readonly onClose: () => void;
  readonly triggerRef?: RefObject<HTMLElement | null> | undefined;
}

/**
 * Determina se o modal deve ser fechado via tecla Escape.
 */
export function shouldCloseCancelModalOnKeyDown(
  key: string,
  isCanceling: boolean
): boolean {
  return key === 'Escape' && !isCanceling;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(selectors));
}

export default function ImportCancelModal({
  isOpen,
  importacaoId,
  nomeArquivo,
  isCanceling,
  errorMessage,
  onConfirmCancel,
  onClose,
  triggerRef,
}: ImportCancelModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef<boolean>(false);

  // Captura e restaura foco ao abrir/fechar no navegador
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      previousActiveRef.current =
        triggerRef?.current ??
        (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);

      const focusTimer = window.setTimeout(() => {
        (keepButtonRef.current ?? dialogRef.current)?.focus();
      }, 0);

      return () => {
        window.clearTimeout(focusTimer);
      };
    }

    if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      const returnTarget = triggerRef?.current ?? previousActiveRef.current;
      previousActiveRef.current = null;
      if (returnTarget && returnTarget.isConnected) {
        returnTarget.focus();
      }
    }

    return undefined;
  }, [isOpen, triggerRef]);

  if (!isOpen) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (shouldCloseCancelModalOnKeyDown(event.key, isCanceling)) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key === 'Tab' && dialogRef.current) {
      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !isCanceling) {
      onClose();
    }
  }

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={handleBackdropClick}
      data-testid="cancel-modal-overlay"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={styles.dialog}
        onKeyDown={handleKeyDown}
        data-testid="cancel-importacao-modal"
      >
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <span className={styles.alertIcon} aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
              </svg>
            </span>
            <h2 id={titleId} className={styles.title}>
              Cancelar importação pendente?
            </h2>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={isCanceling}
            aria-label="Fechar janela de confirmação"
            data-testid="cancel-modal-close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div id={descriptionId} className={styles.body}>
          <p className={styles.summaryLine}>
            Você está prestes a cancelar{' '}
            {importacaoId !== null ? (
              <span className={styles.lotTag}>Lote #{importacaoId}</span>
            ) : (
              'esta importação'
            )}
            :
          </p>
          <p className={styles.fileBox} data-testid="cancel-modal-filename">
            {nomeArquivo}
          </p>
          <p className={styles.explanation}>
            Esta ação encerrará o lote com o status <strong>Cancelada</strong>. Nenhuma
            nascente deste arquivo será adicionada ao mapa público e o arquivo{' '}
            <code>.txt</code> original permanecerá preservado para auditoria.
          </p>
        </div>

        {errorMessage && (
          <div
            className={styles.errorAlert}
            role="alert"
            aria-live="assertive"
            data-testid="cancel-modal-error"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <div className={styles.actions}>
          <button
            ref={keepButtonRef}
            type="button"
            className={styles.keepButton}
            onClick={onClose}
            disabled={isCanceling}
            data-testid="cancel-modal-keep"
          >
            Manter importação
          </button>

          <button
            type="button"
            className={styles.confirmCancelButton}
            onClick={() => {
              void onConfirmCancel();
            }}
            disabled={isCanceling}
            aria-busy={isCanceling}
            data-testid="cancel-modal-confirm"
          >
            {isCanceling ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                <span>Cancelando...</span>
              </>
            ) : (
              <span>Confirmar cancelamento</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
