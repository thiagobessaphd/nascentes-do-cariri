import Link from 'next/link';
import styles from './error.module.css';

export default function ImportacaoDetailNotFound() {
  return (
    <div className={styles.container} data-testid="importacao-detail-not-found">
      <div className={styles.card}>
        <h1 className={styles.title}>Importação não encontrada</h1>
        <p className={styles.description}>
          O identificador informado na URL não corresponde a um lote válido de importação.
          Consulte o histórico para selecionar um registro existente.
        </p>
        <div className={styles.actions}>
          <Link href="/admin/importacoes/historico" className={styles.retryButton}>
            Voltar ao Histórico
          </Link>
          <Link href="/admin/importacoes" className={styles.secondaryLink}>
            Nova Importação (.txt)
          </Link>
        </div>
      </div>
    </div>
  );
}
