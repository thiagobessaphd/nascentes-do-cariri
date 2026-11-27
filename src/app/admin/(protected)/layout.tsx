import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import logoUfcaSymbol from '@/assets/images/logo_ufca.png';
import logoUfcaFull from '@/assets/images/logo_ufca-full.png';
import logoCnpq from '@/assets/images/logo_cnpq.png';
import { AdminNav } from '@/components/admin/nav';
import { requireAdminPageSession } from '@/lib/security/admin-page-guard';
import { toAdminProfileView } from '@/modules/painel/painel.contracts';
import styles from './admin-layout.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export interface AdminLayoutProps {
  readonly children: ReactNode;
}

export default async function AdminLayout({ children }: Readonly<AdminLayoutProps>) {
  const session = await requireAdminPageSession();
  const profile = toAdminProfileView(session);

  return (
    <div className={styles.adminShell} data-admin-shell="true">
      {/* Atalho de acessibilidade por teclado para o conteúdo principal */}
      <a href="#admin-main" className={styles.skipLink}>
        Pular para o conteúdo principal
      </a>

      {/* Conjunto do Cabeçalho (Barra Superior + Filete + Navegação Principal) */}
      <div className={styles.headerWrapper}>
        {/* Barra Institucional Superior Resumida */}
        <div
          className={styles.institutionalTopBar}
          role="region"
          aria-label="Identificação institucional"
        >
          <div className={styles.topBarContainer}>
            <span className={styles.topBarInstitution}>
              Universidade Federal do Cariri (UFCA)
            </span>

            <div className={styles.topBarMeta}>
              <span className={styles.restrictedBadge}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Administrativo • Mapa das Nascentes do Cariri
              </span>

              <span className={styles.topBarDivider} aria-hidden="true">
                |
              </span>

              <Link
                href="/mapa"
                className={styles.topBarMapLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir Mapa Público Interativo em nova aba"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                <span>Ver Mapa Público</span>
                <span className={styles.externalArrow} aria-hidden="true">
                  ↗
                </span>
              </Link>
            </div>
          </div>
        </div>

        {/* Filete Cromático Oficial UFCA */}
        <div className={styles.ufcaAccentStrip} aria-hidden="true" />

        {/* Cabeçalho Principal Administrativo */}
        <header className={styles.adminHeader} role="banner">
          <div className={styles.headerContainer}>
            <div className={styles.brandGroup}>
              <Link
                href="/admin"
                className={styles.brandLink}
                aria-label="Projeto Nascentes do Cariri — Visão Geral do Painel Administrativo"
              >
                <Image
                  src={logoUfcaSymbol}
                  alt=""
                  width={112}
                  height={40}
                  className={styles.headerLogoImg}
                  priority
                />

                <span className={styles.brandDivider} aria-hidden="true" />

                <span className={styles.systemIdentity}>
                  <span className={styles.systemTitle}>Projeto Nascentes do Cariri</span>
                  <span className={styles.systemSubtitle}>
                    Ciência, Território e Conservação dos Recursos Hídricos
                  </span>
                </span>
              </Link>
            </div>

            {/* Navegação Principal e Identidade do Administrador Autenticado */}
            <div className={styles.headerControls}>
              <nav aria-label="Navegação Administrativa" className={styles.adminNav}>
                <AdminNav />
              </nav>

              <div className={styles.navDivider} aria-hidden="true" />

              {/* Perfil do Usuário Autenticado + Gancho Reservado de Logout (Task-32) */}
              <div
                className={styles.userProfileArea}
                role="group"
                aria-label="Perfil do usuário conectado"
              >
                <div className={styles.userAvatar} aria-hidden="true">
                  {profile.iniciais}
                </div>

                <div className={styles.userInfo}>
                  <span className={styles.userName} title={profile.nome}>
                    {profile.nome}
                  </span>
                  <span className={styles.userEmail} title={profile.email}>
                    {profile.email}
                  </span>
                </div>

                <button
                  type="button"
                  className={styles.logoutButton}
                  data-testid="admin-logout-button"
                  aria-disabled="true"
                  title="Encerramento de sessão disponível em breve"
                  aria-label="Sair da conta administrativa (indisponível temporariamente)"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span className={styles.logoutLabel}>Sair</span>
                </button>
              </div>
            </div>
          </div>
        </header>
      </div>

      {/* Região Principal */}
      <main id="admin-main" className={styles.adminMain} tabIndex={-1}>
        {children}
      </main>

      {/* Rodapé Institucional Completo com Logo UFCA na esquerda e Dados na direita */}
      <footer className={styles.adminFooter} role="contentinfo">
        <div className={styles.footerContainer}>
          <div className={styles.footerLogoWrapper}>
            <Image
              src={logoUfcaFull}
              alt="Logotipo da Universidade Federal do Cariri (UFCA)"
              width={116}
              height={116}
              className={styles.footerLogoImg}
            />
            <div className={styles.footerLogoDivider} aria-hidden="true" />
            <Image
              src={logoCnpq}
              alt="Logotipo do CNPq — Conselho Nacional de Desenvolvimento Científico e Tecnológico"
              width={116}
              height={116}
              className={styles.footerLogoImg}
            />
          </div>

          <div className={styles.footerInfoArea}>
            <p className={styles.footerUniversityName}>
              UNIVERSIDADE FEDERAL DO CARIRI (UFCA)
            </p>
            <p className={styles.footerProjectName}>
              Gestão e Catalogação das Nascentes do Cariri
            </p>
            <p className={styles.footerDepartment}>
              Pesquisa • Monitoramento • Gestão dos Recursos Hídricos
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
