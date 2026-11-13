'use client';

/**
 * Nascentes do Cariri — Formulário de Submissão e Norma Técnica (.TXT)
 *
 * Implementa a seleção de arquivo, dropzone acessível por teclado, especificação
 * técnica do cabeçalho canônico e disparo da validação preliminar.
 */

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { MAX_UPLOAD_SIZE_BYTES_CLIENT } from '@/modules/importacoes/importacoes.contracts';
import { formatFileSizeBytes } from '@/services/importacoes.client';
import styles from './ImportUploadForm.module.css';

export interface ImportUploadFormProps {
  readonly onValidate: (file: File) => Promise<void> | void;
  readonly isValidating: boolean;
  readonly disabled?: boolean | undefined;
  readonly error?: string | null | undefined;
  readonly onClearError?: (() => void) | undefined;
  readonly containerRef?: RefObject<HTMLElement | null> | undefined;
}

const CANONICAL_HEADER = 'latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media';
const SAMPLE_ROW = '-7.213456;-39.315678;Crato;Nascente do Sítio A;Belmonte;2026-08-01;2.75';
const FULL_EXAMPLE = `${CANONICAL_HEADER}\n${SAMPLE_ROW}`;

export default function ImportUploadForm({
  onValidate,
  isValidating,
  disabled = false,
  error = null,
  onClearError,
  containerRef,
}: ImportUploadFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const isLocked = disabled || isValidating;

  function validateAndSetFile(file: File) {
    setLocalError(null);
    onClearError?.();

    const name = (file.name || '').trim().toLowerCase();
    if (!name.endsWith('.txt')) {
      setLocalError('Apenas arquivos no formato .txt são permitidos.');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    if (file.size === 0) {
      setLocalError('O arquivo selecionado está vazio (0 bytes).');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES_CLIENT) {
      setLocalError('O arquivo excede o limite máximo permitido de 5 MB.');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setSelectedFile(file);
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0 && files[0]) {
      validateAndSetFile(files[0]);
    }
    e.target.value = '';
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isLocked) {
      setIsDragOver(true);
    }
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) {
      return;
    }
    setIsDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (isLocked) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0]) {
      validateAndSetFile(files[0]);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if ((e.key === 'Enter' || e.key === ' ') && !isLocked && !selectedFile) {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }

  function handleRemoveFile() {
    setSelectedFile(null);
    setLocalError(null);
    onClearError?.();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopyExample() {
    try {
      await navigator.clipboard.writeText(FULL_EXAMPLE);
      setCopied(true);
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch {
      // Ignora silenciosamente em navegadores com clipboard desabilitado
    }
  }

  function handleDownloadTemplate() {
    const content = `${FULL_EXAMPLE}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_importacao_nascentes.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleSubmit() {
    if (!selectedFile || isLocked) return;
    onValidate(selectedFile);
  }

  const activeError = error || localError;

  return (
    <section
      ref={containerRef}
      tabIndex={-1}
      className={styles.uploadContainer}
      aria-label="Seção de envio e validação de arquivo TXT"
    >
      {/* 1. Norma Técnica e Exemplo Estrutural do Formato */}
      <div className={styles.guidanceCard}>
        <div className={styles.guidanceHeader}>
          <h2 className={styles.guidanceTitle}>
            <span className={styles.guidanceIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </span>
            Especificação Técnica do Arquivo Tabular (.TXT)
          </h2>
          <ul className={styles.badgesList} aria-label="Requisitos do formato">
            <li className={styles.badge}>Extensão .txt</li>
            <li className={styles.badge}>Codificação UTF-8</li>
            <li className={styles.badge}>Separador ponto e vírgula (;)</li>
            <li className={styles.badge}>Limite 5 MB</li>
            <li className={styles.badge}>Decimais com ponto (.)</li>
          </ul>
        </div>

        <div className={styles.exampleBlock}>
          <div className={styles.exampleHeader}>
            <span>Estrutura Homologada — Cabeçalho Canônico (7 Colunas) e Linha de Exemplo:</span>
            <div className={styles.exampleActions}>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className={styles.downloadTemplateButton}
                aria-label="Baixar modelo .txt codificado em UTF-8 com o cabeçalho oficial"
                data-testid="download-template-button"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Baixar modelo .txt</span>
              </button>
              <button
                type="button"
                onClick={handleCopyExample}
                className={styles.copyButton}
                aria-label={
                  copied
                    ? 'Exemplo copiado para a área de transferência'
                    : 'Copiar exemplo do formato TXT'
                }
                data-testid="copy-example-button"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{copied ? 'Copiado!' : 'Copiar exemplo'}</span>
              </button>
            </div>
          </div>
          <pre className={styles.codeSnippet}>
            <code>{FULL_EXAMPLE}</code>
          </pre>
        </div>

        {/* Limites Geográficos e de Formato (Prevenção de Erros de Domínio CT-BE-07 a CT-BE-09) */}
        <div className={styles.domainRulesSection} aria-label="Limites aceitos pelo validador">
          <div className={styles.domainRulesHeader}>
            <span>Limites e Regras de Domínio Aceitos pelo Validador</span>
          </div>

          <div className={styles.domainRulesGrid}>
            <div className={styles.domainRuleCard}>
              <div className={styles.domainRuleTop}>
                <span className={styles.domainRuleTitle}>Latitude</span>
                <code className={styles.domainRuleColumn}>latitude</code>
              </div>
              <div className={styles.domainRuleValue}>
                Entre <code>-8.0</code> e <code>-6.5</code>
              </div>
              <span className={styles.domainRuleHint}>Recorte geográfico do Cariri</span>
            </div>

            <div className={styles.domainRuleCard}>
              <div className={styles.domainRuleTop}>
                <span className={styles.domainRuleTitle}>Longitude</span>
                <code className={styles.domainRuleColumn}>longitude</code>
              </div>
              <div className={styles.domainRuleValue}>
                Entre <code>-40.5</code> e <code>-38.5</code>
              </div>
              <span className={styles.domainRuleHint}>Recorte geográfico do Cariri</span>
            </div>

            <div className={styles.domainRuleCard}>
              <div className={styles.domainRuleTop}>
                <span className={styles.domainRuleTitle}>Data de Criação</span>
                <code className={styles.domainRuleColumn}>data_criacao</code>
              </div>
              <div className={styles.domainRuleValue}>
                Formato <code>AAAA-MM-DD</code>
              </div>
              <span className={styles.domainRuleHint}>Data real • Sem datas futuras</span>
            </div>

            <div className={styles.domainRuleCard}>
              <div className={styles.domainRuleTop}>
                <span className={styles.domainRuleTitle}>Vazão Média</span>
                <code className={styles.domainRuleColumn}>vazao_media</code>
              </div>
              <div className={styles.domainRuleValue}>
                Valor <code>&ge; 0</code> em <code>m³/s</code>
              </div>
              <span className={styles.domainRuleHint}>Numérico com ponto decimal (.)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Painel de Submissão e Inspeção de Arquivo */}
      <div className={styles.submissionPanel}>
        <div className={styles.submissionPanelHeader}>
          <h2 className={styles.submissionPanelTitle}>Submissão de Lote para Inspeção Preliminar</h2>
          <p className={styles.submissionPanelSubtitle}>
            Selecione o arquivo de dados no computador ou arraste-o para a área demarcada abaixo.
          </p>
        </div>

        <div className={styles.dropzoneWrapper}>
          <input
            ref={fileInputRef}
            id="arquivo-txt-input"
            type="file"
            accept=".txt,text/plain"
            onChange={handleFileInputChange}
            disabled={isLocked}
            className={styles.hiddenInput}
            tabIndex={-1}
            aria-hidden="true"
          />

          <div
            className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ''} ${
              selectedFile ? styles.dropzoneSelected : ''
            } ${isLocked ? styles.dropzoneDisabled : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            {...(!selectedFile
              ? {
                  onKeyDown: handleKeyDown,
                  onClick: () => !isLocked && fileInputRef.current?.click(),
                  role: 'button' as const,
                  tabIndex: isLocked ? -1 : 0,
                  'aria-label':
                    'Selecionar arquivo TXT para validação. Clique ou arraste o arquivo até aqui.',
                  'aria-disabled': isLocked,
                }
              : {
                  'aria-label': `Arquivo selecionado: ${selectedFile.name} (${formatFileSizeBytes(selectedFile.size)}). Arraste um novo arquivo ou utilize os botões para trocar ou remover.`,
                })}
            data-testid="import-txt-dropzone"
          >
            {selectedFile ? (
              <div className={styles.dropzoneSelectedContent} data-testid="selected-file-card">
                <div className={styles.dropzoneIconSelected} aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="m9 15 2 2 4-4" />
                  </svg>
                </div>

                <span className={styles.fileReadyBadge}>Arquivo Pronto para Inspeção</span>

                <div className={styles.fileSelectedMeta}>
                  <span className={styles.fileName}>{selectedFile.name}</span>
                  <span className={styles.fileSize}>({formatFileSizeBytes(selectedFile.size)})</span>
                </div>

                <p className={styles.dropzoneSelectedHint}>
                  Formato <code>.txt</code> reconhecido. Clique em <strong>Validar Arquivo</strong> abaixo para iniciar a verificação linha por linha ou substitua o arquivo se desejar.
                </p>

                <div className={styles.dropzoneSelectedActions}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isLocked) fileInputRef.current?.click();
                    }}
                    disabled={isLocked}
                    className={styles.changeFileButton}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>Trocar arquivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    disabled={isLocked}
                    className={styles.removeButton}
                    aria-label="Remover arquivo selecionado"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span>Remover</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.dropzoneIcon} aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>

                <span className={styles.dropzoneLabel}>
                  Arraste o arquivo .txt homologado aqui ou <span className={styles.dropzoneBrowse}>clique para selecionar</span>
                </span>
                <p className={styles.dropzoneHelp}>
                  Validação imediata de extensão e volume • Máximo de 5 MB por submissão
                </p>
              </>
            )}
          </div>
        </div>

        {/* 4. Feedback de Erro do Formulário */}
        {activeError && (
          <div className={styles.errorAlert} role="alert" aria-live="assertive" data-testid="form-error-alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
            </svg>
            <span>{activeError}</span>
          </div>
        )}

        {/* 5. Ação de Envio para Validação */}
        <div className={styles.submitSection}>
          <p className={styles.submitHint}>
            Nenhuma alteração será gravada no banco de dados durante a validação preliminar.
          </p>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedFile || isLocked}
            className={styles.validateButton}
            aria-busy={isValidating}
            data-testid="validate-file-button"
          >
            {isValidating ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                <span>Validando arquivo...</span>
              </>
            ) : (
              <>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Validar Arquivo</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
