'use client';

/**
 * Nascentes do Cariri — Formulário Acessível de Autenticação Administrativa
 *
 * Garante rotulagem explícita, navegação integral por teclado, gestão acessível de
 * foco e leitores de tela, proteção contra envios duplicados e cooldown anti-abuso.
 */

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ADMIN_LOGIN_NOTICE_BY_REASON,
  ADMIN_LOGIN_REASONS,
  DEFAULT_ADMIN_REDIRECT_PATH,
  resolveAdminLoginReason,
  sanitizeAdminRedirectPath,
  type AdminLoginReason,
  type AuthFieldErrors,
} from '@/modules/auth/auth.contracts';
import {
  AuthClientError,
  loginAdmin,
  validateLoginInput,
} from '@/services/auth.client';
import { markAdminLoginSuccessToast } from '@/services/admin-session-events';
import { AdminToast } from '@/components/admin/toast';
import {
  formatCooldownRemainingPtBr,
  getCooldownRemainingSeconds,
  getSubmitButtonLabel,
  resolveLoginFailureState,
  type LoginGlobalAlert,
} from './login-form-state';
import styles from './LoginForm.module.css';

export interface LoginNotice {
  readonly reason: AdminLoginReason;
  readonly message: string;
}

export interface LoginFormProps {
  readonly redirectTo?: string | undefined;
  readonly initialNoticeReason?: AdminLoginReason | null | undefined;
}

export interface LoginFormViewProps {
  readonly email: string;
  readonly password: string;
  readonly showPassword: boolean;
  readonly fieldErrors: AuthFieldErrors;
  readonly globalAlert: LoginGlobalAlert | null;
  readonly loginNotice?: LoginNotice | null | undefined;
  readonly statusAnnouncement: string | null;
  readonly isSubmitting: boolean;
  readonly isRedirecting: boolean;
  readonly cooldownRemainingSeconds: number;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onEmailChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onPasswordChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onTogglePassword: () => void;
  readonly emailInputRef?: RefObject<HTMLInputElement | null> | undefined;
  readonly passwordInputRef?: RefObject<HTMLInputElement | null> | undefined;
  readonly alertRef?: RefObject<HTMLDivElement | null> | undefined;
}

/**
 * Camada de apresentação pura e acessível do formulário de login administrativo.
 */
export function LoginFormView({
  email,
  password,
  showPassword,
  fieldErrors,
  globalAlert,
  loginNotice,
  statusAnnouncement,
  isSubmitting,
  isRedirecting,
  cooldownRemainingSeconds,
  onSubmit,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  emailInputRef,
  passwordInputRef,
  alertRef,
}: LoginFormViewProps) {
  const isCooldownActive = cooldownRemainingSeconds > 0;
  const isBusy = isSubmitting || isRedirecting;
  const isSubmitDisabled = isBusy || isCooldownActive;

  const buttonLabel = getSubmitButtonLabel({
    isSubmitting,
    isRedirecting,
    cooldownRemainingSeconds,
  });

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      className={styles.form}
      data-testid="admin-login-form"
    >
      {loginNotice != null && globalAlert === null ? (
        <div
          role="status"
          aria-live="polite"
          className={
            loginNotice.reason === ADMIN_LOGIN_REASONS.SESSION_EXPIRED
              ? `${styles.noticeBanner} ${styles.noticeBannerWarning}`
              : styles.noticeBanner
          }
          data-testid="admin-login-notice"
          data-reason={loginNotice.reason}
        >
          <span className={styles.noticeIcon} aria-hidden="true">
            {loginNotice.reason === ADMIN_LOGIN_REASONS.SESSION_EXPIRED ? (
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            ) : (
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
          </span>
          <p className={styles.noticeMessage}>{loginNotice.message}</p>
        </div>
      ) : null}

      {globalAlert !== null ? (
        <div
          ref={alertRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className={
            globalAlert.kind === 'rate_limit'
              ? `${styles.alertBanner} ${styles.alertBannerRateLimit}`
              : styles.alertBanner
          }
          data-testid="login-error-alert"
        >
          <span className={styles.alertIcon} aria-hidden="true">
            {globalAlert.kind === 'rate_limit' ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </span>

          <div className={styles.alertContent}>
            <p className={styles.alertMessage}>{globalAlert.message}</p>
            {isCooldownActive ? (
              <p
                className={styles.cooldownTimer}
                aria-live="off"
                data-testid="login-cooldown-timer"
              >
                Nova tentativa liberada em{' '}
                <strong className={styles.cooldownValue}>
                  {formatCooldownRemainingPtBr(cooldownRemainingSeconds)}
                </strong>
                .
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Anúncio discreto para transição de sucesso ou fim de bloqueio */}
      <div
        role="status"
        aria-live="polite"
        className={styles.srOnly}
        data-testid="login-status-live"
      >
        {statusAnnouncement ?? ''}
      </div>

      {/* Campo: E-mail institucional */}
      <div className={styles.fieldGroup}>
        <label htmlFor="admin-login-email" className={styles.label}>
          E-mail institucional
        </label>
        <input
          ref={emailInputRef}
          id="admin-login-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-required="true"
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={
            fieldErrors.email ? 'admin-login-email-error' : undefined
          }
          readOnly={isBusy}
          value={email}
          onChange={onEmailChange}
          placeholder="nome.sobrenome@ufca.edu.br"
          className={
            fieldErrors.email
              ? `${styles.input} ${styles.inputInvalid}`
              : styles.input
          }
          data-testid="login-email-input"
        />
        {fieldErrors.email ? (
          <p
            id="admin-login-email-error"
            aria-live="polite"
            className={styles.fieldError}
            data-testid="login-email-error"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{fieldErrors.email}</span>
          </p>
        ) : null}
      </div>

      {/* Campo: Senha */}
      <div className={styles.fieldGroup}>
        <label htmlFor="admin-login-password" className={styles.label}>
          Senha
        </label>
        <div className={styles.passwordWrapper}>
          <input
            ref={passwordInputRef}
            id="admin-login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={
              fieldErrors.password ? 'admin-login-password-error' : undefined
            }
            readOnly={isBusy}
            value={password}
            onChange={onPasswordChange}
            placeholder="Digite sua senha de acesso"
            className={
              fieldErrors.password
                ? `${styles.input} ${styles.passwordInput} ${styles.inputInvalid}`
                : `${styles.input} ${styles.passwordInput}`
            }
            data-testid="login-password-input"
          />

          <button
            type="button"
            className={styles.passwordToggle}
            onClick={onTogglePassword}
            disabled={isBusy}
            aria-pressed={showPassword}
            aria-label={
              showPassword ? 'Ocultar senha digitada' : 'Mostrar senha digitada'
            }
            title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            data-testid="login-password-toggle"
          >
            {showPassword ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        {fieldErrors.password ? (
          <p
            id="admin-login-password-error"
            aria-live="polite"
            className={styles.fieldError}
            data-testid="login-password-error"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{fieldErrors.password}</span>
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        className={styles.submitButton}
        disabled={isSubmitDisabled}
        aria-busy={isBusy}
        data-testid="login-submit-button"
      >
        {isBusy ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
        )}
        <span>{buttonLabel}</span>
      </button>
    </form>
  );
}

export default function LoginForm({
  redirectTo,
  initialNoticeReason,
}: LoginFormProps) {
  const router = useRouter();
  const safeRedirectTo = sanitizeAdminRedirectPath(
    redirectTo,
    DEFAULT_ADMIN_REDIRECT_PATH
  );
  const resolvedInitialReason = resolveAdminLoginReason(initialNoticeReason);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [globalAlert, setGlobalAlert] = useState<LoginGlobalAlert | null>(null);
  const [activeNoticeReason, setActiveNoticeReason] = useState<AdminLoginReason | null>(
    resolvedInitialReason === ADMIN_LOGIN_REASONS.SESSION_EXPIRED
      ? ADMIN_LOGIN_REASONS.SESSION_EXPIRED
      : null
  );
  const [logoutToastOpen, setLogoutToastOpen] = useState<boolean>(
    resolvedInitialReason === ADMIN_LOGIN_REASONS.LOGOUT
  );
  const [statusAnnouncement, setStatusAnnouncement] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);
  const [cooldownRemainingSeconds, setCooldownRemainingSeconds] = useState(0);
  const [alertFocusTick, setAlertFocusTick] = useState(0);
  const [fieldErrorFocusTick, setFieldErrorFocusTick] = useState(0);

  const isSubmittingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (
      resolvedInitialReason === ADMIN_LOGIN_REASONS.LOGOUT &&
      typeof window !== 'undefined' &&
      window.location &&
      typeof window.history?.replaceState === 'function'
    ) {
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.get('motivo') === ADMIN_LOGIN_REASONS.LOGOUT) {
        currentUrl.searchParams.delete('motivo');
        const nextRelativeUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
        window.history.replaceState(null, '', nextRelativeUrl);
      }
    }
  }, [resolvedInitialReason]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (alertFocusTick > 0 && globalAlert !== null) {
      alertRef.current?.focus();
    }
  }, [alertFocusTick, globalAlert]);

  useEffect(() => {
    if (fieldErrorFocusTick <= 0) {
      return;
    }

    if (fieldErrors.email) {
      emailInputRef.current?.focus();
    } else if (fieldErrors.password) {
      passwordInputRef.current?.focus();
    }
  }, [fieldErrorFocusTick, fieldErrors]);

  useEffect(() => {
    if (cooldownUntilMs === null) {
      return;
    }

    const intervalId = setInterval(() => {
      const remaining = getCooldownRemainingSeconds(cooldownUntilMs, Date.now());
      setCooldownRemainingSeconds(remaining);

      if (remaining <= 0) {
        clearInterval(intervalId);
        setCooldownUntilMs(null);
        setStatusAnnouncement(
          'Bloqueio temporário encerrado. Você já pode tentar entrar novamente.'
        );
      }
    }, 500);

    return () => {
      clearInterval(intervalId);
    };
  }, [cooldownUntilMs]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (isSubmittingRef.current || isRedirecting) {
      return;
    }

    setActiveNoticeReason(null);
    setLogoutToastOpen(false);

    if (cooldownUntilMs !== null) {
      const remainingNow = getCooldownRemainingSeconds(cooldownUntilMs, Date.now());
      if (remainingNow > 0) {
        setCooldownRemainingSeconds(remainingNow);
        setAlertFocusTick((prev) => prev + 1);
        return;
      }
      setCooldownUntilMs(null);
      setCooldownRemainingSeconds(0);
    }

    const validation = validateLoginInput({ email, password });
    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      setGlobalAlert(null);
      setStatusAnnouncement(null);
      setFieldErrorFocusTick((prev) => prev + 1);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    setGlobalAlert(null);
    setStatusAnnouncement(null);

    abortControllerRef.current?.abort();
    const requestController = new AbortController();
    abortControllerRef.current = requestController;

    try {
      await loginAdmin(validation.data, { signal: requestController.signal });

      setPassword('');
      setConsecutiveFailures(0);
      setCooldownUntilMs(null);
      setCooldownRemainingSeconds(0);
      setIsRedirecting(true);
      markAdminLoginSuccessToast();
      setStatusAnnouncement(
        'Autenticação realizada com sucesso. Redirecionando para o painel administrativo...'
      );

      router.replace(safeRedirectTo);
      router.refresh();
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      if (error instanceof AuthClientError && error.statusCode === 400 && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
        setFieldErrorFocusTick((prev) => prev + 1);
        return;
      }

      const nowMs = Date.now();
      const failureDetails =
        error instanceof AuthClientError
          ? {
              statusCode: error.statusCode,
              code: error.code,
              message: error.message,
              retryAfterSeconds: error.retryAfterSeconds,
              isNetworkError: error.isNetworkError,
              isTimeout: error.isTimeout,
            }
          : {
              message: 'Não foi possível concluir o acesso. Tente novamente.',
            };

      const nextFailureState = resolveLoginFailureState({
        ...failureDetails,
        previousConsecutiveFailures: consecutiveFailures,
        previousCooldownUntilMs: cooldownUntilMs,
        nowMs,
      });

      setConsecutiveFailures(nextFailureState.consecutiveAuthFailures);
      setCooldownUntilMs(nextFailureState.cooldownUntilMs);
      setCooldownRemainingSeconds(
        getCooldownRemainingSeconds(nextFailureState.cooldownUntilMs, nowMs)
      );
      setGlobalAlert(nextFailureState.alert);
      setAlertFocusTick((prev) => prev + 1);
    } finally {
      if (abortControllerRef.current === requestController) {
        abortControllerRef.current = null;
      }
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const loginNotice: LoginNotice | null = activeNoticeReason
    ? {
        reason: activeNoticeReason,
        message: ADMIN_LOGIN_NOTICE_BY_REASON[activeNoticeReason],
      }
    : null;

  return (
    <>
      <AdminToast
        open={logoutToastOpen}
        tone="info"
        title="Sessão encerrada"
        message="Sua sessão foi encerrada com sucesso.."
        dataReason={ADMIN_LOGIN_REASONS.LOGOUT}
        onDismiss={() => setLogoutToastOpen(false)}
      />

      <LoginFormView
        email={email}
        password={password}
        showPassword={showPassword}
        fieldErrors={fieldErrors}
        globalAlert={globalAlert}
        loginNotice={loginNotice}
        statusAnnouncement={statusAnnouncement}
        isSubmitting={isSubmitting}
        isRedirecting={isRedirecting}
        cooldownRemainingSeconds={cooldownRemainingSeconds}
        onSubmit={handleSubmit}
        onEmailChange={(event) => {
          setEmail(event.target.value);
          if (fieldErrors.email) {
            setFieldErrors((prev) => ({ password: prev.password }));
          }
        }}
        onPasswordChange={(event) => {
          setPassword(event.target.value);
          if (fieldErrors.password) {
            setFieldErrors((prev) => ({ email: prev.email }));
          }
        }}
        onTogglePassword={() => setShowPassword((prev) => !prev)}
        emailInputRef={emailInputRef}
        passwordInputRef={passwordInputRef}
        alertRef={alertRef}
      />
    </>
  );
}
