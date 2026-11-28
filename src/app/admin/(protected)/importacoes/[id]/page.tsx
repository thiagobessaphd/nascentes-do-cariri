import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ImportacaoDetailView } from '@/components/admin/importacoes';
import { requireAdminPageSession } from '@/lib/security/admin-page-guard';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Detalhes da Importação | Painel Administrativo — UFCA',
  description:
    'Inspeção detalhada de metadados, assinatura SHA-256, totais processados, diagnóstico de erros e gestão de lote pendente.',
  robots: {
    index: false,
    follow: false,
  },
};

export interface ImportacaoDetailPageProps {
  readonly params: Promise<{
    readonly id: string;
  }>;
}

const STRICT_POSITIVE_INT_REGEX = /^[1-9]\d*$/;

function parseDetailRouteId(rawId: string): number | null {
  const trimmed = rawId.trim();
  if (!STRICT_POSITIVE_INT_REGEX.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export default async function ImportacaoDetailPage({
  params,
}: ImportacaoDetailPageProps) {
  const { id } = await params;
  const importacaoId = parseDetailRouteId(id);

  await requireAdminPageSession({
    nextPath:
      importacaoId !== null
        ? `/admin/importacoes/${importacaoId}`
        : '/admin/importacoes/historico',
  });

  if (importacaoId === null) {
    notFound();
  }

  return (
    <div className={styles.pageContainer}>
      <ImportacaoDetailView importacaoId={importacaoId} />
    </div>
  );
}
