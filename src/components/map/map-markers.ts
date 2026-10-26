/**
 * Nascentes do Cariri — Módulo Cartográfico de Marcadores e Agrupamento
 * Implementa a instanciação padronizada, segura e eficiente de marcadores e clusters
 * para a exibição de nascentes no mapa Leaflet.
*/

import L from 'leaflet';
import type { NascentePublicDto } from '@/modules/nascentes/nascentes.dto';
import { isValidCoordinate } from './map-bounds';

/**
 * Dimensões e pontos de ancoragem cartográfica do ícone de nascente.
 * Dimensões: 28x36px.
 * iconAnchor [14, 36]: a ponta inferior central do pin toca exatamente na coordenada real.
 * popupAnchor [0, -36]: o popup se abre exatamente acima do topo do marcador.
 * tooltipAnchor [14, -18]: o tooltip se abre na lateral do pin.
 */
export const NASCENTE_ICON_SIZE: [number, number] = [28, 36];
export const NASCENTE_ICON_ANCHOR: [number, number] = [14, 36];
export const NASCENTE_POPUP_ANCHOR: [number, number] = [0, -36];
export const NASCENTE_TOOLTIP_ANCHOR: [number, number] = [14, -18];

export const NASCENTE_PIN_CSS_CLASS = 'nascente-marker-pin';

/**
 * SVG otimizado do marcador de nascente
 */
export const NASCENTE_PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 36" width="28" height="36" role="img" aria-hidden="true" class="nascente-pin-svg">
  <path d="M 14 1 C 6.82 1 1 6.82 1 14 C 1 24 14 35 14 35 C 14 35 27 24 27 14 C 27 6.82 21.18 1 14 1 Z" fill="#0284c7" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />
  <path d="M 14 7 C 14 7 9.5 13 9.5 16 C 9.5 18.485 11.515 20.5 14 20.5 C 16.485 20.5 18.5 18.485 18.5 16 C 18.5 13 14 7 14 7 Z" fill="#ffffff" />
</svg>
`.trim();

/**
 * Instância única em cache do ícone do marcador de nascente.
 * o mesmo L.DivIcon é reutilizado por todos os registros.
 */
let cachedNascenteIcon: L.DivIcon | null = null;

/**
 * Obtém ou inicializa a instância singleton do ícone da nascente.
 */
export function getNascenteIcon(leafletInstance: typeof L = L): L.DivIcon {
  if (!cachedNascenteIcon) {
    cachedNascenteIcon = leafletInstance.divIcon({
      className: NASCENTE_PIN_CSS_CLASS,
      html: NASCENTE_PIN_SVG,
      iconSize: NASCENTE_ICON_SIZE,
      iconAnchor: NASCENTE_ICON_ANCHOR,
      popupAnchor: NASCENTE_POPUP_ANCHOR,
      tooltipAnchor: NASCENTE_TOOLTIP_ANCHOR,
    });
  }

  return cachedNascenteIcon;
}

/**
 * Reseta o cache da instância do ícone
*/
export function resetNascenteIconCache(): void {
  cachedNascenteIcon = null;
}

/**
 * Interface do marcador com os metadados da nascente de origem.
*/
export interface NascenteMarker extends L.Marker {
  nascenteData?: NascentePublicDto;
}

/**
 * Cria um marcador Leaflet individual para uma nascente.
 * Se as coordenadas forem inválidas, retorna `null`
*/
export function createNascenteMarker(
  nascente: NascentePublicDto,
  leafletInstance: typeof L = L,
  customIcon?: L.DivIcon | L.Icon
): NascenteMarker | null {
  if (!isValidCoordinate(nascente.latitude, nascente.longitude)) {
    return null;
  }

  const icon = customIcon ?? getNascenteIcon(leafletInstance);
  const fonteLabel = nascente.fonte?.trim();
  const municipioLabel = nascente.municipio?.trim();

  const title = fonteLabel
    ? `${fonteLabel} — ${municipioLabel || 'Cariri'}`
    : `Nascente — ${municipioLabel || 'Cariri'}`;

  const alt = `Marcador da nascente: ${title}`;

  const marker = leafletInstance.marker([nascente.latitude, nascente.longitude], {
    icon,
    title,
    alt,
    keyboard: true,
    riseOnHover: true,
  }) as NascenteMarker;

  marker.nascenteData = nascente;

  return marker;
}

/**
 * Converte em lote uma coleção de DTOs públicos de nascentes em marcadores Leaflet válidos.
 * Registros com coordenadas inválidas são descartados de forma resiliente.
 */
export function createNascentesMarkers(
  nascentes: readonly NascentePublicDto[],
  leafletInstance: typeof L = L
): NascenteMarker[] {
  const markers: NascenteMarker[] = [];

  for (const nascente of nascentes) {
    const marker = createNascenteMarker(nascente, leafletInstance);
    if (marker) {
      markers.push(marker);
    }
  }

  return markers;
}

/**
 * Configurações padrão recomendadas para o agrupamento por proximidade (Clustering).
 */
export const DEFAULT_CLUSTER_OPTIONS: L.MarkerClusterGroupOptions = {
  maxClusterRadius: 50,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: true,
  removeOutsideVisibleBounds: true,
  // O plugin não cancela os lotes pendentes em clearLayers/removeLayer.
  // A inserção síncrona impede que filtros antigos repovoem a camada atual.
  chunkedLoading: false,
  animate: true,
};

/**
 * Assegura que o plugin leaflet.markercluster foi inicializado no cliente,
 * expondo L na janela global conforme requerido pela distribuição UMD do plugin.
 */
export async function initMarkerClusterPlugin(leafletInstance: typeof L = L): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const browserGlobal = window as unknown as { L?: typeof L };
  if (!browserGlobal.L) {
    browserGlobal.L = leafletInstance;
  }

  if (typeof leafletInstance.markerClusterGroup === 'function') {
    return;
  }

  await import('leaflet.markercluster');
}

/**
 * Cria e configura um grupo de clusterização (L.MarkerClusterGroup).
 *
 * @throws Error se o plugin leaflet.markercluster não tiver sido carregado previamente.
 */
export function createNascenteClusterGroup(
  leafletInstance: typeof L = L,
  customOptions?: L.MarkerClusterGroupOptions
): L.MarkerClusterGroup {
  if (typeof leafletInstance.markerClusterGroup !== 'function') {
    throw new Error(
      'Plugin leaflet.markercluster não foi carregado no objeto Leaflet (L.markerClusterGroup indisponível).'
    );
  }

  return leafletInstance.markerClusterGroup({
    ...DEFAULT_CLUSTER_OPTIONS,
    ...customOptions,
  });
}
