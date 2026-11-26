'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from './error.module.css';

export interface AdminDashboardErrorProps {
  readonly error: Error & { readonly digest?: string | undefined };
  readonly reset: () => void;
}

export default function AdminDashboardError({
  error,
  reset,
}: AdminDashboardErrorProps) {
  useEffect(() => {
    console.error('[AdminDashboard] Erro inesperado na rota /admin:', error);
  }, [error]);

  return (
    <div className={styles.container} role="alert" aria-live="assertive">
      <div className={styles.card}>
        <h1 className={styles.title}>
          Não foi possível carregar o painel administrativo
        </h1>
        <p className={styles.description}>
          Ocorreu uma falha inesperada ao exibir o resumo operacional. Nenhum dado foi
          alterado. Tente recarregar a página ou acesse diretamente os módulos de
          importação e histórico.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={reset} className={styles.retryButton}>
            Tentar novamente
          </button>
          <Link href="/admin/importacoes" className={styles.secondaryLink}>
            Ir para Importação de Dados
          </Link>
          <Link href="/admin/importacoes/historico" className={styles.secondaryLink}>
            Ver Histórico de Lotes
          </Link>
        </div>
      </div>
    </div>
  );
}
