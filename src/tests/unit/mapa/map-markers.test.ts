import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NascentePublicDto } from '@/modules/nascentes/nascentes.dto';

const mockMarkerInstances: Array<{ latLng: [number, number]; options: Record<string, unknown> }> = [];

const mockClusterGroupInstance = {
  addTo: vi.fn().mockReturnThis(),
  clearLayers: vi.fn(),
  addLayers: vi.fn(),
  removeLayer: vi.fn(),
};

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn((options: Record<string, unknown>) => ({
      _isDivIcon: true,
      options,
    })),
    marker: vi.fn((latLng: [number, number], options: Record<string, unknown>) => {
      const instance = {
        latLng,
        options,
        addTo: vi.fn().mockReturnThis(),
      };
      mockMarkerInstances.push(instance);
      return instance;
    }),
    markerClusterGroup: vi.fn((options: Record<string, unknown>) => ({
      ...mockClusterGroupInstance,
      options,
    })),
  },
}));

import L from 'leaflet';
import {
  NASCENTE_ICON_SIZE,
  NASCENTE_ICON_ANCHOR,
  NASCENTE_POPUP_ANCHOR,
  NASCENTE_TOOLTIP_ANCHOR,
  NASCENTE_PIN_CSS_CLASS,
  NASCENTE_PIN_SVG,
  DEFAULT_CLUSTER_OPTIONS,
  getNascenteIcon,
  resetNascenteIconCache,
  createNascenteMarker,
  createNascentesMarkers,
  createNascenteClusterGroup,
  initMarkerClusterPlugin,
  type NascenteMarker,
} from '@/components/map/map-markers';

describe('Módulo de Marcadores e Agrupamento Leaflet (src/components/map/map-markers.ts)', () => {
  const mockNascenteValida: NascentePublicDto = {
    id: 101,
    latitude: -7.234567,
    longitude: -39.415678,
    municipio: 'Crato',
    fonte: 'Fonte dos Buritis',
    localidade: 'Sítio Fundão',
    data_criacao: '2024-03-20',
    vazao_media: 5.4,
    unidade_vazao: 'm³/s',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkerInstances.length = 0;
    resetNascenteIconCache();
  });

  describe('1. Dimensões, Âncoras e Ícone SVG (Flyweight / Singleton)', () => {
    it('deve definir dimensões e âncoras cartográficas precisas para o ícone de nascente', () => {
      expect(NASCENTE_ICON_SIZE).toEqual([28, 36]);
      expect(NASCENTE_ICON_ANCHOR).toEqual([14, 36]);
      expect(NASCENTE_POPUP_ANCHOR).toEqual([0, -36]);
      expect(NASCENTE_TOOLTIP_ANCHOR).toEqual([14, -18]);
      expect(NASCENTE_PIN_CSS_CLASS).toBe('nascente-marker-pin');
    });

    it('deve conter marcação SVG semântica com gota d água e contraste na cor Cariri (#0284c7)', () => {
      expect(NASCENTE_PIN_SVG).toContain('<svg');
      expect(NASCENTE_PIN_SVG).toContain('viewBox="0 0 28 36"');
      expect(NASCENTE_PIN_SVG).toContain('fill="#0284c7"');
      expect(NASCENTE_PIN_SVG).toContain('fill="#ffffff"');
      expect(NASCENTE_PIN_SVG).toContain('role="img"');
      expect(NASCENTE_PIN_SVG).toContain('aria-hidden="true"');
      expect(NASCENTE_PIN_SVG).toContain('nascente-pin-svg');
    });

    it('deve instanciar o L.divIcon com os parâmetros de estilo e âncoras corretos', () => {
      const icon = getNascenteIcon(L);

      expect(L.divIcon).toHaveBeenCalledTimes(1);
      expect(L.divIcon).toHaveBeenCalledWith({
        className: 'nascente-marker-pin',
        html: NASCENTE_PIN_SVG,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -36],
        tooltipAnchor: [14, -18],
      });
      expect(icon).toBeDefined();
    });

    it('deve reutilizar rigorosamente a mesma instância do ícone (Singleton)', () => {
      const icon1 = getNascenteIcon(L);
      const icon2 = getNascenteIcon(L);
      const icon3 = getNascenteIcon(L);

      // Garante que L.divIcon foi chamado apenas 1 vez e que todos os ponteiros são idênticos
      expect(L.divIcon).toHaveBeenCalledTimes(1);
      expect(icon1).toBe(icon2);
      expect(icon2).toBe(icon3);
    });

    it('deve permitir resetar o cache do ícone via resetNascenteIconCache', () => {
      const icon1 = getNascenteIcon(L);
      resetNascenteIconCache();
      const icon2 = getNascenteIcon(L);

      expect(L.divIcon).toHaveBeenCalledTimes(2);
      expect(icon1).not.toBe(icon2);
    });
  });

  describe('2. Criação de Marcador Individual e Validação de Coordenadas (createNascenteMarker)', () => {
    it('deve instanciar um L.Marker com coordenadas [latitude, longitude] válidas e dados anexados', () => {
      const marker = createNascenteMarker(mockNascenteValida, L) as NascenteMarker;

      expect(marker).not.toBeNull();
      expect(L.marker).toHaveBeenCalledWith(
        [mockNascenteValida.latitude, mockNascenteValida.longitude],
        expect.objectContaining({
          keyboard: true,
          riseOnHover: true,
          title: 'Fonte dos Buritis — Crato',
          alt: 'Marcador da nascente: Fonte dos Buritis — Crato',
        })
      );
      expect(marker.nascenteData).toEqual(mockNascenteValida);
    });

    it('deve formatar título com fallback seguro caso fonte ou município sejam vazios', () => {
      const nascenteSemFonte: NascentePublicDto = {
        ...mockNascenteValida,
        fonte: '',
        municipio: 'Juazeiro do Norte',
      };

      createNascenteMarker(nascenteSemFonte, L);

      expect(L.marker).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          title: 'Nascente — Juazeiro do Norte',
          alt: 'Marcador da nascente: Nascente — Juazeiro do Norte',
        })
      );
    });

    it('deve formatar título com fallback para "Cariri" quando município for omitido ou vazio', () => {
      const nascenteSemMunicipio: NascentePublicDto = {
        ...mockNascenteValida,
        fonte: 'Olho D Água',
        municipio: '',
      };

      createNascenteMarker(nascenteSemMunicipio, L);

      expect(L.marker).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          title: 'Olho D Água — Cariri',
        })
      );
    });

    it('deve sanitizar strings de fonte e município compostas apenas por espaços em branco', () => {
      const nascenteComEspacos: NascentePublicDto = {
        ...mockNascenteValida,
        fonte: '   ',
        municipio: '   ',
      };

      createNascenteMarker(nascenteComEspacos, L);

      expect(L.marker).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          title: 'Nascente — Cariri',
          alt: 'Marcador da nascente: Nascente — Cariri',
        })
      );
    });

    it('deve aceitar coordenadas limítrofes exatas [-90, -180], [90, 180] e [0, 0]', () => {
      const pontoZero = createNascenteMarker({ ...mockNascenteValida, latitude: 0, longitude: 0 }, L);
      const pontoMin = createNascenteMarker({ ...mockNascenteValida, latitude: -90, longitude: -180 }, L);
      const pontoMax = createNascenteMarker({ ...mockNascenteValida, latitude: 90, longitude: 180 }, L);

      expect(pontoZero).not.toBeNull();
      expect(pontoMin).not.toBeNull();
      expect(pontoMax).not.toBeNull();
    });

    it('deve permitir injetar um ícone customizado', () => {
      const customIcon = { custom: true } as unknown as L.DivIcon;
      createNascenteMarker(mockNascenteValida, L, customIcon);

      expect(L.marker).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          icon: customIcon,
        })
      );
    });

    describe('Rejeição Segura de Coordenadas Inválidas', () => {
      it('deve retornar null para latitude NaN', () => {
        const marker = createNascenteMarker({ ...mockNascenteValida, latitude: NaN }, L);
        expect(marker).toBeNull();
      });

      it('deve retornar null para longitude NaN', () => {
        const marker = createNascenteMarker({ ...mockNascenteValida, longitude: NaN }, L);
        expect(marker).toBeNull();
      });

      it('deve retornar null para coordenadas Infinity ou -Infinity', () => {
        expect(createNascenteMarker({ ...mockNascenteValida, latitude: Infinity }, L)).toBeNull();
        expect(createNascenteMarker({ ...mockNascenteValida, latitude: -Infinity }, L)).toBeNull();
        expect(createNascenteMarker({ ...mockNascenteValida, longitude: Infinity }, L)).toBeNull();
        expect(createNascenteMarker({ ...mockNascenteValida, longitude: -Infinity }, L)).toBeNull();
      });

      it('deve retornar null para latitude fora dos limites globais [-90, 90]', () => {
        expect(createNascenteMarker({ ...mockNascenteValida, latitude: 90.0001 }, L)).toBeNull();
        expect(createNascenteMarker({ ...mockNascenteValida, latitude: -90.0001 }, L)).toBeNull();
        expect(createNascenteMarker({ ...mockNascenteValida, latitude: 150 }, L)).toBeNull();
      });

      it('deve retornar null para longitude fora dos limites globais [-180, 180]', () => {
        expect(createNascenteMarker({ ...mockNascenteValida, longitude: 180.0001 }, L)).toBeNull();
        expect(createNascenteMarker({ ...mockNascenteValida, longitude: -180.0001 }, L)).toBeNull();
        expect(createNascenteMarker({ ...mockNascenteValida, longitude: 220 }, L)).toBeNull();
      });

      it('deve retornar null para coordenadas não numéricas (string, null, undefined)', () => {
        // @ts-expect-error teste proposital de payload malformado em runtime
        expect(createNascenteMarker({ ...mockNascenteValida, latitude: '-7.234' }, L)).toBeNull();
        // @ts-expect-error teste proposital de payload malformado em runtime
        expect(createNascenteMarker({ ...mockNascenteValida, latitude: null }, L)).toBeNull();
        // @ts-expect-error teste proposital de payload malformado em runtime
        expect(createNascenteMarker({ ...mockNascenteValida, longitude: undefined }, L)).toBeNull();
      });
    });
  });

  describe('3. Criação de Marcadores em Lote (createNascentesMarkers)', () => {
    it('deve retornar array vazio para 0 registros (dataset vazio)', () => {
      const markers = createNascentesMarkers([], L);
      expect(markers).toEqual([]);
      expect(L.marker).not.toHaveBeenCalled();
    });

    it('deve processar corretamente 1 único registro', () => {
      const markers = createNascentesMarkers([mockNascenteValida], L);
      expect(markers).toHaveLength(1);
      expect(L.marker).toHaveBeenCalledTimes(1);
    });

    it('deve processar N registros válidos com alto desempenho', () => {
      const lote: NascentePublicDto[] = [
        { ...mockNascenteValida, id: 1, latitude: -7.21, longitude: -39.41 },
        { ...mockNascenteValida, id: 2, latitude: -7.22, longitude: -39.42 },
        { ...mockNascenteValida, id: 3, latitude: -7.23, longitude: -39.43 },
        { ...mockNascenteValida, id: 4, latitude: -7.24, longitude: -39.44 },
      ];

      const markers = createNascentesMarkers(lote, L);

      expect(markers).toHaveLength(4);
      expect(L.marker).toHaveBeenCalledTimes(4);
    });

    it('deve descartar de forma resiliente registros com coordenadas inválidas sem interromper o lote', () => {
      const loteMisto: NascentePublicDto[] = [
        { ...mockNascenteValida, id: 1, latitude: -7.21, longitude: -39.41 },
        { ...mockNascenteValida, id: 2, latitude: NaN, longitude: -39.42 }, // Inválido
        { ...mockNascenteValida, id: 3, latitude: -7.23, longitude: -39.43 },
        { ...mockNascenteValida, id: 4, latitude: 100, longitude: -39.44 }, // Fora do globo
        { ...mockNascenteValida, id: 5, latitude: -7.25, longitude: Infinity }, // Inválido
        { ...mockNascenteValida, id: 6, latitude: -7.26, longitude: -39.46 },
      ];

      const markers = createNascentesMarkers(loteMisto, L);

      expect(markers).toHaveLength(3);
      expect(markers.map((m) => m.nascenteData?.id)).toEqual([1, 3, 6]);
    });
  });

  describe('4. Configuração e Fábrica de Clusters (createNascenteClusterGroup)', () => {
    it('deve expor opções padrão ideais de clusterização para o Cariri', () => {
      expect(DEFAULT_CLUSTER_OPTIONS).toEqual({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        removeOutsideVisibleBounds: true,
        chunkedLoading: false,
        animate: true,
      });
    });

    it('deve instanciar o MarkerClusterGroup aplicando as opções padrão', () => {
      const clusterGroup = createNascenteClusterGroup(L);

      expect(L.markerClusterGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          maxClusterRadius: 50,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          removeOutsideVisibleBounds: true,
          chunkedLoading: false,
        })
      );
      expect(clusterGroup).toBeDefined();
    });

    it('deve permitir sobrescrever ou estender as opções padrão do cluster', () => {
      createNascenteClusterGroup(L, {
        maxClusterRadius: 80,
        showCoverageOnHover: true,
      });

      expect(L.markerClusterGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          maxClusterRadius: 80,
          showCoverageOnHover: true,
          spiderfyOnMaxZoom: true,
        })
      );
    });

    it('deve lançar erro descritivo caso o plugin leaflet.markercluster não esteja disponível em L', () => {
      const mockSemPlugin = {} as typeof L;

      expect(() => createNascenteClusterGroup(mockSemPlugin)).toThrow(
        'Plugin leaflet.markercluster não foi carregado no objeto Leaflet (L.markerClusterGroup indisponível).'
      );
    });
  });

  describe('5. Inicialização do Plugin no Cliente (initMarkerClusterPlugin)', () => {
    it('não deve lançar exceção durante execução em ambiente SSR (sem window)', async () => {
      // Em ambiente Node / vitest sem window mockado explicitamente
      await expect(initMarkerClusterPlugin(L)).resolves.toBeUndefined();
    });

    it('deve vincular L à janela global quando em ambiente de navegador', async () => {
      const originalWindow = globalThis.window;
      const fakeWindow = {} as unknown as Window & { L?: typeof L };
      // @ts-expect-error teste com janela global simulada
      globalThis.window = fakeWindow;

      try {
        await initMarkerClusterPlugin(L);
        expect(fakeWindow.L).toBe(L);
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });
});
