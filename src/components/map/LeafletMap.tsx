'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { mapConfig } from '@/config/map';
import { useMunicipiosPublicos } from '@/hooks/useMunicipiosPublicos';
import { useNascentesPublicas } from '@/hooks/useNascentesPublicas';
import type { NascentesQueryParams } from '@/modules/nascentes/nascentes.dto';
import { adjustMapBounds } from './map-bounds';
import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  buildNascentesQueryParams,
  clearMapFilterState,
  createDebounceController,
  createInitialMapFilterState,
  hasActiveMapFilters,
  type MapFilterState,
} from './map-filters';
import {
  createNascenteClusterGroup,
  createNascentesMarkers,
  initMarkerClusterPlugin,
} from './map-markers';
import MapCounter from './MapCounter';
import MapFeedback from './MapFeedback';
import MapFilters from './MapFilters';
import styles from './LeafletMap.module.css';
import './map-markers.module.css';
import './map-popup.module.css';

export interface LeafletMapProps {
  readonly className?: string | undefined;
  readonly params?: NascentesQueryParams | undefined;
}

export default function LeafletMap({ className, params }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const [hasTileError, setHasTileError] = useState<boolean>(false);
  const [initialTotal, setInitialTotal] = useState<number | undefined>(undefined);

  const [rawFilterState, setFilterState] = useState<MapFilterState>(() =>
    createInitialMapFilterState(params)
  );
  const filterState: MapFilterState =
    rawFilterState && typeof rawFilterState === 'object'
      ? rawFilterState
      : createInitialMapFilterState(params);

  const debounceRef = useRef(
    createDebounceController<string>(DEFAULT_SEARCH_DEBOUNCE_MS)
  );

  const effectiveParams = buildNascentesQueryParams(
    {
      municipio: filterState.municipio,
      debouncedSearch: filterState.debouncedSearch,
    },
    params
  );

  const isFilterActive = hasActiveMapFilters(filterState);

  const { status, data, error, refetch } = useNascentesPublicas(effectiveParams);

  // Armazena o total geral inicial de nascentes sem filtros para cálculo de proporção nos filtros
  if (!isFilterActive && status === 'success' && data.length > 0 && initialTotal === undefined) {
    setInitialTotal(data.length);
  }

  // Armazena referências sincronizadas via effect para leitura segura em callbacks assíncronos
  const dataRef = useRef(data);
  const statusRef = useRef(status);

  useEffect(() => {
    dataRef.current = data;
    statusRef.current = status;
  }, [data, status]);

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

    mapRef.current = map;

    // Inicialização assíncrona/síncrona resiliente do plugin e camada de clusters
    const setupClusterGroup = async () => {
      try {
        if (typeof L.markerClusterGroup !== 'function') {
          await initMarkerClusterPlugin(L);
        }

        // Uma inicialização antiga não deve anexar camadas ao mapa recriado no StrictMode.
        if (mapRef.current !== map) {
          return;
        }

        const clusterGroup = createNascenteClusterGroup(L);
        clusterGroup.addTo(map);
        clusterGroupRef.current = clusterGroup;

        // Se os dados já estiverem disponíveis antes da inicialização do plugin
        const currentData = dataRef.current;
        const currentStatus = statusRef.current;

        if (currentStatus === 'success' && currentData && currentData.length > 0) {
          clusterGroup.clearLayers();
          const markers = createNascentesMarkers(currentData, L);
          clusterGroup.addLayers(markers);
        }
      } catch (pluginError: unknown) {
        console.error(
          'Falha ao carregar plugin leaflet.markercluster:',
          pluginError instanceof Error ? pluginError.message : pluginError
        );
      }
    };

    void setupClusterGroup();

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
      if (clusterGroupRef.current) {
        clusterGroupRef.current.clearLayers();
        if (mapRef.current) {
          mapRef.current.removeLayer(clusterGroupRef.current);
        }
        clusterGroupRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sincronização dos marcadores e enquadramento cartográfico quando os dados mudam
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;

    if (clusterGroup) {
      clusterGroup.clearLayers();

      if (status === 'success' && data && data.length > 0) {
        const markers = createNascentesMarkers(data, L);
        clusterGroup.addLayers(markers);
      }
    }

    if (map && (status === 'success' || status === 'empty')) {
      adjustMapBounds(map, data);
    }
  }, [status, data]);

  // Limpeza simétrica do timer de debounce ao desmontar o componente
  useEffect(() => {
    const controller = debounceRef.current;
    return () => {
      controller.cancel();
    };
  }, []);

  const municipiosQuery = useMunicipiosPublicos();
  const municipiosOptions = Array.isArray(municipiosQuery.data)
    ? municipiosQuery.data
    : [];

  const handleMunicipioChange = (nextMunicipio: string): void => {
    setFilterState((prev) => {
      const current =
        prev && typeof prev === 'object'
          ? prev
          : createInitialMapFilterState(params);
      return {
        ...current,
        municipio: nextMunicipio,
      };
    });
  };

  const handleSearchInputChange = (nextSearchInput: string): void => {
    const trimmed = nextSearchInput.trim();

    if (trimmed.length === 0) {
      debounceRef.current.cancel();
      setFilterState((prev) => {
        const current =
          prev && typeof prev === 'object'
            ? prev
            : createInitialMapFilterState(params);
        return {
          ...current,
          searchInput: nextSearchInput,
          debouncedSearch: '',
        };
      });
      return;
    }

    setFilterState((prev) => {
      const current =
        prev && typeof prev === 'object'
          ? prev
          : createInitialMapFilterState(params);
      return {
        ...current,
        searchInput: nextSearchInput,
      };
    });

    debounceRef.current.schedule(nextSearchInput, (debouncedValue) => {
      setFilterState((prev) => {
        const current =
          prev && typeof prev === 'object'
            ? prev
            : createInitialMapFilterState(params);
        return {
          ...current,
          debouncedSearch: debouncedValue,
        };
      });
    });
  };

  const handleClearFilters = (): void => {
    debounceRef.current.cancel();
    setFilterState(clearMapFilterState());
  };

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
      <MapFilters
        municipio={filterState.municipio}
        searchInput={filterState.searchInput}
        municipios={municipiosOptions}
        isLoadingMunicipios={Boolean(municipiosQuery.isLoading)}
        municipiosError={municipiosQuery.error}
        hasActiveFilters={isFilterActive}
        onMunicipioChange={handleMunicipioChange}
        onSearchInputChange={handleSearchInputChange}
        onClearFilters={handleClearFilters}
      />
      <div className={styles.counterOverlay}>
        <MapCounter
          count={data.length}
          total={initialTotal}
          hasActiveFilters={isFilterActive}
          isLoading={status === 'loading'}
        />
      </div>
      <MapFeedback
        status={status}
        error={error}
        onRetry={refetch}
        hasActiveFilters={isFilterActive}
        onClearFilters={handleClearFilters}
      />
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
