import type { Metadata } from 'next';
import { ImportacaoWorkspace } from '@/components/admin/importacoes';
import styles from './importacoes.module.css';

export const metadata: Metadata = {
  title: 'Importação e Validação de Nascentes | Painel Administrativo — UFCA',
  description:
    'Verificação linha por linha, prévia de conferência e atualização segura da base de nascentes no mapa do Cariri cearense.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ImportacoesAdminPage() {
  return (
    <div className={styles.pageContainer}>
      {/* Cabeçalho Semântico da Página (Único H1 do Documento) */}
      <header className={styles.pageHeader}>
        <div className={styles.headerTopRow}>
          <div className={styles.titleArea}>
            <span className={styles.moduleOverline}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              GESTÃO DA BASE CARTOGRÁFICA
            </span>
            <h1 className={styles.pageTitle}>
              Importação e Validação de Nascentes
            </h1>
            <p className={styles.pageSubtitle}>
              Envie a planilha de campo para atualizar os dados do mapa com segurança: o sistema verifica o arquivo linha por linha, exibe uma prévia completa para sua conferência antes da publicação e adiciona apenas os registros novos, sem risco de apagar ou duplicar os dados já cadastrados.
            </p>
          </div>
        </div>
      </header>

      {/* Região do Workspace Operacional */}
      <section
        className={styles.workspaceSection}
        aria-label="Área de trabalho de importação e prévia"
      >
        <ImportacaoWorkspace />
      </section>
    </div>
  );
}
