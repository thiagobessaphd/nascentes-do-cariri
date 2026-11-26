/**
 * Suíte de Testes Unitários e de Componentes: Tela de Login Acessível e Proteção Anti-Abuso (US-15 / Task-30)
 *
 * Módulos cobertos:
 * - src/app/admin/(auth)/login/page.tsx
 * - src/app/admin/(auth)/login/error.tsx
 * - src/components/admin/auth/login-form/LoginForm.tsx
 * - src/components/admin/auth/login-form/login-form-state.ts
 * - src/config/security-headers.ts (isolamento frame-ancestors sobre /admin/login)
 */

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FRAMING_POLICIES,
  SECURITY_HEADER_NAMES,
  getSecurityHeaders,
} from '@/config/security-headers';
import { getOptionalAdminPageSession } from '@/lib/security/admin-page-guard';
import {
  AUTH_ERROR_CODES,
  DEFAULT_RATE_LIMIT_FALLBACK_SECONDS,
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  RATE_LIMITED_LOGIN_MESSAGE,
} from '@/modules/auth/auth.contracts';
import AdminLoginPage, {
  dynamic as loginPageDynamic,
  metadata as loginPageMetadata,
} from '@/app/admin/(auth)/login/page';
import AdminLoginError from '@/app/admin/(auth)/login/error';
import {
  LoginForm,
  LoginFormView,
  PROGRESSIVE_BACKOFF_SCHEDULE_SECONDS,
  calculateProgressiveBackoffSeconds,
  formatCooldownRemainingPtBr,
  getCooldownRemainingSeconds,
  getSubmitButtonLabel,
  resolveLoginFailureState,
  type LoginFormViewProps,
} from '@/components/admin/auth';

const mockReplace = vi.fn();
const mockRefresh = vi.fn();
const mockRedirect = vi.fn((url: string): never => {
  const redirectError = Object.assign(new Error(`NEXT_REDIRECT:${url}`), {
    digest: `NEXT_REDIRECT;replace;${url};307;`,
  });
  throw redirectError;
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    refresh: mockRefresh,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/lib/security/admin-page-guard', () => ({
  getOptionalAdminPageSession: vi.fn(),
  requireAdminPageSession: vi.fn(),
}));

function createViewProps(
  overrides?: Partial<LoginFormViewProps>
): LoginFormViewProps {
  return {
    email: '',
    password: '',
    showPassword: false,
    fieldErrors: {},
    globalAlert: null,
    statusAnnouncement: null,
    isSubmitting: false,
    isRedirecting: false,
    cooldownRemainingSeconds: 0,
    onSubmit: () => {},
    onEmailChange: () => {},
    onPasswordChange: () => {},
    onTogglePassword: () => {},
    ...overrides,
  };
}

describe('US-15 / Task-30 — Tela de Login Acessível e Proteção contra Abuso (/admin/login)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOptionalAdminPageSession).mockResolvedValue(null);
  });

  describe('1. Rota /admin/login, Isolamento de Layout, Redirecionamento SSR e Segurança de Framing', () => {
    it('deve declarar force-dynamic, robots noindex/nofollow e política anti-clickjacking sobre /admin/*', () => {
      expect(loginPageDynamic).toBe('force-dynamic');
      expect(loginPageMetadata.robots).toEqual({
        index: false,
        follow: false,
      });

      const rules = getSecurityHeaders({ isProduction: true });
      const adminRule = rules.find((rule) => rule.source === '/admin/:path*');
      expect(adminRule).toBeDefined();

      const cspHeader = adminRule?.headers.find(
        (header) => header.key === SECURITY_HEADER_NAMES.CSP
      );
      const xfoHeader = adminRule?.headers.find(
        (header) => header.key === SECURITY_HEADER_NAMES.X_FRAME_OPTIONS
      );

      expect(cspHeader?.value).toBe(FRAMING_POLICIES.RESTRICTED_NONE);
      expect(xfoHeader?.value).toBe('DENY');
    });

    it('deve renderizar AdminLoginPage para visitante não autenticado sem vazar navegação ou perfil do painel interno', async () => {
      const element = await AdminLoginPage({});
      const html = renderToStaticMarkup(element);

      expect(html).toContain('<main id="login-main"');
      expect(html).toContain('<h1 id="admin-login-heading"');
      expect(html).toContain('Administrativo');
      expect(html).toContain('Nascentes do Cariri');
      expect(html).toContain('href="/mapa"');
      expect(html).toContain('Voltar ao mapa público');
      expect(html).toContain('Universidade Federal do Cariri (UFCA)');
      expect(html).toContain('CNPq');

      // Isolamento estrito contra vazamento da casca protegida
      expect(html).not.toContain('Navegação Administrativa');
      expect(html).not.toContain('Importação de Dados');
      expect(html).not.toContain('Histórico de Lotes');
      expect(html).not.toContain('Thiago Bessa');
      expect(html).not.toContain('Sair da conta administrativa');
    });

    it('deve redirecionar automaticamente administrador já autenticado respeitando ?next= seguro e barrando Open Redirect', async () => {
      const activeSession = {
        id: 1,
        nome: 'Admin UFCA',
        email: 'admin@ufca.edu.br',
        ativo: true,
        sessionId: 55,
        sessionExpiresAt: new Date('2026-12-31T23:59:59.000Z'),
      };

      vi.mocked(getOptionalAdminPageSession).mockResolvedValue(activeSession);

      // Sem ?next= -> fallback padrão /admin/importacoes
      await expect(AdminLoginPage({})).rejects.toThrow(
        'NEXT_REDIRECT:/admin/importacoes'
      );
      expect(mockRedirect).toHaveBeenLastCalledWith('/admin/importacoes');

      // Com ?next= interno válido (/admin/importacoes/historico e /admin)
      await expect(
        AdminLoginPage({
          searchParams: Promise.resolve({ next: '/admin/importacoes/historico' }),
        })
      ).rejects.toThrow('NEXT_REDIRECT:/admin/importacoes/historico');

      await expect(
        AdminLoginPage({
          searchParams: Promise.resolve({ next: '/admin' }),
        })
      ).rejects.toThrow('NEXT_REDIRECT:/admin');

      // Tentativas hostis de Open Redirect e loop para o próprio /admin/login
      for (const hostileNext of [
        'https://evil.example.com',
        '//evil.example.com',
        '\\evil.example.com',
        '/mapa',
        '/admin/login',
        '/admin/login?next=/admin',
      ]) {
        await expect(
          AdminLoginPage({
            searchParams: Promise.resolve({ next: hostileNext }),
          })
        ).rejects.toThrow('NEXT_REDIRECT:/admin/importacoes');
      }
    });

    it('deve degradar com segurança renderizando o formulário se getOptionalAdminPageSession falhar transitoriamente', async () => {
      vi.mocked(getOptionalAdminPageSession).mockRejectedValueOnce(
        new Error('Falha transitória de leitura')
      );

      const element = await AdminLoginPage({});
      const html = renderToStaticMarkup(element);

      expect(html).toContain('data-testid="admin-login-form"');
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('deve renderizar boundary de erro acessível com role="alert" sem expor detalhes internos', () => {
      const mockReset = vi.fn();
      const internalError = new Error('SELECT * FROM sessoes ECONNREFUSED');
      const errorHtml = renderToStaticMarkup(
        React.createElement(AdminLoginError, {
          error: internalError,
          reset: mockReset,
        })
      );

      expect(errorHtml).toContain('role="alert"');
      expect(errorHtml).toContain('aria-live="assertive"');
      expect(errorHtml).toContain('Tentar novamente');
      expect(errorHtml).toContain('href="/mapa"');
      expect(errorHtml).not.toContain('ECONNREFUSED');
    });
  });

  describe('2. Acessibilidade Semântica, Rótulos, Teclado e Estados Visuais em LoginForm / LoginFormView', () => {
    it('NÃO deve importar módulos de servidor/Prisma, usar innerHTML ou armazenar dados em Web Storage', () => {
      const filesToInspect = [
        'src/components/admin/auth/login-form/LoginForm.tsx',
        'src/components/admin/auth/login-form/login-form-state.ts',
      ];

      for (const relativeFile of filesToInspect) {
        const content = fs.readFileSync(
          path.resolve(process.cwd(), relativeFile),
          'utf-8'
        );
        expect(content).not.toMatch(/from\s+['"]@\/modules\/auth['"]/);
        expect(content).not.toContain('@prisma/client');
        expect(content).not.toContain('dangerouslySetInnerHTML');
        expect(content).not.toContain('innerHTML');
        expect(content).not.toContain('localStorage');
        expect(content).not.toContain('sessionStorage');
      }
    });

    it('deve associar explicitamente labels, autocomplete, controles de teclado e método POST seguro', () => {
      const html = renderToStaticMarkup(React.createElement(LoginForm));

      expect(html).toContain('<form');
      expect(html).toContain('method="post"');
      expect(html).toContain('noValidate=""');
      expect(html).toContain('for="admin-login-email"');
      expect(html).toContain('id="admin-login-email"');
      expect(html).toContain('type="email"');
      expect(html).toContain('autoComplete="username"');
      expect(html).toContain('for="admin-login-password"');
      expect(html).toContain('id="admin-login-password"');
      expect(html).toContain('type="password"');
      expect(html).toContain('autoComplete="current-password"');

      // Botão acessível de alternar visibilidade da senha por teclado
      expect(html).toContain('data-testid="login-password-toggle"');
      expect(html).toContain('type="button"');
      expect(html).toContain('aria-pressed="false"');
      expect(html).toContain('aria-label="Mostrar senha digitada"');

      // Botão principal habilitado no estado inicial
      expect(html).toContain('type="submit"');
      expect(html).toContain('aria-busy="false"');
      expect(html).toContain('>Entrar<');
    });

    it('deve alternar tipo do campo de senha e aria-pressed quando showPassword=true', () => {
      const html = renderToStaticMarkup(
        React.createElement(LoginFormView, createViewProps({ showPassword: true }))
      );

      expect(html).toMatch(/id="admin-login-password"[^>]*type="text"/);
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('aria-label="Ocultar senha digitada"');
    });

    it('deve vincular mensagens de erro por campo via aria-invalid e aria-describedby', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          LoginFormView,
          createViewProps({
            fieldErrors: {
              email: 'Informe um e-mail válido.',
              password: 'Informe a senha.',
            },
          })
        )
      );

      expect(html).toMatch(
        /id="admin-login-email"[^>]*aria-invalid="true"[^>]*aria-describedby="admin-login-email-error"/
      );
      expect(html).toContain('id="admin-login-email-error"');
      expect(html).toContain('Informe um e-mail válido.');

      expect(html).toMatch(
        /id="admin-login-password"[^>]*aria-invalid="true"[^>]*aria-describedby="admin-login-password-error"/
      );
      expect(html).toContain('id="admin-login-password-error"');
      expect(html).toContain('Informe a senha.');
    });

    it('deve exibir estados de envio e redirecionamento bloqueando novas submissões', () => {
      const submittingHtml = renderToStaticMarkup(
        React.createElement(
          LoginFormView,
          createViewProps({ isSubmitting: true })
        )
      );

      expect(submittingHtml).toContain('>Entrando...<');
      expect(submittingHtml).toMatch(
        /data-testid="login-submit-button"[^>]*disabled=""|disabled=""[^>]*data-testid="login-submit-button"/
      );
      expect(submittingHtml).toContain('aria-busy="true"');

      const redirectingHtml = renderToStaticMarkup(
        React.createElement(
          LoginFormView,
          createViewProps({ isRedirecting: true })
        )
      );

      expect(redirectingHtml).toContain('>Redirecionando...<');
      expect(redirectingHtml).toContain('aria-busy="true"');
      expect(redirectingHtml).toMatch(
        /data-testid="login-submit-button"[^>]*disabled=""|disabled=""[^>]*data-testid="login-submit-button"/
      );
    });

    it('deve renderizar banner role="alert" focável (tabindex="-1") e cronômetro com aria-live="off" durante cooldown', () => {
      const rateLimitedHtml = renderToStaticMarkup(
        React.createElement(
          LoginFormView,
          createViewProps({
            globalAlert: {
              kind: 'rate_limit',
              message: RATE_LIMITED_LOGIN_MESSAGE,
            },
            cooldownRemainingSeconds: 895,
          })
        )
      );

      expect(rateLimitedHtml).toContain('role="alert"');
      expect(rateLimitedHtml).toContain('aria-live="assertive"');
      expect(rateLimitedHtml).toContain('tabindex="-1"');
      expect(rateLimitedHtml).toContain(RATE_LIMITED_LOGIN_MESSAGE);
      expect(rateLimitedHtml).toContain('data-testid="login-cooldown-timer"');
      expect(rateLimitedHtml).toContain('aria-live="off"');
      expect(rateLimitedHtml).toContain('14 min 55 s');
      expect(rateLimitedHtml).toContain('>Aguarde 14 min 55 s<');
      expect(rateLimitedHtml).toMatch(
        /data-testid="login-submit-button"[^>]*disabled=""|disabled=""[^>]*data-testid="login-submit-button"/
      );
    });
  });

  describe('3. Máquina Pura Anti-Abuso, Anti-Enumeração, Backoff Progressivo e Rate Limit (login-form-state.ts)', () => {
    it('deve aplicar backoff progressivo apenas a partir da 3ª falha 401 consecutiva', () => {
      expect(calculateProgressiveBackoffSeconds(0)).toBe(0);
      expect(calculateProgressiveBackoffSeconds(1)).toBe(0);
      expect(calculateProgressiveBackoffSeconds(2)).toBe(0);
      expect(calculateProgressiveBackoffSeconds(3)).toBe(
        PROGRESSIVE_BACKOFF_SCHEDULE_SECONDS.THIRD_FAILURE
      );
      expect(calculateProgressiveBackoffSeconds(4)).toBe(
        PROGRESSIVE_BACKOFF_SCHEDULE_SECONDS.FOURTH_FAILURE
      );
      expect(calculateProgressiveBackoffSeconds(5)).toBe(
        PROGRESSIVE_BACKOFF_SCHEDULE_SECONDS.FIFTH_OR_MORE_FAILURE
      );
      expect(calculateProgressiveBackoffSeconds(9)).toBe(
        PROGRESSIVE_BACKOFF_SCHEDULE_SECONDS.FIFTH_OR_MORE_FAILURE
      );
    });

    it('deve calcular e formatar tempo restante de bloqueio com precisão em segundos e minutos', () => {
      const nowMs = 1_700_000_000_000;
      expect(getCooldownRemainingSeconds(null, nowMs)).toBe(0);
      expect(getCooldownRemainingSeconds(nowMs - 100, nowMs)).toBe(0);
      expect(getCooldownRemainingSeconds(nowMs + 2_100, nowMs)).toBe(3);

      expect(formatCooldownRemainingPtBr(0)).toBe('0 s');
      expect(formatCooldownRemainingPtBr(6)).toBe('6 s');
      expect(formatCooldownRemainingPtBr(60)).toBe('1 min');
      expect(formatCooldownRemainingPtBr(900)).toBe('15 min');
      expect(formatCooldownRemainingPtBr(892)).toBe('14 min 52 s');
    });

    it('NÃO deve diferenciar usuário inexistente, senha incorreta ou conta inativa em resolveLoginFailureState', () => {
      const nowMs = 1_700_000_000_000;

      const unknownUserFailure = resolveLoginFailureState({
        statusCode: 401,
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Usuário inexistente',
        previousConsecutiveFailures: 0,
        previousCooldownUntilMs: null,
        nowMs,
      });

      const wrongPasswordFailure = resolveLoginFailureState({
        statusCode: 401,
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Senha incorreta',
        previousConsecutiveFailures: 0,
        previousCooldownUntilMs: null,
        nowMs,
      });

      const inactiveUserFailure = resolveLoginFailureState({
        statusCode: 403,
        code: AUTH_ERROR_CODES.FORBIDDEN_INACTIVE_USER,
        message: 'Conta desativada',
        previousConsecutiveFailures: 0,
        previousCooldownUntilMs: null,
        nowMs,
      });

      expect(unknownUserFailure.alert).toEqual({
        kind: 'error',
        message: GENERIC_INVALID_CREDENTIALS_MESSAGE,
      });
      expect(wrongPasswordFailure.alert).toEqual(unknownUserFailure.alert);
      expect(inactiveUserFailure.alert).toEqual(unknownUserFailure.alert);
      expect(unknownUserFailure.cooldownUntilMs).toBeNull();

      // 3ª falha consecutiva aciona backoff progressivo de 3s mantendo anti-enumeração
      const thirdFailure = resolveLoginFailureState({
        statusCode: 401,
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: GENERIC_INVALID_CREDENTIALS_MESSAGE,
        previousConsecutiveFailures: 2,
        previousCooldownUntilMs: null,
        nowMs,
      });

      expect(thirdFailure.consecutiveAuthFailures).toBe(3);
      expect(thirdFailure.cooldownReason).toBe('progressive_backoff');
      expect(thirdFailure.cooldownUntilMs).toBe(nowMs + 3_000);
      expect(thirdFailure.alert.message).toContain(
        GENERIC_INVALID_CREDENTIALS_MESSAGE
      );
    });

    it('deve ativar bloqueio completo sincronizado ao Retry-After em resposta 429 sem reduzir trava existente maior', () => {
      const nowMs = 1_700_000_000_000;

      const rateLimitState = resolveLoginFailureState({
        statusCode: 429,
        code: AUTH_ERROR_CODES.RATE_LIMITED,
        message: RATE_LIMITED_LOGIN_MESSAGE,
        retryAfterSeconds: 600,
        previousConsecutiveFailures: 4,
        previousCooldownUntilMs: null,
        nowMs,
      });

      expect(rateLimitState).toEqual({
        consecutiveAuthFailures: 5,
        cooldownUntilMs: nowMs + 600_000,
        cooldownReason: 'rate_limit',
        alert: {
          kind: 'rate_limit',
          message: RATE_LIMITED_LOGIN_MESSAGE,
        },
      });

      // Fallback seguro quando retryAfterSeconds não vier definido
      const fallbackRateLimit = resolveLoginFailureState({
        statusCode: 429,
        code: AUTH_ERROR_CODES.RATE_LIMITED,
        message: RATE_LIMITED_LOGIN_MESSAGE,
        previousConsecutiveFailures: 5,
        previousCooldownUntilMs: null,
        nowMs,
      });
      expect(fallbackRateLimit.cooldownUntilMs).toBe(
        nowMs + DEFAULT_RATE_LIMIT_FALLBACK_SECONDS * 1000
      );

      // Falhas de rede/5xx não devem penalizar o contador de falhas de credencial
      const networkErrorState = resolveLoginFailureState({
        message: 'Falha de conexão com o servidor.',
        isNetworkError: true,
        previousConsecutiveFailures: 2,
        previousCooldownUntilMs: null,
        nowMs,
      });
      expect(networkErrorState.consecutiveAuthFailures).toBe(2);
      expect(networkErrorState.cooldownUntilMs).toBeNull();
    });

    it('getSubmitButtonLabel deve priorizar redirecionamento, envio e contagem regressiva sobre o estado ocioso', () => {
      expect(
        getSubmitButtonLabel({
          isSubmitting: false,
          isRedirecting: false,
          cooldownRemainingSeconds: 0,
        })
      ).toBe('Entrar');

      expect(
        getSubmitButtonLabel({
          isSubmitting: true,
          isRedirecting: false,
          cooldownRemainingSeconds: 10,
        })
      ).toBe('Entrando...');

      expect(
        getSubmitButtonLabel({
          isSubmitting: true,
          isRedirecting: true,
          cooldownRemainingSeconds: 10,
        })
      ).toBe('Redirecionando...');

      expect(
        getSubmitButtonLabel({
          isSubmitting: false,
          isRedirecting: false,
          cooldownRemainingSeconds: 65,
        })
      ).toBe('Aguarde 1 min 5 s');
    });
  });
});
