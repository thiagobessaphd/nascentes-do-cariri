import styles from './map.module.css';

export default function MapLoading() {
  return (
    <div
      className={styles.loadingWrapper}
      role="status"
      aria-live="polite"
      aria-label="Carregando mapa interativo"
    >
      <div className={styles.loadingSpinner} aria-hidden="true" />
      <p className={styles.loadingText}>Carregando mapa das nascentes...</p>
    </div>
  );
}
