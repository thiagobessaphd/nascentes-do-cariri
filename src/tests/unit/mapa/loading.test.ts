import { describe, it, expect } from 'vitest';
import Loading from '@/app/mapa/loading';
import MapLoading from '@/components/map/MapLoading';

describe('Estado de Carregamento da Rota do Mapa', () => {
  it('deve renderizar o componente MapLoading no loading nativo da rota', () => {
    const loadingElement = Loading();

    expect(loadingElement.type).toBe(MapLoading);
  });

  it('deve renderizar o container acessível com role status e aria-live polite', () => {
    const mapLoadingElement = MapLoading();

    expect(mapLoadingElement.type).toBe('div');
    expect(mapLoadingElement.props.role).toBe('status');
    expect(mapLoadingElement.props['aria-live']).toBe('polite');
    expect(mapLoadingElement.props['aria-label']).toBe('Carregando mapa interativo das nascentes');
  });
});
