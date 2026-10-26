/**
 * CT-FE-02 — Teste Unitário: Tooltip no Mouseover e Marcadores
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type L from 'leaflet';
import type { NascentePublicDto } from '@/modules/nascentes/nascentes.dto';
import {
  NASCENTE_TOOLTIP_ANCHOR,
  DEFAULT_TOOLTIP_OPTIONS,
  createNascenteTooltipElement,
  bindNascenteInteractions,
} from '@/components/map/map-popup';
import { installMockDom, restoreMockDom, MockDomElement } from './mock-dom';

describe('CT-FE-02 — Suíte de Tooltip no Mouseover (src/components/map/map-popup.ts)', () => {
  const mockNascenteValida: NascentePublicDto = {
    id: 1,
    latitude: -7.234567,
    longitude: -39.415678,
    municipio: 'Crato',
    localidade: 'Sítio Fundão',
    fonte: 'Fonte dos Buritis',
    vazao_media: 5.4,
    unidade_vazao: 'm³/s',
    data_criacao: '2024-03-20',
  };

  describe('1. Contratos de Constantes e Opções Padrão de Tooltip', () => {
    it('deve definir a âncora cartográfica correta para o tooltip ([14, -18])', () => {
      // Arrange & Act
      const anchor = NASCENTE_TOOLTIP_ANCHOR;

      // Assert: metade da largura (14) e centro vertical do marcador (36/2 = 18)
      expect(anchor).toEqual([14, -18]);
    });

    it('deve expor opções padrão ideais para o Leaflet com classe e direção adequadas', () => {
      // Arrange & Act & Assert
      expect(DEFAULT_TOOLTIP_OPTIONS).toEqual({
        offset: [0, 0],
        direction: 'right',
        sticky: false,
        opacity: 0.96,
        className: 'nascente-leaflet-tooltip',
      });
    });
  });

  describe('2. Fábrica DOM do Tooltip (createNascenteTooltipElement)', () => {
    beforeEach(() => {
      installMockDom();
    });

    afterEach(() => {
      restoreMockDom();
    });

    it('deve criar a árvore semântica do tooltip com atributos de acessibilidade (role="tooltip")', () => {
      // Arrange & Act
      const el = createNascenteTooltipElement(mockNascenteValida) as unknown as MockDomElement;

      // Assert
      expect(el.tagName).toBe('DIV');
      expect(el.className).toBe('nascente-tooltip');
      expect(el.getAttribute('role')).toBe('tooltip');

      const header = el.querySelector<MockDomElement>('.nascente-tooltip-header');
      expect(header).not.toBeNull();
      expect(header?.children[0]?.tagName).toBe('STRONG');
      expect(header?.children[0]?.className).toBe('nascente-tooltip-title');
      expect(header?.children[0]?.textContent).toBe('Fonte dos Buritis');

      const body = el.querySelector<MockDomElement>('.nascente-tooltip-body');
      expect(body).not.toBeNull();

      const location = el.querySelector<MockDomElement>('.nascente-tooltip-location');
      expect(location).not.toBeNull();
      expect(location?.textContent).toBe('Sítio Fundão, Crato');

      const flow = el.querySelector<MockDomElement>('.nascente-tooltip-flow');
      expect(flow).not.toBeNull();
      expect(flow?.textContent).toBe('Vazão: 5,40 m³/s');
    });

    describe('Regras de Fallback de Localização e Município', () => {
      it('deve formatar localização como "localidade, municipio" quando ambos existirem', () => {
        // Arrange
        const nascente: NascentePublicDto = {
          ...mockNascenteValida,
          localidade: 'Baixa Verde',
          municipio: 'Barbalha',
        };

        // Act
        const el = createNascenteTooltipElement(nascente) as unknown as MockDomElement;
        const loc = el.querySelector<MockDomElement>('.nascente-tooltip-location');

        // Assert
        expect(loc?.textContent).toBe('Baixa Verde, Barbalha');
      });

      it('deve exibir apenas a localidade quando município for vazio ou omitido', () => {
        // Arrange
        const nascente: NascentePublicDto = {
          ...mockNascenteValida,
          localidade: 'Sítio Barreiras',
          municipio: '',
        };

        // Act
        const el = createNascenteTooltipElement(nascente) as unknown as MockDomElement;
        const loc = el.querySelector<MockDomElement>('.nascente-tooltip-location');

        // Assert
        expect(loc?.textContent).toBe('Sítio Barreiras');
      });

      it('deve exibir apenas o município quando localidade for vazia ou omitida', () => {
        // Arrange
        const nascente: NascentePublicDto = {
          ...mockNascenteValida,
          localidade: '',
          municipio: 'Santana do Cariri',
        };

        // Act
        const el = createNascenteTooltipElement(nascente) as unknown as MockDomElement;
        const loc = el.querySelector<MockDomElement>('.nascente-tooltip-location');

        // Assert
        expect(loc?.textContent).toBe('Santana do Cariri');
      });

      it('deve usar o fallback "Cariri" quando ambos forem vazios ou apenas espaços em branco', () => {
        // Arrange
        const nascente: NascentePublicDto = {
          ...mockNascenteValida,
          localidade: '   ',
          municipio: '   ',
        };

        // Act
        const el = createNascenteTooltipElement(nascente) as unknown as MockDomElement;
        const loc = el.querySelector<MockDomElement>('.nascente-tooltip-location');

        // Assert
        expect(loc?.textContent).toBe('Cariri');
      });
    });

    describe('Regras de Formatação e Fallback de Vazão', () => {
      it('deve formatar vazão média com 2 casas decimais e vírgula no padrão pt-BR', () => {
        // Arrange
        const nascente: NascentePublicDto = {
          ...mockNascenteValida,
          vazao_media: 12.3456,
          unidade_vazao: 'm³/s',
        };

        // Act
        const el = createNascenteTooltipElement(nascente) as unknown as MockDomElement;
        const flow = el.querySelector<MockDomElement>('.nascente-tooltip-flow');

        // Assert
        expect(flow?.textContent).toBe('Vazão: 12,35 m³/s');
      });

      it('deve suportar unidade personalizada de vazão', () => {
        // Arrange
        const nascente = {
          ...mockNascenteValida,
          vazao_media: 15.0,
          unidade_vazao: 'L/s',
        } as unknown as NascentePublicDto;

        // Act
        const el = createNascenteTooltipElement(nascente) as unknown as MockDomElement;
        const flow = el.querySelector<MockDomElement>('.nascente-tooltip-flow');

        // Assert
        expect(flow?.textContent).toBe('Vazão: 15,00 L/s');
      });

      it('deve exibir "Vazão: Não informada" quando vazão_media for nula ou indefinida', () => {
        // Arrange
        const nascenteSemVazao = {
          ...mockNascenteValida,
          vazao_media: null,
        } as unknown as NascentePublicDto;

        // Act
        const el = createNascenteTooltipElement(nascenteSemVazao) as unknown as MockDomElement;
        const flow = el.querySelector<MockDomElement>('.nascente-tooltip-flow');

        // Assert
        expect(flow?.textContent).toBe('Vazão: Não informada');
      });

      it('deve exibir "Vazão: Não informada" quando a vazão for negativa', () => {
        // Arrange
        const nascenteInvalida: NascentePublicDto = {
          ...mockNascenteValida,
          vazao_media: -2.5,
        };

        // Act
        const el = createNascenteTooltipElement(nascenteInvalida) as unknown as MockDomElement;
        const flow = el.querySelector<MockDomElement>('.nascente-tooltip-flow');

        // Assert
        expect(flow?.textContent).toBe('Vazão: Não informada');
      });

      it('deve formatar corretamente vazão igual a zero (0,00 m³/s)', () => {
        // Arrange
        const nascenteZero: NascentePublicDto = {
          ...mockNascenteValida,
          vazao_media: 0,
        };

        // Act
        const el = createNascenteTooltipElement(nascenteZero) as unknown as MockDomElement;
        const flow = el.querySelector<MockDomElement>('.nascente-tooltip-flow');

        // Assert
        expect(flow?.textContent).toBe('Vazão: 0,00 m³/s');
      });
    });

    describe('Regras de Denominação da Fonte (Título)', () => {
      it('deve aplicar fallback para "Nascente sem denominação" quando fonte for nula, vazia ou espaços', () => {
        // Arrange
        const nascenteSemFonte: NascentePublicDto = {
          ...mockNascenteValida,
          fonte: '   ',
        };

        // Act
        const el = createNascenteTooltipElement(nascenteSemFonte) as unknown as MockDomElement;
        const title = el.querySelector<MockDomElement>('.nascente-tooltip-title');

        // Assert
        expect(title?.textContent).toBe('Nascente sem denominação');
      });
    });

    describe('Segurança e Imunidade a Cross-Site Scripting (XSS)', () => {
      it('não deve interpretar tags ou scripts maliciosos injetados nos campos de texto', () => {
        // Arrange
        const payloadHostil = '<script>alert("XSS")</script><img src=x onerror=alert(1)>';
        const nascenteAtaque = {
          ...mockNascenteValida,
          fonte: payloadHostil,
          localidade: '"><b onmouseover=alert(1)>X</b>',
          municipio: '<svg onload=alert(1)>',
          unidade_vazao: '<iframe src=javascript:alert(1)></iframe>',
        } as unknown as NascentePublicDto;

        // Act
        const el = createNascenteTooltipElement(nascenteAtaque) as unknown as MockDomElement;

        // Assert: Assegura que o elemento pai NÃO contém tags HTML parsed e que os valores são tratados como texto estrito
        const title = el.querySelector<MockDomElement>('.nascente-tooltip-title');
        const location = el.querySelector<MockDomElement>('.nascente-tooltip-location');
        const flow = el.querySelector<MockDomElement>('.nascente-tooltip-flow');

        expect(title?.textContent).toBe(payloadHostil);
        expect(location?.textContent).toContain('"><b onmouseover=alert(1)>X</b>');
        expect(flow?.textContent).toContain('<iframe src=javascript:alert(1)></iframe>');

        // Não deve criar nós de script ou imagem filhos
        expect(el.querySelector('script')).toBeNull();
        expect(el.querySelector('img')).toBeNull();
        expect(el.querySelector('svg')).toBeNull();
        expect(el.querySelector('iframe')).toBeNull();
      });
    });
  });

  describe('3. Robustez em Ambiente Server-Side (Sem DOM)', () => {
    it('deve lançar erro descritivo caso createNascenteTooltipElement seja invocado sem document global', () => {
      // Garante ausência de document
      restoreMockDom();

      expect(() => createNascenteTooltipElement(mockNascenteValida)).toThrow(
        'createNascenteTooltipElement requer um ambiente com DOM (document indisponível).'
      );
    });

    it('deve retornar silenciosamente e de forma resiliente em bindNascenteInteractions quando document for indefinido', () => {
      // Garante ausência de document
      restoreMockDom();

      const mockMarker = {
        bindTooltip: vi.fn(),
        bindPopup: vi.fn(),
      } as unknown as L.Marker;

      // Act
      expect(() => bindNascenteInteractions(mockMarker, mockNascenteValida)).not.toThrow();

      // Assert: Nenhuma operação deve ter sido chamada
      expect(mockMarker.bindTooltip).not.toHaveBeenCalled();
      expect(mockMarker.bindPopup).not.toHaveBeenCalled();
    });
  });

  describe('4. Vinculação do Tooltip ao Marcador (bindNascenteInteractions)', () => {
    beforeEach(() => {
      installMockDom();
    });

    afterEach(() => {
      restoreMockDom();
    });

    it('deve invocar marker.bindTooltip com o elemento gerado e as opções padrão', () => {
      // Arrange
      const mockMarker = {
        bindTooltip: vi.fn().mockReturnThis(),
        bindPopup: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
      } as unknown as L.Marker;

      // Act
      bindNascenteInteractions(mockMarker, mockNascenteValida);

      // Assert
      expect(mockMarker.bindTooltip).toHaveBeenCalledTimes(1);
      const mockCalls = (mockMarker.bindTooltip as unknown as { mock: { calls: [unknown, unknown][] } }).mock.calls;
      const firstCall = mockCalls[0];
      expect(firstCall).toBeDefined();
      const [elementArg, optionsArg] = firstCall!;

      expect(elementArg).toBeDefined();
      expect(optionsArg).toEqual(
        expect.objectContaining({
          offset: [0, 0],
          direction: 'right',
          sticky: false,
          opacity: 0.96,
          className: 'nascente-leaflet-tooltip',
        })
      );
    });

    it('deve permitir sobrescrever as opções padrão do tooltip', () => {
      // Arrange
      const mockMarker = {
        bindTooltip: vi.fn().mockReturnThis(),
        bindPopup: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
      } as unknown as L.Marker;

      const customTooltipOptions: L.TooltipOptions = {
        direction: 'top',
        opacity: 0.8,
        sticky: true,
      };

      // Act
      bindNascenteInteractions(mockMarker, mockNascenteValida, undefined, customTooltipOptions);

      // Assert
      expect(mockMarker.bindTooltip).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          direction: 'top',
          opacity: 0.8,
          sticky: true,
          className: 'nascente-leaflet-tooltip',
        })
      );
    });

    it('não deve quebrar caso marker.bindTooltip não seja uma função', () => {
      // Arrange
      const mockMarkerIncompleto = {
        bindPopup: vi.fn(),
      } as unknown as L.Marker;

      // Act & Assert
      expect(() => bindNascenteInteractions(mockMarkerIncompleto, mockNascenteValida)).not.toThrow();
    });
  });
});
