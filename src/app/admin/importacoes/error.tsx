'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from './error.module.css';

export interface ImportacoesErrorProps {
  readonly error: Error & { readonly digest?: string | undefined };
  readonly reset: () => void;
}

export default function ImportacoesError({ error, reset }: ImportacoesErrorProps) {
  useEffect(() => {
    console.error('[AdminImportacoes] Erro inesperado na rota /admin/importacoes:', error);
  }, [error]);

  return (
    <div className={styles.container} role="alert" aria-live="assertive">
      <div className={styles.card}>
        <h2 className={styles.title}>
          Não foi possível carregar o módulo de importação
        </h2>
        <p className={styles.description}>
          Ocorreu uma falha inesperada ao renderizar a área de validação de nascentes.
          Nenhum dado foi alterado no banco. Tente recarregar o painel ou retorne ao mapa público.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={reset} className={styles.retryButton}>
            Tentar novamente
          </button>
          <Link href="/mapa" className={styles.secondaryLink}>
            Abrir Mapa Público
          </Link>
        </div>
      </div>
    </div>
  );
}
