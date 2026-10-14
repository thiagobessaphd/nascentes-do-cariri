import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from '@/app/api/health/route';
import { prisma } from '@/lib/db/prisma';

describe('Endpoint de Monitoramento e Uptime (/api/health)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve responder 200 OK com payload estruturado e conectividade saudável com o banco', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('healthy');
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(typeof body.timestamp).toBe('string');
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();

    // Valida cabeçalho de controle de cache (anti-proxy/CDN caching)
    const cacheControl = response.headers.get('Cache-Control');
    expect(cacheControl).toBeDefined();
    expect(cacheControl).toContain('no-store');
    expect(cacheControl).toContain('no-cache');
  });

  it('deve responder 503 Service Unavailable de forma resiliente caso o banco esteja inacessível', async () => {
    // Simula interrupção na conexão com o banco
    vi.spyOn(prisma.usuario, 'count').mockRejectedValueOnce(
      new Error('Connection lost: Can not connect to MySQL server')
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('error');
    expect(body.database).toBe('unhealthy');
    expect(typeof body.timestamp).toBe('string');

    // Valida que detalhes internos ou stack traces não são expostos no payload
    expect(body.stack).toBeUndefined();
    expect(body.error).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('MySQL server');

    // Headers de cache continuam estritos mesmo no erro
    const cacheControl = response.headers.get('Cache-Control');
    expect(cacheControl).toContain('no-store');
  });

  it('deve responder 503 caso a consulta ao banco sofra timeout (fail-fast)', async () => {
    // Simula lentidão extrema / hanging query excedendo o timeout
    vi.spyOn(prisma.usuario, 'count').mockImplementationOnce(
      () =>
        new Promise<number>((resolve) =>
          setTimeout(() => resolve(0), 5000)
        ) as unknown as ReturnType<typeof prisma.usuario.count>
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('error');
    expect(body.database).toBe('unhealthy');
    expect(typeof body.timestamp).toBe('string');
  });
});
