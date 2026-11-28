/**
 * Suíte de Testes Unitários e de UI: Logout, Alerta de Erro no Shell e Guardas de Sessão
 * (US-16 / Task-32 / Etapa 3)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_LOGIN_NOTICE_BY_REASON,
  ADMIN_LOGIN_REASONS,
  AUTH_ERROR_CODES,
} from '@/modules/auth/auth.contracts';
import { AuthClientError } from '@/services/auth.client';
import {
  AdminBfcacheCurtainView,
  AdminLogoutErrorBannerView,
  DEFAULT_LOGOUT_FAILURE_MESSAGE,
  LogoutButtonView,
  SESSION_REVALIDATION_THROTTLE_MS,
  isConfirmedSessionAuthFailure,
  shouldRevalidateSessionOnFocus,
} from '@/components/admin/session';
import { LoginFormView } from '@/components/admin/auth/login-form/LoginForm';
import { AdminToastView } from '@/components/admin/toast';

describe('Task-32 — Interface de Logout, Alerta de Erro, BFCache e Aviso de Login', () => {
  describe('1. LogoutButtonView (acionamento direto e estado de transição)', () => {
    it('deve renderizar estado ativo com rótulo Sair e sem aria-disabled', () => {
      const html = renderToStaticMarkup(
        React.createElement(LogoutButtonView, {
          isBusy: false,
          onClick: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="admin-logout-button"');
      expect(html).toContain('aria-label="Sair da conta administrativa"');
      expect(html).toContain('aria-busy="false"');
      expect(html).toContain('>Sair<');
      expect(html).not.toContain('aria-disabled="true"');
      expect(html).not.toContain('disabled=""');
    });

    it('deve travar clique duplo com disabled, aria-disabled, aria-busy e rótulo Saindo... sem spinner', () => {
      const html = renderToStaticMarkup(
        React.createElement(LogoutButtonView, {
          isBusy: true,
          onClick: vi.fn(),
        })
      );

      expect(html).toContain('disabled=""');
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-label="Encerrando sessão administrativa"');
      expect(html).toContain('>Saindo...<');
      expect(html).not.toContain('spinner');
    });
  });

  describe('2. AdminLogoutErrorBannerView (alerta acessível sob o header)', () => {
    it('deve renderizar role="alert" assertivo, focável e com botão Fechar acessível', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminLogoutErrorBannerView, {
          message: DEFAULT_LOGOUT_FAILURE_MESSAGE,
          onDismiss: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="admin-logout-error-alert"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('tabindex="-1"');
      expect(html).toContain(DEFAULT_LOGOUT_FAILURE_MESSAGE);
      expect(html).toContain('data-testid="admin-logout-error-dismiss"');
      expect(html).toContain('aria-label="Fechar aviso de erro ao sair"');
    });
  });

  describe('3. AdminBfcacheCurtainView e Lógica de Revalidação (AdminSessionGuard)', () => {
    it('deve renderizar cortina anti-BFCache em estado checking e estado recuperável error', () => {
      const checkingHtml = renderToStaticMarkup(
        React.createElement(AdminBfcacheCurtainView, {
          state: 'checking',
          onRetry: vi.fn(),
        })
      );
      expect(checkingHtml).toContain('data-testid="admin-bfcache-curtain"');
      expect(checkingHtml).toContain('role="status"');
      expect(checkingHtml).toContain('aria-busy="true"');
      expect(checkingHtml).toContain('Verificando sua sessão administrativa...');
      expect(checkingHtml).not.toContain('data-testid="admin-bfcache-retry-button"');

      const errorHtml = renderToStaticMarkup(
        React.createElement(AdminBfcacheCurtainView, {
          state: 'error',
          onRetry: vi.fn(),
        })
      );
      expect(errorHtml).toContain('role="alert"');
      expect(errorHtml).toContain('aria-live="assertive"');
      expect(errorHtml).toContain('Não foi possível confirmar sua sessão agora.');
      expect(errorHtml).toContain('data-testid="admin-bfcache-retry-button"');
      expect(errorHtml).toContain('data-testid="admin-bfcache-login-link"');
      expect(errorHtml).toContain('href="/admin/login?motivo=sessao_expirada"');
    });

    it('shouldRevalidateSessionOnFocus deve respeitar throttle mínimo de 15 segundos', () => {
      expect(SESSION_REVALIDATION_THROTTLE_MS).toBe(15_000);
      expect(shouldRevalidateSessionOnFocus(0, 1_000)).toBe(true);
      expect(shouldRevalidateSessionOnFocus(10_000, 24_999)).toBe(false);
      expect(shouldRevalidateSessionOnFocus(10_000, 25_000)).toBe(true);
      expect(shouldRevalidateSessionOnFocus(10_000, 30_000)).toBe(true);
    });

    it('isConfirmedSessionAuthFailure deve confirmar apenas 401/403 e ignorar 5xx ou rede', () => {
      expect(
        isConfirmedSessionAuthFailure(
          new AuthClientError('Expirada', {
            statusCode: 401,
            code: AUTH_ERROR_CODES.UNAUTHORIZED,
          })
        )
      ).toBe(true);

      expect(
        isConfirmedSessionAuthFailure(
          new AuthClientError('Inativa', {
            statusCode: 403,
            code: AUTH_ERROR_CODES.FORBIDDEN_INACTIVE_USER,
          })
        )
      ).toBe(true);

      expect(
        isConfirmedSessionAuthFailure(
          new AuthClientError('Erro interno', {
            statusCode: 500,
            code: 'INTERNAL_SERVER_ERROR',
          })
        )
      ).toBe(false);

      expect(
        isConfirmedSessionAuthFailure(
          new AuthClientError('Sem internet', { isNetworkError: true })
        )
      ).toBe(false);

      expect(isConfirmedSessionAuthFailure(new Error('Falha genérica'))).toBe(false);
    });
  });

  describe('4. Prioridade Visual em LoginFormView (status vs alert)', () => {
    it('deve ocultar o aviso role="status" quando houver globalAlert de erro para evitar competição visual', () => {
      const htmlWithAlert = renderToStaticMarkup(
        React.createElement(LoginFormView, {
          email: 'admin@ufca.edu.br',
          password: '',
          showPassword: false,
          fieldErrors: {},
          loginNotice: {
            reason: ADMIN_LOGIN_REASONS.LOGOUT,
            message: ADMIN_LOGIN_NOTICE_BY_REASON[ADMIN_LOGIN_REASONS.LOGOUT],
          },
          globalAlert: {
            kind: 'error',
            message: 'E-mail ou senha inválidos.',
          },
          statusAnnouncement: null,
          isSubmitting: false,
          isRedirecting: false,
          cooldownRemainingSeconds: 0,
          onSubmit: vi.fn(),
          onEmailChange: vi.fn(),
          onPasswordChange: vi.fn(),
          onTogglePassword: vi.fn(),
        })
      );

      expect(htmlWithAlert).toContain('data-testid="login-error-alert"');
      expect(htmlWithAlert).not.toContain('data-testid="admin-login-notice"');
    });
  });

  describe('5. Guardrails Estáticos de CSS (Zero Spinner, Contraste AA e Alinhamento 1240px)', () => {
    it('CSS de sessão e layout NÃO deve conter spinners/rotação nem opacidade baixa em botão desabilitado', () => {
      const sessionCss = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/admin/session/AdminSessionShell.module.css'),
        'utf-8'
      );
      const layoutCss = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/admin/(protected)/admin-layout.module.css'),
        'utf-8'
      );
      const toastCss = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/admin/toast/AdminToast.module.css'),
        'utf-8'
      );

      expect(sessionCss).not.toMatch(/rotate\(/i);
      expect(sessionCss).not.toMatch(/@keyframes\s+spin/i);
      expect(sessionCss).toContain('max-width: 1240px');
      expect(sessionCss).toContain('min-height: 44px');
      expect(sessionCss).toContain('min-width: 44px');

      expect(toastCss).not.toMatch(/rotate\(/i);
      expect(toastCss).not.toMatch(/@keyframes\s+spin/i);
      expect(toastCss).toContain('left: 1.25rem');
      expect(toastCss).toContain('adminToastEnter');
      expect(toastCss).toContain('adminToastExit');
      expect(toastCss).toContain('min-height: 44px');
      expect(toastCss).toContain('min-width: 44px');
      expect(toastCss).toContain('prefers-reduced-motion');

      expect(layoutCss).not.toContain('opacity: 0.55');
      expect(layoutCss).not.toMatch(/rotate\(/i);
    });
  });

  describe('6. AdminToastView (confirmação discreta de login e logout)', () => {
    it('deve renderizar toasts acessíveis de sucesso (login) e informativo (logout) sem roubar foco', () => {
      const successHtml = renderToStaticMarkup(
        React.createElement(AdminToastView, {
          tone: 'success',
          title: 'Login realizado',
          message: 'Bem-vindo ao painel.',
          dataReason: 'login',
          onDismiss: vi.fn(),
        })
      );
      expect(successHtml).toContain('data-testid="admin-toast"');
      expect(successHtml).toContain('data-tone="success"');
      expect(successHtml).toContain('data-reason="login"');
      expect(successHtml).toContain('role="status"');
      expect(successHtml).toContain('aria-live="polite"');
      expect(successHtml).toContain('aria-atomic="true"');
      expect(successHtml).toContain('data-testid="admin-toast-close"');
      expect(successHtml).toContain('aria-label="Fechar notificação"');
      expect(successHtml).not.toContain('tabindex="-1"');

      const logoutHtml = renderToStaticMarkup(
        React.createElement(AdminToastView, {
          tone: 'info',
          title: 'Sessão encerrada',
          message: 'Você saiu com segurança.',
          dataReason: 'logout',
          onDismiss: vi.fn(),
        })
      );
      expect(logoutHtml).toContain('data-tone="info"');
      expect(logoutHtml).toContain('data-reason="logout"');
      expect(logoutHtml).toContain('Sessão encerrada');

      const exitingHtml = renderToStaticMarkup(
        React.createElement(AdminToastView, {
          tone: 'info',
          title: 'Sessão encerrada',
          message: 'Você saiu com segurança.',
          isExiting: true,
          onDismiss: vi.fn(),
        })
      );
      expect(exitingHtml).toContain('data-exiting="true"');
    });
  });
});
