import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('leaflet', () => ({
  default: {
    latLngBounds: vi.fn((latLngs: [number, number][]) => ({
      isValid: () => Array.isArray(latLngs) && latLngs.length > 0,
    })),
  },
}));

import {
  adjustMapBounds,
  filterValidCoordinates,
  isValidCoordinate,
  DEFAULT_BOUNDS_PADDING,
  DEFAULT_MAX_BOUNDS_ZOOM,
  DEFAULT_SINGLE_POINT_ZOOM,
  type MapViewportTarget,
} from '@/components/map/map-bounds';
import { mapConfig } from '@/config/map';

describe('Lógica Cartográfica de Enquadramento e Bounds (src/components/map/map-bounds.ts)', () => {
  let mockMap: MapViewportTarget;

  beforeEach(() => {
    mockMap = {
      fitBounds: vi.fn(),
      setView: vi.fn(),
    };
  });

  describe('1. Validação e Filtragem de Coordenadas', () => {
    it('deve validar coordenadas geográficas válidas dentro dos limites do globo', () => {
      expect(isValidCoordinate(-7.23, -39.41)).toBe(true);
      expect(isValidCoordinate(0, 0)).toBe(true);
      expect(isValidCoordinate(-90, -180)).toBe(true);
      expect(isValidCoordinate(90, 180)).toBe(true);
    });

    it('deve rejeitar valores não numéricos, NaN, Infinity e coordenadas fora dos limites', () => {
      expect(isValidCoordinate(NaN, -39.41)).toBe(false);
      expect(isValidCoordinate(-7.23, Infinity)).toBe(false);
      expect(isValidCoordinate('-7.23', -39.41)).toBe(false);
      expect(isValidCoordinate(null, undefined)).toBe(false);
      expect(isValidCoordinate(-91, -39.41)).toBe(false);
      expect(isValidCoordinate(91, -39.41)).toBe(false);
      expect(isValidCoordinate(-7.23, -181)).toBe(false);
      expect(isValidCoordinate(-7.23, 181)).toBe(false);
    });

    it('deve filtrar apenas pontos com coordenadas válidas preservando a estrutura original', () => {
      const mixedPoints = [
        { id: 1, latitude: -7.2, longitude: -39.3 },
        { id: 2, latitude: NaN, longitude: -39.4 },
        { id: 3, latitude: -7.5, longitude: Infinity },
        { id: 4, latitude: -7.8, longitude: -39.1 },
      ];

      const result = filterValidCoordinates(mixedPoints);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.id)).toEqual([1, 4]);
    });
  });

  describe('2. Enquadramento de Zero Registros (Dataset Vazio ou Inválido)', () => {
    it('deve enquadrar os limites padrão do Cariri quando o array for vazio', () => {
      adjustMapBounds(mockMap, []);

      expect(mockMap.setView).not.toHaveBeenCalled();
      expect(mockMap.fitBounds).toHaveBeenCalledWith(
        [
          [mapConfig.caririBounds[0][0], mapConfig.caririBounds[0][1]],
          [mapConfig.caririBounds[1][0], mapConfig.caririBounds[1][1]],
        ],
        { padding: DEFAULT_BOUNDS_PADDING }
      );
    });

    it('deve recorrer aos limites do Cariri se todos os pontos do array possuírem coordenadas inválidas', () => {
      const invalidPoints = [
        { latitude: NaN, longitude: -39.0 },
        { latitude: -95, longitude: 200 },
      ];

      adjustMapBounds(mockMap, invalidPoints);

      expect(mockMap.setView).not.toHaveBeenCalled();
      expect(mockMap.fitBounds).toHaveBeenCalledWith(
        expect.any(Array),
        { padding: DEFAULT_BOUNDS_PADDING }
      );
    });
  });

  describe('3. Enquadramento de Ponto Único (1 Registro)', () => {
    it('deve chamar map.setView com zoom 14 e coordenadas exatas da nascente', () => {
      const singlePoint = [{ latitude: -7.2345, longitude: -39.4152 }];

      adjustMapBounds(mockMap, singlePoint);

      expect(mockMap.fitBounds).not.toHaveBeenCalled();
      expect(mockMap.setView).toHaveBeenCalledWith(
        [-7.2345, -39.4152],
        DEFAULT_SINGLE_POINT_ZOOM
      );
    });

    it('deve permitir customizar o nível de zoom para ponto único via opções', () => {
      const singlePoint = [{ latitude: -7.2345, longitude: -39.4152 }];

      adjustMapBounds(mockMap, singlePoint, { singlePointZoom: 15 });

      expect(mockMap.setView).toHaveBeenCalledWith([-7.2345, -39.4152], 15);
    });
  });

  describe('4. Enquadramento de Múltiplos Pontos (>= 2 Registros)', () => {
    it('deve chamar map.fitBounds com LatLngBounds, padding [32, 32] e maxZoom 16', () => {
      const multiplePoints = [
        { latitude: -7.15, longitude: -39.30 },
        { latitude: -7.30, longitude: -39.45 },
        { latitude: -7.22, longitude: -39.12 },
      ];

      adjustMapBounds(mockMap, multiplePoints);

      expect(mockMap.setView).not.toHaveBeenCalled();
      expect(mockMap.fitBounds).toHaveBeenCalledWith(
        expect.objectContaining({
          isValid: expect.any(Function),
        }),
        {
          padding: DEFAULT_BOUNDS_PADDING,
          maxZoom: DEFAULT_MAX_BOUNDS_ZOOM,
        }
      );
    });

    it('deve respeitar configurações customizadas de padding e maxZoom', () => {
      const points = [
        { latitude: -7.15, longitude: -39.30 },
        { latitude: -7.30, longitude: -39.45 },
      ];

      adjustMapBounds(mockMap, points, {
        padding: [48, 48],
        maxZoom: 15,
      });

      expect(mockMap.fitBounds).toHaveBeenCalledWith(
        expect.anything(),
        {
          padding: [48, 48],
          maxZoom: 15,
        }
      );
    });
  });

  describe('5. Cenários de Borda e Tolerância Cartográfica', () => {
    it('deve processar corretamente DTOs completos de nascentes públicas', () => {
      const nascentesDtos = [
        {
          id: 1,
          latitude: -7.2345,
          longitude: -39.4123,
          municipio: 'Crato',
          fonte: 'Fonte Batateiras',
          localidade: 'Sítio Fundão',
          data_criacao: '2024-05-10',
          vazao_media: 15.4,
          unidade_vazao: 'm³/s',
        },
        {
          id: 2,
          latitude: -7.2025,
          longitude: -39.3138,
          municipio: 'Juazeiro do Norte',
          fonte: "Olho d'Água do Horto",
          localidade: 'Horto',
          data_criacao: '2024-06-15',
          vazao_media: 8.25,
          unidade_vazao: 'm³/s',
        },
      ];

      adjustMapBounds(mockMap, nascentesDtos);

      expect(mockMap.fitBounds).toHaveBeenCalledWith(
        expect.anything(),
        {
          padding: DEFAULT_BOUNDS_PADDING,
          maxZoom: DEFAULT_MAX_BOUNDS_ZOOM,
        }
      );
    });

    it('deve lidar com pontos coincidentes (mesma latitude e longitude) aplicando fitBounds sem exceção', () => {
      const coincidentPoints = [
        { latitude: -7.2345, longitude: -39.4123 },
        { latitude: -7.2345, longitude: -39.4123 },
      ];

      expect(() => adjustMapBounds(mockMap, coincidentPoints)).not.toThrow();
      expect(mockMap.fitBounds).toHaveBeenCalled();
    });
  });
});
