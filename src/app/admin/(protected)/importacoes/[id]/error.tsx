'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from './error.module.css';

export interface ImportacaoDetailErrorProps {
  readonly error: Error & { readonly digest?: string | undefined };
  readonly reset: () => void;
}

export default function ImportacaoDetailError({
  error,
  reset,
}: ImportacaoDetailErrorProps) {
  useEffect(() => {
    console.error('[AdminImportacaoDetalhe] Erro inesperado na rota:', error);
  }, [error]);

  return (
    <div className={styles.container} role="alert" aria-live="assertive">
      <div className={styles.card}>
        <h2 className={styles.title}>
          Não foi possível carregar os detalhes desta importação
        </h2>
        <p className={styles.description}>
          Ocorreu uma falha inesperada ao consultar os dados do lote. Tente recarregar a
          página ou volte para a listagem completa do histórico.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={reset} className={styles.retryButton}>
            Tentar novamente
          </button>
          <Link href="/admin/importacoes/historico" className={styles.secondaryLink}>
            Voltar ao Histórico
          </Link>
        </div>
      </div>
    </div>
  );
}
