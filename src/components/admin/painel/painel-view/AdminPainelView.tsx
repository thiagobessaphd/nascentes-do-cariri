'use client';

/**
 * Nascentes do Cariri — Visão Interativa do Painel Administrativo (/admin)
 *
 * Gerencia explicitamente os 4 estados da interface:
 * - `loading`: skeletons CSS puros (sem spinners visíveis) com `role="status"` e `aria-busy="true"`;
 * - `empty`: base sem nascentes e sem lotes, com card orientador e CTA para primeira importação;
 * - `success`: indicadores operacionais (KPIs) + histórico recente de até 5 lotes;
 * - `error`: alerta acessível (`role="alert"`) sem detalhes internos + retentativa via `GET /api/admin/resumo`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  GENERIC_PAINEL_LOAD_ERROR_MESSAGE,
  deriveAdminDashboardState,
  type AdminDashboardViewState,
  type AdminResumoResponseDto,
} from '@/modules/painel/painel.contracts';
import {
  PainelClientError,
  fetchAdminResumo,
} from '@/services/painel.client';
import { PainelKpiCards } from '../kpi-cards';
import { RecentImportacoesSection } from '../recent-importacoes';
import styles from './AdminPainelView.module.css';

export interface AdminPainelViewProps {
  readonly initialData?: AdminResumoResponseDto | undefined;
  readonly initialError?: string | undefined;
  readonly initialAuthError?: boolean | undefined;
}

function buildInitialState(props: AdminPainelViewProps): AdminDashboardViewState {
  if (props.initialError) {
    return {
      status: 'error',
      message: props.initialError,
      retryable: true,
      isAuthError: props.initialAuthError ?? false,
    };
  }

  if (props.initialData) {
    return deriveAdminDashboardState(props.initialData);
  }

  return { status: 'loading' };
}

export default function AdminPainelView({
  initialData,
  initialError,
  initialAuthError,
}: AdminPainelViewProps) {
  const [state, setState] = useState<AdminDashboardViewState>(() =>
    buildInitialState({ initialData, initialError, initialAuthError })
  );

  const shouldSkipInitialFetchRef = useRef<boolean>(
    initialData !== undefined || initialError !== undefined
  );
  const inFlightRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const errorAlertRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusErrorRef = useRef<boolean>(false);

  const loadResumo = useCallback(async (focusOnError: boolean) => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({ status: 'loading' });

    try {
      const resumo = await fetchAdminResumo({ signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }

      setState(deriveAdminDashboardState(resumo));
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }

      shouldFocusErrorRef.current = focusOnError;

      if (error instanceof PainelClientError) {
        setState({
          status: 'error',
          message: error.message,
          retryable: true,
          isAuthError: error.isAuthError,
        });
      } else {
        setState({
          status: 'error',
          message: GENERIC_PAINEL_LOAD_ERROR_MESSAGE,
          retryable: true,
          isAuthError: false,
        });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        inFlightRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    if (shouldSkipInitialFetchRef.current) {
      shouldSkipInitialFetchRef.current = false;
      return;
    }

    void loadResumo(false);

    return () => {
      abortControllerRef.current?.abort();
      inFlightRef.current = false;
    };
  }, [loadResumo]);

  useEffect(() => {
    if (state.status === 'error' && shouldFocusErrorRef.current) {
      shouldFocusErrorRef.current = false;
      errorAlertRef.current?.focus();
    }
  }, [state]);

  const handleRetry = (): void => {
    void loadResumo(true);
  };

  if (state.status === 'loading') {
    return (
      <div
        className={styles.loadingWrapper}
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-testid="dashboard-loading-state"
      >
        <span className={styles.srOnly}>
          Carregando resumo do painel administrativo...
        </span>

        <div className={styles.skeletonKpiGrid} aria-hidden="true">
          <div className={`${styles.skeletonCard} ${styles.skeletonSpringsCard}`}>
            <span className={`${styles.skeletonLine} ${styles.skOverline}`} />
            <span className={`${styles.skeletonLine} ${styles.skHeroNum}`} />
            <span className={`${styles.skeletonLine} ${styles.skSubLine}`} />
            <span className={`${styles.skeletonLine} ${styles.skFooterLink}`} />
          </div>

          <div className={`${styles.skeletonCard} ${styles.skeletonLastImportCard}`}>
            <div className={styles.skeletonHeaderRow}>
              <span className={`${styles.skeletonLine} ${styles.skOverline}`} />
              <span className={`${styles.skeletonLine} ${styles.skBadge}`} />
            </div>
            <span className={`${styles.skeletonLine} ${styles.skFileName}`} />
            <div className={styles.skeletonMetaRow}>
              <span className={`${styles.skeletonLine} ${styles.skMetaItem}`} />
              <span className={`${styles.skeletonLine} ${styles.skMetaItem}`} />
            </div>
            <div className={styles.skeletonCountsGrid}>
              <span className={`${styles.skeletonLine} ${styles.skCountTile}`} />
              <span className={`${styles.skeletonLine} ${styles.skCountTile}`} />
              <span className={`${styles.skeletonLine} ${styles.skCountTile}`} />
              <span className={`${styles.skeletonLine} ${styles.skCountTile}`} />
            </div>
          </div>
        </div>

        <div className={styles.skeletonTableCard} aria-hidden="true">
          <div className={styles.skeletonTableHeader}>
            <span className={`${styles.skeletonLine} ${styles.skSectionTitle}`} />
            <span className={`${styles.skeletonLine} ${styles.skActionBtn}`} />
          </div>
          {[0, 1, 2, 3, 4].map((rowIndex) => (
            <div key={rowIndex} className={styles.skeletonRow}>
              <span className={`${styles.skeletonLine} ${styles.skRowWide}`} />
              <span className={`${styles.skeletonLine} ${styles.skRowMedium}`} />
              <span className={`${styles.skeletonLine} ${styles.skRowMedium}`} />
              <span className={`${styles.skeletonLine} ${styles.skBadge}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <section
        ref={errorAlertRef}
        className={styles.errorCard}
        role="alert"
        aria-live="assertive"
        tabIndex={-1}
        data-testid="dashboard-error-state"
      >
        <div className={styles.errorHeader}>
          <span className={styles.errorIconBox} aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
            </svg>
          </span>

          <div className={styles.errorTextGroup}>
            <h2 className={styles.errorTitle}>
              {state.isAuthError
                ? 'Sessão administrativa expirada ou sem permissão'
                : 'Não foi possível carregar o resumo do painel'}
            </h2>
            <p className={styles.errorDescription}>{state.message}</p>
          </div>
        </div>

        <div className={styles.errorActions}>
          {state.isAuthError ? (
            <Link
              href="/admin/login?next=%2Fadmin"
              className={styles.primaryActionButton}
              data-testid="dashboard-login-recovery-link"
            >
              Ir para o login
            </Link>
          ) : null}

          {state.retryable ? (
            <button
              type="button"
              onClick={handleRetry}
              className={
                state.isAuthError
                  ? styles.secondaryActionLink
                  : styles.primaryActionButton
              }
              data-testid="dashboard-retry-button"
            >
              Tentar novamente
            </button>
          ) : null}

          <Link href="/admin/importacoes" className={styles.secondaryActionLink}>
            Ir para Importação de Dados
          </Link>

          <Link
            href="/admin/importacoes/historico"
            className={styles.secondaryActionLink}
          >
            Ver Histórico
          </Link>
        </div>
      </section>
    );
  }

  if (state.status === 'empty') {
    return (
      <div className={styles.contentStack}>
        <PainelKpiCards indicadores={state.data.indicadores} />

        <section
          className={styles.emptyCard}
          role="status"
          aria-live="polite"
          aria-labelledby="dashboard-empty-heading"
          data-testid="dashboard-empty-state"
        >
          <div className={styles.emptyHeader}>
            <span className={styles.emptyIconBox} aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </span>

            <div className={styles.emptyTextGroup}>
              <h2 id="dashboard-empty-heading" className={styles.emptyTitle}>
                Comece publicando o primeiro lote de nascentes
              </h2>
              <p className={styles.emptyDescription}>
                A base pública ainda não possui nascentes ativas nem importações
                registradas. Envie um arquivo .txt no padrão oficial do projeto para
                validar os registros, conferir a prévia e atualizar o mapa público.
              </p>
            </div>
          </div>

          <div className={styles.emptyActions}>
            <Link
              href="/admin/importacoes"
              className={styles.primaryActionButton}
              data-testid="dashboard-first-import-cta"
            >
              Realizar primeira importação (.txt)
            </Link>
            <Link
              href="/admin/importacoes/historico"
              className={styles.secondaryActionLink}
            >
              Consultar histórico de lotes
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.contentStack} data-testid="dashboard-populated-state">
      <PainelKpiCards indicadores={state.data.indicadores} />
      <RecentImportacoesSection
        items={state.data.historicoRecente}
        totalImportacoes={state.data.indicadores.totalImportacoes}
      />
    </div>
  );
}
