import styles from './map.module.css';

export default function MapLoading() {
  return (
    <div
      className={styles.skeletonWrapper}
      role="status"
      aria-live="polite"
      aria-label="Carregando mapa interativo das nascentes"
    >
      <div className={styles.skeletonGrid} aria-hidden="true" />
      <div className={styles.skeletonShimmer} aria-hidden="true" />

      <div className={styles.skeletonZoomControl} aria-hidden="true">
        <div className={styles.skeletonZoomButton} />
        <div className={styles.skeletonZoomButton} />
      </div>

      <div className={styles.skeletonScaleControl} aria-hidden="true" />

      <div className={styles.skeletonCenterBadge}>
        <div className={styles.skeletonDropPulse} aria-hidden="true">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
          </svg>
        </div>
        <div className={styles.skeletonTextContent}>
          <p className={styles.skeletonTitle}>Carregando mapa interativo das nascentes</p>
          <div className={styles.skeletonDots} aria-hidden="true">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        </div>
      </div>
    </div>
  );
}
