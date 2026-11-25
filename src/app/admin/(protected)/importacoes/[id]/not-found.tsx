import Link from 'next/link';
import styles from './not-found.module.css';

export default function ImportacaoDetailNotFound() {
  return (
    <div className={styles.container} data-testid="importacao-detail-not-found">
      <div className={styles.card}>
        <div className={styles.iconBadge} aria-hidden="true">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <circle cx="11.5" cy="14.5" r="2.5" />
            <line x1="13.3" y1="16.3" x2="15.5" y2="18.5" />
          </svg>
        </div>

        <span className={styles.codeBadge}>Erro 404</span>

        <h1 className={styles.title}>Importação não encontrada</h1>

        <p className={styles.description}>
          O registro informado não corresponde a um lote válido de importação.
          Consulte o histórico para selecionar um registro existente ou envie um novo arquivo.
        </p>

        <div className={styles.actions}>
          <Link href="/admin/importacoes/historico" className={styles.primaryButton}>
            Voltar ao Histórico
          </Link>
        </div>
      </div>
    </div>
  );
}
