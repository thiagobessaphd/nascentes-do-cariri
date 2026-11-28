import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPageSession } from '@/lib/security/admin-page-guard';
import {
  DEFAULT_HISTORY_PAGE,
  IMPORTACAO_STATUS_VALUES,
  MAX_HISTORY_PAGE_SIZE,
  type ImportacaoStatus,
} from '@/modules/importacoes/importacoes.contracts';
import { ImportacaoHistoryView } from '@/components/admin/importacoes';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Histórico de Importações | Painel Administrativo — UFCA',
  description:
    'Auditoria completa dos envios de arquivos TXT, responsáveis, totais processados, status e retomada de importações pendentes.',
  robots: {
    index: false,
    follow: false,
  },
};

export interface ImportacoesHistoryPageProps {
  readonly searchParams?:
    | Promise<{
        readonly page?: string | string[];
        readonly pageSize?: string | string[];
        readonly limit?: string | string[];
        readonly status?: string | string[];
      }>
    | undefined;
}

function parseOptionalPageParam(rawPage: string | string[] | undefined): number {
  const candidate = Array.isArray(rawPage) ? rawPage[0] : rawPage;
  if (!candidate || !/^[1-9]\d*$/.test(candidate.trim())) {
    return DEFAULT_HISTORY_PAGE;
  }
  const parsed = Number(candidate.trim());
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_HISTORY_PAGE;
}

const DEFAULT_HISTORY_UI_PAGE_SIZE = 5 as const;

function parseOptionalPageSizeParam(
  rawPageSize: string | string[] | undefined,
  rawLimit: string | string[] | undefined
): number {
  const candidate = Array.isArray(rawPageSize)
    ? rawPageSize[0]
    : rawPageSize ?? (Array.isArray(rawLimit) ? rawLimit[0] : rawLimit);
  if (!candidate || !/^[1-9]\d*$/.test(candidate.trim())) {
    return DEFAULT_HISTORY_UI_PAGE_SIZE;
  }
  const parsed = Number(candidate.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_HISTORY_PAGE_SIZE) {
    return DEFAULT_HISTORY_UI_PAGE_SIZE;
  }
  return parsed;
}

function parseOptionalStatusParam(
  rawStatus: string | string[] | undefined
): ImportacaoStatus | undefined {
  const candidate = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
  if (!candidate) return undefined;
  const trimmed = candidate.trim();
  return (IMPORTACAO_STATUS_VALUES as readonly string[]).includes(trimmed)
    ? (trimmed as ImportacaoStatus)
    : undefined;
}

export default async function ImportacoesHistoryPage({
  searchParams,
}: ImportacoesHistoryPageProps) {
  const session = await requireAdminPageSession({
    nextPath: '/admin/importacoes/historico',
  });
  const resolvedParams = searchParams ? await searchParams : undefined;
  const initialPage = parseOptionalPageParam(resolvedParams?.page);
  const initialPageSize = parseOptionalPageSizeParam(
    resolvedParams?.pageSize,
    resolvedParams?.limit
  );
  const initialStatus = parseOptionalStatusParam(resolvedParams?.status);
  const currentUserId = session.id;

  return (
    <div className={styles.pageContainer}>
      {/* Cabeçalho Semântico da Página (Único H1 do Documento) */}
      <header className={styles.pageHeader}>
        <div className={styles.headerTopRow}>
          <div className={styles.titleArea}>
            <span className={styles.moduleOverline}>
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
                <polyline points="12 6 12 12 16 14" />
              </svg>
              AUDITORIA E RASTREABILIDADE
            </span>
            <h1 className={styles.pageTitle}>Histórico de Importações</h1>
            <p className={styles.pageSubtitle}>
              Consulte todos os lotes enviados para atualização das nascentes, acompanhe
              responsáveis, datas, totais e falhas de validação, ou retome a conferência de
              importações que ainda aguardam confirmação.
            </p>
          </div>

          <Link href="/admin/importacoes" className={styles.newImportCta}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Nova Importação (.txt)</span>
          </Link>
        </div>
      </header>

      {/* Região Principal da Listagem */}
      <section
        className={styles.historySection}
        aria-label="Listagem e filtros do histórico de importações"
      >
        <ImportacaoHistoryView
          currentUserId={currentUserId}
          initialPage={initialPage}
          initialPageSize={initialPageSize}
          initialStatus={initialStatus}
        />
      </section>
    </div>
  );
}
