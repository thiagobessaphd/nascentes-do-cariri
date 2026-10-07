import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "Mapa das Nascentes do Cariri",
  description: "Visualização geográfica e interativa das nascentes da região do Cariri cearense."
};

interface MapaLayoutProps {
  children: ReactNode;
}

export default function MapaLayout({ children }: Readonly<MapaLayoutProps>) {
  return (
    <div
      id="mapa-publico-layout"
      className={styles.mapaLayout}
      role="region"
      aria-label="Mapa Interativo das Nascentes do Cariri"
    >
      {children}
    </div>
  );
}
