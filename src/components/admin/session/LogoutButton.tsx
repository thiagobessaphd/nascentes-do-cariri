'use client';

/**
 * Nascentes do Cariri — Botão Funcional de Encerramento de Sessão (`Sair`)
 *
 * Acionamento direto (sem modal de confirmação), rótulo claro em transição ("Saindo..."),
 * sem spinner giratório, com foco visível e alvo mínimo >= 44x44px.
 */

import { useAdminSessionContext } from './AdminSessionContext';

export interface LogoutButtonViewProps {
  readonly isBusy: boolean;
  readonly onClick: () => void;
  readonly className?: string | undefined;
  readonly labelClassName?: string | undefined;
}

export function LogoutButtonView({
  isBusy,
  onClick,
  className,
  labelClassName,
}: LogoutButtonViewProps) {
  return (
    <button
      type="button"
      className={className}
      data-testid="admin-logout-button"
      disabled={isBusy}
      aria-disabled={isBusy ? 'true' : undefined}
      aria-busy={isBusy ? 'true' : 'false'}
      aria-label={
        isBusy ? 'Encerrando sessão administrativa' : 'Sair da conta administrativa'
      }
      onClick={onClick}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span className={labelClassName}>{isBusy ? 'Saindo...' : 'Sair'}</span>
    </button>
  );
}

export interface LogoutButtonProps {
  readonly className?: string | undefined;
  readonly labelClassName?: string | undefined;
}

export function LogoutButton({ className, labelClassName }: LogoutButtonProps) {
  const ctx = useAdminSessionContext();

  return (
    <LogoutButtonView
      isBusy={ctx?.isLoggingOut ?? false}
      onClick={() => {
        if (ctx) {
          void ctx.triggerLogout();
        }
      }}
      className={className}
      labelClassName={labelClassName}
    />
  );
}
