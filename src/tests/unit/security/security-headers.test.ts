import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  COMMON_SECURITY_HEADERS,
  HSTS_POLICY,
  PERMISSIONS_POLICY,
  SECURITY_HEADER_NAMES,
  buildSecurityHeaders,
  getSecurityHeaders,
} from '@/config/security-headers';

describe('Políticas Globais de Hardening de Headers e HSTS', () => {
  describe('Contratos e Políticas Base', () => {
    it('deve conter a política HSTS com 2 anos (63072000s), includeSubDomains e preload', () => {
      expect(HSTS_POLICY).toBe('max-age=63072000; includeSubDomains; preload');
    });

    it('deve restringir recursos sensíveis no Permissions-Policy (câmera, microfone, geolocalização)', () => {
      expect(PERMISSIONS_POLICY).toBe('camera=(), microphone=(), geolocation=()');
    });

    it('deve desabilitar pré-resolução de DNS com X-DNS-Prefetch-Control: off', () => {
      const dnsHeader = COMMON_SECURITY_HEADERS.find(
        (h) => h.key === SECURITY_HEADER_NAMES.X_DNS_PREFETCH_CONTROL
      );
      expect(dnsHeader).toBeDefined();
      expect(dnsHeader?.value).toBe('off');
    });

    it('deve incluir Permissions-Policy e nosniff nos cabeçalhos comuns', () => {
      const permissionsHeader = COMMON_SECURITY_HEADERS.find(
        (h) => h.key === SECURITY_HEADER_NAMES.PERMISSIONS_POLICY
      );
      const nosniffHeader = COMMON_SECURITY_HEADERS.find(
        (h) => h.key === SECURITY_HEADER_NAMES.X_CONTENT_TYPE_OPTIONS
      );

      expect(permissionsHeader?.value).toBe(PERMISSIONS_POLICY);
      expect(nosniffHeader?.value).toBe('nosniff');
    });
  });

  describe('buildSecurityHeaders() - Isolamento por Ambiente', () => {
    it('NÃO deve injetar HSTS em ambiente de desenvolvimento (isProduction = false)', () => {
      const { mapaHeaders, restrictedHeaders } = buildSecurityHeaders({ isProduction: false });

      const mapaHsts = mapaHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.HSTS);
      const restrictedHsts = restrictedHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.HSTS);

      expect(mapaHsts).toBeUndefined();
      expect(restrictedHsts).toBeUndefined();
    });

    it('DEVE injetar HSTS obrigatório em ambiente de produção', () => {
      const { mapaHeaders, restrictedHeaders } = buildSecurityHeaders({ isProduction: true });

      const mapaHsts = mapaHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.HSTS);
      const restrictedHsts = restrictedHeaders.find((h) => h.key === SECURITY_HEADER_NAMES.HSTS);

      expect(mapaHsts).toBeDefined();
      expect(mapaHsts?.value).toBe(HSTS_POLICY);

      expect(restrictedHsts).toBeDefined();
      expect(restrictedHsts?.value).toBe(HSTS_POLICY);
    });

    it('deve manter cabeçalhos de defesa comuns ativos em ambos os ambientes', () => {
      const devHeaders = buildSecurityHeaders({ isProduction: false });
      const prodHeaders = buildSecurityHeaders({ isProduction: true });

      for (const suite of [devHeaders, prodHeaders]) {
        for (const headers of [suite.mapaHeaders, suite.restrictedHeaders]) {
          const perm = headers.find((h) => h.key === SECURITY_HEADER_NAMES.PERMISSIONS_POLICY);
          const dns = headers.find((h) => h.key === SECURITY_HEADER_NAMES.X_DNS_PREFETCH_CONTROL);
          const nosniff = headers.find((h) => h.key === SECURITY_HEADER_NAMES.X_CONTENT_TYPE_OPTIONS);

          expect(perm?.value).toBe(PERMISSIONS_POLICY);
          expect(dns?.value).toBe('off');
          expect(nosniff?.value).toBe('nosniff');
        }
      }
    });
  });

  describe('getSecurityHeaders() - Mapeamento de Rotas com HSTS', () => {
    it('deve propagar HSTS para todas as rotas configuradas quando em produção', () => {
      const routes = getSecurityHeaders({ isProduction: true });

      expect(routes.length).toBeGreaterThanOrEqual(4);
      for (const route of routes) {
        const hsts = route.headers.find((h) => h.key === SECURITY_HEADER_NAMES.HSTS);
        expect(hsts).toBeDefined();
        expect(hsts?.value).toBe(HSTS_POLICY);
      }
    });

    it('não deve conter HSTS em nenhuma rota quando em desenvolvimento', () => {
      const routes = getSecurityHeaders({ isProduction: false });

      for (const route of routes) {
        const hsts = route.headers.find((h) => h.key === SECURITY_HEADER_NAMES.HSTS);
        expect(hsts).toBeUndefined();
      }
    });
  });

  describe('Auditoria de Segredos e Isolamento', () => {
    it('deve garantir que nenhum segredo do servidor possua prefixo NEXT_PUBLIC_ em .env.example', () => {
      const envExamplePath = path.resolve(process.cwd(), '.env.example');
      expect(fs.existsSync(envExamplePath)).toBe(true);

      const content = fs.readFileSync(envExamplePath, 'utf-8');
      const lines = content.split('\n');

      const serverSecrets = [
        'AUTH_SECRET',
        'DATABASE_URL',
        'BLOB_READ_WRITE_TOKEN',
        'MYSQL_PASSWORD',
        'MYSQL_ROOT_PASSWORD',
      ];

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) {
          continue;
        }

        const [varName] = trimmed.split('=');
        const cleanName = varName?.trim() ?? '';

        // Segredos de servidor não podem ter prefixo NEXT_PUBLIC_
        for (const secret of serverSecrets) {
          expect(cleanName).not.toBe(`NEXT_PUBLIC_${secret}`);
        }

        // Se tem NEXT_PUBLIC_, deve ser estritamente configuração pública do mapa
        if (cleanName.startsWith('NEXT_PUBLIC_')) {
          expect(cleanName).toMatch(/^NEXT_PUBLIC_(TILE_|MAP_)/);
        }
      }
    });
  });
});
