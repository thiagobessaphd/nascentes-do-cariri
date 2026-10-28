/**
 * CT-FE-04 — Teste Unitário: Filtros de Busca, Município, Combinação, Debounce e Limpeza
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type L from 'leaflet';
import type { NascentePublicDto } from '@/modules/nascentes/nascentes.dto';
import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_MUNICIPIO_FILTER_LENGTH,
  normalizeFilterText,
  normalizeFoldedText,
  createInitialMapFilterState,
  clearMapFilterState,
  hasActiveMapFilters,
  buildNascentesQueryParams,
  matchesNascenteFilter,
  filterNascentesPublicas,
  createDebounceController,
} from '@/components/map/map-filters';
import MapFilters from '@/components/map/MapFilters';
import { bindNascenteInteractions } from '@/components/map/map-popup';
import { installMockDom, restoreMockDom, MockDomElement } from './mock-dom';

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
  {
    id: 4,
    latitude: -7.2501,
    longitude: -39.1432,
    municipio: 'Missão Velha',
    fonte: 'Nascente da Cachoeira',
    localidade: 'Sítio Missão Nova',
    data_criacao: '2024-03-05',
    vazao_media: 6.4,
    unidade_vazao: 'm³/s',
  },
  {
    id: 5,
    latitude: -7.2411,
    longitude: -39.4099,
    municipio: 'Crato',
    fonte: 'Nascente do Belmonte',
    localidade: 'Encosta da Serra',
    data_criacao: '2024-04-12',
    vazao_media: 4.1,
    unidade_vazao: 'm³/s',
  },
];

describe('CT-FE-04 — Suíte de Filtros de Município, Busca Textual, Debounce e Limpeza', () => {
  describe('1. Normalização e Sanitização de Texto (normalizeFilterText / normalizeFoldedText)', () => {
    it('deve remover espaços nas extremidades e colapsar múltiplos espaços internos', () => {
      expect(normalizeFilterText('   Fonte   da   Batateira   ')).toBe(
        'Fonte da Batateira'
      );
      expect(normalizeFilterText('\t\n  Crato \r\n ')).toBe('Crato');
    });

    it('deve remover caracteres de controle ASCII invisíveis', () => {
      expect(normalizeFilterText('Fonte\u0000\u0007\u001F do \u007FSaco')).toBe(
        'Fonte do Saco'
      );
    });

    it('deve truncar entradas que excedam o limite máximo de caracteres', () => {
      const longText = 'A'.repeat(MAX_SEARCH_QUERY_LENGTH + 45);
      const normalized = normalizeFilterText(longText, MAX_SEARCH_QUERY_LENGTH);

      expect(normalized).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
    });

    it('deve retornar string vazia para valores não-string ou compostos apenas por espaços', () => {
      expect(normalizeFilterText('     ')).toBe('');
      expect(normalizeFilterText(null)).toBe('');
      expect(normalizeFilterText(undefined)).toBe('');
      expect(normalizeFilterText(12345)).toBe('');
      expect(normalizeFilterText({})).toBe('');
    });

    it('deve remover acentos e converter para minúsculas em normalizeFoldedText', () => {
      expect(normalizeFoldedText('  Sítio   Fundão - Missão Velha ')).toBe(
        'sitio fundao - missao velha'
      );
      expect(normalizeFoldedText('ÁÉÍÓÚ ÂÊÔ ÃÕ Ç')).toBe('aeiou aeo ao c');
    });
  });

  describe('2. Estado Inicial, Detecção de Filtros Ativos e Limpeza (clearMapFilterState)', () => {
    it('deve criar o estado inicial vazio quando nenhum parâmetro externo for informado', () => {
      expect(createInitialMapFilterState()).toEqual({
        municipio: '',
        searchInput: '',
        debouncedSearch: '',
      });
    });

    it('deve inicializar o estado normalizando parâmetros externos de município e q', () => {
      expect(
        createInitialMapFilterState({
          municipio: '  Santana do Cariri ',
          q: '  Fonte   do Saco ',
        })
      ).toEqual({
        municipio: 'Santana do Cariri',
        searchInput: 'Fonte do Saco',
        debouncedSearch: 'Fonte do Saco',
      });
    });

    it('deve restaurar o estado completamente limpo por meio de clearMapFilterState', () => {
      expect(clearMapFilterState()).toEqual({
        municipio: '',
        searchInput: '',
        debouncedSearch: '',
      });
    });

    it('deve identificar corretamente se há filtros ativos em hasActiveMapFilters', () => {
      expect(hasActiveMapFilters(null)).toBe(false);
      expect(hasActiveMapFilters(undefined)).toBe(false);
      expect(
        hasActiveMapFilters({ municipio: '  ', searchInput: '  ', debouncedSearch: '' })
      ).toBe(false);

      expect(hasActiveMapFilters({ municipio: 'Crato', searchInput: '' })).toBe(true);
      expect(hasActiveMapFilters({ municipio: '', searchInput: 'Batateira' })).toBe(true);
      expect(hasActiveMapFilters({ municipio: '', debouncedSearch: 'Caldas' })).toBe(true);
      expect(hasActiveMapFilters({ q: 'Saco' })).toBe(true);
    });
  });

  describe('3. Construção de Query Params para a API Pública (buildNascentesQueryParams)', () => {
    it('deve retornar objeto vazio quando não houver filtros ativos nem bounding box', () => {
      expect(
        buildNascentesQueryParams({ municipio: '  ', debouncedSearch: '   ' })
      ).toEqual({});
    });

    it('deve incluir apenas municipio quando somente o filtro de município estiver preenchido', () => {
      expect(
        buildNascentesQueryParams({ municipio: ' Barbalha ', debouncedSearch: '' })
      ).toEqual({
        municipio: 'Barbalha',
      });
    });

    it('deve incluir apenas q quando somente a busca textual estiver preenchida', () => {
      expect(
        buildNascentesQueryParams({ municipio: '', debouncedSearch: '  Fundão  ' })
      ).toEqual({
        q: 'Fundão',
      });
    });

    it('deve combinar municipio, q e coordenadas de bounding box quando todos estiverem presentes', () => {
      const params = buildNascentesQueryParams(
        { municipio: 'Crato', debouncedSearch: 'Batateira' },
        { north: -7.0, south: -7.5, east: -39.0, west: -39.8 }
      );

      expect(params).toEqual({
        municipio: 'Crato',
        q: 'Batateira',
        north: -7.0,
        south: -7.5,
        east: -39.0,
        west: -39.8,
      });
    });

    it('deve respeitar os limites máximos de caracteres de município (150) e busca (100)', () => {
      const params = buildNascentesQueryParams({
        municipio: 'M'.repeat(200),
        debouncedSearch: 'Q'.repeat(150),
      });

      expect(params.municipio).toHaveLength(MAX_MUNICIPIO_FILTER_LENGTH);
      expect(params.q).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
    });
  });

  describe('4. Filtragem Combinada e Imutável de Nascentes (matchesNascenteFilter / filterNascentesPublicas)', () => {
    it('deve retornar cópia integral com todas as nascentes quando nenhum filtro estiver ativo', () => {
      const result = filterNascentesPublicas(MOCK_NASCENTES);

      expect(result).toHaveLength(MOCK_NASCENTES.length);
      expect(result).toEqual(MOCK_NASCENTES);
      expect(result).not.toBe(MOCK_NASCENTES);
    });

    it('deve filtrar isoladamente por município de forma insensível a acentos e caixa', () => {
      const cratoResults = filterNascentesPublicas(MOCK_NASCENTES, {
        municipio: 'crato',
      });
      expect(cratoResults.map((n) => n.id)).toEqual([1, 5]);

      const missaoVelhaResults = filterNascentesPublicas(MOCK_NASCENTES, {
        municipio: 'MISSAO VELHA',
      });
      expect(missaoVelhaResults.map((n) => n.id)).toEqual([4]);
    });

    it('deve filtrar isoladamente pela busca textual (q) tanto pelo nome da fonte quanto pela localidade', () => {
      // Busca por termo na Fonte
      const byFonte = filterNascentesPublicas(MOCK_NASCENTES, {
        q: 'caldas',
      });
      expect(byFonte.map((n) => n.id)).toEqual([2]);

      // Busca por termo na Localidade (sem acento no filtro, com acento no registro)
      const byLocalidade = filterNascentesPublicas(MOCK_NASCENTES, {
        q: 'sitio fundao',
      });
      expect(byLocalidade.map((n) => n.id)).toEqual([1]);
    });

    it('deve filtrar combinando município + busca textual simultaneamente', () => {
      // Crato possui 2 nascentes (id 1 e id 5), mas apenas id 5 tem "Belmonte" / "Encosta"
      const combinedMatch = filterNascentesPublicas(MOCK_NASCENTES, {
        municipio: 'Crato',
        q: 'Belmonte',
      });
      expect(combinedMatch.map((n) => n.id)).toEqual([5]);

      // Crato + termo que pertence a Barbalha ("Caldas") deve retornar vazio
      const combinedMismatch = filterNascentesPublicas(MOCK_NASCENTES, {
        municipio: 'Crato',
        q: 'Caldas',
      });
      expect(combinedMismatch).toEqual([]);
    });

    it('não deve mutar o array original de nascentes sob nenhuma circunstância', () => {
      const snapshot = JSON.parse(JSON.stringify(MOCK_NASCENTES));
      filterNascentesPublicas(MOCK_NASCENTES, { municipio: 'Barbalha', q: 'Caldas' });

      expect(MOCK_NASCENTES).toEqual(snapshot);
    });

    it('deve validar registros individuais via matchesNascenteFilter com segurança', () => {
      const sample = MOCK_NASCENTES[2]!; // Santana do Cariri / Fonte do Saco / Sítio Saco
      expect(matchesNascenteFilter(sample)).toBe(true);
      expect(matchesNascenteFilter(sample, { municipio: 'Santana do Cariri' })).toBe(true);
      expect(matchesNascenteFilter(sample, { municipio: 'Santana do Cariri', q: 'saco' })).toBe(true);
      expect(matchesNascenteFilter(sample, { municipio: 'Crato', q: 'saco' })).toBe(false);
    });
  });

  describe('5. Controlador de Debounce Cancelável (createDebounceController)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('deve consolidar múltiplas digitações rápidas em uma única execução após o tempo de debounce', () => {
      const controller = createDebounceController<string>(DEFAULT_SEARCH_DEBOUNCE_MS);
      const callback = vi.fn();

      controller.schedule('F', callback);
      vi.advanceTimersByTime(100);

      controller.schedule('Fo', callback);
      vi.advanceTimersByTime(100);

      controller.schedule('Fonte', callback);
      expect(controller.isPending()).toBe(true);
      expect(callback).not.toHaveBeenCalled();

      // Avança quase até o limite (ainda não deve ter disparado)
      vi.advanceTimersByTime(DEFAULT_SEARCH_DEBOUNCE_MS - 1);
      expect(callback).not.toHaveBeenCalled();

      // Completa o tempo de debounce
      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('Fonte');
      expect(controller.isPending()).toBe(false);
    });

    it('deve cancelar imediatamente qualquer execução agendada quando cancel() for chamado (ex: Limpar filtros)', () => {
      const controller = createDebounceController<string>(DEFAULT_SEARCH_DEBOUNCE_MS);
      const callback = vi.fn();

      controller.schedule('Batateira', callback);
      expect(controller.isPending()).toBe(true);

      controller.cancel();
      expect(controller.isPending()).toBe(false);

      vi.advanceTimersByTime(DEFAULT_SEARCH_DEBOUNCE_MS * 2);
      expect(callback).not.toHaveBeenCalled();
    });

    it('deve executar imediatamente e limpar o timer pendente quando flush() for acionado', () => {
      const controller = createDebounceController<string>(DEFAULT_SEARCH_DEBOUNCE_MS);
      const callback = vi.fn();

      controller.schedule('Saco', callback);
      controller.flush('Saco Imediato', callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('Saco Imediato');
      expect(controller.isPending()).toBe(false);

      vi.advanceTimersByTime(DEFAULT_SEARCH_DEBOUNCE_MS * 2);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('6. Renderização Semântica e Acessível do Componente MapFilters', () => {
    it('deve renderizar <form role="search"> com controles acessíveis e botão Limpar desabilitado quando sem filtros', () => {
      const html = renderToString(
        React.createElement(MapFilters, {
          municipio: '',
          searchInput: '',
          municipios: ['Barbalha', 'Crato', 'Santana do Cariri'],
          onMunicipioChange: vi.fn(),
          onSearchInputChange: vi.fn(),
          onClearFilters: vi.fn(),
        })
      );

      expect(html).toContain('role="search"');
      expect(html).toContain('aria-label="Filtros de nascentes no mapa"');
      expect(html).toContain('for="filtro-municipio"');
      expect(html).toContain('role="combobox"');
      expect(html).toContain('aria-haspopup="listbox"');
      expect(html).toContain('Todos os municípios');
      expect(html).toContain('for="filtro-busca"');
      expect(html).toContain('type="search"');
      expect(html).toContain('placeholder="Buscar por fonte ou localidade..."');
      expect(html).toContain('data-testid="map-filter-clear-button"');
      expect(html).toContain('disabled=""');
    });

    it('deve habilitar o botão "Limpar filtros" e exibir o município ativo quando um filtro estiver selecionado', () => {
      const html = renderToString(
        React.createElement(MapFilters, {
          municipio: 'Santana do Cariri',
          searchInput: 'Saco',
          municipios: ['Barbalha', 'Crato', 'Santana do Cariri'],
          onMunicipioChange: vi.fn(),
          onSearchInputChange: vi.fn(),
          onClearFilters: vi.fn(),
        })
      );

      expect(html).toContain('Santana do Cariri');
      expect(html).toContain('value="Saco"');
      expect(html).not.toContain('disabled=""');
    });

    it('deve exibir aviso acessível não bloqueante quando ocorrer erro ao carregar municípios', () => {
      const html = renderToString(
        React.createElement(MapFilters, {
          municipio: '',
          searchInput: '',
          municipios: [],
          municipiosError: 'Erro ao carregar municípios',
          onMunicipioChange: vi.fn(),
          onSearchInputChange: vi.fn(),
          onClearFilters: vi.fn(),
        })
      );

      expect(html).toContain('Lista de municípios indisponível');
      expect(html).toContain('data-testid="map-filter-municipios-error"');
    });
  });

  describe('7. Regressão de UX — Coordenação entre Tooltip, Popup e Título Nativo do Marcador', () => {
    beforeEach(() => {
      installMockDom();
    });

    afterEach(() => {
      restoreMockDom();
    });

    it('deve fechar o Tooltip automaticamente ao abrir o Popup (popupopen) e bloquear tooltipopen enquanto o Popup estiver aberto', () => {
      const registeredHandlers: Record<string, (e?: unknown) => void> = {};
      let popupOpenState = false;

      const mockMarker = {
        bindTooltip: vi.fn().mockReturnThis(),
        bindPopup: vi.fn().mockReturnThis(),
        closeTooltip: vi.fn(),
        isPopupOpen: vi.fn(() => popupOpenState),
        getElement: vi.fn(() => null),
        on: vi.fn((event: string, handler: (e?: unknown) => void) => {
          registeredHandlers[event] = handler;
          return mockMarker;
        }),
      } as unknown as L.Marker;

      bindNascenteInteractions(mockMarker, MOCK_NASCENTES[0]!);

      // Simula abertura do popup
      popupOpenState = true;
      registeredHandlers['popupopen']?.({ popup: { getElement: () => null } });
      expect(mockMarker.closeTooltip).toHaveBeenCalledTimes(1);

      // Se o tooltip tentar abrir enquanto o popup ainda está aberto, deve ser fechado imediatamente
      registeredHandlers['tooltipopen']?.();
      expect(mockMarker.closeTooltip).toHaveBeenCalledTimes(2);
    });

    it('deve converter o atributo nativo title do elemento DOM do marcador em aria-label ao montar no mapa', () => {
      const registeredHandlers: Record<string, (e?: unknown) => void> = {};
      const markerDomElement = new MockDomElement('DIV');
      markerDomElement.setAttribute('title', 'Fonte da Batateira — Crato');

      const mockMarker = {
        bindTooltip: vi.fn().mockReturnThis(),
        bindPopup: vi.fn().mockReturnThis(),
        getElement: vi.fn(() => markerDomElement as unknown as HTMLElement),
        on: vi.fn((event: string, handler: (e?: unknown) => void) => {
          registeredHandlers[event] = handler;
          return mockMarker;
        }),
      } as unknown as L.Marker;

      bindNascenteInteractions(mockMarker, MOCK_NASCENTES[0]!);

      registeredHandlers['add']?.();

      expect(markerDomElement.getAttribute('title')).toBeNull();
      expect(markerDomElement.getAttribute('aria-label')).toBe(
        'Fonte da Batateira — Crato'
      );
    });
  });
});

