'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { mapConfig } from '@/config/map';
import { useNascentesPublicas } from '@/hooks/useNascentesPublicas';
import type { NascentesQueryParams } from '@/modules/nascentes/nascentes.dto';
import { adjustMapBounds } from './map-bounds';
import styles from './map.module.css';

export interface LeafletMapProps {
  readonly className?: string | undefined;
  readonly params?: NascentesQueryParams | undefined;
}

export default function LeafletMap({ className, params }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [hasTileError, setHasTileError] = useState<boolean>(false);

  const { status, data } = useNascentesPublicas(params);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: [mapConfig.defaultLat, mapConfig.defaultLng],
      zoom: mapConfig.defaultZoom,
      minZoom: mapConfig.minZoom,
      maxZoom: mapConfig.maxZoom,
      zoomControl: true,
      attributionControl: true,
      keyboard: true,
      scrollWheelZoom: true,
      dragging: true,
      touchZoom: true,
      preferCanvas: false,
    });

    const tileLayer = L.tileLayer(mapConfig.tileUrl, {
      attribution: mapConfig.attribution,
      minZoom: mapConfig.minZoom,
      maxZoom: mapConfig.maxZoom,
    });

    tileLayer.on('tileerror', () => {
      setHasTileError(true);
    });

    tileLayer.on('tileload', () => {
      setHasTileError(false);
    });

    tileLayer.addTo(map);

    L.control.scale({ imperial: false, metric: true }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

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
      if (markersLayerRef.current) {
        markersLayerRef.current.clearLayers();
        markersLayerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Enquadramento dinâmico da visualização cartográfica quando os dados estiverem disponíveis
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (status === 'success' || status === 'empty') {
      adjustMapBounds(map, data);
    }
  }, [status, data]);

  const containerClassName = className
    ? `${styles.mapContainer} ${className}`
    : styles.mapContainer;

  return (
    <div
      ref={containerRef}
      id="mapa-cariri"
      className={containerClassName}
      role="region"
      aria-label="Mapa cartográfico das nascentes do Cariri"
      tabIndex={0}
    >
      {hasTileError && (
        <div
          className={styles.tileErrorBanner}
          role="status"
          aria-live="polite"
        >
          <span>Dificuldade em carregar os blocos do mapa. Verifique sua conexão.</span>
        </div>
      )}
    </div>
  );
}
