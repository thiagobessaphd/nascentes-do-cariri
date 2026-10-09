import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE_DEFAULTS,
  SESSION_COOKIE_NAMES,
  extractSessionToken,
  getSessionCookieConfig,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
} from '@/config/session-cookies';

describe('Contrato e Configuração de Cookies de Sessão', () => {
  describe('getSessionCookieConfig()', () => {
    it('deve aplicar prefixo __Host- e flag Secure=true em ambiente de produção', () => {
      const config = getSessionCookieConfig({ isProduction: true });

      expect(config.name).toBe(SESSION_COOKIE_NAMES.PRODUCTION);
      expect(config.name).toBe('__Host-nascentes.session-token');
      expect(config.options.secure).toBe(true);
      expect(config.options.httpOnly).toBe(true);
      expect(config.options.sameSite).toBe('lax');
      expect(config.options.path).toBe('/');
      expect(config.options.maxAge).toBe(SESSION_COOKIE_DEFAULTS.DEFAULT_MAX_AGE_SECONDS);
    });

    it('deve usar nome simples e flag Secure=false em ambiente de desenvolvimento (suporte a HTTP local)', () => {
      const config = getSessionCookieConfig({ isProduction: false });

      expect(config.name).toBe(SESSION_COOKIE_NAMES.DEVELOPMENT);
      expect(config.name).toBe('nascentes.session-token');
      expect(config.options.secure).toBe(false);
      expect(config.options.httpOnly).toBe(true);
      expect(config.options.sameSite).toBe('lax');
      expect(config.options.path).toBe('/');
      expect(config.options.maxAge).toBe(SESSION_COOKIE_DEFAULTS.DEFAULT_MAX_AGE_SECONDS);
    });

    it('deve permitir customização de maxAgeSeconds mantendo as demais flags seguras', () => {
      const customMaxAge = 3600; // 1 hora
      const config = getSessionCookieConfig({ isProduction: true, maxAgeSeconds: customMaxAge });

      expect(config.options.maxAge).toBe(customMaxAge);
      expect(config.options.httpOnly).toBe(true);
      expect(config.options.secure).toBe(true);
      expect(config.options.path).toBe('/');
    });
  });

  describe('serializeSessionCookie()', () => {
    it('deve serializar cookie completo com Secure e prefixo __Host- para produção', () => {
      const token = 'token-criptografado-sessao-123';
      const cookieString = serializeSessionCookie(token, { isProduction: true });

      expect(cookieString).toContain('__Host-nascentes.session-token=token-criptografado-sessao-123');
      expect(cookieString).toContain('Path=/');
      expect(cookieString).toContain('HttpOnly');
      expect(cookieString).toContain('Secure');
      expect(cookieString).toContain('SameSite=Lax');
      expect(cookieString).toContain(`Max-Age=${SESSION_COOKIE_DEFAULTS.DEFAULT_MAX_AGE_SECONDS}`);
    });

    it('deve serializar cookie sem Secure e sem prefixo restrito para desenvolvimento', () => {
      const token = 'token-dev-456';
      const cookieString = serializeSessionCookie(token, { isProduction: false });

      expect(cookieString).toContain('nascentes.session-token=token-dev-456');
      expect(cookieString).not.toContain('__Host-');
      expect(cookieString).not.toContain('Secure');
      expect(cookieString).toContain('Path=/');
      expect(cookieString).toContain('HttpOnly');
      expect(cookieString).toContain('SameSite=Lax');
    });

    it('deve aplicar URL encode no token para evitar caracteres inválidos no cabeçalho HTTP', () => {
      const specialToken = 'token+com espaços&simbolos=42;';
      const cookieString = serializeSessionCookie(specialToken, { isProduction: true });

      expect(cookieString).toContain(encodeURIComponent(specialToken));
      expect(cookieString).not.toContain('spaces');
    });
  });

  describe('serializeExpiredSessionCookie()', () => {
    it('deve serializar cookie de invalidação imediata com Max-Age=0 e data no passado', () => {
      const expiredString = serializeExpiredSessionCookie({ isProduction: true });

      expect(expiredString).toContain('__Host-nascentes.session-token=');
      expect(expiredString).toContain('Max-Age=0');
      expect(expiredString).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
      expect(expiredString).toContain('Path=/');
      expect(expiredString).toContain('HttpOnly');
      expect(expiredString).toContain('Secure');
    });

    it('deve expirar cookie de desenvolvimento sem flag Secure', () => {
      const expiredString = serializeExpiredSessionCookie({ isProduction: false });

      expect(expiredString).toContain('nascentes.session-token=');
      expect(expiredString).not.toContain('Secure');
      expect(expiredString).toContain('Max-Age=0');
      expect(expiredString).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    });
  });

  describe('extractSessionToken()', () => {
    it('deve retornar null se o cabeçalho for nulo, indefinido ou vazio', () => {
      expect(extractSessionToken(null)).toBeNull();
      expect(extractSessionToken(undefined)).toBeNull();
      expect(extractSessionToken('')).toBeNull();
      expect(extractSessionToken('   ')).toBeNull();
    });

    it('deve extrair o token do cookie de produção __Host- em cabeçalhos compostos', () => {
      const header = 'theme=dark; __Host-nascentes.session-token=meu-jwt-secreto; tracking=off';
      const token = extractSessionToken(header);

      expect(token).toBe('meu-jwt-secreto');
    });

    it('deve extrair o token do cookie de desenvolvimento nascentes.session-token', () => {
      const header = 'other=val; nascentes.session-token=dev-jwt-123';
      const token = extractSessionToken(header);

      expect(token).toBe('dev-jwt-123');
    });

    it('deve realizar decode de valores URL-encoded', () => {
      const rawValue = 'token%20com%20espaco';
      const header = `__Host-nascentes.session-token=${rawValue}`;
      const token = extractSessionToken(header);

      expect(token).toBe('token com espaco');
    });

    it('deve ignorar entradas malformadas sem sinal de igual sem lançar exceções', () => {
      const malformedHeader = 'malformedCookie; __Host-nascentes.session-token=valido; outro';
      const token = extractSessionToken(malformedHeader);

      expect(token).toBe('valido');
    });

    it('deve retornar null se nenhum dos cookies de sessão esperados estiver presente', () => {
      const unrelatedHeader = 'cookie_a=123; cookie_b=456; ga_session=abc';
      const token = extractSessionToken(unrelatedHeader);

      expect(token).toBeNull();
    });
  });
});
