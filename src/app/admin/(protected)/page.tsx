/**
 * Nascentes do Cariri — Página Principal do Painel Administrativo (/admin)
 *
 * Server Component dinâmico com Defesa em Profundidade:
 * 1. Revalida sessão ativa no MySQL via `requireAdminPageSession({ nextPath: '/admin' })`
 *    (protegendo inclusive navegações parciais/soft navigation no App Router);
 * 2. Carrega os indicadores e os 5 lotes recentes diretamente via `painelService.getResumo()`
 *    (zero waterfall inicial);
 * 3. Degrada com segurança em falhas transitórias de banco sem derrubar o shell nem expor erros internos.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import { requireAdminPageSession } from '@/lib/security/admin-page-guard';
import {
  GENERIC_PAINEL_LOAD_ERROR_MESSAGE,
  painelService,
  type AdminResumoResponseDto,
} from '@/modules/painel';
import { AdminPainelView } from '@/components/admin/painel';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Painel Administrativo | Nascentes do Cariri — UFCA',
  description:
    'Visão geral operacional das nascentes ativas publicadas no mapa, situação da última importação e histórico recente de lotes.',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminDashboardPage() {
  // Guarda autoritativa fora do try/catch para preservar NEXT_REDIRECT e proteger soft navigation
  await requireAdminPageSession({ nextPath: '/admin' });

  let initialData: AdminResumoResponseDto | undefined;
  let initialError: string | undefined;

  try {
    initialData = await painelService.getResumo();
  } catch (error: unknown) {
    logger.error(
      'Falha ao carregar resumo operacional do painel administrativo (/admin).',
      error
    );
    initialError = GENERIC_PAINEL_LOAD_ERROR_MESSAGE;
  }

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
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
              VISÃO GERAL
            </span>
            <h1 className={styles.pageTitle}>Painel Administrativo</h1>
            <p className={styles.pageSubtitle}>
              Acompanhe o total de nascentes ativas publicadas no mapa público, verifique
              a situação da última importação e acesse rapidamente um novo envio ou o
              histórico completo de lotes.
            </p>
          </div>

          <Link
            href="/admin/importacoes"
            className={styles.newImportCta}
            data-testid="dashboard-new-import-cta"
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Nova Importação (.txt)</span>
          </Link>
        </div>
      </header>

      {/* Região de Indicadores e Histórico Recente */}
      <section
        className={styles.dashboardSection}
        aria-label="Resumo operacional e histórico recente de importações"
      >
        <AdminPainelView initialData={initialData} initialError={initialError} />
      </section>
    </div>
  );
}
