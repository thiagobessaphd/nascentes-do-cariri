'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from './error.module.css';

export interface ImportacoesHistoryErrorProps {
  readonly error: Error & { readonly digest?: string | undefined };
  readonly reset: () => void;
}

export default function ImportacoesHistoryError({
  error,
  reset,
}: ImportacoesHistoryErrorProps) {
  useEffect(() => {
    console.error('[AdminImportacoesHistorico] Erro inesperado na rota:', error);
  }, [error]);

  return (
    <div className={styles.container} role="alert" aria-live="assertive">
      <div className={styles.card}>
        <h2 className={styles.title}>
          Não foi possível carregar o histórico de importações
        </h2>
        <p className={styles.description}>
          Ocorreu uma falha inesperada ao exibir o painel de auditoria. Nenhum registro foi
          alterado. Tente recarregar ou retorne para a tela de importação.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={reset} className={styles.retryButton}>
            Tentar novamente
          </button>
          <Link href="/admin/importacoes" className={styles.secondaryLink}>
            Ir para Importação de Dados
          </Link>
        </div>
      </div>
    </div>
  );
}
