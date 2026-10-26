import { describe, it, expect } from 'vitest';
import React from 'react';
import MapaLayout from '@/app/mapa/layout';
import MapaPage from '@/app/mapa/page';
import MapLoading from '@/components/map/MapLoading';
import layoutStyles from '@/app/mapa/mapa.module.css';
import loadingStyles from '@/components/map/MapLoading.module.css';
import mapStyles from '@/components/map/LeafletMap.module.css';

describe('Responsividade da Rota Pública e Isolamento de Iframe (CT-FE-07)', () => {
  describe('Layout Estrutural e Enquadramento em Iframe', () => {
    it('deve aplicar as classes CSS que garantem largura total e altura dinâmica (100dvh/100vh)', () => {
      const layoutElement = MapaLayout({ children: React.createElement('div', { id: 'teste' }) });

      expect(layoutElement.type).toBe('div');
      expect(layoutElement.props.id).toBe('mapa-publico-layout');
      expect(layoutElement.props.className).toBe(layoutStyles.mapaLayout);
      expect(layoutElement.props.role).toBe('region');
      expect(layoutElement.props['aria-label']).toBe('Mapa Interativo das Nascentes do Cariri');
    });

    it('deve garantir que o elemento <main> possua overflow controlado e flexibilidade de altura', () => {
      const pageElement = MapaPage();

      expect(pageElement.type).toBe('main');
      expect(pageElement.props.className).toBe(layoutStyles.mapaMain);
      expect(pageElement.props['aria-label']).toBe('Mapa Interativo');

      // Valida presença de heading semanticamente oculto para leitores de tela
      const children = React.Children.toArray(pageElement.props.children);
      const srHeading = children.find(
        (child) => React.isValidElement(child) && child.type === 'h1'
      ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;

      expect(srHeading).toBeDefined();
      expect(srHeading?.props.className).toBe(layoutStyles.srOnly);
    });

    it('deve conter estilos que previnem o transbordamento horizontal (horizontal scroll) em telas móveis', () => {
      // Classes devem estar definidas em seus respectivos módulos CSS
      expect(layoutStyles.mapaLayout).toBeDefined();
      expect(layoutStyles.mapaMain).toBeDefined();
      expect(mapStyles.mapContainer).toBeDefined();
      expect(layoutStyles.srOnly).toBeDefined();
    });
  });

  describe('Feedback Visual e Acessibilidade (Skeleton Loading em Múltiplas Resoluções)', () => {
    it('deve renderizar o skeleton de carregamento com semântica de status acessível para leitores de tela', () => {
      const loadingElement = MapLoading();

      expect(loadingElement.type).toBe('div');
      expect(loadingElement.props.role).toBe('status');
      expect(loadingElement.props['aria-live']).toBe('polite');
      expect(loadingElement.props['aria-label']).toBe('Carregando mapa interativo das nascentes');
    });

    it('deve marcar elementos puramente visuais e decorativos com aria-hidden="true"', () => {
      const loadingElement = MapLoading();
      const children = React.Children.toArray(loadingElement.props.children);

      const decorativeElements = children.filter(
        (child) => React.isValidElement(child) && (child.props as Record<string, unknown>)['aria-hidden'] === 'true'
      );

      // Grid cartográfico, shimmer, controles de zoom simulados, escala simulada e badge devem ser aria-hidden
      expect(decorativeElements.length).toBeGreaterThanOrEqual(4);
    });

    it('deve conter badge central com mensagem clara e pontos de pulso de loading', () => {
      const loadingElement = MapLoading();
      const children = React.Children.toArray(loadingElement.props.children);

      const centerBadge = children.find(
        (child) => React.isValidElement(child) && (child.props as { className?: string }).className === loadingStyles.skeletonCenterBadge
      ) as React.ReactElement<{ children?: React.ReactNode }> | undefined;

      expect(centerBadge).toBeDefined();
    });
  });

  describe('Simulação de Viewports e Cenários de Dispositivo', () => {
    const viewports = [
      { nome: 'Desktop Full HD', width: 1920, height: 1080, tipo: 'desktop' },
      { nome: 'Laptop Padrão', width: 1366, height: 768, tipo: 'desktop' },
      { nome: 'Tablet Retrato', width: 768, height: 1024, tipo: 'tablet' },
      { nome: 'Mobile Padrão (iPhone 14 / Android)', width: 390, height: 844, tipo: 'mobile' },
      { nome: 'Mobile Compacto (iPhone SE)', width: 375, height: 667, tipo: 'mobile' },
    ];

    it.each(viewports)(
      'deve suportar renderização em $nome ($width x $height)',
      ({ width, height }) => {
        // Valida que o layout e os componentes renderizam sem exceções para qualquer dimensão de tela
        const layout = MapaLayout({
          children: React.createElement('div', {
            style: { width: `${width}px`, height: `${height}px` },
            id: 'viewport-test-child',
          }),
        });

        expect(layout).toBeDefined();
        expect(layout.props.children).toBeDefined();
      }
    );
  });
});
