/**
 * Nascentes do Cariri — Lógica Cartográfica de Enquadramento Leaflet
 * Implementa o enquadramento dinâmico (fitBounds / setView) em conformidade com as regras cartográficas:
 * - >= 2 nascentes: L.latLngBounds com padding [32, 32] e maxZoom 16
 * - 1 nascente: map.setView com zoom 14 (evita aproximação excessiva)
 * - 0 nascentes: enquadramento padrão na região do Cariri (DEFAULT_CARIRI_BOUNDS)
 */

import L from 'leaflet';
import { mapConfig } from '@/config/map';

export interface CoordinatePoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface AdjustBoundsOptions {
  readonly padding?: [number, number] | undefined;
  readonly maxZoom?: number | undefined;
  readonly singlePointZoom?: number | undefined;
  readonly fallbackBounds?: L.LatLngBoundsExpression | undefined;
}

export const DEFAULT_BOUNDS_PADDING: [number, number] = [32, 32];
export const DEFAULT_MAX_BOUNDS_ZOOM = 16;
export const DEFAULT_SINGLE_POINT_ZOOM = 14;

/**
 * Valida rigorosamente se as coordenadas são numéricas, finitas e estão dentro do globo terrestre.
*/
export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Filtra apenas registros que contêm coordenadas geograficamente válidas.
 */
export function filterValidCoordinates<T extends CoordinatePoint>(points: readonly T[]): T[] {
  return points.filter((point) => isValidCoordinate(point.latitude, point.longitude));
}

export interface MapViewportTarget {
  fitBounds(bounds: L.LatLngBoundsExpression, options?: L.FitBoundsOptions): unknown;
  setView(center: L.LatLngExpression, zoom: number, options?: L.ZoomPanOptions): unknown;
}

/**
 * Aplica enquadramento cartográfico resiliente:
 * - Para 2 ou mais pontos: calcula bounding box com padding e limite de zoom.
 * - Para 1 único ponto: centraliza com zoom intermediário confortável.
 * - Para 0 pontos ou pontos inválidos: enquadra o Bounding Box padrão do Cariri.
*/
export function adjustMapBounds(
  map: MapViewportTarget,
  points: readonly CoordinatePoint[],
  options?: AdjustBoundsOptions
): void {
  const validPoints = filterValidCoordinates(points);
  const padding = options?.padding ?? DEFAULT_BOUNDS_PADDING;
  const maxZoom = options?.maxZoom ?? DEFAULT_MAX_BOUNDS_ZOOM;
  const singlePointZoom = options?.singlePointZoom ?? DEFAULT_SINGLE_POINT_ZOOM;

  if (validPoints.length >= 2) {
    const latLngs: [number, number][] = validPoints.map((point) => [point.latitude, point.longitude]);
    const bounds = L.latLngBounds(latLngs);

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding, maxZoom });
      return;
    }
  }

  if (validPoints.length === 1) {
    const single = validPoints[0]!;
    map.setView([single.latitude, single.longitude], singlePointZoom);
    return;
  }

  // Fallback para 0 registros: Bounding Box padrão da macrorregião do Cariri
  const fallbackBounds: L.LatLngBoundsExpression =
    options?.fallbackBounds ?? [
      [mapConfig.caririBounds[0][0], mapConfig.caririBounds[0][1]],
      [mapConfig.caririBounds[1][0], mapConfig.caririBounds[1][1]],
    ];

  map.fitBounds(fallbackBounds, { padding });
}
