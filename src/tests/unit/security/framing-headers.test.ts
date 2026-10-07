import { beforeAll, describe, expect, it } from 'vitest';
import {
  FRAMING_POLICIES,
  MAPA_SECURITY_HEADERS,
  RESTRICTED_SECURITY_HEADERS,
  SECURITY_HEADER_NAMES,
  SECURITY_ORIGINS,
  getSecurityHeaders,
} from '@/config/security-headers';

describe('Políticas de Segurança e Framing', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'mysql://user:pass@localhost:3306/db';
    process.env.APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
    process.env.AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:3000';
    process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? '12345678901234567890123456789012';
    process.env.NEXT_PUBLIC_TILE_URL = process.env.NEXT_PUBLIC_TILE_URL ?? 'https://tile.openstreetmap.org';
    process.env.NEXT_PUBLIC_TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ?? '&copy; OpenStreetMap';
  });
  describe('Contratos e Constantes de Segurança', () => {
    it('deve possuir o domínio institucional da UFCA e self como origens autorizadas', () => {
      expect(SECURITY_ORIGINS.SELF).toBe("'self'");
      expect(SECURITY_ORIGINS.UFCA_INSTITUTIONAL).toBe('https://nascentesdocariri.ufca.edu.br');
    });

    it('deve conter a diretiva CSP correta para a rota pública do mapa', () => {
      expect(FRAMING_POLICIES.MAPA_PUBLIC).toBe(
        "frame-ancestors 'self' https://nascentesdocariri.ufca.edu.br"
      );
      expect(FRAMING_POLICIES.MAPA_PUBLIC).not.toContain('*');
    });

    it('deve conter a diretiva CSP estritamente restritiva para rotas administrativas e raiz', () => {
      expect(FRAMING_POLICIES.RESTRICTED_NONE).toBe("frame-ancestors 'none'");
    });
  });

  describe('Headers da Rota Pública do Mapa (/mapa/:path*)', () => {
    it('deve conter CSP com frame-ancestors restrito à UFCA e self', () => {
      const cspHeader = MAPA_SECURITY_HEADERS.find(
        (h) => h.key === SECURITY_HEADER_NAMES.CSP
      );
      expect(cspHeader).toBeDefined();
      expect(cspHeader?.value).toBe("frame-ancestors 'self' https://nascentesdocariri.ufca.edu.br");
    });

    it('NÃO deve conter X-Frame-Options para permitir incorporação no WordPress institucional', () => {
      const xFrameHeader = MAPA_SECURITY_HEADERS.find(
        (h) => h.key.toLowerCase() === 'x-frame-options'
      );
      expect(xFrameHeader).toBeUndefined();
    });

    it('deve conter cabeçalhos de defesa adicionais (nosniff e Referrer-Policy)', () => {
      const nosniff = MAPA_SECURITY_HEADERS.find(
        (h) => h.key === SECURITY_HEADER_NAMES.X_CONTENT_TYPE_OPTIONS
      );
      const referrer = MAPA_SECURITY_HEADERS.find(
        (h) => h.key === SECURITY_HEADER_NAMES.REFERRER_POLICY
      );

      expect(nosniff?.value).toBe('nosniff');
      expect(referrer?.value).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('Headers de Rotas Restritas (/admin/:path*, /api/admin/:path*, /)', () => {
    it('deve conter CSP frame-ancestors none', () => {
      const cspHeader = RESTRICTED_SECURITY_HEADERS.find(
        (h) => h.key === SECURITY_HEADER_NAMES.CSP
      );
      expect(cspHeader?.value).toBe("frame-ancestors 'none'");
    });

    it('deve conter X-Frame-Options com valor DENY como defesa em profundidade', () => {
      const xFrameHeader = RESTRICTED_SECURITY_HEADERS.find(
        (h) => h.key === SECURITY_HEADER_NAMES.X_FRAME_OPTIONS
      );
      expect(xFrameHeader?.value).toBe('DENY');
    });

    it('deve conter nosniff e Referrer-Policy', () => {
      const nosniff = RESTRICTED_SECURITY_HEADERS.find(
        (h) => h.key === SECURITY_HEADER_NAMES.X_CONTENT_TYPE_OPTIONS
      );
      const referrer = RESTRICTED_SECURITY_HEADERS.find(
        (h) => h.key === SECURITY_HEADER_NAMES.REFERRER_POLICY
      );

      expect(nosniff?.value).toBe('nosniff');
      expect(referrer?.value).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('Estrutura de Rotas em getSecurityHeaders()', () => {
    const rules = getSecurityHeaders();

    it('deve mapear regras para todas as superfícies essenciais da aplicação', () => {
      const sources = rules.map((r) => r.source);
      expect(sources).toContain('/mapa/:path*');
      expect(sources).toContain('/admin/:path*');
      expect(sources).toContain('/api/admin/:path*');
      expect(sources).toContain('/');
    });

    it('deve garantir que apenas /mapa/:path* tem política permissiva', () => {
      const mapaRule = rules.find((r) => r.source === '/mapa/:path*');
      expect(mapaRule).toBeDefined();

      const nonMapaRules = rules.filter((r) => r.source !== '/mapa/:path*');
      for (const rule of nonMapaRules) {
        const csp = rule.headers.find((h) => h.key === SECURITY_HEADER_NAMES.CSP);
        const xFrame = rule.headers.find((h) => h.key === SECURITY_HEADER_NAMES.X_FRAME_OPTIONS);

        expect(csp?.value).toBe("frame-ancestors 'none'");
        expect(xFrame?.value).toBe('DENY');
      }
    });
  });

  describe('Integração com next.config.ts', () => {
    it('deve delegar a configuração de headers para getSecurityHeaders', async () => {
      const nextConfigModule = await import('../../../../next.config');
      const nextConfig = nextConfigModule.default;

      expect(nextConfig.headers).toBeDefined();
      if (typeof nextConfig.headers === 'function') {
        const headers = await nextConfig.headers();
        expect(headers).toEqual(getSecurityHeaders());
      }
    });
  });
});
