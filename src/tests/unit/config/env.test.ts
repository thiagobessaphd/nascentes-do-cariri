import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Validação de Variáveis de Ambiente (env.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restaura o ambiente original
    process.env = originalEnv;
  });

  const validEnvSetup = () => {
    process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/db';
    process.env.APP_URL = 'http://localhost:8080';
    process.env.AUTH_URL = 'http://localhost:8080';
    process.env.AUTH_SECRET = '12345678901234567890123456789012';
    process.env.NEXT_PUBLIC_TILE_URL = 'https://tile.openstreetmap.org';
    process.env.NEXT_PUBLIC_TILE_ATTRIBUTION = '&copy; OpenStreetMap';
  };

  it('deve carregar com sucesso quando todas as variáveis obrigatórias são válidas', async () => {
    validEnvSetup();

    const { env } = await import('../../../config/env');

    expect(env.DATABASE_URL).toBe('mysql://user:pass@localhost:3306/db');
    expect(env.APP_URL).toBe('http://localhost:8080');
    expect(env.AUTH_SECRET).toHaveLength(32);

    expect(env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM).toBe(10);
    expect(env.MAX_UPLOAD_SIZE_BYTES).toBe(5242880);
  });

  it('deve lançar exceção fatal se uma variável obrigatória estiver ausente', async () => {
    validEnvSetup();
    delete process.env.DATABASE_URL;

    await expect(import('../../../config/env')).rejects.toThrow(/Variáveis de ambiente inválidas/);
  });

  it('deve lançar exceção fatal se AUTH_SECRET for menor que 32 caracteres', async () => {
    validEnvSetup();
    process.env.AUTH_SECRET = 'secret_inseguro_curto';

    await expect(import('../../../config/env')).rejects.toThrow(/Variáveis de ambiente inválidas/);
  });

  it('deve lançar exceção se URLs fornecidas forem mal formadas', async () => {
    validEnvSetup();
    process.env.APP_URL = 'dominio_sem_http';

    await expect(import('../../../config/env')).rejects.toThrow(/Variáveis de ambiente inválidas/);
  });

  it('deve respeitar a coerção e fallback de variáveis numéricas do Mapa', async () => {
    validEnvSetup();
    process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT = '-8.123';
    process.env.MAX_UPLOAD_SIZE_BYTES = '10000';

    const { env } = await import('../../../config/env');

    expect(env.NEXT_PUBLIC_MAP_DEFAULT_LAT).toBe(-8.123);
    expect(env.MAX_UPLOAD_SIZE_BYTES).toBe(10000);
  });
});
