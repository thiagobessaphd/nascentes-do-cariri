import styles from './boundary.module.css';

export default function ImportacoesLoading() {
  return (
    <div className={styles.container} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.card}>
        <div className={styles.loadingHeader}>
          <span className={styles.spinner} aria-hidden="true" />
          <p className={styles.title}>Carregando painel de importação e validação...</p>
        </div>
        <div className={`${styles.skeletonBlock} ${styles.skeletonWide}`} aria-hidden="true" />
        <div className={`${styles.skeletonBlock} ${styles.skeletonMedium}`} aria-hidden="true" />
      </div>
    </div>
  );
}
