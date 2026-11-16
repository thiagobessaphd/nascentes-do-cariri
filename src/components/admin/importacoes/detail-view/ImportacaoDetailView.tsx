'use client';

/**
 * Nascentes do Cariri — Visão Detalhada de Auditoria e Gestão de Lote Importado
 *
 * Consome GET /api/admin/importacoes/[id], apresentando metadados completos,
 * assinatura SHA-256 copiável, resumo KPI, diagnóstico seguro de erro/cancelamento,
 * inspeção somente leitura da prévia quando pendente e ações restritas ao dono
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ImportacaoDetailResponseDto } from '@/modules/importacoes/importacoes.contracts';
import {
  cancelImportacaoById,
  canBackToAnalyzeImportacao,
  canCancelPendingImportacao,
  clearPreviewSessionIfId,
  derivePreviewState,
  fetchImportacaoDetailById,
  formatDateTimePtBr,
  formatHashSha256Short,
  ImportacaoClientError,
  savePreviewSession,
  type PreviewClassification,
} from '@/services/importacoes.client';
import ImportSummaryCards from '../summary-cards/ImportSummaryCards';
import ImportErrorsList from '../errors-list/ImportErrorsList';
import ImportPreviewTable from '../preview-table/ImportPreviewTable';
import ImportStatusBadge from '../status-badge/ImportStatusBadge';
import ImportCancelModal from '../cancel-modal/ImportCancelModal';
import styles from './ImportacaoDetailView.module.css';

export interface ImportacaoDetailViewProps {
  readonly importacaoId: number;
  readonly authToken?: string | undefined;
  readonly initialDetail?: ImportacaoDetailResponseDto | undefined;
  readonly initialError?: string | undefined;
  readonly initialStatusCode?: number | undefined;
}

type DetailAsyncState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'success'; readonly detail: ImportacaoDetailResponseDto }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly statusCode?: number | undefined;
    };

function buildSummaryClassification(
  detail: ImportacaoDetailResponseDto
): PreviewClassification {
  if (detail.preview) {
    return derivePreviewState(detail.preview);
  }

  return derivePreviewState({
    canConfirm: false,
    summary: {
      totalLinhas: detail.totalLinhas,
      totalValidas: detail.totalValidas,
      totalInvalidas: detail.totalInvalidas,
      totalDuplicadas: detail.totalDuplicadas,
    },
    allErrors: [],
  });
}

export default function ImportacaoDetailView({
  importacaoId,
  authToken,
  initialDetail,
  initialError,
  initialStatusCode,
}: ImportacaoDetailViewProps) {
  const [state, setState] = useState<DetailAsyncState>(() => {
    if (initialError) {
      return {
        kind: 'error',
        message: initialError,
        ...(initialStatusCode !== undefined ? { statusCode: initialStatusCode } : {}),
      };
    }
    if (initialDetail) {
      return { kind: 'success', detail: initialDetail };
    }
    return { kind: 'loading' };
  });

  const [hashCopied, setHashCopied] = useState<boolean>(false);
  const [cancelModalOpen, setCancelModalOpen] = useState<boolean>(false);
  const [isCanceling, setIsCanceling] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancellationNotice, setCancellationNotice] = useState<string | null>(null);

  const shouldSkipInitialFetchRef = useRef<boolean>(
    initialDetail !== undefined || initialError !== undefined
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const cancellationNoticeRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  const loadDetail = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({ kind: 'loading' });

    try {
      const detail = await fetchImportacaoDetailById(importacaoId, {
        authToken,
        signal: controller.signal,
      });
      setState({ kind: 'success', detail });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar os detalhes da importação.';
      const statusCode =
        err instanceof ImportacaoClientError ? err.statusCode : undefined;

      setState({
        kind: 'error',
        message,
        ...(statusCode !== undefined ? { statusCode } : {}),
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [authToken, importacaoId]);

  useEffect(() => {
    if (shouldSkipInitialFetchRef.current) {
      shouldSkipInitialFetchRef.current = false;
      return;
    }

    void loadDetail();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadDetail]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  async function handleCopyHash(hash: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(hash);
      setHashCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setHashCopied(false);
        copyTimerRef.current = null;
      }, 2500);
    } catch {
      setHashCopied(false);
    }
  }

  async function handleConfirmCancel() {
    if (state.kind !== 'success' || isCanceling) return;

    const currentDetail = state.detail;
    setIsCanceling(true);
    setCancelError(null);

    try {
      const cancelResult = await cancelImportacaoById(currentDetail.id, {
        authToken,
      });

      clearPreviewSessionIfId(currentDetail.id);
      setCancelModalOpen(false);
      setCancellationNotice(
        'Importação cancelada com sucesso. Nenhuma nascente deste lote foi inserida e o arquivo .txt original permanece preservado para auditoria.'
      );
      setState({
        kind: 'success',
        detail: {
          ...currentDetail,
          status: cancelResult.status,
          mensagemErro: cancelResult.mensagemErro,
          concluidaAt: cancelResult.concluidaAt,
          preview: null,
        },
      });

      window.setTimeout(() => {
        cancellationNoticeRef.current?.focus({ preventScroll: true });
      }, 0);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível cancelar esta importação no servidor.';
      setCancelError(message);
    } finally {
      setIsCanceling(false);
    }
  }

  const backBreadcrumb = (
    <nav aria-label="Navegação estrutural" className={styles.breadcrumbBar}>
      <Link
        href="/admin/importacoes/historico"
        className={styles.backLink}
        data-testid="detail-back-to-history"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span>Voltar ao Histórico</span>
      </Link>
    </nav>
  );

  // Estado de Carregamento (Skeleton estrutural do Detalhe)
  if (state.kind === 'loading') {
    return (
      <div className={styles.container} data-testid="importacao-detail-loading">
        {backBreadcrumb}
        <div
          className={styles.skeletonLayout}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className={styles.srOnly}>
            Carregando detalhes do lote #{importacaoId}...
          </span>

          <section className={styles.skeletonHeroCard} aria-hidden="true">
            <div className={styles.skeletonHeroTop}>
              <div className={styles.skeletonStack}>
                <span className={`${styles.skeletonLine} ${styles.skeletonOverline}`} />
                <span className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
                <span className={`${styles.skeletonLine} ${styles.skeletonSubtitle}`} />
              </div>
              <span className={`${styles.skeletonLine} ${styles.skeletonBadge}`} />
            </div>
            <div className={styles.skeletonMetaGrid}>
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className={styles.skeletonMetaItem}>
                  <span className={`${styles.skeletonLine} ${styles.skeletonMetaLabel}`} />
                  <span className={`${styles.skeletonLine} ${styles.skeletonMetaVal}`} />
                </div>
              ))}
            </div>
          </section>

          <section className={styles.skeletonKpiGrid} aria-hidden="true">
            {[0, 1, 2, 3].map((card) => (
              <div key={card} className={styles.skeletonKpiCard}>
                <span className={`${styles.skeletonLine} ${styles.skeletonKpiLabel}`} />
                <span className={`${styles.skeletonLine} ${styles.skeletonKpiValue}`} />
              </div>
            ))}
          </section>

          <section className={styles.skeletonSectionCard} aria-hidden="true">
            <span className={`${styles.skeletonLine} ${styles.skeletonSectionTitle}`} />
            <span className={`${styles.skeletonLine} ${styles.skeletonRowBar}`} />
            <span className={`${styles.skeletonLine} ${styles.skeletonRowBar}`} />
            <span className={`${styles.skeletonLine} ${styles.skeletonRowBarShort}`} />
          </section>
        </div>
      </div>
    );
  }

  // Estado de Erro (404 / 401 / 403 / 500)
  if (state.kind === 'error') {
    const isNotFound = state.statusCode === 404;

    return (
      <div className={styles.container} data-testid="importacao-detail-error">
        {backBreadcrumb}
        <section
          className={styles.errorStateCard}
          role="alert"
          aria-live="assertive"
        >
          <div className={styles.errorStateHeader}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
            </svg>
            <h1 className={styles.errorStateTitle}>
              {isNotFound
                ? `Importação #${importacaoId} não encontrada`
                : 'Não foi possível carregar os detalhes da importação'}
            </h1>
          </div>
          <p className={styles.errorStateMessage}>{state.message}</p>
          <div className={styles.errorStateActions}>
            <Link href="/admin/importacoes/historico" className={styles.primaryLink}>
              Voltar ao Histórico
            </Link>
            {!isNotFound && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  void loadDetail();
                }}
                data-testid="detail-retry-button"
              >
                Tentar novamente
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  const { detail } = state;
  const classification = buildSummaryClassification(detail);
  const canBackToAnalyze = canBackToAnalyzeImportacao(detail);
  const canCancel = canCancelPendingImportacao(detail);

  const validCardTitle =
    detail.status === 'CONCLUIDA' ? 'Nascentes Inseridas' : 'Novas Nascentes';
  const validCardCountOverride =
    detail.status === 'CONCLUIDA' ? detail.nascentesInseridasCount : detail.totalValidas;
  const validCardFooterOverride =
    detail.status === 'CONCLUIDA'
      ? 'Gravadas na base oficial'
      : detail.status === 'AGUARDANDO_CONFIRMACAO'
        ? 'Aptas mediante confirmação'
        : 'Não inseridas na base';

  return (
    <div className={styles.container} data-testid="importacao-detail-view">
      {backBreadcrumb}

      {/* Cabeçalho Institucional do Lote */}
      <header className={styles.pageHeader}>
        <div className={styles.headerTopRow}>
          <div className={styles.titleArea}>
            <span className={styles.moduleOverline}>
              AUDITORIA DE IMPORTAÇÃO • LOTE #{detail.id}
            </span>
            <h1 className={styles.pageTitle} data-testid="detail-file-title">
              {detail.nomeArquivo}
            </h1>
          </div>

          <div className={styles.headerBadgeWrap}>
            <ImportStatusBadge status={detail.status} size="lg" />
          </div>
        </div>
      </header>

      {/* Aviso Imediato Após Cancelamento na Tela */}
      {cancellationNotice && (
        <div
          ref={cancellationNoticeRef}
          tabIndex={-1}
          className={styles.cancelSuccessBanner}
          role="status"
          aria-live="polite"
          data-testid="detail-cancellation-notice"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{cancellationNotice}</span>
        </div>
      )}

      {/* Bloco Estruturado de Metadados (<dl>) sem exposição de caminhos internos */}
      <section
        className={styles.metadataCard}
        aria-labelledby="detail-metadata-heading"
        data-testid="detail-metadata-card"
      >
        <h2 id="detail-metadata-heading" className={styles.sectionHeading}>
          Metadados de Rastreabilidade
        </h2>

        <dl className={styles.metadataGrid}>
          <div className={styles.metadataItem}>
            <dt className={styles.metadataTerm}>Arquivo Original</dt>
            <dd className={`${styles.metadataValue} ${styles.monoValue}`}>
              {detail.nomeArquivo}
            </dd>
          </div>

          <div className={styles.metadataItem}>
            <dt className={styles.metadataTerm}>Assinatura SHA-256</dt>
            <dd className={styles.metadataValue}>
              <div className={styles.hashRow}>
                <span
                  className={styles.hashTag}
                  title={`Hash SHA-256: ${detail.hashSha256}`}
                >
                  {formatHashSha256Short(detail.hashSha256)}
                </span>
                <span className={styles.srOnly}>
                  Hash completo: {detail.hashSha256}
                </span>
                <button
                  type="button"
                  className={styles.copyHashButton}
                  onClick={() => {
                    void handleCopyHash(detail.hashSha256);
                  }}
                  aria-label="Copiar hash SHA-256 completo"
                  data-testid="detail-copy-hash-button"
                >
                  {hashCopied ? 'Copiado!' : 'Copiar hash'}
                </button>
                <span className={styles.srOnly} aria-live="polite">
                  {hashCopied ? 'Assinatura SHA-256 copiada para a área de transferência.' : ''}
                </span>
              </div>
            </dd>
          </div>

          <div className={styles.metadataItem}>
            <dt className={styles.metadataTerm}>Administrador Responsável</dt>
            <dd className={styles.metadataValue}>
              <span className={styles.authorName}>{detail.usuario.nome}</span>
              <span className={styles.authorEmail}>{detail.usuario.email}</span>
            </dd>
          </div>

          <div className={styles.metadataItem}>
            <dt className={styles.metadataTerm}>Data de Envio</dt>
            <dd className={`${styles.metadataValue} ${styles.tabularNum}`}>
              {formatDateTimePtBr(detail.createdAt)}
            </dd>
          </div>

          <div className={styles.metadataItem}>
            <dt className={styles.metadataTerm}>Data de Conclusão</dt>
            <dd className={`${styles.metadataValue} ${styles.tabularNum}`}>
              {formatDateTimePtBr(
                detail.concluidaAt,
                detail.status === 'AGUARDANDO_CONFIRMACAO' ? 'Aguardando decisão' : '—'
              )}
            </dd>
          </div>

          <div className={styles.metadataItem}>
            <dt className={styles.metadataTerm}>Situação Atual</dt>
            <dd className={styles.metadataValue}>
              <ImportStatusBadge status={detail.status} size="sm" />
            </dd>
          </div>
        </dl>
      </section>

      {/* Banners Contextuais por Situação */}
      {detail.status === 'CONCLUIDA' && (
        <section
          className={styles.successBanner}
          role="status"
          aria-live="polite"
          data-testid="detail-completed-banner"
        >
          <div className={styles.bannerTextWrap}>
            <h2 className={styles.bannerTitle}>Importação concluída e publicada</h2>
            <p className={styles.bannerBody}>
              {detail.nascentesInseridasCount === 1
                ? '1 nova nascente foi adicionada à base oficial e está disponível no mapa público.'
                : `${detail.nascentesInseridasCount} novas nascentes foram adicionadas à base oficial e estão disponíveis no mapa público.`}
            </p>
          </div>
          <Link
            href="/mapa"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mapPublicLink}
            data-testid="detail-open-map-link"
          >
            <span>Ver no Mapa Público</span>
            <span aria-hidden="true">↗</span>
          </Link>
        </section>
      )}

      {detail.status === 'FALHOU' && (
        <section
          className={styles.failedBanner}
          role="alert"
          aria-live="assertive"
          data-testid="detail-failed-banner"
        >
          <div className={styles.bannerTextWrap}>
            <h2 className={styles.bannerTitle}>Motivo da Falha na Importação</h2>
            <p className={styles.bannerBody}>
              {detail.mensagemErro ??
                'O arquivo foi rejeitado durante a validação ou ocorreu uma falha interna antes da confirmação. Nenhum dado anterior foi alterado.'}
            </p>
          </div>
        </section>
      )}

      {detail.status === 'CANCELADA' && (
        <section
          className={styles.cancelledBanner}
          role="status"
          aria-live="polite"
          data-testid="detail-cancelled-banner"
        >
          <div className={styles.bannerTextWrap}>
            <h2 className={styles.bannerTitle}>Registro de Cancelamento</h2>
            <p className={styles.bannerBody}>
              {detail.mensagemErro ??
                'Importação cancelada pelo administrador antes da confirmação.'}{' '}
              Nenhuma nascente deste arquivo foi inserida e o original permanece preservado
              para auditoria.
            </p>
          </div>
        </section>
      )}

      {/* 4 Cards KPI Reutilizados */}
      <ImportSummaryCards
        summary={{
          totalLinhas: detail.totalLinhas,
          totalValidas: detail.totalValidas,
          totalInvalidas: detail.totalInvalidas,
          totalDuplicadas: detail.totalDuplicadas,
        }}
        fileName={detail.nomeArquivo}
        fileSize={detail.preview?.tamanhoBytes}
        hashSha256={detail.hashSha256}
        classification={classification}
        hideMetadataBar
        hideDiagnosticBanner={detail.status !== 'AGUARDANDO_CONFIRMACAO' || detail.preview === null}
        validCardTitle={validCardTitle}
        validCardCountOverride={validCardCountOverride}
        validCardFooterOverride={validCardFooterOverride}
      />

      {/* Barra de Ações para Lote Pendente (AGUARDANDO_CONFIRMACAO) — SEM botão Confirmar direto */}
      {detail.status === 'AGUARDANDO_CONFIRMACAO' && (
        <section
          className={styles.pendingActionBar}
          aria-label="Ações disponíveis para importação pendente"
          data-testid="detail-pending-actions"
        >
          <div className={styles.actionInfo}>
            <h2 className={styles.actionTitle}>Lote aguardando decisão</h2>
            {!detail.isOwner ? (
              <p className={styles.actionHelp} data-testid="detail-ownership-notice">
                Este lote pertence a <strong>{detail.usuario.nome}</strong>. Apenas o
                administrador autor pode analisá-lo para confirmação ou cancelá-lo.
              </p>
            ) : detail.preview === null ? (
              <p className={styles.actionHelp} data-testid="detail-preview-unavailable-notice">
                A prévia detalhada linha a linha não pôde ser reconstruída a partir do
                armazenamento atual. Caso não deseje mantê-la aberta, você pode cancelar esta
                importação pendente.
              </p>
            ) : (
              <p className={styles.actionHelp}>
                Para confirmar este lote no banco, retome a conferência na tela de análise.
                Você também pode cancelar a importação pendente agora.
              </p>
            )}
          </div>

          <div className={styles.actionButtons}>
            {canBackToAnalyze && (
              <Link
                href={`/admin/importacoes?importacaoId=${detail.id}`}
                className={styles.analyzePrimaryLink}
                onClick={() => {
                  if (detail.preview) {
                    savePreviewSession(detail.preview);
                  }
                }}
                data-testid="detail-back-to-analyze-link"
              >
                Reanalisar
              </Link>
            )}

            {canCancel && (
              <button
                ref={cancelButtonRef}
                type="button"
                className={styles.cancelDestructiveButton}
                onClick={() => {
                  setCancelError(null);
                  setCancelModalOpen(true);
                }}
                data-testid="detail-cancel-button"
              >
                Cancelar importação
              </button>
            )}
          </div>
        </section>
      )}

      {/* Inspeção Somente Leitura da Prévia Reconstruída (quando pendente e disponível) */}
      {detail.status === 'AGUARDANDO_CONFIRMACAO' && detail.preview !== null && (
        <section
          className={styles.readonlyPreviewSection}
          aria-label="Inspeção da prévia reconstruída"
          data-testid="detail-readonly-preview"
        >
          <ImportErrorsList errors={detail.preview.allErrors} />

          {(detail.preview.summary.totalValidas > 0 ||
            detail.preview.summary.totalDuplicadas > 0) && (
            <ImportPreviewTable
              validRows={detail.preview.validRows}
              duplicateRows={detail.preview.duplicateRows}
            />
          )}
        </section>
      )}

      {/* Modal Acessível de Confirmação de Cancelamento */}
      <ImportCancelModal
        isOpen={cancelModalOpen}
        importacaoId={detail.id}
        nomeArquivo={detail.nomeArquivo}
        isCanceling={isCanceling}
        errorMessage={cancelError}
        onConfirmCancel={handleConfirmCancel}
        onClose={() => {
          if (!isCanceling) {
            setCancelError(null);
            setCancelModalOpen(false);
          }
        }}
        triggerRef={cancelButtonRef}
      />
    </div>
  );
}
