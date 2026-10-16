import { describe, it, expect } from 'vitest';
import MapaLayout, { metadata } from '@/app/mapa/layout';
import React from 'react';

describe('Layout Público da Rota do Mapa', () => {
  it('deve exportar metadados corretos e descritivos para a rota pública do mapa', () => {
    expect(metadata.title).toBe('Mapa das Nascentes do Cariri');
    expect(metadata.description).toBe('Visualização geográfica e interativa das nascentes da região do Cariri cearense.');
  });

  it('deve renderizar o container estrutural com atributos semânticos e de acessibilidade para a rota pública do mapa', () => {
    const testChild = React.createElement('span', null, 'Conteúdo do Mapa');
    const layoutElement = MapaLayout({ children: testChild });

    expect(layoutElement.type).toBe('div');
    expect(layoutElement.props.id).toBe('mapa-publico-layout');
    expect(layoutElement.props.role).toBe('region');
    expect(layoutElement.props['aria-label']).toBe('Mapa Interativo das Nascentes do Cariri');
    expect(layoutElement.props.children).toBe(testChild);
  });

  it('deve garantir que o layout seja isolado sem elementos administrativos no wrapper', () => {
    const layoutElement = MapaLayout({ children: null });

    // O container raiz do layout para iframe não deve injetar navbars, menus ou footers
    expect(layoutElement.props.children).toBeNull();
  });
});
