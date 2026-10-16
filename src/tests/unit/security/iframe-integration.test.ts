import { describe, it, expect } from 'vitest';
import {
  buildSecurityHeaders,
  getSecurityHeaders,
  SECURITY_HEADER_NAMES,
  SECURITY_ORIGINS,
  FRAMING_POLICIES,
  HSTS_POLICY,
} from '@/config/security-headers';

describe('Isolamento de Framing e CSP para Iframe)', () => {
  describe('Política de Incorporação Institucional da Rota do Mapa (/mapa)', () => {
    const { mapaHeaders } = buildSecurityHeaders({ isProduction: false });

    it('deve autorizar estritamente o próprio domínio e o portal institucional da UFCA em frame-ancestors', () => {
      const cspHeader = mapaHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.CSP);

      expect(cspHeader).toBeDefined();
      expect(cspHeader?.value).toBe(
        `frame-ancestors ${SECURITY_ORIGINS.SELF} ${SECURITY_ORIGINS.UFCA_INSTITUTIONAL}`
      );

      // Não pode conter wildcard ou origens inseguras
      expect(cspHeader?.value).not.toContain('*');
      expect(cspHeader?.value).not.toContain('http://');
    });

    it('NÃO deve conter X-Frame-Options: DENY na rota do mapa para viabilizar iframe no portal da UFCA', () => {
      const xFrameHeader = mapaHeaders.find(
        (h) => h.key.toLowerCase() === SECURITY_HEADER_NAMES.X_FRAME_OPTIONS.toLowerCase()
      );

      expect(xFrameHeader).toBeUndefined();
    });

    it('deve conter proteção contra MIME-sniffing e política de referrer segura para contexto de iframe', () => {
      const nosniff = mapaHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.X_CONTENT_TYPE_OPTIONS);
      const referrer = mapaHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.REFERRER_POLICY);

      expect(nosniff?.value).toBe('nosniff');
      expect(referrer?.value).toBe('strict-origin-when-cross-origin');
    });

    it('deve desabilitar APIs de hardware sensíveis via Permissions-Policy dentro do iframe', () => {
      const permissions = mapaHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.PERMISSIONS_POLICY);

      expect(permissions?.value).toBe('camera=(), microphone=(), geolocation=()');
    });
  });

  describe('Bloqueio Estrito de Framing para Painel Administrativo e Rotas Sensíveis', () => {
    const { restrictedHeaders } = buildSecurityHeaders({ isProduction: false });

    it('deve proibir qualquer tentativa de framing de rotas administrativas com frame-ancestors none', () => {
      const cspHeader = restrictedHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.CSP);

      expect(cspHeader).toBeDefined();
      expect(cspHeader?.value).toBe(FRAMING_POLICIES.RESTRICTED_NONE);
      expect(cspHeader?.value).toBe("frame-ancestors 'none'");
    });

    it('deve incluir X-Frame-Options: DENY como camada secundária de defesa em profundidade (Anti-Clickjacking)', () => {
      const xFrameHeader = restrictedHeaders.find(
        (h) => h.key === SECURITY_HEADER_NAMES.X_FRAME_OPTIONS
      );

      expect(xFrameHeader).toBeDefined();
      expect(xFrameHeader?.value).toBe('DENY');
    });
  });

  describe('Diferenciação de Ambiente e Propagação de Regras no Next.js', () => {
    it('deve injetar Strict-Transport-Security (HSTS) em todas as rotas quando isProduction for true', () => {
      const prodHeaders = buildSecurityHeaders({ isProduction: true });

      const hstsMapa = prodHeaders.mapaHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.HSTS);
      const hstsRestricted = prodHeaders.restrictedHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.HSTS);

      expect(hstsMapa?.value).toBe(HSTS_POLICY);
      expect(hstsRestricted?.value).toBe(HSTS_POLICY);
    });

    it('NÃO deve injetar HSTS em ambiente não produtivo para não afetar desenvolvimento local', () => {
      const devHeaders = buildSecurityHeaders({ isProduction: false });

      const hstsMapa = devHeaders.mapaHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.HSTS);
      const hstsRestricted = devHeaders.restrictedHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.HSTS);

      expect(hstsMapa).toBeUndefined();
      expect(hstsRestricted).toBeUndefined();
    });

    it('deve mapear rotas corretamente em getSecurityHeaders() sem lacunas nas superfícies críticas', () => {
      const rules = getSecurityHeaders();

      const mapaRule = rules.find((r) => r.source === '/mapa/:path*');
      const adminRule = rules.find((r) => r.source === '/admin/:path*');
      const apiAdminRule = rules.find((r) => r.source === '/api/admin/:path*');
      const rootRule = rules.find((r) => r.source === '/');

      expect(mapaRule).toBeDefined();
      expect(adminRule).toBeDefined();
      expect(apiAdminRule).toBeDefined();
      expect(rootRule).toBeDefined();

      // Confirma que /mapa/:path* é a única rota com frame-ancestors autorizando o portal da UFCA
      const mapaCsp = mapaRule?.headers.find((h) => h.key === SECURITY_HEADER_NAMES.CSP);
      expect(mapaCsp?.value).toContain('https://nascentesdocariri.ufca.edu.br');

      // Todas as demais rotas bloqueiam framing
      for (const rule of [adminRule, apiAdminRule, rootRule]) {
        const csp = rule?.headers.find((h) => h.key === SECURITY_HEADER_NAMES.CSP);
        const xFrame = rule?.headers.find((h) => h.key === SECURITY_HEADER_NAMES.X_FRAME_OPTIONS);

        expect(csp?.value).toBe("frame-ancestors 'none'");
        expect(xFrame?.value).toBe('DENY');
      }
    });
  });
});
