import styles from './loading.module.css';

export default function ImportacoesLoading() {
  return (
    <div
      className={styles.container}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={styles.srOnly}>
        Carregando painel de importação e validação...
      </span>

      <header className={styles.headerCard} aria-hidden="true">
        <div className={styles.headerTextGroup}>
          <span className={`${styles.skeletonLine} ${styles.overlineBar}`} />
          <span className={`${styles.skeletonLine} ${styles.titleBar}`} />
          <span className={`${styles.skeletonLine} ${styles.subtitleBar}`} />
        </div>
        <span className={`${styles.skeletonLine} ${styles.historyBtnBar}`} />
      </header>

      <section className={styles.workspaceCard} aria-hidden="true">
        <span className={`${styles.skeletonLine} ${styles.sectionTitleBar}`} />
        <div className={styles.dropzoneBox}>
          <span className={`${styles.skeletonLine} ${styles.dropIconBar}`} />
          <span className={`${styles.skeletonLine} ${styles.dropLabelBar}`} />
          <span className={`${styles.skeletonLine} ${styles.dropHintBar}`} />
        </div>
        <div className={styles.actionsFooter}>
          <span className={`${styles.skeletonLine} ${styles.primaryActionBar}`} />
        </div>
      </section>
    </div>
  );
}
