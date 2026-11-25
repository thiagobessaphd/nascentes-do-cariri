'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from './error.module.css';

export interface AdminLoginErrorProps {
  readonly error: Error & { readonly digest?: string | undefined };
  readonly reset: () => void;
}

export default function AdminLoginError({
  error,
  reset,
}: AdminLoginErrorProps) {
  useEffect(() => {
    console.error('[AdminLogin] Erro inesperado na rota /admin/login:', error);
  }, [error]);

  return (
    <main className={styles.container}>
      <div className={styles.card} role="alert" aria-live="assertive">
        <h1 className={styles.title}>
          Não foi possível carregar a tela de acesso administrativo
        </h1>
        <p className={styles.description}>
          Ocorreu uma falha temporária ao verificar a página de autenticação. Tente
          novamente em instantes ou retorne ao mapa público das Nascentes do Cariri.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={reset} className={styles.retryButton}>
            Tentar novamente
          </button>
          <Link href="/mapa" className={styles.secondaryLink}>
            Voltar ao Mapa Público
          </Link>
        </div>
      </div>
    </main>
  );
}
