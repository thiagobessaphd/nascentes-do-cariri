import styles from './loading.module.css';

export default function ImportacoesHistoryLoading() {
  return (
    <div
      className={styles.container}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={styles.srOnly}>
        Carregando histórico administrativo de importações...
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

      <div className={styles.filterCard} aria-hidden="true">
        <div className={styles.filterControls}>
          <div className={styles.filterField}>
            <span className={`${styles.skeletonLine} ${styles.labelBar}`} />
            <span className={`${styles.skeletonLine} ${styles.selectBar}`} />
          </div>
          <div className={styles.filterField}>
            <span className={`${styles.skeletonLine} ${styles.labelShortBar}`} />
            <span className={`${styles.skeletonLine} ${styles.pageSizeBar}`} />
          </div>
        </div>
        <span className={`${styles.skeletonLine} ${styles.countBar}`} />
      </div>

      <div className={styles.tableCard} aria-hidden="true">
        <div className={styles.tableHeadRow}>
          <span className={`${styles.skeletonLine} ${styles.headBar}`} />
          <span className={`${styles.skeletonLine} ${styles.headBar}`} />
          <span className={`${styles.skeletonLine} ${styles.headBar}`} />
          <span className={`${styles.skeletonLine} ${styles.headBar}`} />
          <span className={`${styles.skeletonLine} ${styles.headBar}`} />
          <span className={`${styles.skeletonLine} ${styles.headBar}`} />
        </div>
        {[0, 1, 2, 3, 4].map((rowIndex) => (
          <div key={rowIndex} className={styles.tableRow}>
            <div className={styles.cellStack}>
              <span className={`${styles.skeletonLine} ${styles.cellWide}`} />
              <span className={`${styles.skeletonLine} ${styles.cellTag}`} />
            </div>
            <div className={styles.cellStack}>
              <span className={`${styles.skeletonLine} ${styles.cellMedium}`} />
              <span className={`${styles.skeletonLine} ${styles.cellWide}`} />
            </div>
            <div className={styles.cellStack}>
              <span className={`${styles.skeletonLine} ${styles.cellMedium}`} />
              <span className={`${styles.skeletonLine} ${styles.cellWide}`} />
            </div>
            <div className={styles.cellGrid}>
              <span className={`${styles.skeletonLine} ${styles.cellMini}`} />
              <span className={`${styles.skeletonLine} ${styles.cellMini}`} />
              <span className={`${styles.skeletonLine} ${styles.cellMini}`} />
              <span className={`${styles.skeletonLine} ${styles.cellMini}`} />
            </div>
            <span className={`${styles.skeletonLine} ${styles.pillBar}`} />
            <div className={styles.cellActions}>
              <span className={`${styles.skeletonLine} ${styles.btnBar}`} />
              <span className={`${styles.skeletonLine} ${styles.btnBar}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
