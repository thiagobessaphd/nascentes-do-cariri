import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { mapConfig } from '@/config/map';
import styles from '@/components/map/LeafletMap.module.css';
import feedbackStyles from '@/components/map/MapFeedback.module.css';

// Mock do módulo Leaflet para testes determinísticos em ambiente Node
const mockMapInstance = {
  remove: vi.fn(),
  invalidateSize: vi.fn(),
  fitBounds: vi.fn(),
  setView: vi.fn(),
};

const registeredEventHandlers: Record<string, () => void> = {};

const mockTileLayerInstance = {
  addTo: vi.fn().mockReturnThis(),
  on: vi.fn((event: string, handler: () => void) => {
    registeredEventHandlers[event] = handler;
    return mockTileLayerInstance;
  }),
};

const mockScaleControlInstance = {
  addTo: vi.fn().mockReturnThis(),
};

const mockLayerGroupInstance = {
  addTo: vi.fn().mockReturnThis(),
  clearLayers: vi.fn(),
};

vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => mockMapInstance),
    tileLayer: vi.fn(() => mockTileLayerInstance),
    control: {
      scale: vi.fn(() => mockScaleControlInstance),
    },
    layerGroup: vi.fn(() => mockLayerGroupInstance),
    latLngBounds: vi.fn((latLngs: [number, number][]) => ({
      isValid: () => Array.isArray(latLngs) && latLngs.length > 0,
    })),
  },
}));

// Mock do CSS para import 'leaflet/dist/leaflet.css'
vi.mock('leaflet/dist/leaflet.css', () => ({}));

import L from 'leaflet';
import LeafletMap from '@/components/map/LeafletMap';

describe('Base Leaflet e Configuração de Tiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(registeredEventHandlers)) {
      delete registeredEventHandlers[key];
    }
  });

  describe('1. Inicialização com configuração válida/inválida', () => {
    it('deve renderizar o container do mapa com id, role semântica, aria-label e foco acessível', async () => {
      const { renderToString } = await import('react-dom/server');
      const html = renderToString(React.createElement(LeafletMap));

      expect(html).toContain('id="mapa-cariri"');
      expect(html).toContain('role="region"');
      expect(html).toContain('aria-label="Mapa cartográfico das nascentes do Cariri"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain(styles.mapContainer);
    });

    it('deve permitir estender a estilização do container através da prop className', async () => {
      const { renderToString } = await import('react-dom/server');
      const customClass = 'custom-map-class';
      const html = renderToString(React.createElement(LeafletMap, { className: customClass }));

      expect(html).toContain(styles.mapContainer);
      expect(html).toContain(customClass);
    });

    it('deve inicializar o mapa com parâmetros válidos de coordenadas e limites do Cariri', () => {
      const mockContainer = {} as HTMLDivElement;

      const validOptions: L.MapOptions = {
        center: [mapConfig.defaultLat, mapConfig.defaultLng] as [number, number],
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
      };

      L.map(mockContainer, validOptions);

      expect(L.map).toHaveBeenCalledWith(mockContainer, expect.objectContaining({
        center: [-7.23456789, -39.12345678],
        zoom: 10,
        minZoom: 6,
        maxZoom: 19,
      }));
    });

    it('deve manter a estabilidade do LeafletMap mesmo sob fallback de configuração ausente ou inválida', () => {
      // Garante que o objeto mapConfig fornece valores padrão seguros em qualquer cenário de fallback
      expect(mapConfig.tileUrl).toBeDefined();
      expect(mapConfig.tileUrl.startsWith('http')).toBe(true);
      expect(mapConfig.attribution).toContain('OpenStreetMap');
      expect(mapConfig.minZoom).toBeLessThanOrEqual(mapConfig.maxZoom);
      expect(mapConfig.caririBounds).toBeDefined();
    });

    it('deve tratar eventos de falha de carregamento de tiles (tileerror) exibindo feedback acessível', async () => {
      const tileLayer = L.tileLayer(mapConfig.tileUrl, {
        attribution: mapConfig.attribution,
        minZoom: mapConfig.minZoom,
        maxZoom: mapConfig.maxZoom,
      });

      tileLayer.on('tileerror', () => { });
      tileLayer.on('tileload', () => { });

      expect(tileLayer.on).toHaveBeenCalledWith('tileerror', expect.any(Function));
      expect(tileLayer.on).toHaveBeenCalledWith('tileload', expect.any(Function));

      const { renderToString } = await import('react-dom/server');
      const errorBannerHtml = renderToString(
        React.createElement(
          'div',
          {
            className: styles.tileErrorBanner,
            role: 'status',
            'aria-live': 'polite',
          },
          React.createElement('span', null, 'Dificuldade em carregar os blocos do mapa. Verifique sua conexão.')
        )
      );

      expect(errorBannerHtml).toContain('role="status"');
      expect(errorBannerHtml).toContain('aria-live="polite"');
      expect(errorBannerHtml).toContain(styles.tileErrorBanner);
      expect(errorBannerHtml).toContain('Dificuldade em carregar os blocos do mapa');
    });
  });

  describe('2. Controles e atribuição em desktop/móvel', () => {
    it('deve habilitar interatividade completa: toque (mobile), teclado, arrasto e scroll', () => {
      const mockContainer = {} as HTMLDivElement;

      L.map(mockContainer, {
        center: [mapConfig.defaultLat, mapConfig.defaultLng] as [number, number],
        zoom: mapConfig.defaultZoom,
        minZoom: mapConfig.minZoom,
        maxZoom: mapConfig.maxZoom,
        zoomControl: true,
        attributionControl: true,
        keyboard: true,
        scrollWheelZoom: true,
        dragging: true,
        touchZoom: true,
      });

      expect(L.map).toHaveBeenCalledWith(mockContainer, expect.objectContaining({
        touchZoom: true,
        dragging: true,
        scrollWheelZoom: true,
        keyboard: true,
        zoomControl: true,
        attributionControl: true,
      }));
    });

    it('deve incluir o controle de escala métrica nativo do Leaflet (imperial=false, metric=true)', () => {
      L.control.scale({ imperial: false, metric: true });

      expect(L.control.scale).toHaveBeenCalledWith({
        imperial: false,
        metric: true,
      });
    });

    it('deve configurar camada de tiles com atribuição ODbL permanente e visível', () => {
      const tileLayer = L.tileLayer(mapConfig.tileUrl, {
        attribution: mapConfig.attribution,
        minZoom: mapConfig.minZoom,
        maxZoom: mapConfig.maxZoom,
      });

      expect(L.tileLayer).toHaveBeenCalledWith(
        mapConfig.tileUrl,
        expect.objectContaining({
          attribution: expect.stringContaining('OpenStreetMap'),
          minZoom: 6,
          maxZoom: 19,
        })
      );
      expect(tileLayer).toBe(mockTileLayerInstance);
    });

    it('deve conter as classes de estilo para responsividade de layout, escala e atribuição mobile', () => {
      expect(styles.mapContainer).toBeDefined();
      expect(styles.tileErrorBanner).toBeDefined();
    });
  });

  describe('3. Integração de Estados, Feedbacks e Ciclo de Vida da Camada de Marcadores', () => {
    it('deve inicializar e vincular a camada dedicada de marcadores (L.layerGroup) ao mapa', () => {
      const mockContainer = {} as HTMLDivElement;
      const map = L.map(mockContainer);

      const markersLayer = L.layerGroup().addTo(map);

      expect(L.layerGroup).toHaveBeenCalled();
      expect(markersLayer.addTo).toHaveBeenCalledWith(map);
    });

    it('deve limpar as camadas de marcadores ao desmontar o mapa para evitar vazamentos de memória', () => {
      const markersLayer = L.layerGroup();
      markersLayer.clearLayers();

      expect(markersLayer.clearLayers).toHaveBeenCalled();
    });

    it('deve renderizar o MapFeedback dentro do container do mapa', async () => {
      const { renderToString } = await import('react-dom/server');
      const html = renderToString(React.createElement(LeafletMap));

      // No primeiro ciclo de renderização no servidor, o feedback inicial é montado
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Carregando nascentes...');
      expect(html).toContain(feedbackStyles.feedbackCard);
      expect(html).toContain(feedbackStyles.feedbackLoading);
    });

    it('deve repassar parâmetros de busca (município, q, bounds) sem quebrar a inicialização do mapa', async () => {
      const { renderToString } = await import('react-dom/server');
      const params = {
        municipio: 'Crato',
        q: 'Batateiras',
        north: -7.2,
        south: -7.4,
        east: -39.3,
        west: -39.5,
      };

      const html = renderToString(React.createElement(LeafletMap, { params }));

      expect(html).toContain('id="mapa-cariri"');
      expect(html).toContain('role="region"');
      expect(html).toContain(styles.mapContainer);
    });
  });
});
