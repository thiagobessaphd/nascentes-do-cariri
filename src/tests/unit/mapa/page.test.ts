import { describe, it, expect } from 'vitest';
import MapaPage from '@/app/mapa/page';
import React from 'react';

describe('Página Pública do Mapa', () => {
  it('deve renderizar a landmark semântica principal <main> com atributo de acessibilidade', () => {
    const pageElement = MapaPage();

    expect(pageElement.type).toBe('main');
    expect(pageElement.props['aria-label']).toBe('Mapa Interativo');
  });

  it('deve conter cabeçalho h1 acessível para leitores de tela', () => {
    const pageElement = MapaPage();
    const children = React.Children.toArray(pageElement.props.children);

    const heading = children.find(
      (child) => React.isValidElement(child) && child.type === 'h1'
    ) as React.ReactElement<{ children: React.ReactNode }> | undefined;

    expect(heading).toBeDefined();
    expect(heading?.props.children).toBe('Mapa Interativo das Nascentes do Cariri');
  });
});
