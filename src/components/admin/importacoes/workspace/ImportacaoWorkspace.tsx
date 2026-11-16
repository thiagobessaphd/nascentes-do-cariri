'use client';

/**
 * Nascentes do Cariri — Workspace Integrador de Validação e Prévia
 *
 * Gerencia a máquina de estados no cliente, stepper de progresso transacional,
 * foco assistivo programático ao detectar falhas e orquestração dos componentes
 * de Upload, Resumo, Tabela de Prévia, Lista de Erros e Barra de Ações.
 */

import { useState, useRef, useEffect } from 'react';
import type {
  ImportacaoCancelResponseDto,
  ImportacaoConfirmResponseDto,
  ImportacaoValidationResponseDto,
} from '@/modules/importacoes/importacoes.contracts';
import {
  cancelImportacaoById,
  canConfirmImportacao,
  clearPreviewSession,
  clearPreviewSessionIfId,
  confirmImportacaoById,
  derivePreviewState,
  fetchImportacaoDetailById,
  ImportacaoClientError,
  loadPreviewSession,
  savePreviewSession,
  uploadAndValidateTxt,
  type PreviewClassification,
} from '@/services/importacoes.client';
import ImportUploadForm from '../upload-form/ImportUploadForm';
import ImportSummaryCards from '../summary-cards/ImportSummaryCards';
import ImportErrorsList from '../errors-list/ImportErrorsList';
import ImportPreviewTable from '../preview-table/ImportPreviewTable';
import ImportActionBar from '../action-bar/ImportActionBar';
import styles from './ImportacaoWorkspace.module.css';

export interface ImportacaoWorkspaceProps {
  /**
   * Callback opcional disparado após confirmar o lote validado no servidor
   */
  readonly onConfirmImportacao?: ((
    dto: ImportacaoValidationResponseDto,
    commitResult: ImportacaoConfirmResponseDto
  ) => Promise<void> | void) | undefined;
  /**
   * Callback opcional disparado após cancelar a importação no servidor
   */
  readonly onCancelImportacao?: ((
    dto: ImportacaoValidationResponseDto,
    cancelResult: ImportacaoCancelResponseDto
  ) => Promise<void> | void) | undefined;
  /**
   * Token opcional de autenticação administrativa para execução via API
   */
  readonly authToken?: string | undefined;
  /**
   * Identificador opcional de lote pendente para restauração explícita da prévia
   */
  readonly initialImportacaoId?: number | undefined;
}

const STRICT_POSITIVE_INT_REGEX = /^[1-9]\d*$/;

export function parseImportacaoIdSearchParam(
  rawValue: string | null | undefined
): number | undefined {
  if (!rawValue) return undefined;
  const trimmed = rawValue.trim();
  if (!STRICT_POSITIVE_INT_REGEX.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readImportacaoIdFromLocation(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  return parseImportacaoIdSearchParam(params.get('importacaoId'));
}

function stripImportacaoIdFromLocation(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('importacaoId')) return;
  url.searchParams.delete('importacaoId');
  const nextUrl = `${url.pathname}${url.search ? url.search : ''}`;
  window.history.replaceState(null, '', nextUrl);
}

function scrollToWorkspaceTop(): void {
  if (typeof window === 'undefined') return;
  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof window.scrollTo === 'function') {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }
}

export default function ImportacaoWorkspace({
  onConfirmImportacao,
  onCancelImportacao,
  authToken,
  initialImportacaoId,
}: ImportacaoWorkspaceProps) {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isRestoringPreview, setIsRestoringPreview] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [previewDto, setPreviewDto] = useState<ImportacaoValidationResponseDto | null>(null);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isCanceling, setIsCanceling] = useState<boolean>(false);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null);
  const [cancellationNotice, setCancellationNotice] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  const errorsSectionRef = useRef<HTMLElement>(null);
  const previewLayoutRef = useRef<HTMLDivElement>(null);
  const uploadSectionRef = useRef<HTMLElement>(null);
  const cancellationNoticeRef = useRef<HTMLDivElement>(null);
  const confirmationNoticeRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isValidatingRef = useRef<boolean>(false);
  const isMutatingRef = useRef<boolean>(false);
  const prevStageRef = useRef<'upload' | 'preview'>('upload');

  // Deriva o diagnóstico do DTO atual caso exista
  const classification: PreviewClassification | null = previewDto
    ? isConfirmed
      ? {
          kind: 'valid',
          message:
            confirmationNotice ??
            'Homologação transacional concluída com sucesso. Os registros válidos já foram integrados ao mapa.',
          canConfirm: true,
        }
      : derivePreviewState(previewDto)
    : null;

  const canConfirm = previewDto && !isConfirmed ? canConfirmImportacao(previewDto) : false;

  // Cancela requisição em voo caso o componente seja desmontado
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Restaura prévia pendente via ?importacaoId=<id> (Opção A) ou sessionStorage local
  useEffect(() => {
    const targetId = initialImportacaoId ?? readImportacaoIdFromLocation();
    const storedPreview = loadPreviewSession();

    if (targetId === undefined) {
      if (!storedPreview) return;

      const timerId = window.setTimeout(() => {
        setPreviewDto((current) => current ?? storedPreview);
      }, 0);

      return () => {
        window.clearTimeout(timerId);
      };
    }

    if (
      storedPreview &&
      storedPreview.importacaoId === targetId &&
      storedPreview.status === 'AGUARDANDO_CONFIRMACAO'
    ) {
      const timerId = window.setTimeout(() => {
        setPreviewDto((current) => current ?? storedPreview);
      }, 0);

      return () => {
        window.clearTimeout(timerId);
      };
    }

    const controller = new AbortController();
    const startTimerId = window.setTimeout(() => {
      setIsRestoringPreview(true);
      setValidationError(null);
      setCancellationNotice(null);
      setConfirmationError(null);
    }, 0);

    void fetchImportacaoDetailById(targetId, {
      includePreview: true,
      authToken,
      signal: controller.signal,
    })
      .then((detail) => {
        if (controller.signal.aborted) return;

        if (detail.status !== 'AGUARDANDO_CONFIRMACAO') {
          clearPreviewSessionIfId(targetId);
          stripImportacaoIdFromLocation();
          setValidationError(
            `O lote #${targetId} não está mais aguardando confirmação e não pode ser retomado para análise.`
          );
          return;
        }

        if (!detail.isOwner) {
          stripImportacaoIdFromLocation();
          setValidationError(
            `O lote #${targetId} pertence a ${detail.usuario.nome}. Apenas o administrador autor pode analisá-lo para confirmação.`
          );
          return;
        }

        if (!detail.preview) {
          stripImportacaoIdFromLocation();
          setValidationError(
            `Não foi possível reconstruir a prévia do lote #${targetId} a partir do arquivo armazenado.`
          );
          return;
        }

        savePreviewSession(detail.preview);
        setIsConfirmed(false);
        setConfirmationNotice(null);
        setPreviewDto(detail.preview);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        stripImportacaoIdFromLocation();
        const message =
          err instanceof Error
            ? err.message
            : `Não foi possível carregar a prévia do lote #${targetId}.`;
        setValidationError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsRestoringPreview(false);
        }
      });

    return () => {
      window.clearTimeout(startTimerId);
      controller.abort();
    };
  }, [authToken, initialImportacaoId]);

  // Gerenciamento de foco programático nas transições de etapa
  useEffect(() => {
    const currentStage = previewDto ? 'preview' : 'upload';
    const prevStage = prevStageRef.current;
    prevStageRef.current = currentStage;

    if (previewDto) {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (previewDto.allErrors.length > 0) {
        errorsSectionRef.current?.focus();
        errorsSectionRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      } else {
        previewLayoutRef.current?.focus();
      }
      return;
    }

    if (prevStage === 'preview') {
      scrollToWorkspaceTop();
      (cancellationNoticeRef.current ?? uploadSectionRef.current)?.focus({
        preventScroll: true,
      });
    }
  }, [previewDto]);

  // Rola para o topo e foca o banner de confirmação assim que a homologação conclui
  useEffect(() => {
    if (!isConfirmed) return;
    scrollToWorkspaceTop();
    confirmationNoticeRef.current?.focus({ preventScroll: true });
  }, [isConfirmed]);

  async function handleValidateFile(file: File) {
    if (isValidatingRef.current) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    isValidatingRef.current = true;
    stripImportacaoIdFromLocation();

    setIsValidating(true);
    setValidationError(null);
    setIsConfirmed(false);
    setConfirmationNotice(null);
    setCancellationNotice(null);
    setConfirmationError(null);
    setCurrentFile(file);

    try {
      const dto = await uploadAndValidateTxt(file, {
        authToken,
        signal: controller.signal,
      });
      savePreviewSession(dto);
      setPreviewDto(dto);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      clearPreviewSession();
      setPreviewDto(null);
      const message =
        err instanceof Error ? err.message : 'Falha inesperada ao validar o arquivo no servidor.';
      setValidationError(message);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      isValidatingRef.current = false;
      setIsValidating(false);
    }
  }

  function resetWorkspaceState(notice: string | null) {
    clearPreviewSession();
    stripImportacaoIdFromLocation();
    setPreviewDto(null);
    setCurrentFile(null);
    setValidationError(null);
    setIsConfirmed(false);
    setConfirmationNotice(null);
    setConfirmationError(null);
    setCancellationNotice(notice);
  }

  async function handleCancelPreview() {
    if (isConfirming || isCanceling || isMutatingRef.current) return;

    if (previewDto && previewDto.status === 'AGUARDANDO_CONFIRMACAO' && !isConfirmed) {
      isMutatingRef.current = true;
      setIsCanceling(true);
      setConfirmationError(null);

      try {
        const cancelResult = await cancelImportacaoById(previewDto.importacaoId, {
          authToken,
        });
        if (onCancelImportacao) {
          await onCancelImportacao(previewDto, cancelResult);
        }
        resetWorkspaceState(
          cancelResult.mensagemErro ||
            'Importação cancelada pelo administrador antes da confirmação.'
        );
      } catch (err: unknown) {
        if (err instanceof ImportacaoClientError && err.statusCode === 404) {
          resetWorkspaceState(null);
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Falha inesperada ao cancelar a importação no servidor.';
        setConfirmationError(message);
      } finally {
        isMutatingRef.current = false;
        setIsCanceling(false);
      }
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isValidatingRef.current = false;
    setIsValidating(false);
    resetWorkspaceState(null);
  }

  async function handleConfirm() {
    if (
      !previewDto ||
      !canConfirm ||
      isConfirming ||
      isCanceling ||
      isConfirmed ||
      isMutatingRef.current
    ) {
      return;
    }

    isMutatingRef.current = true;
    setIsConfirming(true);
    setConfirmationError(null);
    setConfirmationNotice(null);
    setCancellationNotice(null);

    try {
      const commitResult = await confirmImportacaoById(previewDto.importacaoId, {
        authToken,
      });
      if (onConfirmImportacao) {
        await onConfirmImportacao(previewDto, commitResult);
      }
      clearPreviewSession();
      stripImportacaoIdFromLocation();
      setPreviewDto((prev) =>
        prev ? { ...prev, status: commitResult.status } : prev
      );
      setIsConfirmed(true);

      const totalInseridas = commitResult.summary.totalInseridas;
      const totalDuplicadas = commitResult.summary.totalDuplicadas;
      const inseridasLabel =
        totalInseridas === 1
          ? '1 nova nascente adicionada'
          : `${totalInseridas} novas nascentes adicionadas`;
      const duplicadasInfo =
        totalDuplicadas > 0
          ? ` (${totalDuplicadas} ${
              totalDuplicadas === 1 ? 'duplicada ignorada' : 'duplicadas ignoradas'
            })`
          : '';
      setConfirmationNotice(
        `Importação confirmada com sucesso! ${inseridasLabel} à base oficial do mapa${duplicadasInfo}.`
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Falha inesperada ao confirmar a importação no banco de dados.';
      setConfirmationError(message);
    } finally {
      isMutatingRef.current = false;
      setIsConfirming(false);
    }
  }

  const isPreviewStage = previewDto !== null;
  const hasPreviewErrors =
    isPreviewStage && (previewDto.allErrors.length > 0 || previewDto.summary.totalInvalidas > 0);
  const hasHeaderError =
    isPreviewStage &&
    previewDto.allErrors.some(
      (err) => err.field === 'cabecalho' || err.code === 'INVALID_HEADER'
    );

  const step1Class = isPreviewStage ? styles.stepCompleted : styles.stepActive;
  const step2Class = !isPreviewStage
    ? styles.stepPending
    : hasPreviewErrors
      ? styles.stepBlocked
      : isConfirmed
        ? styles.stepCompleted
        : styles.stepActive;
  const step3Class = !isPreviewStage
    ? styles.stepPending
    : isConfirmed
      ? styles.stepCompleted
      : hasPreviewErrors
        ? styles.stepBlocked
        : styles.stepPending;

  return (
    <div className={styles.workspace} data-testid="importacao-workspace">
      {/* Indicador Formal de Etapas do Protocolo de Importação */}
      <nav className={styles.stepperBar} aria-label="Etapas do protocolo de importação">
        <ol className={styles.stepperList}>
          <li
            className={`${styles.stepItem} ${step1Class}`}
            aria-current={!isPreviewStage ? 'step' : undefined}
          >
            <span className={styles.stepBadge} aria-hidden="true">
              {isPreviewStage ? '✓' : '1'}
            </span>
            <div className={styles.stepTextGroup}>
              <span className={styles.stepTitle}>1. Submissão e Validação Sintática</span>
              <span className={styles.stepSubtitle}>
                {isPreviewStage ? 'Arquivo recebido e inspecionado' : 'Seleção do arquivo .txt homologado'}
              </span>
            </div>
          </li>

          <li
            className={`${styles.stepItem} ${step2Class}`}
            aria-current={isPreviewStage && !isConfirmed ? 'step' : undefined}
          >
            <span className={styles.stepBadge} aria-hidden="true">
              {isConfirmed ? '✓' : '2'}
            </span>
            <div className={styles.stepTextGroup}>
              <span className={styles.stepTitle}>2. Auditoria de Prévia e Parecer</span>
              <span className={styles.stepSubtitle}>
                {!isPreviewStage
                  ? 'Aguardando processamento do lote'
                  : hasPreviewErrors
                    ? previewDto.allErrors.length === 1
                      ? '1 inconsistência detectada'
                      : `${previewDto.allErrors.length} inconsistências detectadas`
                    : 'Diagnóstico estrutural concluído'}
              </span>
            </div>
          </li>

          <li
            className={`${styles.stepItem} ${step3Class}`}
            aria-current={isConfirmed ? 'step' : undefined}
          >
            <span className={styles.stepBadge} aria-hidden="true">
              {isConfirmed ? '✓' : '3'}
            </span>
            <div className={styles.stepTextGroup}>
              <span className={styles.stepTitle}>3. Homologação Transacional</span>
              <span className={styles.stepSubtitle}>
                {!isPreviewStage
                  ? 'Requer 100% de conformidade'
                  : isConfirmed
                    ? 'Homologação concluída com sucesso'
                    : canConfirm
                      ? 'Aguardando sua confirmação final'
                      : hasPreviewErrors
                        ? 'Bloqueada até correção do arquivo'
                        : 'Sem novos registros para integrar'}
              </span>
            </div>
          </li>
        </ol>
      </nav>

      {/* 1. Feedback de cancelamento anterior e formulário de upload */}
      {!previewDto && cancellationNotice && (
        <div
          ref={cancellationNoticeRef}
          tabIndex={-1}
          className={styles.noticeBox}
          role="status"
          aria-live="polite"
          data-testid="cancellation-notice"
        >
          <div className={styles.noticeContent}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{cancellationNotice}</span>
          </div>
        </div>
      )}

      {!previewDto && isRestoringPreview && (
        <div
          className={styles.restoringBox}
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-testid="restoring-preview-notice"
        >
          <span className={styles.restoringSpinner} aria-hidden="true" />
          <span>Recuperando prévia do lote selecionado no histórico...</span>
        </div>
      )}

      {!previewDto && (
        <ImportUploadForm
          onValidate={handleValidateFile}
          isValidating={isValidating}
          error={validationError}
          onClearError={() => setValidationError(null)}
          containerRef={uploadSectionRef}
        />
      )}

      {/* 2. Visualização Completa da Prévia Diagnosticada */}
      {previewDto && classification && (
        <div
          ref={previewLayoutRef}
          tabIndex={-1}
          className={styles.previewLayout}
          data-testid="preview-layout"
        >
          {/* Feedback de Erro na Confirmação */}
          {confirmationError && (
            <div className={styles.errorBox} role="alert" aria-live="assertive">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
              </svg>
              <span>{confirmationError}</span>
            </div>
          )}

          {/* Feedback de Confirmação quando acionado */}
          {confirmationNotice && (
            <div
              ref={confirmationNoticeRef}
              tabIndex={-1}
              className={styles.noticeBox}
              role="status"
              aria-live="polite"
              data-testid="confirmation-notice"
            >
              <div className={styles.noticeContent}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>{confirmationNotice}</span>
              </div>
              <button
                type="button"
                className={styles.noticeActionBtn}
                onClick={() => {
                  void handleCancelPreview();
                }}
                data-testid="new-import-button"
              >
                Enviar Novo Arquivo
              </button>
            </div>
          )}

          {/* Cards de Resumo e Metadados */}
          <ImportSummaryCards
            summary={previewDto.summary}
            fileName={previewDto.nomeArquivo || currentFile?.name || 'arquivo.txt'}
            fileSize={previewDto.tamanhoBytes || currentFile?.size}
            hashSha256={previewDto.hashSha256}
            classification={classification}
            hasHeaderError={hasHeaderError}
            hideDiagnosticBanner={isConfirmed}
          />

          {/* Tabela de Erros de Validação (em primeiro plano caso haja erros) */}
          <ImportErrorsList
            errors={previewDto.allErrors}
            containerRef={errorsSectionRef}
          />

          {/* Tabela de Prévia dos Registros Válidos e Duplicados (oculta em falhas totais) */}
          {(previewDto.summary.totalValidas > 0 || previewDto.summary.totalDuplicadas > 0) && (
            <ImportPreviewTable
              validRows={previewDto.validRows}
              duplicateRows={previewDto.duplicateRows}
            />
          )}

          {/* Barra de Ações no Fluxo do Documento (Confirmar / Cancelar ou Enviar Corrigido) */}
          <ImportActionBar
            canConfirm={canConfirm}
            totalValidas={previewDto.summary.totalValidas}
            totalInvalidas={
              previewDto.summary.totalInvalidas > 0
                ? previewDto.summary.totalInvalidas
                : previewDto.allErrors.length
            }
            blockingReason={classification.blockingReason}
            isConfirming={isConfirming}
            isCanceling={isCanceling}
            isConfirmed={isConfirmed}
            onConfirm={() => {
              void handleConfirm();
            }}
            onCancel={() => {
              void handleCancelPreview();
            }}
          />
        </div>
      )}
    </div>
  );
}
