'use client';

import dynamic from 'next/dynamic';
import MapLoading from '@/components/map/MapLoading';
import styles from '@/components/map/map.module.css';

const LeafletMap = dynamic(() => import('@/components/map/LeafletMap'), {
  ssr: false,
  loading: () => <MapLoading />,
});

export default function MapaPage() {
  return (
    <main className={styles.mapaMain} aria-label="Mapa Interativo">
      <h1 className={styles.srOnly}>Mapa Interativo das Nascentes do Cariri</h1>
      <LeafletMap />
    </main>
  );
}
