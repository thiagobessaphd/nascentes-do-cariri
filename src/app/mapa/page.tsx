'use client';

import dynamic from 'next/dynamic';
import styles from './page.module.css';

const LeafletMap = dynamic(() => import('@/components/map/LeafletMap'), {
  ssr: false,
  loading: () => (
    <div
      className={styles.loadingWrapper}
      role="status"
      aria-live="polite"
      aria-label="Carregando mapa interativo"
    >
      <div className={styles.loadingSpinner} aria-hidden="true" />
      <p className={styles.loadingText}>Carregando mapa das nascentes...</p>
    </div>
  ),
});

export default function MapaPage() {
  return (
    <main className={styles.mapaMain} aria-label="Mapa Interativo">
      <h1 className={styles.srOnly}>Mapa Interativo das Nascentes do Cariri</h1>
      <LeafletMap />
    </main>
  );
}
