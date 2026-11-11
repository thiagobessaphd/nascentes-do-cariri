/**
 * CT-FE-05 — Teste Unitário: Estado sem Dados (Empty State), Contador Sincronizado e Limpeza Contextual
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { NascentePublicDto } from '@/modules/nascentes/nascentes.dto';
import MapCounter, { formatCounterAccessibleText } from '@/components/map/MapCounter';
import counterStyles from '@/components/map/MapCounter.module.css';
import MapFeedback from '@/components/map/MapFeedback';
import feedbackStyles from '@/components/map/MapFeedback.module.css';
import {
  clearMapFilterState,
  filterNascentesPublicas,
  hasActiveMapFilters,
  type MapFilterState,
} from '@/components/map/map-filters';

const MOCK_NASCENTES: readonly NascentePublicDto[] = [
  {
    id: 1,
    latitude: -7.2345,
    longitude: -39.4156,
    municipio: 'Crato',
    fonte: 'Fonte da Batateira',
    localidade: 'Sítio Fundão',
    data_criacao: '2024-01-15',
    vazao_media: 12.5,
    unidade_vazao: 'm³/s',
  },
  {
    id: 2,
    latitude: -7.3112,
    longitude: -39.3011,
    municipio: 'Barbalha',
    fonte: 'Fonte do Caldas',
    localidade: 'Estância Hidromineral',
    data_criacao: '2024-02-10',
    vazao_media: 18.2,
    unidade_vazao: 'm³/s',
  },
  {
    id: 3,
    latitude: -7.1725,
    longitude: -39.7314,
    municipio: 'Santana do Cariri',
    fonte: 'Fonte do Saco',
    localidade: 'Sítio Saco',
    data_criacao: '2024-01-01',
    vazao_media: 181.46,
    unidade_vazao: 'm³/s',
  },
];

describe('CT-FE-05 — Suíte de Estado sem Dados (Empty State), Contador Acessível e Limpeza de Filtros', () => {
  describe('1. Formatação Acessível do Contador (formatCounterAccessibleText)', () => {
    it('deve retornar mensagem de carregamento quando isLoading for true e total ainda for desconhecido', () => {
      expect(formatCounterAccessibleText(0, undefined, false, true)).toBe(
        'Carregando nascentes no mapa...'
      );
    });

    it('deve formatar corretamente o total geral no plural e no singular sem filtros ativos', () => {
      expect(formatCounterAccessibleText(62, undefined, false, false)).toBe(
        '62 nascentes exibidas no mapa do Cariri.'
      );
      expect(formatCounterAccessibleText(1, undefined, false, false)).toBe(
        '1 nascente exibida no mapa do Cariri.'
      );
      expect(formatCounterAccessibleText(0, undefined, false, false)).toBe(
        '0 nascentes exibidas no mapa do Cariri.'
      );
    });

    it('deve formatar a proporção filtrada com resultados e com zero resultados', () => {
      expect(formatCounterAccessibleText(14, 62, true, false)).toBe(
        'Exibindo 14 de 62 nascentes com filtros aplicados.'
      );
      expect(formatCounterAccessibleText(0, 62, true, false)).toBe(
        'Exibindo 0 de 62 nascentes com filtros aplicados.'
      );
      expect(formatCounterAccessibleText(0, 1, true, false)).toBe(
        'Exibindo 0 de 1 nascente com filtros aplicados.'
      );
    });

    it('deve formatar contagem filtrada mesmo quando o total geral ainda não estiver definido', () => {
      expect(formatCounterAccessibleText(5, undefined, true, false)).toBe(
        '5 nascentes exibidas com filtros aplicados.'
      );
      expect(formatCounterAccessibleText(0, undefined, true, false)).toBe(
        '0 nascentes exibidas com filtros aplicados.'
      );
    });
  });

  describe('2. Componente Acessível MapCounter (src/components/map/MapCounter.tsx)', () => {
    it('deve renderizar com semântica WAI-ARIA role="status", aria-live="polite" e aria-atomic="true"', () => {
      const html = renderToString(
        React.createElement(MapCounter, { count: 62 })
      );

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-atomic="true"');
      expect(html).toContain('data-testid="map-counter"');
      expect(html).toContain('aria-label="62 nascentes exibidas no mapa do Cariri."');
      expect(html).toContain('>62<');
      expect(html).toContain('nascentes no Cariri');
      expect(html).not.toContain('Filtrado');
    });

    it('deve exibir singular "1 nascente no Cariri" quando houver exatamente 1 registro sem filtros', () => {
      const html = renderToString(
        React.createElement(MapCounter, { count: 1 })
      );

      expect(html).toContain('>1<');
      expect(html).toContain('nascente no Cariri');
      expect(html).not.toContain('nascentes no Cariri');
    });

    it('deve exibir proporção "14 de 62 nascentes" e badge "Filtrado" quando filtros estiverem ativos', () => {
      const html = renderToString(
        React.createElement(MapCounter, {
          count: 14,
          total: 62,
          hasActiveFilters: true,
        })
      );

      expect(html).toContain(counterStyles.counterFiltered);
      expect(html).toContain('>14<');
      expect(html).toContain('>de<');
      expect(html).toContain('>62<');
      expect(html).toContain('nascentes');
      expect(html).toContain(counterStyles.filteredBadge);
      expect(html).toContain('Filtrado');
    });

    it('deve manter a contagem numérica uniforme "0 de 62 nascentes" e badge "Filtrado" quando filtro não retornar resultados', () => {
      const html = renderToString(
        React.createElement(MapCounter, {
          count: 0,
          total: 62,
          hasActiveFilters: true,
        })
      );

      expect(html).toContain('>0<');
      expect(html).toContain('>de<');
      expect(html).toContain('>62<');
      expect(html).toContain('nascentes');
      expect(html).toContain('Filtrado');
      expect(html).not.toContain('Nenhuma nascente encontrada');
    });

    it('deve exibir "Carregando..." apenas durante o carregamento inicial sem total prévio', () => {
      const html = renderToString(
        React.createElement(MapCounter, {
          count: 0,
          isLoading: true,
        })
      );

      expect(html).toContain('Carregando...');
      expect(html).toContain(counterStyles.counterLoading);
    });

    it('deve normalizar contagens negativas defensivamente para 0', () => {
      const html = renderToString(
        React.createElement(MapCounter, {
          count: -10,
          total: 62,
          hasActiveFilters: true,
        })
      );

      expect(html).toContain('>0<');
      expect(html).not.toContain('-10');
    });

    it('deve interromper a propagação de eventos de mouse, toque e scroll para o mapa Leaflet', () => {
      const element = MapCounter({ count: 10 });
      const stopPropagation = vi.fn();
      const fakeEvent = { stopPropagation } as unknown as React.SyntheticEvent;

      element.props.onClick(fakeEvent);
      element.props.onDoubleClick(fakeEvent);
      element.props.onMouseDown(fakeEvent);
      element.props.onTouchStart(fakeEvent);
      element.props.onWheel(fakeEvent);

      expect(stopPropagation).toHaveBeenCalledTimes(5);
    });
  });

  describe('3. Estado sem Resultados no MapFeedback (Empty State)', () => {
    it('deve exibir mensagem contextualizada e botão "Limpar filtros" quando houver filtros ativos sem resultados', () => {
      const onClearFilters = vi.fn();
      const html = renderToString(
        React.createElement(MapFeedback, {
          status: 'empty',
          hasActiveFilters: true,
          onClearFilters,
        })
      );

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('data-testid="map-feedback-empty"');
      expect(html).toContain(
        'Nenhuma nascente encontrada para os filtros aplicados.'
      );
      expect(html).toContain(feedbackStyles.feedbackEmptyFiltered);
      expect(html).toContain('data-testid="map-feedback-clear-filters-button"');
      expect(html).toContain('aria-label="Limpar filtros aplicados"');
      expect(html).toContain('>Limpar filtros</button>');
      expect(html).not.toContain(feedbackStyles.feedbackDismissButton);
    });

    it('deve exibir mensagem geral sem botão de limpar filtros quando o estado vazio não decorrer de filtros ativos', () => {
      const html = renderToString(
        React.createElement(MapFeedback, {
          status: 'empty',
          hasActiveFilters: false,
        })
      );

      expect(html).toContain('Nenhuma nascente encontrada para esta região.');
      expect(html).not.toContain('data-testid="map-feedback-clear-filters-button"');
      expect(html).not.toContain(feedbackStyles.feedbackDismissButton);
    });

    it('deve acionar o callback onClearFilters ao clicar no botão "Limpar filtros" do estado vazio', () => {
      const onClearFilters = vi.fn();
      const element = MapFeedback({
        status: 'empty',
        hasActiveFilters: true,
        onClearFilters,
      });

      expect(element).not.toBeNull();

      const children = React.Children.toArray(element!.props.children);
      const clearButton = children.find(
        (child) =>
          React.isValidElement<{ 'data-testid'?: string; onClick?: () => void }>(child) &&
          child.props['data-testid'] === 'map-feedback-clear-filters-button'
      ) as React.ReactElement<{ onClick: () => void }> | undefined;

      expect(clearButton).toBeDefined();
      clearButton!.props.onClick();

      expect(onClearFilters).toHaveBeenCalledTimes(1);
    });

    it('deve isolar eventos de clique, toque e rolagem no card vazio para não mover o mapa subjacente', () => {
      const element = MapFeedback({
        status: 'empty',
        hasActiveFilters: true,
        onClearFilters: vi.fn(),
      });

      expect(element).not.toBeNull();

      const stopPropagation = vi.fn();
      const fakeEvent = { stopPropagation } as unknown as React.SyntheticEvent;

      element!.props.onClick(fakeEvent);
      element!.props.onMouseDown(fakeEvent);
      element!.props.onTouchStart(fakeEvent);
      element!.props.onWheel(fakeEvent);

      expect(stopPropagation).toHaveBeenCalledTimes(4);
    });
  });

  describe('4. Diferenciação Semântica entre Estados Informativos e de Alerta', () => {
    it('deve utilizar role="status" (polite) para loading e empty, e role="alert" (assertive) apenas para error', () => {
      const loadingHtml = renderToString(
        React.createElement(MapFeedback, { status: 'loading' })
      );
      const emptyHtml = renderToString(
        React.createElement(MapFeedback, { status: 'empty', hasActiveFilters: true })
      );
      const errorHtml = renderToString(
        React.createElement(MapFeedback, { status: 'error', error: 'Erro de rede' })
      );

      expect(loadingHtml).toContain('role="status"');
      expect(loadingHtml).toContain('aria-live="polite"');

      expect(emptyHtml).toContain('role="status"');
      expect(emptyHtml).toContain('aria-live="polite"');

      expect(errorHtml).toContain('role="alert"');
      expect(errorHtml).toContain('aria-live="assertive"');
    });
  });

  describe('5. Fluxo Integrado: Filtro sem Resultados -> Limpar Filtros -> Restauração', () => {
    it('deve transicionar de estado filtrado sem resultados (0 de 3) para conjunto completo restaurado (3 nascentes)', () => {
      const totalInicial = MOCK_NASCENTES.length;

      // 1. Aplica filtro que não possui correspondência
      let filterState: MapFilterState = {
        municipio: 'Crato',
        searchInput: 'Nascente Inexistente XYZ',
        debouncedSearch: 'Nascente Inexistente XYZ',
      };

      expect(hasActiveMapFilters(filterState)).toBe(true);

      const emptyResults = filterNascentesPublicas(MOCK_NASCENTES, {
        municipio: filterState.municipio,
        q: filterState.debouncedSearch,
      });

      expect(emptyResults).toHaveLength(0);

      // Verifica renderização sincronizada em estado vazio
      const counterEmptyHtml = renderToString(
        React.createElement(MapCounter, {
          count: emptyResults.length,
          total: totalInicial,
          hasActiveFilters: hasActiveMapFilters(filterState),
        })
      );
      const feedbackEmptyHtml = renderToString(
        React.createElement(MapFeedback, {
          status: 'empty',
          hasActiveFilters: hasActiveMapFilters(filterState),
          onClearFilters: () => {
            filterState = clearMapFilterState();
          },
        })
      );

      expect(counterEmptyHtml).toContain('>0<');
      expect(counterEmptyHtml).toContain('>de<');
      expect(counterEmptyHtml).toContain('>3<');
      expect(counterEmptyHtml).toContain('Filtrado');
      expect(feedbackEmptyHtml).toContain(
        'Nenhuma nascente encontrada para os filtros aplicados.'
      );
      expect(feedbackEmptyHtml).toContain('Limpar filtros');

      // 2. Aciona limpeza de filtros
      filterState = clearMapFilterState();
      expect(hasActiveMapFilters(filterState)).toBe(false);

      const restoredResults = filterNascentesPublicas(MOCK_NASCENTES, {
        municipio: filterState.municipio,
        q: filterState.debouncedSearch,
      });

      expect(restoredResults).toHaveLength(3);

      // Verifica restauração do contador e ocultação do empty state
      const counterRestoredHtml = renderToString(
        React.createElement(MapCounter, {
          count: restoredResults.length,
          total: totalInicial,
          hasActiveFilters: hasActiveMapFilters(filterState),
        })
      );
      const feedbackRestoredHtml = renderToString(
        React.createElement(MapFeedback, {
          status: 'success',
          hasActiveFilters: hasActiveMapFilters(filterState),
        })
      );

      expect(counterRestoredHtml).toContain('>3<');
      expect(counterRestoredHtml).toContain('nascentes no Cariri');
      expect(counterRestoredHtml).not.toContain('Filtrado');
      expect(feedbackRestoredHtml).toBe('');
    });
  });
});

