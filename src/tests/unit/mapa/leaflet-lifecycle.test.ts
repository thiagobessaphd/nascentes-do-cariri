import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EffectCallback } from 'react';

const mocks = vi.hoisted(() => ({
  effects: [] as EffectCallback[],
  refs: 0,
  finishPlugin: undefined as (() => void) | undefined,
  map: vi.fn(),
  cluster: { addTo: vi.fn(), clearLayers: vi.fn(), addLayers: vi.fn() },
  createCluster: vi.fn(),
  initPlugin: vi.fn(),
}));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: (initial: unknown) => ({ current: mocks.refs++ === 0 ? {} : initial }),
  useState: () => [false, vi.fn()],
  useEffect: (effect: EffectCallback) => { mocks.effects.push(effect); },
}));

vi.mock('leaflet', () => ({ default: {
  map: mocks.map,
  tileLayer: () => ({ on: vi.fn(), addTo: vi.fn() }),
  control: { scale: () => ({ addTo: vi.fn() }) },
} }));
vi.mock('@/hooks/useNascentesPublicas', () => ({
  useNascentesPublicas: () => ({ status: 'loading', data: [], refetch: vi.fn() }),
}));
vi.mock('@/components/map/map-markers', () => ({
  initMarkerClusterPlugin: mocks.initPlugin,
  createNascenteClusterGroup: mocks.createCluster,
  createNascentesMarkers: vi.fn(),
}));

import LeafletMap from '@/components/map/LeafletMap';

describe('Inicialização assíncrona do cluster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects.length = 0;
    mocks.refs = 0;
    mocks.map.mockImplementation(() => ({ remove: vi.fn(), removeLayer: vi.fn() }));
    mocks.createCluster.mockReturnValue(mocks.cluster);
    const pluginReady = new Promise<void>((resolve) => { mocks.finishPlugin = resolve; });
    mocks.initPlugin.mockReturnValue(pluginReady);
  });

  it('cria apenas a camada do mapa atual quando o effect é recriado durante o carregamento', async () => {
    LeafletMap({});
    const setup = mocks.effects[1]!;
    const cleanupFirst = setup();
    if (typeof cleanupFirst === 'function') cleanupFirst();
    const cleanupSecond = setup();

    mocks.finishPlugin!();
    await Promise.resolve();

    expect(mocks.createCluster).toHaveBeenCalledTimes(1);
    expect(mocks.cluster.addTo).toHaveBeenCalledWith(mocks.map.mock.results[1]!.value);
    if (typeof cleanupSecond === 'function') cleanupSecond();
    expect(mocks.cluster.clearLayers).toHaveBeenCalledTimes(1);
  });

  it('não cria camadas se o plugin terminar de carregar depois da desmontagem', async () => {
    LeafletMap({});
    const cleanup = mocks.effects[1]!();
    if (typeof cleanup === 'function') cleanup();
    mocks.finishPlugin!();
    await Promise.resolve();
    expect(mocks.createCluster).not.toHaveBeenCalled();
  });
});
