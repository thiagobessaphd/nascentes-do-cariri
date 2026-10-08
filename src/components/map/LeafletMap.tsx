'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { mapConfig } from '@/config/map';
import styles from './map.module.css';

export interface LeafletMapProps {
  readonly className?: string;
}

export default function LeafletMap({ className }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: [mapConfig.defaultLat, mapConfig.defaultLng],
      zoom: mapConfig.defaultZoom,
      zoomControl: true,
      attributionControl: true,
      keyboard: true,
      scrollWheelZoom: true,
      preferCanvas: false,
    });

    L.tileLayer(mapConfig.tileUrl, {
      attribution: mapConfig.attribution,
      maxZoom: mapConfig.maxZoom,
    }).addTo(map);

    L.control.scale({ imperial: false }).addTo(map);

    mapRef.current = map;

    let resizeObserver: ResizeObserver | null = null;
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }

        resizeTimeout = setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize({ pan: false, debounceMoveend: true });
          }
        }, 100);
      });

      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const containerClassName = className
    ? `${styles.mapContainer} ${className}`
    : styles.mapContainer;

  return (
    <div
      ref={containerRef}
      id="mapa-cariri"
      className={containerClassName}
      role="application"
      aria-label="Mapa cartográfico das nascentes do Cariri"
      tabIndex={0}
    />
  );
}
