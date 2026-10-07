import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Configuração do Mapa do Cliente (src/config/map.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('deve carregar com valores customizados válidos das variáveis de ambiente', async () => {
    process.env.NEXT_PUBLIC_TILE_URL = 'https://custom-tiles.org/{z}/{x}/{y}.png';
    process.env.NEXT_PUBLIC_TILE_ATTRIBUTION = '&copy; Custom Provider';
    process.env.NEXT_PUBLIC_TILE_MAX_ZOOM = '18';
    process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT = '-7.2000';
    process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG = '-39.3000';
    process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM = '12';

    const { mapConfig } = await import('@/config/map');

    expect(mapConfig.tileUrl).toBe('https://custom-tiles.org/{z}/{x}/{y}.png');
    expect(mapConfig.attribution).toBe('&copy; Custom Provider');
    expect(mapConfig.maxZoom).toBe(18);
    expect(mapConfig.defaultLat).toBe(-7.2);
    expect(mapConfig.defaultLng).toBe(-39.3);
    expect(mapConfig.defaultZoom).toBe(12);
  });

  it('deve aplicar fallbacks padrão da região do Cariri quando variáveis estiverem ausentes', async () => {
    delete process.env.NEXT_PUBLIC_TILE_URL;
    delete process.env.NEXT_PUBLIC_TILE_ATTRIBUTION;
    delete process.env.NEXT_PUBLIC_TILE_MAX_ZOOM;
    delete process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT;
    delete process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG;
    delete process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM;

    const { mapConfig } = await import('@/config/map');

    expect(mapConfig.tileUrl).toBe('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(mapConfig.attribution).toContain('OpenStreetMap');
    expect(mapConfig.maxZoom).toBe(19);
    expect(mapConfig.defaultLat).toBeCloseTo(-7.23456789);
    expect(mapConfig.defaultLng).toBeCloseTo(-39.12345678);
    expect(mapConfig.defaultZoom).toBe(10);
  });

  it('deve aplicar fallback seguro se a URL do tile for malformada', async () => {
    process.env.NEXT_PUBLIC_TILE_URL = 'url-invalida-sem-protocolo';

    const { mapConfig } = await import('@/config/map');

    expect(mapConfig.tileUrl).toBe('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
  });

  it('deve aplicar fallback seguro se latitude ou longitude estiverem fora dos limites válidos', async () => {
    process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT = '-95'; // Latitude inválida (< -90)
    process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG = '200'; // Longitude inválida (> 180)

    const { mapConfig } = await import('@/config/map');

    expect(mapConfig.defaultLat).toBe(-7.23456789);
    expect(mapConfig.defaultLng).toBe(-39.12345678);
  });
});
