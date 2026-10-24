/**
 * Nascentes do Cariri — Módulo de Tooltip e Popup
 * Implementa formatadores puros, fábrica DOM imune a XSS e vinculação de acessibilidade
 * para os marcadores de nascentes no mapa Leaflet.
 */

import type L from 'leaflet';
import type { NascentePublicDto } from '@/modules/nascentes/nascentes.dto';
import { UNIDADE_VAZAO_PADRAO } from '@/modules/nascentes/nascentes.dto';
import {
  NASCENTE_POPUP_ANCHOR,
  NASCENTE_TOOLTIP_ANCHOR,
} from './map-markers';

/**
 * Formata o valor da vazão média com 2 casas decimais no padrão brasileiro
 * e anexa a unidade oficial de medida ('m³/s').
 * Retorna 'Não informada' se o valor for nulo, indefinido, inválido ou negativo.
 *
 * @param vazaoMedia - Valor numérico ou string numérica da vazão
 * @param unidade - Unidade de medida
 */
export function formatVazao(
  vazaoMedia?: number | string | null,
  unidade: string = UNIDADE_VAZAO_PADRAO
): string {
  if (vazaoMedia === null || vazaoMedia === undefined) {
    return 'Não informada';
  }

  const num = typeof vazaoMedia === 'number' ? vazaoMedia : Number(vazaoMedia);
  if (!Number.isFinite(num) || num < 0) {
    return 'Não informada';
  }

  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);

  const unit = unidade?.trim() || UNIDADE_VAZAO_PADRAO;
  return `${formatted} ${unit}`;
}

/**
 * Formata a data civil de criação (AAAA-MM-DD) para exibição em pt-BR (DD/MM/AAAA)
 *
 * @param isoDate - Data civil no formato AAAA-MM-DD
 */
export function formatDataCriacao(isoDate?: string | null): string {
  if (!isoDate || typeof isoDate !== 'string') {
    return 'Não informada';
  }

  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return 'Não informada';
  }

  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/**
 * Formata as coordenadas geográficas cartográficas (latitude e longitude)
 * com 6 casas decimais de precisão submétrica.
 *
 * @param latitude - Latitude em graus decimais (-90 a 90)
 * @param longitude - Longitude em graus decimais (-180 a 180)
 */
export function formatCoordenadas(
  latitude?: number | null,
  longitude?: number | null
): string {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined
  ) {
    return 'Não informadas';
  }

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return 'Não informadas';
  }

  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}


export const DEFAULT_POPUP_OPTIONS: L.PopupOptions = {
  offset: NASCENTE_POPUP_ANCHOR,
  closeButton: true,
  autoPan: true,
  autoPanPadding: [20, 20],
  className: 'nascente-leaflet-popup',
  maxWidth: 320,
  minWidth: 260,
};

export const DEFAULT_TOOLTIP_OPTIONS: L.TooltipOptions = {
  offset: NASCENTE_TOOLTIP_ANCHOR,
  direction: 'right',
  sticky: false,
  opacity: 0.96,
  className: 'nascente-leaflet-tooltip',
};

export function createNascenteTooltipElement(nascente: NascentePublicDto): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('createNascenteTooltipElement requer um ambiente com DOM (document indisponível).');
  }

  const container = document.createElement('div');
  container.className = 'nascente-tooltip';
  container.setAttribute('role', 'tooltip');

  const header = document.createElement('div');
  header.className = 'nascente-tooltip-header';

  const title = document.createElement('strong');
  title.className = 'nascente-tooltip-title';
  title.textContent = nascente.fonte?.trim() || 'Nascente sem denominação';
  header.appendChild(title);

  const body = document.createElement('div');
  body.className = 'nascente-tooltip-body';

  const location = document.createElement('span');
  location.className = 'nascente-tooltip-location';
  const localidade = nascente.localidade?.trim() || '';
  const municipio = nascente.municipio?.trim() || '';
  if (localidade && municipio) {
    location.textContent = `${localidade}, ${municipio}`;
  } else if (localidade) {
    location.textContent = localidade;
  } else if (municipio) {
    location.textContent = municipio;
  } else {
    location.textContent = 'Cariri';
  }
  body.appendChild(location);

  const flow = document.createElement('span');
  flow.className = 'nascente-tooltip-flow';
  flow.textContent = `Vazão: ${formatVazao(nascente.vazao_media, nascente.unidade_vazao)}`;
  body.appendChild(flow);

  container.appendChild(header);
  container.appendChild(body);

  return container;
}

/**
 * Cria uma linha de par chave-valor para o elemento `<dl>` do popup.
 */
function createDetailRow(term: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'nascente-popup-row';

  const dt = document.createElement('dt');
  dt.className = 'nascente-popup-term';
  dt.textContent = term;

  const dd = document.createElement('dd');
  dd.className = 'nascente-popup-value';
  dd.textContent = value;

  row.appendChild(dt);
  row.appendChild(dd);
  return row;
}

export function createNascentePopupElement(nascente: NascentePublicDto): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error('createNascentePopupElement requer um ambiente com DOM (document indisponível).');
  }

  const article = document.createElement('article');
  article.className = 'nascente-popup';
  const titleId = `nascente-popup-title-${nascente.id}`;
  article.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('header');
  header.className = 'nascente-popup-header';

  const badge = document.createElement('span');
  badge.className = 'nascente-popup-badge';
  badge.textContent = 'Nascente';
  header.appendChild(badge);

  const title = document.createElement('h3');
  title.id = titleId;
  title.className = 'nascente-popup-title';
  title.textContent = nascente.fonte?.trim() || 'Nascente sem denominação';
  header.appendChild(title);

  article.appendChild(header);

  const dl = document.createElement('dl');
  dl.className = 'nascente-popup-details';

  dl.appendChild(createDetailRow('Município', nascente.municipio?.trim() || 'Não informado'));
  dl.appendChild(createDetailRow('Localidade', nascente.localidade?.trim() || 'Não informada'));
  dl.appendChild(createDetailRow('Data de criação', formatDataCriacao(nascente.data_criacao)));
  dl.appendChild(createDetailRow('Vazão média', formatVazao(nascente.vazao_media, nascente.unidade_vazao)));
  dl.appendChild(createDetailRow('Coordenadas', formatCoordenadas(nascente.latitude, nascente.longitude)));

  article.appendChild(dl);

  return article;
}

/**
 * Vincula tooltip, popup e eventos acessíveis de teclado e foco a um marcador Leaflet.
 * - Atribui tooltip no hover/focus
 * - Atribui popup no clique ou toque
 * - Habilita abertura de popup pelas teclas Enter e Espaço quando o marcador estiver em foco
 * - Configura `aria-label` e `title` descritivos no botão nativo de fechar do popup
 *
 * @param marker - Marcador Leaflet alvo
 * @param nascente - Dados públicos da nascente
 * @param popupOptions - Opções customizadas de popup (opcional)
 * @param tooltipOptions - Opções customizadas de tooltip (opcional)
 */
export function bindNascenteInteractions(
  marker: L.Marker,
  nascente: NascentePublicDto,
  popupOptions?: L.PopupOptions,
  tooltipOptions?: L.TooltipOptions
): void {
  if (typeof document === 'undefined') {
    return;
  }

  const tooltipElement = createNascenteTooltipElement(nascente);
  marker.bindTooltip(tooltipElement, {
    ...DEFAULT_TOOLTIP_OPTIONS,
    ...tooltipOptions,
  });

  const popupElement = createNascentePopupElement(nascente);
  marker.bindPopup(popupElement, {
    ...DEFAULT_POPUP_OPTIONS,
    ...popupOptions,
  });

  marker.on('keydown', (event: L.LeafletKeyboardEvent) => {
    const key = event.originalEvent?.key;
    if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
      event.originalEvent?.preventDefault();
      marker.openPopup();
    }
  });

  marker.on('popupopen', (event: L.PopupEvent) => {
    const container = event.popup?.getElement();
    if (container) {
      const closeButton = container.querySelector<HTMLAnchorElement>('.leaflet-popup-close-button');
      if (closeButton) {
        const fonteNome = nascente.fonte?.trim();
        const ariaLabel = fonteNome
          ? `Fechar detalhes da nascente ${fonteNome}`
          : 'Fechar detalhes da nascente';

        closeButton.setAttribute('aria-label', ariaLabel);
        closeButton.setAttribute('title', ariaLabel);
      }
    }
  });
}
