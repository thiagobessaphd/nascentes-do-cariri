'use client';

/**
 * Nascentes do Cariri — Visão Interativa do Histórico de Importações
 *
 * Consome GET /api/admin/importacoes com filtragem por status, paginação determinística,
 * exibição híbrida responsiva (tabela no desktop e cards em dispositivos móveis),
 * controle de ownership para lotes pendentes
 * e garantia estrita de que não existe confirmação direta nem exposição de caminhos internos.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import Link from 'next/link';
import {
  DEFAULT_HISTORY_PAGE,
  DEFAULT_HISTORY_PAGE_SIZE,
  IMPORTACAO_STATUS_VALUES,
  type ImportacaoHistoryItemDto,
  type ImportacaoHistoryListResponseDto,
  type ImportacaoStatus,
} from '@/modules/importacoes/importacoes.contracts';
import {
  cancelImportacaoById,
  canBackToAnalyzeImportacao,
  canCancelPendingImportacao,
  clearPreviewSessionIfId,
  fetchImportacoesHistory,
  formatDateTimePtBr,
  formatImportacaoStatusLabel,
  getImportacaoStatusMeta,
} from '@/services/importacoes.client';
import ImportStatusBadge from '../status-badge/ImportStatusBadge';
import ImportCancelModal from '../cancel-modal/ImportCancelModal';
import styles from './ImportacaoHistoryView.module.css';

export interface ImportacaoHistoryViewProps {
  readonly currentUserId?: number | null | undefined;
  readonly authToken?: string | undefined;
  readonly initialPage?: number | undefined;
  readonly initialStatus?: ImportacaoStatus | undefined;
  readonly initialData?: ImportacaoHistoryListResponseDto | undefined;
  readonly initialError?: string | undefined;
}

type ImportacaoStatusTone = ReturnType<typeof getImportacaoStatusMeta>['tone'];

interface StatusFilterOption {
  readonly value: ImportacaoStatus | '';
  readonly label: string;
  readonly tone: ImportacaoStatusTone | null;
}

const STATUS_FILTER_OPTIONS: readonly StatusFilterOption[] = [
  { value: '', label: 'Todos os status', tone: null },
  ...IMPORTACAO_STATUS_VALUES.map((statusValue) => {
    const meta = getImportacaoStatusMeta(statusValue);
    return {
      value: statusValue,
      label: meta.label,
      tone: meta.tone,
    };
  }),
];

const STATUS_DOT_CLASS_MAP: Record<ImportacaoStatus, string | undefined> = {
  VALIDANDO: styles.toneDotValidating,
  AGUARDANDO_CONFIRMACAO: styles.toneDotWarning,
  PROCESSANDO: styles.toneDotProcessing,
  CONCLUIDA: styles.toneDotSuccess,
  FALHOU: styles.toneDotDanger,
  CANCELADA: styles.toneDotNeutral,
};

type HistoryAsyncState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'success'; readonly response: ImportacaoHistoryListResponseDto }
  | { readonly kind: 'error'; readonly message: string };

interface CancelTargetState {
  readonly item: ImportacaoHistoryItemDto;
}

function syncHistoryQueryParams(page: number, status?: ImportacaoStatus): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (page > 1) {
    url.searchParams.set('page', String(page));
  } else {
    url.searchParams.delete('page');
  }

  if (status) {
    url.searchParams.set('status', status);
  } else {
    url.searchParams.delete('status');
  }

  const nextUrl = `${url.pathname}${url.search ? url.search : ''}`;
  window.history.replaceState(null, '', nextUrl);
}

function buildResultCountText(
  state: HistoryAsyncState,
  statusFilter?: ImportacaoStatus
): string {
  if (state.kind === 'loading') {
    return 'Carregando histórico de importações...';
  }
  if (state.kind === 'error') {
    return 'Não foi possível consultar o histórico de importações.';
  }

  const { data, meta } = state.response;
  if (meta.totalItems === 0) {
    return statusFilter
      ? 'Nenhuma importação encontrada para o filtro selecionado.'
      : 'Nenhuma importação registrada até o momento.';
  }

  const start = (meta.page - 1) * meta.pageSize + 1;
  const end = start + data.length - 1;
  const suffix = statusFilter
    ? ` com status "${formatImportacaoStatusLabel(statusFilter)}"`
    : '';
  return `Exibindo ${start}–${end} de ${meta.totalItems} importações${suffix}`;
}

export default function ImportacaoHistoryView({
  currentUserId = null,
  authToken,
  initialPage = DEFAULT_HISTORY_PAGE,
  initialStatus,
  initialData,
  initialError,
}: ImportacaoHistoryViewProps) {
  const [page, setPage] = useState<number>(initialPage >= 1 ? initialPage : 1);
  const [statusFilter, setStatusFilter] = useState<ImportacaoStatus | undefined>(
    initialStatus
  );
  const [state, setState] = useState<HistoryAsyncState>(() => {
    if (initialError) {
      return { kind: 'error', message: initialError };
    }
    if (initialData) {
      return { kind: 'success', response: initialData };
    }
    return { kind: 'loading' };
  });

  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelTargetState | null>(null);
  const [isCanceling, setIsCanceling] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const shouldSkipInitialFetchRef = useRef<boolean>(
    initialData !== undefined || initialError !== undefined
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLUListElement | null>(null);

  const loadHistory = useCallback(
    async (targetPage: number, targetStatus?: ImportacaoStatus) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setState({ kind: 'loading' });

      try {
        const response = await fetchImportacoesHistory(
          {
            page: targetPage,
            pageSize: DEFAULT_HISTORY_PAGE_SIZE,
            ...(targetStatus !== undefined ? { status: targetStatus } : {}),
          },
          {
            authToken,
            signal: controller.signal,
          }
        );
        setState({ kind: 'success', response });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Falha inesperada ao carregar o histórico de importações.';
        setState({ kind: 'error', message });
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [authToken]
  );

  useEffect(() => {
    if (shouldSkipInitialFetchRef.current) {
      shouldSkipInitialFetchRef.current = false;
      return;
    }

    void loadHistory(page, statusFilter);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadHistory, page, statusFilter]);

  useEffect(() => {
    if (!isDropdownOpen) return;

    function handleOutsidePointer(event: MouseEvent | TouchEvent) {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsidePointer);
    document.addEventListener('touchstart', handleOutsidePointer);

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('touchstart', handleOutsidePointer);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isDropdownOpen || !listboxRef.current) return;
    const optionEl = listboxRef.current.children[highlightedIndex];
    if (optionEl instanceof HTMLElement && typeof optionEl.scrollIntoView === 'function') {
      optionEl.scrollIntoView({ block: 'nearest' });
    }
  }, [isDropdownOpen, highlightedIndex]);

  const currentOptionIndex = STATUS_FILTER_OPTIONS.findIndex(
    (option) => option.value === (statusFilter ?? '')
  );
  const selectedOption =
    STATUS_FILTER_OPTIONS[currentOptionIndex >= 0 ? currentOptionIndex : 0] ??
    STATUS_FILTER_OPTIONS[0];

  function handleSelectStatusOption(rawValue: ImportacaoStatus | '') {
    const nextStatus = rawValue === '' ? undefined : rawValue;

    setActionNotice(null);
    setPage(1);
    setStatusFilter(nextStatus);
    syncHistoryQueryParams(1, nextStatus);
    setIsDropdownOpen(false);
    triggerButtonRef.current?.focus();
  }

  function handleToggleDropdown() {
    setIsDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setHighlightedIndex(currentOptionIndex >= 0 ? currentOptionIndex : 0);
      }
      return next;
    });
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const total = STATUS_FILTER_OPTIONS.length;

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!isDropdownOpen) {
          setIsDropdownOpen(true);
          setHighlightedIndex(currentOptionIndex >= 0 ? currentOptionIndex : 0);
        } else {
          setHighlightedIndex((prev) => (prev + 1) % total);
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!isDropdownOpen) {
          setIsDropdownOpen(true);
          setHighlightedIndex(currentOptionIndex >= 0 ? currentOptionIndex : 0);
        } else {
          setHighlightedIndex((prev) => (prev - 1 + total) % total);
        }
        break;
      }
      case 'Home': {
        if (isDropdownOpen) {
          event.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      }
      case 'End': {
        if (isDropdownOpen) {
          event.preventDefault();
          setHighlightedIndex(total - 1);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (isDropdownOpen) {
          const chosen = STATUS_FILTER_OPTIONS[highlightedIndex];
          if (chosen) {
            handleSelectStatusOption(chosen.value);
          }
        } else {
          setIsDropdownOpen(true);
          setHighlightedIndex(currentOptionIndex >= 0 ? currentOptionIndex : 0);
        }
        break;
      }
      case 'Escape': {
        if (isDropdownOpen) {
          event.preventDefault();
          setIsDropdownOpen(false);
        }
        break;
      }
      case 'Tab': {
        if (isDropdownOpen) {
          setIsDropdownOpen(false);
        }
        break;
      }
    }
  }

  function handleClearFilter() {
    setActionNotice(null);
    setPage(1);
    setStatusFilter(undefined);
    setIsDropdownOpen(false);
    syncHistoryQueryParams(1, undefined);
  }

  function handlePageChange(nextPage: number) {
    setActionNotice(null);
    setPage(nextPage);
    syncHistoryQueryParams(nextPage, statusFilter);
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      const prefersReducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  }

  function openCancelModal(
    item: ImportacaoHistoryItemDto,
    triggerButton: HTMLButtonElement | null
  ) {
    cancelTriggerRef.current = triggerButton;
    setCancelError(null);
    setCancelTarget({ item });
  }

  function closeCancelModal() {
    if (isCanceling) return;
    setCancelError(null);
    setCancelTarget(null);
  }

  async function handleConfirmCancel() {
    if (!cancelTarget || isCanceling) return;

    setIsCanceling(true);
    setCancelError(null);

    try {
      const targetId = cancelTarget.item.id;
      const targetName = cancelTarget.item.nomeArquivo;

      await cancelImportacaoById(targetId, { authToken });
      clearPreviewSessionIfId(targetId);

      setCancelTarget(null);
      setActionNotice(
        `Lote #${targetId} (${targetName}) cancelado com sucesso. O arquivo original permanece preservado para auditoria.`
      );
      await loadHistory(page, statusFilter);
      window.setTimeout(() => {
        noticeRef.current?.focus({ preventScroll: true });
      }, 0);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível cancelar a importação selecionada.';
      setCancelError(message);
    } finally {
      setIsCanceling(false);
    }
  }

  const countText = buildResultCountText(state, statusFilter);
  const selectedDisplayLabel = selectedOption?.label ?? 'Todos os status';
  const selectedToneClass =
    selectedOption !== undefined && selectedOption.value !== ''
      ? STATUS_DOT_CLASS_MAP[selectedOption.value]
      : undefined;

  const selectControlClassNames = [
    styles.selectControl,
    isDropdownOpen ? styles.selectControlOpen : '',
    statusFilter !== undefined ? styles.selectControlActive : '',
  ]
    .filter(Boolean)
    .join(' ');

  const chevronClassNames = [
    styles.selectChevron,
    isDropdownOpen ? styles.selectChevronOpen : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.wrapper} data-testid="importacao-history-view">
      {/* Barra de Filtros e Anúncio de Resultados */}
      <section className={styles.filterBar} aria-label="Filtros do histórico de importações">
        <div className={styles.filterControls}>
          <div className={styles.fieldGroup} ref={dropdownContainerRef}>
            <label
              id="history-status-filter-label"
              htmlFor="history-status-filter"
              className={styles.filterLabel}
            >
              Filtrar por status
            </label>
            <div className={styles.inputWrapper}>
              <span className={styles.fieldIcon} aria-hidden="true">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
              </span>

              <button
                ref={triggerButtonRef}
                id="history-status-filter"
                type="button"
                role="combobox"
                aria-autocomplete="none"
                aria-haspopup="listbox"
                aria-expanded={isDropdownOpen}
                aria-controls="history-status-filter-listbox"
                aria-labelledby="history-status-filter-label history-status-filter"
                aria-activedescendant={
                  isDropdownOpen
                    ? `history-status-opt-${highlightedIndex}`
                    : undefined
                }
                onClick={handleToggleDropdown}
                onKeyDown={handleTriggerKeyDown}
                className={selectControlClassNames}
                data-testid="history-status-filter"
              >
                {selectedToneClass && (
                  <span
                    className={`${styles.toneDot} ${selectedToneClass}`}
                    aria-hidden="true"
                  />
                )}
                <span className={styles.selectValueText}>
                  {selectedDisplayLabel}
                </span>
              </button>

              <span className={chevronClassNames} aria-hidden="true">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>

              {isDropdownOpen && (
                <ul
                  ref={listboxRef}
                  id="history-status-filter-listbox"
                  role="listbox"
                  aria-labelledby="history-status-filter-label"
                  className={styles.dropdownMenu}
                  data-testid="history-status-filter-listbox"
                >
                  {STATUS_FILTER_OPTIONS.map((option, index) => {
                    const isSelected = option.value === (statusFilter ?? '');
                    const isHighlighted = index === highlightedIndex;
                    const optionToneClass =
                      option.value !== ''
                        ? STATUS_DOT_CLASS_MAP[option.value]
                        : styles.toneDotAll;

                    const optionClassNames = [
                      styles.dropdownOption,
                      isSelected ? styles.dropdownOptionSelected : '',
                      isHighlighted ? styles.dropdownOptionHighlighted : '',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <li
                        key={option.value || '__all__'}
                        id={`history-status-opt-${index}`}
                        role="option"
                        aria-selected={isSelected}
                        className={optionClassNames}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelectStatusOption(option.value)}
                        data-testid={
                          option.value
                            ? `history-status-option-${option.value}`
                            : 'history-status-option-all'
                        }
                      >
                        <span
                          className={`${styles.toneDot} ${optionToneClass ?? ''}`}
                          aria-hidden="true"
                        />
                        <span className={styles.dropdownOptionLabel}>
                          {option.label}
                        </span>
                        {isSelected && (
                          <svg
                            className={styles.dropdownOptionCheck}
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {statusFilter !== undefined && (
            <button
              type="button"
              className={styles.clearFilterButton}
              onClick={handleClearFilter}
              data-testid="history-clear-filter"
            >
              Limpar filtro
            </button>
          )}
        </div>

        <p
          className={styles.resultCount}
          aria-live="polite"
          aria-atomic="true"
          data-testid="history-result-count"
        >
          {countText}
        </p>
      </section>

      {/* Aviso de Cancelamento Concluído */}
      {actionNotice && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          className={styles.successBanner}
          role="status"
          aria-live="polite"
          data-testid="history-action-notice"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Estado de Carregamento (Skeleton) */}
      {state.kind === 'loading' && (
        <section
          className={styles.loadingCard}
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-testid="history-loading-state"
        >
          <div className={styles.loadingHeader}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>Carregando histórico de importações...</span>
          </div>
          <div className={styles.skeletonList} aria-hidden="true">
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
          </div>
        </section>
      )}

      {/* Estado de Erro na API */}
      {state.kind === 'error' && (
        <section
          className={styles.errorCard}
          role="alert"
          aria-live="assertive"
          data-testid="history-error-state"
        >
          <div className={styles.errorHeader}>
            <svg
              width="20"
              height="20"
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
            <h2 className={styles.stateTitle}>Não foi possível carregar o histórico</h2>
          </div>
          <p className={styles.stateDescription}>{state.message}</p>
          <div className={styles.stateActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                void loadHistory(page, statusFilter);
              }}
              data-testid="history-retry-button"
            >
              Tentar novamente
            </button>
          </div>
        </section>
      )}

      {/* Estado Vazio (Base sem lotes vs Filtro sem correspondência) */}
      {state.kind === 'success' && state.response.data.length === 0 && (
        <section
          className={styles.emptyCard}
          role="status"
          aria-live="polite"
          data-testid="history-empty-state"
        >
          <div className={styles.emptyIcon} aria-hidden="true">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className={styles.stateTitle}>
            {statusFilter
              ? `Nenhuma importação com status "${formatImportacaoStatusLabel(statusFilter)}"`
              : 'Nenhuma importação registrada ainda'}
          </h2>
          <p className={styles.stateDescription}>
            {statusFilter
              ? 'Não encontramos lotes correspondentes ao status selecionado. Limpe o filtro para visualizar todos os envios.'
              : 'Todo arquivo .txt enviado para validação ficará registrado aqui com autor, datas, totais e situação final para auditoria.'}
          </p>
          <div className={styles.stateActions}>
            {statusFilter ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleClearFilter}
                data-testid="history-empty-clear-filter"
              >
                Limpar filtro
              </button>
            ) : (
              <Link href="/admin/importacoes" className={styles.primaryLink}>
                Nova Importação (.txt)
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Listagem Populada — Tabela Desktop + Cards Mobile */}
      {state.kind === 'success' && state.response.data.length > 0 && (
        <>
          {/* Tabela Semântica para Desktop (> 768px) */}
          <div className={styles.desktopTableCard}>
            <div className={styles.tableScrollContainer}>
              <table className={styles.table} data-testid="history-desktop-table">
                <caption className={styles.srOnly}>
                  Histórico administrativo das importações de arquivos TXT
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Arquivo e Assinatura</th>
                    <th scope="col">Administrador</th>
                    <th scope="col">Datas</th>
                    <th scope="col">Resumo de Linhas</th>
                    <th scope="col">Status</th>
                    <th scope="col">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {state.response.data.map((item) => {
                    const isOwner =
                      currentUserId !== null && item.usuario.id === currentUserId;
                    const showAnalyze = canBackToAnalyzeImportacao({
                      status: item.status,
                      isOwner,
                    });
                    const showCancel = canCancelPendingImportacao({
                      status: item.status,
                      isOwner,
                    });

                    return (
                      <tr key={item.id} data-testid={`history-row-${item.id}`}>
                        <td>
                          <div className={styles.fileCell}>
                            <span className={styles.fileName}>{item.nomeArquivo}</span>
                            <div className={styles.fileSubMeta}>
                              <span className={styles.lotIdTag}>Lote #{item.id}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.authorCell}>
                            <span className={styles.authorName}>{item.usuario.nome}</span>
                            <span className={styles.authorEmail}>{item.usuario.email}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.datesCell}>
                            <span className={styles.datePrimary}>
                              {formatDateTimePtBr(item.createdAt)}
                            </span>
                            <span className={styles.dateSecondary}>
                              {item.concluidaAt
                                ? `Finalizada em ${formatDateTimePtBr(item.concluidaAt)}`
                                : 'Sem conclusão'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.totalsGrid}>
                            <span className={styles.totalItem}>
                              Lidas: <strong>{item.totalLinhas}</strong>
                            </span>
                            <span
                              className={`${styles.totalItem} ${item.totalValidas > 0 ? styles.totalValid : ''}`}
                            >
                              Válidas: <strong>{item.totalValidas}</strong>
                            </span>
                            <span
                              className={`${styles.totalItem} ${item.totalDuplicadas > 0 ? styles.totalDuplicate : ''}`}
                            >
                              Dupl.: <strong>{item.totalDuplicadas}</strong>
                            </span>
                            <span
                              className={`${styles.totalItem} ${item.totalInvalidas > 0 ? styles.totalInvalid : ''}`}
                            >
                              Erros: <strong>{item.totalInvalidas}</strong>
                            </span>
                          </div>
                        </td>
                        <td>
                          <ImportStatusBadge status={item.status} size="sm" />
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <Link
                              href={`/admin/importacoes/${item.id}`}
                              className={styles.detailLinkButton}
                              data-testid={`history-detail-link-${item.id}`}
                            >
                              Ver detalhes
                            </Link>

                            {showAnalyze && (
                              <Link
                                href={`/admin/importacoes?importacaoId=${item.id}`}
                                className={styles.analyzeLinkButton}
                                data-testid={`history-analyze-link-${item.id}`}
                              >
                                Voltar para analisar
                              </Link>
                            )}

                            {showCancel && (
                              <button
                                type="button"
                                className={styles.cancelRowButton}
                                aria-label={`Cancelar importação ${item.nomeArquivo}`}
                                onClick={(event) =>
                                  openCancelModal(item, event.currentTarget)
                                }
                                data-testid={`history-cancel-button-${item.id}`}
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lista em Cards para Dispositivos Móveis (<= 768px) */}
          <ul
            className={styles.mobileCardsList}
            aria-label="Lista de importações em formato compacto"
            data-testid="history-mobile-list"
          >
            {state.response.data.map((item) => {
              const isOwner = currentUserId !== null && item.usuario.id === currentUserId;
              const showAnalyze = canBackToAnalyzeImportacao({
                status: item.status,
                isOwner,
              });
              const showCancel = canCancelPendingImportacao({
                status: item.status,
                isOwner,
              });

              return (
                <li key={item.id} className={styles.mobileCardItem}>
                  <article
                    className={styles.mobileCard}
                    data-testid={`history-mobile-card-${item.id}`}
                  >
                    <header className={styles.mobileCardHeader}>
                      <div className={styles.mobileTitleGroup}>
                        <span className={styles.lotIdTag}>Lote #{item.id}</span>
                        <h3 className={styles.mobileFileName}>{item.nomeArquivo}</h3>
                      </div>
                      <ImportStatusBadge status={item.status} size="sm" />
                    </header>

                    <div className={styles.mobileMetaList}>
                      <div className={styles.mobileMetaRow}>
                        <span className={styles.mobileMetaLabel}>Administrador:</span>
                        <span className={styles.mobileMetaValue}>
                          {item.usuario.nome} ({item.usuario.email})
                        </span>
                      </div>
                      <div className={styles.mobileMetaRow}>
                        <span className={styles.mobileMetaLabel}>Enviada em:</span>
                        <span className={`${styles.mobileMetaValue} ${styles.tabularNum}`}>
                          {formatDateTimePtBr(item.createdAt)}
                        </span>
                      </div>
                      <div className={styles.mobileMetaRow}>
                        <span className={styles.mobileMetaLabel}>Conclusão:</span>
                        <span className={`${styles.mobileMetaValue} ${styles.tabularNum}`}>
                          {formatDateTimePtBr(item.concluidaAt, 'Em aberto')}
                        </span>
                      </div>
                    </div>

                    <div className={styles.mobileTotalsGrid}>
                      <div className={styles.mobileTotalBox}>
                        <span className={styles.mobileTotalLabel}>Lidas</span>
                        <span className={styles.mobileTotalNum}>{item.totalLinhas}</span>
                      </div>
                      <div className={styles.mobileTotalBox}>
                        <span className={styles.mobileTotalLabel}>Válidas</span>
                        <span
                          className={`${styles.mobileTotalNum} ${item.totalValidas > 0 ? styles.totalValid : ''}`}
                        >
                          {item.totalValidas}
                        </span>
                      </div>
                      <div className={styles.mobileTotalBox}>
                        <span className={styles.mobileTotalLabel}>Duplicadas</span>
                        <span
                          className={`${styles.mobileTotalNum} ${item.totalDuplicadas > 0 ? styles.totalDuplicate : ''}`}
                        >
                          {item.totalDuplicadas}
                        </span>
                      </div>
                      <div className={styles.mobileTotalBox}>
                        <span className={styles.mobileTotalLabel}>Erros</span>
                        <span
                          className={`${styles.mobileTotalNum} ${item.totalInvalidas > 0 ? styles.totalInvalid : ''}`}
                        >
                          {item.totalInvalidas}
                        </span>
                      </div>
                    </div>

                    <footer className={styles.mobileCardActions}>
                      <Link
                        href={`/admin/importacoes/${item.id}`}
                        className={styles.detailLinkButton}
                      >
                        Ver detalhes
                      </Link>

                      {showAnalyze && (
                        <Link
                          href={`/admin/importacoes?importacaoId=${item.id}`}
                          className={styles.analyzeLinkButton}
                        >
                          Voltar para analisar
                        </Link>
                      )}

                      {showCancel && (
                        <button
                          type="button"
                          className={styles.cancelRowButton}
                          aria-label={`Cancelar importação ${item.nomeArquivo}`}
                          onClick={(event) => openCancelModal(item, event.currentTarget)}
                        >
                          Cancelar
                        </button>
                      )}
                    </footer>
                  </article>
                </li>
              );
            })}
          </ul>

          {/* Controles de Paginação */}
          {state.response.meta.totalPages > 1 && (
            <nav
              className={styles.pagination}
              aria-label="Paginação do histórico de importações"
              data-testid="history-pagination"
            >
              <span className={styles.paginationInfo}>
                Página {state.response.meta.page} de {state.response.meta.totalPages} (
                {state.response.meta.totalItems} registros)
              </span>

              <div className={styles.paginationButtons}>
                <button
                  type="button"
                  className={styles.pageButton}
                  disabled={!state.response.meta.hasPreviousPage}
                  onClick={() => handlePageChange(state.response.meta.page - 1)}
                  data-testid="history-prev-page"
                >
                  Anterior
                </button>

                <button
                  type="button"
                  className={styles.pageButton}
                  disabled={!state.response.meta.hasNextPage}
                  onClick={() => handlePageChange(state.response.meta.page + 1)}
                  data-testid="history-next-page"
                >
                  Próxima
                </button>
              </div>
            </nav>
          )}
        </>
      )}

      {/* Modal Acessível de Confirmação de Cancelamento */}
      <ImportCancelModal
        isOpen={cancelTarget !== null}
        importacaoId={cancelTarget?.item.id ?? null}
        nomeArquivo={cancelTarget?.item.nomeArquivo ?? ''}
        isCanceling={isCanceling}
        errorMessage={cancelError}
        onConfirmCancel={handleConfirmCancel}
        onClose={closeCancelModal}
        triggerRef={cancelTriggerRef}
      />
    </div>
  );
}
