'use client';

/**
 * Nascentes do Cariri — Workspace Integrador de Validação e Prévia (Padrão Institucional UFCA)
 *
 * Gerencia a máquina de estados no cliente, stepper de progresso transacional,
 * foco assistivo programático ao detectar falhas e orquestração dos componentes
 * de Upload, Resumo, Tabela de Prévia, Lista de Erros e Barra de Ações.
 */

import { useState, useRef, useEffect } from 'react';
import type { ImportacaoValidationResponseDto } from '@/modules/importacoes/importacoes.types';
import {
  canConfirmImportacao,
  derivePreviewState,
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
   * Callback opcional disparado ao confirmar o lote validado (conectado na US-13)
   */
  readonly onConfirmImportacao?: ((dto: ImportacaoValidationResponseDto) => Promise<void> | void) | undefined;
  /**
   * Token opcional de autenticação administrativa para execução via API
   */
  readonly authToken?: string | undefined;
}

export default function ImportacaoWorkspace({
  onConfirmImportacao,
  authToken,
}: ImportacaoWorkspaceProps) {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [previewDto, setPreviewDto] = useState<ImportacaoValidationResponseDto | null>(null);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null);

  const errorsSectionRef = useRef<HTMLDivElement>(null);

  // Deriva o diagnóstico do DTO atual caso exista
  const classification: PreviewClassification | null = previewDto
    ? derivePreviewState(previewDto)
    : null;

  const canConfirm = previewDto ? canConfirmImportacao(previewDto) : false;

  // Gerenciamento de foco programático para tecnologias assistivas ao detectar erros
  useEffect(() => {
    if (previewDto && previewDto.allErrors.length > 0) {
      errorsSectionRef.current?.focus();
      errorsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [previewDto]);

  async function handleValidateFile(file: File) {
    setIsValidating(true);
    setValidationError(null);
    setIsConfirmed(false);
    setConfirmationNotice(null);
    setCurrentFile(file);

    try {
      const dto = await uploadAndValidateTxt(file, { authToken });
      setPreviewDto(dto);
    } catch (err: unknown) {
      setPreviewDto(null);
      const message =
        err instanceof Error ? err.message : 'Falha inesperada ao validar o arquivo no servidor.';
      setValidationError(message);
    } finally {
      setIsValidating(false);
    }
  }

  function handleCancelPreview() {
    setPreviewDto(null);
    setCurrentFile(null);
    setValidationError(null);
    setIsConfirmed(false);
    setConfirmationNotice(null);
  }

  async function handleConfirm() {
    if (!previewDto || !canConfirm || isConfirming) return;

    if (onConfirmImportacao) {
      setIsConfirming(true);
      try {
        await onConfirmImportacao(previewDto);
        setIsConfirmed(true);
      } finally {
        setIsConfirming(false);
      }
    } else {
      const totalValidas = previewDto.summary.totalValidas;
      const validasLabel = totalValidas === 1 ? '1 nascente' : `${totalValidas} nascentes`;
      setIsConfirmed(true);
      setConfirmationNotice(
        `Lote de ${validasLabel} validado com sucesso! A confirmação transacional e gravação definitiva no banco será concluída na US-13.`
      );
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
                      : 'Bloqueada até correção do arquivo'}
              </span>
            </div>
          </li>
        </ol>
      </nav>

      {/* 1. Formulário de Upload (exibido no estado inicial ou quando não há prévia ativa) */}
      {!previewDto && (
        <ImportUploadForm
          onValidate={handleValidateFile}
          isValidating={isValidating}
          error={validationError}
        />
      )}

      {/* 2. Visualização Completa da Prévia Diagnosticada */}
      {previewDto && classification && (
        <div className={styles.previewLayout} data-testid="preview-layout">
          {/* Feedback de Confirmação quando acionado */}
          {confirmationNotice && (
            <div className={styles.noticeBox} role="status" aria-live="polite">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{confirmationNotice}</span>
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
            totalInvalidas={previewDto.summary.totalInvalidas || previewDto.allErrors.length}
            blockingReason={classification.blockingReason}
            isConfirming={isConfirming}
            onConfirm={handleConfirm}
            onCancel={handleCancelPreview}
          />
        </div>
      )}
    </div>
  );
}
