/**
 * CT-FE-03 — Teste Unitário: Popup no Clique, Toque e Acessibilidade por Teclado
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type L from 'leaflet';
import type { NascentePublicDto } from '@/modules/nascentes/nascentes.dto';
import {
  NASCENTE_POPUP_ANCHOR,
  DEFAULT_POPUP_OPTIONS,
  formatVazao,
  formatDataCriacao,
  formatCoordenadas,
  createNascentePopupElement,
  bindNascenteInteractions,
} from '@/components/map/map-popup';
import { installMockDom, restoreMockDom, MockDomElement } from './mock-dom';

describe('CT-FE-03 — Suíte de Popup e Interações Acessíveis (src/components/map/map-popup.ts)', () => {
  const mockNascenteValida: NascentePublicDto = {
    id: 42,
    latitude: -7.234567,
    longitude: -39.415678,
    municipio: 'Crato',
    localidade: 'Sítio Fundão',
    fonte: 'Nascente do Granjeiro',
    vazao_media: 3.75,
    unidade_vazao: 'm³/s',
    data_criacao: '2023-08-15',
  };

  describe('1. Contratos de Constantes e Opções Padrão de Popup', () => {
    it('deve definir a âncora cartográfica correta para o popup ([0, -36])', () => {
      // Arrange & Act & Assert
      expect(NASCENTE_POPUP_ANCHOR).toEqual([0, -36]);
    });

    it('deve expor opções padrão ideais de popup garantindo acessibilidade e usabilidade móvel', () => {
      // Arrange & Act & Assert
      expect(DEFAULT_POPUP_OPTIONS).toEqual({
        offset: [0, 0],
        closeButton: true,
        autoPan: true,
        autoPanPadding: [20, 20],
        className: 'nascente-leaflet-popup',
        maxWidth: 320,
        minWidth: 285,
      });
    });
  });

  describe('2. Formatadores Puros de Dados', () => {
    describe('formatVazao', () => {
      it('deve formatar valor numérico no padrão brasileiro com 2 casas decimais e unidade padrão', () => {
        expect(formatVazao(3.75)).toBe('3,75 m³/s');
        expect(formatVazao(1250.5)).toBe('1.250,50 m³/s');
        expect(formatVazao(0)).toBe('0,00 m³/s');
      });

      it('deve aceitar string numérica válida', () => {
        expect(formatVazao('4.2')).toBe('4,20 m³/s');
      });

      it('deve suportar unidades de medida personalizadas', () => {
        expect(formatVazao(10, 'L/s')).toBe('10,00 L/s');
        expect(formatVazao(2.5, 'm³/h')).toBe('2,50 m³/h');
      });

      it('deve retornar "Não informada" para valores ausentes ou nulos', () => {
        expect(formatVazao(null)).toBe('Não informada');
        expect(formatVazao(undefined)).toBe('Não informada');
      });

      it('deve retornar "Não informada" para vazões negativas, NaN ou strings não numéricas', () => {
        expect(formatVazao(-1)).toBe('Não informada');
        expect(formatVazao(-0.01)).toBe('Não informada');
        expect(formatVazao(NaN)).toBe('Não informada');
        expect(formatVazao('invalido')).toBe('Não informada');
        expect(formatVazao(Infinity)).toBe('Não informada');
      });
    });

    describe('formatDataCriacao', () => {
      it('deve formatar data civil AAAA-MM-DD para DD/MM/AAAA sem deslocamento de timezone', () => {
        expect(formatDataCriacao('2024-03-20')).toBe('20/03/2024');
        expect(formatDataCriacao('2023-12-31')).toBe('31/12/2023');
        expect(formatDataCriacao('2020-01-01')).toBe('01/01/2020');
      });

      it('deve suportar datas com timestamp ISO sem distorcer o dia civil', () => {
        expect(formatDataCriacao('2024-03-20T14:30:00Z')).toBe('20/03/2024');
      });

      it('deve retornar "Não informada" para datas nulas, vazias ou formatos inválidos', () => {
        expect(formatDataCriacao(null)).toBe('Não informada');
        expect(formatDataCriacao(undefined)).toBe('Não informada');
        expect(formatDataCriacao('')).toBe('Não informada');
        expect(formatDataCriacao('data_invalida')).toBe('Não informada');
        expect(formatDataCriacao('20-03-2024')).toBe('Não informada');
      });
    });

    describe('formatCoordenadas', () => {
      it('deve formatar coordenadas com precisão cartográfica de 6 casas decimais', () => {
        expect(formatCoordenadas(-7.234567, -39.415678)).toBe('-7.234567, -39.415678');
      });

      it('deve preencher com zeros à direita até atingir 6 casas decimais', () => {
        expect(formatCoordenadas(-7.2, -39.4)).toBe('-7.200000, -39.400000');
        expect(formatCoordenadas(0, 0)).toBe('0.000000, 0.000000');
      });

      it('deve aceitar coordenadas nos limites mundiais [-90, 90] e [-180, 180]', () => {
        expect(formatCoordenadas(-90, -180)).toBe('-90.000000, -180.000000');
        expect(formatCoordenadas(90, 180)).toBe('90.000000, 180.000000');
      });

      it('deve retornar "Não informadas" para coordenadas fora dos limites globais', () => {
        expect(formatCoordenadas(90.00001, -39.0)).toBe('Não informadas');
        expect(formatCoordenadas(-90.00001, -39.0)).toBe('Não informadas');
        expect(formatCoordenadas(-7.0, 180.00001)).toBe('Não informadas');
        expect(formatCoordenadas(-7.0, -180.00001)).toBe('Não informadas');
      });

      it('deve retornar "Não informadas" para coordenadas nulas, indefinidas ou NaN', () => {
        expect(formatCoordenadas(null, -39.0)).toBe('Não informadas');
        expect(formatCoordenadas(-7.0, null)).toBe('Não informadas');
        expect(formatCoordenadas(undefined, undefined)).toBe('Não informadas');
        expect(formatCoordenadas(NaN, -39.0)).toBe('Não informadas');
        expect(formatCoordenadas(-7.0, Infinity)).toBe('Não informadas');
      });
    });
  });

  describe('3. Fábrica DOM do Popup (createNascentePopupElement)', () => {
    beforeEach(() => {
      installMockDom();
    });

    afterEach(() => {
      restoreMockDom();
    });

    it('deve construir a árvore semântica do popup com header, badge, título e dl', () => {
      // Act
      const el = createNascentePopupElement(mockNascenteValida) as unknown as MockDomElement;

      // Assert: Raiz article com aria-labelledby apontando para o id do título
      expect(el.tagName).toBe('ARTICLE');
      expect(el.className).toBe('nascente-popup');
      expect(el.getAttribute('aria-labelledby')).toBe('nascente-popup-title-42');

      // Header com badge e título h3
      const header = el.querySelector<MockDomElement>('.nascente-popup-header');
      expect(header).not.toBeNull();

      const badge = header?.querySelector<MockDomElement>('.nascente-popup-badge');
      expect(badge?.textContent).toBe('Nascente');

      const title = header?.querySelector<MockDomElement>('.nascente-popup-title');
      expect(title?.tagName).toBe('H3');
      expect(title?.id).toBe('nascente-popup-title-42');
      expect(title?.textContent).toBe('Nascente do Granjeiro');

      // Lista de definição com detalhes
      const dl = el.querySelector<MockDomElement>('.nascente-popup-details');
      expect(dl).not.toBeNull();
    });

    it('deve exibir a vazão média como primeira linha (hero stat com classe .nascente-popup-row--flow)', () => {
      // Act
      const el = createNascentePopupElement(mockNascenteValida) as unknown as MockDomElement;
      const dl = el.querySelector<MockDomElement>('.nascente-popup-details');
      expect(dl).not.toBeNull();

      // Primeiro item deve ser a vazão média
      const firstRow = dl?.children[0] as MockDomElement;
      expect(firstRow.className).toBe('nascente-popup-row nascente-popup-row--flow');

      const term = firstRow.querySelector<MockDomElement>('.nascente-popup-term');
      const value = firstRow.querySelector<MockDomElement>('.nascente-popup-value');
      expect(term?.textContent).toBe('Vazão média');
      expect(value?.textContent).toBe('3,75 m³/s');
    });

    it('deve estruturar as linhas subsequentes na ordem: Município, Localidade, Data de criação e Coordenadas', () => {
      // Act
      const el = createNascentePopupElement(mockNascenteValida) as unknown as MockDomElement;
      const rows = el.querySelectorAll<MockDomElement>('.nascente-popup-row');

      expect(rows).toHaveLength(5);
      const row0 = rows[0]!;
      const row1 = rows[1]!;
      const row2 = rows[2]!;
      const row3 = rows[3]!;
      const row4 = rows[4]!;

      // Linha 1: Vazão
      expect(row0.querySelector<MockDomElement>('.nascente-popup-term')?.textContent).toBe('Vazão média');
      expect(row0.querySelector<MockDomElement>('.nascente-popup-value')?.textContent).toBe('3,75 m³/s');

      // Linha 2: Município
      expect(row1.querySelector<MockDomElement>('.nascente-popup-term')?.textContent).toBe('Município');
      expect(row1.querySelector<MockDomElement>('.nascente-popup-value')?.textContent).toBe('Crato');

      // Linha 3: Localidade
      expect(row2.querySelector<MockDomElement>('.nascente-popup-term')?.textContent).toBe('Localidade');
      expect(row2.querySelector<MockDomElement>('.nascente-popup-value')?.textContent).toBe('Sítio Fundão');

      // Linha 4: Data de criação
      expect(row3.querySelector<MockDomElement>('.nascente-popup-term')?.textContent).toBe('Data de criação');
      expect(row3.querySelector<MockDomElement>('.nascente-popup-value')?.textContent).toBe('15/08/2023');

      // Linha 5: Coordenadas (com classe especial monospace)
      expect(row4.querySelector<MockDomElement>('.nascente-popup-term')?.textContent).toBe('Coordenadas');
      const coordsVal = row4.querySelector<MockDomElement>('.nascente-popup-value');
      expect(coordsVal?.className).toBe('nascente-popup-value nascente-popup-value--coords');
      expect(coordsVal?.textContent).toBe('-7.234567, -39.415678');
    });

    describe('Regras de Fallback para Valores Omitidos ou Nulos', () => {
      it('deve aplicar fallbacks elegantes quando campos opcionais não forem informados', () => {
        // Arrange
        const nascenteMinima = {
          id: 99,
          latitude: -7.0,
          longitude: -39.0,
          municipio: '   ',
          fonte: '   ',
          localidade: null,
          data_criacao: null,
          vazao_media: null,
        } as unknown as NascentePublicDto;

        // Act
        const el = createNascentePopupElement(nascenteMinima) as unknown as MockDomElement;
        const rows = el.querySelectorAll<MockDomElement>('.nascente-popup-row');

        // Assert
        const title = el.querySelector<MockDomElement>('.nascente-popup-title');
        expect(title?.textContent).toBe('Nascente sem denominação');

        const row0 = rows[0]!;
        const row1 = rows[1]!;
        const row2 = rows[2]!;
        const row3 = rows[3]!;

        // Vazão média -> Não informada
        expect(row0.querySelector<MockDomElement>('.nascente-popup-value')?.textContent).toBe('Não informada');
        // Município -> Não informado
        expect(row1.querySelector<MockDomElement>('.nascente-popup-value')?.textContent).toBe('Não informado');
        // Localidade -> Não informada
        expect(row2.querySelector<MockDomElement>('.nascente-popup-value')?.textContent).toBe('Não informada');
        // Data de criação -> Não informada
        expect(row3.querySelector<MockDomElement>('.nascente-popup-value')?.textContent).toBe('Não informada');
      });
    });

    describe('Segurança e Imunidade a Cross-Site Scripting (XSS)', () => {
      it('deve neutralizar completamente payloads maliciosos em todos os campos sem injetar HTML no DOM', () => {
        // Arrange
        const ataqueXss = {
          id: 666,
          latitude: -7.1,
          longitude: -39.1,
          fonte: '<script>alert("XSS Fonte")</script>',
          municipio: '<b onclick="alert(1)">Crato</b>',
          localidade: '"><img src=x onerror=alert(2)>',
          vazao_media: 10,
          unidade_vazao: '<iframe src=javascript:alert(3)>',
          data_criacao: '2024-01-01',
        } as unknown as NascentePublicDto;

        // Act
        const el = createNascentePopupElement(ataqueXss) as unknown as MockDomElement;

        // Assert: Garante que nenhuma tag executável foi criada na árvore DOM
        expect(el.querySelector('script')).toBeNull();
        expect(el.querySelector('b')).toBeNull();
        expect(el.querySelector('img')).toBeNull();
        expect(el.querySelector('iframe')).toBeNull();

        // Garante que o texto puro preserva a string original sem execução
        const title = el.querySelector<MockDomElement>('.nascente-popup-title');
        expect(title?.textContent).toBe('<script>alert("XSS Fonte")</script>');

        const rows = el.querySelectorAll<MockDomElement>('.nascente-popup-row');
        const row1 = rows[1]!;
        const row2 = rows[2]!;
        expect(row1.querySelector<MockDomElement>('.nascente-popup-value')?.textContent).toBe('<b onclick="alert(1)">Crato</b>');
        expect(row2.querySelector<MockDomElement>('.nascente-popup-value')?.textContent).toBe('"><img src=x onerror=alert(2)>');
      });
    });
  });

  describe('4. Robustez em Ambiente Server-Side (Sem DOM)', () => {
    it('deve lançar exceção descritiva quando createNascentePopupElement for invocado sem document', () => {
      // Garante ausência de document
      restoreMockDom();

      expect(() => createNascentePopupElement(mockNascenteValida)).toThrow(
        'createNascentePopupElement requer um ambiente com DOM (document indisponível).'
      );
    });
  });

  describe('5. Interações Acessíveis por Teclado e Botão de Fechar (bindNascenteInteractions)', () => {
    beforeEach(() => {
      installMockDom();
    });

    afterEach(() => {
      restoreMockDom();
    });

    it('deve invocar marker.bindPopup com o elemento gerado e as opções padrão', () => {
      // Arrange
      const mockMarker = {
        bindTooltip: vi.fn().mockReturnThis(),
        bindPopup: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
      } as unknown as L.Marker;

      // Act
      bindNascenteInteractions(mockMarker, mockNascenteValida);

      // Assert
      expect(mockMarker.bindPopup).toHaveBeenCalledTimes(1);
      const mockCalls = (mockMarker.bindPopup as unknown as { mock: { calls: [unknown, unknown][] } }).mock.calls;
      const firstCall = mockCalls[0];
      expect(firstCall).toBeDefined();
      const [popupEl, popupOpts] = firstCall!;

      expect(popupEl).toBeDefined();
      expect(popupOpts).toEqual(
        expect.objectContaining({
          offset: [0, 0],
          closeButton: true,
          autoPan: true,
          className: 'nascente-leaflet-popup',
          minWidth: 285,
          maxWidth: 320,
        })
      );
    });

    it('deve permitir estender as opções de popup com configurações customizadas', () => {
      // Arrange
      const mockMarker = {
        bindTooltip: vi.fn().mockReturnThis(),
        bindPopup: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
      } as unknown as L.Marker;

      const customOpts: L.PopupOptions = {
        minWidth: 350,
        autoPan: false,
      };

      // Act
      bindNascenteInteractions(mockMarker, mockNascenteValida, customOpts);

      // Assert
      expect(mockMarker.bindPopup).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          minWidth: 350,
          autoPan: false,
          className: 'nascente-leaflet-popup',
        })
      );
    });

    describe('Acessibilidade por Teclado (Enter e Espaço)', () => {
      it('deve registrar ouvinte keydown que abre o popup ao pressionar "Enter"', () => {
        // Arrange
        const registeredHandlers: Record<string, (e: unknown) => void> = {};
        const mockMarker = {
          bindTooltip: vi.fn().mockReturnThis(),
          bindPopup: vi.fn().mockReturnThis(),
          openPopup: vi.fn(),
          on: vi.fn((event: string, handler: (e: unknown) => void) => {
            registeredHandlers[event] = handler;
            return mockMarker;
          }),
        } as unknown as L.Marker;

        bindNascenteInteractions(mockMarker, mockNascenteValida);

        // Act: Simula evento de tecla Enter
        const preventDefault = vi.fn();
        const enterEvent = {
          originalEvent: {
            key: 'Enter',
            preventDefault,
          },
        };

        const keydownHandler = registeredHandlers['keydown'];
        expect(keydownHandler).toBeDefined();
        keydownHandler!(enterEvent);

        // Assert
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(mockMarker.openPopup).toHaveBeenCalledTimes(1);
      });

      it('deve abrir o popup ao pressionar tecla Espaço (" " e "Spacebar")', () => {
        // Arrange
        const registeredHandlers: Record<string, (e: unknown) => void> = {};
        const mockMarker = {
          bindTooltip: vi.fn().mockReturnThis(),
          bindPopup: vi.fn().mockReturnThis(),
          openPopup: vi.fn(),
          on: vi.fn((event: string, handler: (e: unknown) => void) => {
            registeredHandlers[event] = handler;
            return mockMarker;
          }),
        } as unknown as L.Marker;

        bindNascenteInteractions(mockMarker, mockNascenteValida);

        const keydownHandler = registeredHandlers['keydown'];
        expect(keydownHandler).toBeDefined();

        // Act 1: Espaço padrão (" ")
        const preventDefaultSpace = vi.fn();
        keydownHandler!({
          originalEvent: { key: ' ', preventDefault: preventDefaultSpace },
        });

        expect(preventDefaultSpace).toHaveBeenCalledTimes(1);
        expect(mockMarker.openPopup).toHaveBeenCalledTimes(1);

        // Act 2: Espaço legado ("Spacebar")
        const preventDefaultSpacebar = vi.fn();
        keydownHandler!({
          originalEvent: { key: 'Spacebar', preventDefault: preventDefaultSpacebar },
        });

        expect(preventDefaultSpacebar).toHaveBeenCalledTimes(1);
        expect(mockMarker.openPopup).toHaveBeenCalledTimes(2);
      });

      it('não deve abrir o popup nem prevenir default para outras teclas (ex: Tab, Escape, Setas)', () => {
        // Arrange
        const registeredHandlers: Record<string, (e: unknown) => void> = {};
        const mockMarker = {
          bindTooltip: vi.fn().mockReturnThis(),
          bindPopup: vi.fn().mockReturnThis(),
          openPopup: vi.fn(),
          on: vi.fn((event: string, handler: (e: unknown) => void) => {
            registeredHandlers[event] = handler;
            return mockMarker;
          }),
        } as unknown as L.Marker;

        bindNascenteInteractions(mockMarker, mockNascenteValida);

        const keydownHandler = registeredHandlers['keydown'];
        expect(keydownHandler).toBeDefined();

        const preventDefault = vi.fn();
        keydownHandler!({
          originalEvent: { key: 'Tab', preventDefault },
        });
        keydownHandler!({
          originalEvent: { key: 'Escape', preventDefault },
        });
        keydownHandler!({
          originalEvent: { key: 'ArrowDown', preventDefault },
        });

        // Assert
        expect(preventDefault).not.toHaveBeenCalled();
        expect(mockMarker.openPopup).not.toHaveBeenCalled();
      });
    });

    describe('Acessibilidade do Botão de Fechar (.leaflet-popup-close-button)', () => {
      it('deve injetar aria-label e title descritivos com o nome da fonte ao disparar popupopen', () => {
        // Arrange
        const registeredHandlers: Record<string, (e: unknown) => void> = {};
        const mockMarker = {
          bindTooltip: vi.fn().mockReturnThis(),
          bindPopup: vi.fn().mockReturnThis(),
          openPopup: vi.fn(),
          on: vi.fn((event: string, handler: (e: unknown) => void) => {
            registeredHandlers[event] = handler;
            return mockMarker;
          }),
        } as unknown as L.Marker;

        bindNascenteInteractions(mockMarker, mockNascenteValida);

        // Cria elemento container falso de popup com o botão fechar
        const container = new MockDomElement('DIV');
        const closeBtn = new MockDomElement('A');
        closeBtn.className = 'leaflet-popup-close-button';
        container.appendChild(closeBtn);

        const popupEvent = {
          popup: {
            getElement: () => container,
          },
        };

        const popupopenHandler = registeredHandlers['popupopen'];
        expect(popupopenHandler).toBeDefined();

        // Act: Dispara popupopen
        popupopenHandler!(popupEvent);

        // Assert
        expect(closeBtn.getAttribute('aria-label')).toBe('Fechar detalhes da nascente Nascente do Granjeiro');
        expect(closeBtn.getAttribute('title')).toBe('Fechar detalhes da nascente Nascente do Granjeiro');
      });

      it('deve usar fallback genérico no botão fechar quando a nascente não possuir fonte denominada', () => {
        // Arrange
        const registeredHandlers: Record<string, (e: unknown) => void> = {};
        const mockMarker = {
          bindTooltip: vi.fn().mockReturnThis(),
          bindPopup: vi.fn().mockReturnThis(),
          openPopup: vi.fn(),
          on: vi.fn((event: string, handler: (e: unknown) => void) => {
            registeredHandlers[event] = handler;
            return mockMarker;
          }),
        } as unknown as L.Marker;

        const nascenteSemFonte: NascentePublicDto = {
          ...mockNascenteValida,
          fonte: '   ',
        };

        bindNascenteInteractions(mockMarker, nascenteSemFonte);

        const container = new MockDomElement('DIV');
        const closeBtn = new MockDomElement('A');
        closeBtn.className = 'leaflet-popup-close-button';
        container.appendChild(closeBtn);

        const popupopenHandler = registeredHandlers['popupopen'];
        expect(popupopenHandler).toBeDefined();

        // Act: Dispara popupopen
        popupopenHandler!({
          popup: { getElement: () => container },
        });

        // Assert
        expect(closeBtn.getAttribute('aria-label')).toBe('Fechar detalhes da nascente');
        expect(closeBtn.getAttribute('title')).toBe('Fechar detalhes da nascente');
      });
    });
  });
});
