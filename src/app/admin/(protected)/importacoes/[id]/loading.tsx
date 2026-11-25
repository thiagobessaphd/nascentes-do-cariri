import styles from './loading.module.css';

export default function ImportacaoDetailLoading() {
  return (
    <div
      className={styles.container}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={styles.srOnly}>Carregando detalhes da importação...</span>

      <div className={styles.breadcrumbBar} aria-hidden="true">
        <span className={`${styles.skeletonLine} ${styles.backBar}`} />
      </div>

      <section className={styles.heroCard} aria-hidden="true">
        <div className={styles.heroTop}>
          <div className={styles.heroText}>
            <span className={`${styles.skeletonLine} ${styles.overlineBar}`} />
            <span className={`${styles.skeletonLine} ${styles.titleBar}`} />
            <span className={`${styles.skeletonLine} ${styles.subtitleBar}`} />
          </div>
          <span className={`${styles.skeletonLine} ${styles.badgeBar}`} />
        </div>
        <div className={styles.metaGrid}>
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className={styles.metaItem}>
              <span className={`${styles.skeletonLine} ${styles.metaLabel}`} />
              <span className={`${styles.skeletonLine} ${styles.metaValue}`} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.kpiGrid} aria-hidden="true">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className={styles.kpiCard}>
            <span className={`${styles.skeletonLine} ${styles.kpiLabel}`} />
            <span className={`${styles.skeletonLine} ${styles.kpiVal}`} />
          </div>
        ))}
      </section>

      <section className={styles.sectionCard} aria-hidden="true">
        <span className={`${styles.skeletonLine} ${styles.sectionTitle}`} />
        <span className={`${styles.skeletonLine} ${styles.rowWide}`} />
        <span className={`${styles.skeletonLine} ${styles.rowWide}`} />
        <span className={`${styles.skeletonLine} ${styles.rowShort}`} />
      </section>
    </div>
  );
}
