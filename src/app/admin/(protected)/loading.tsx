import styles from './loading.module.css';

export default function AdminDashboardLoading() {
  return (
    <div
      className={styles.container}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={styles.srOnly}>
        Carregando resumo do painel administrativo...
      </span>

      <header className={styles.headerCard} aria-hidden="true">
        <div className={styles.headerTextGroup}>
          <span className={`${styles.skeletonLine} ${styles.overlineBar}`} />
          <span className={`${styles.skeletonLine} ${styles.titleBar}`} />
          <span className={`${styles.skeletonLine} ${styles.subtitleBar}`} />
          <span className={`${styles.skeletonLine} ${styles.subtitleShortBar}`} />
        </div>
        <span className={`${styles.skeletonLine} ${styles.ctaButtonBar}`} />
      </header>

      <div className={styles.kpiGrid} aria-hidden="true">
        <div className={`${styles.kpiCard} ${styles.springsCard}`}>
          <span className={`${styles.skeletonLine} ${styles.cardOverlineBar}`} />
          <span className={`${styles.skeletonLine} ${styles.heroNumBar}`} />
          <span className={`${styles.skeletonLine} ${styles.cardDescBar}`} />
          <span className={`${styles.skeletonLine} ${styles.footerLinkBar}`} />
        </div>

        <div className={`${styles.kpiCard} ${styles.lastImportCard}`}>
          <div className={styles.cardTopRow}>
            <span className={`${styles.skeletonLine} ${styles.cardOverlineBar}`} />
            <span className={`${styles.skeletonLine} ${styles.pillBar}`} />
          </div>
          <span className={`${styles.skeletonLine} ${styles.fileBar}`} />
          <div className={styles.metaRow}>
            <span className={`${styles.skeletonLine} ${styles.metaBar}`} />
            <span className={`${styles.skeletonLine} ${styles.metaBar}`} />
          </div>
          <div className={styles.countsRow}>
            <span className={`${styles.skeletonLine} ${styles.countBar}`} />
            <span className={`${styles.skeletonLine} ${styles.countBar}`} />
            <span className={`${styles.skeletonLine} ${styles.countBar}`} />
            <span className={`${styles.skeletonLine} ${styles.countBar}`} />
          </div>
        </div>
      </div>

      <div className={styles.tableCard} aria-hidden="true">
        <div className={styles.tableHeader}>
          <span className={`${styles.skeletonLine} ${styles.sectionTitleBar}`} />
          <span className={`${styles.skeletonLine} ${styles.viewAllBar}`} />
        </div>
        {[0, 1, 2, 3, 4].map((rowIndex) => (
          <div key={rowIndex} className={styles.tableRow}>
            <span className={`${styles.skeletonLine} ${styles.cellWide}`} />
            <span className={`${styles.skeletonLine} ${styles.cellMedium}`} />
            <span className={`${styles.skeletonLine} ${styles.cellMedium}`} />
            <span className={`${styles.skeletonLine} ${styles.pillBar}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
