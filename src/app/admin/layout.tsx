import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import logoUfcaSymbol from '@/assets/images/logo_ufca.png';
import logoUfcaFull from '@/assets/images/logo_ufca-full.png';
import logoCnpq from '@/assets/images/logo_cnpq.png';
import styles from './admin-layout.module.css';

export interface AdminLayoutProps {
  readonly children: ReactNode;
}

export default function AdminLayout({ children }: Readonly<AdminLayoutProps>) {
  return (
    <div className={styles.adminShell}>
      {/* Barra Institucional Superior Resumida */}
      <div
        className={styles.institutionalTopBar}
        role="region"
        aria-label="Identificação institucional"
      >
        <div className={styles.topBarContainer}>
          <span className={styles.topBarInstitution}>
            Universidade Federal do Cariri — UFCA
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
              href="/admin/importacoes"
              className={styles.logoLink}
              aria-label="Universidade Federal do Cariri — Página inicial da administração"
            >
              <Image
                src={logoUfcaSymbol}
                alt="Símbolo da Universidade Federal do Cariri (UFCA)"
                width={112}
                height={40}
                className={styles.headerLogoImg}
                priority
              />
            </Link>

            <div className={styles.brandDivider} aria-hidden="true" />

            <div className={styles.systemIdentity}>
              <Link href="/admin/importacoes" className={styles.systemTitleLink}>
                Projeto Nascentes do Cariri
              </Link>
              <span className={styles.systemSubtitle}>
                Ciência, Território e Conservação dos Recursos Hídricos
              </span>
            </div>
          </div>

          {/* Menu de Navegação Formal + Ação de Destaque para o Mapa */}
          <nav aria-label="Navegação Administrativa" className={styles.adminNav}>
            <ul className={styles.navMenuList}>
              <li className={styles.navMenuItem}>
                <Link href="/admin" className={styles.navMenuLink}>
                  Visão Geral
                </Link>
              </li>
              <li className={styles.navMenuItem}>
                <Link href="/admin/nascentes" className={styles.navMenuLink}>
                  Nascentes
                </Link>
              </li>
              <li className={styles.navMenuItem}>
                <Link
                  href="/admin/importacoes"
                  className={styles.navMenuLinkActive}
                  aria-current="page"
                >
                  Importação de Dados
                </Link>
              </li>
              <li className={styles.navMenuItem}>
                <Link href="/admin/historico" className={styles.navMenuLink}>
                  Histórico de Lotes
                </Link>
              </li>
            </ul>

            <div className={styles.navDivider} aria-hidden="true" />

            {/* Placeholder de Perfil do Usuário Administrativo */}
            <div className={styles.userProfileArea} aria-label="Perfil do usuário conectado">
              <div className={styles.userAvatar} aria-hidden="true">
                TB
              </div>

              <div className={styles.userInfo}>
                <span className={styles.userName}>Thiago Bessa</span>
                <span className={styles.userEmail}>thiago.bessa@ufca.edu.br</span>
              </div>

              <button
                type="button"
                className={styles.logoutButton}
                title="Encerrar sessão"
                aria-label="Sair da conta administrativa"
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
          </nav>
        </div>
      </header>

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
              width={72}
              height={72}
              className={styles.footerLogoImg}
            />
            <div className={styles.footerLogoDivider} aria-hidden="true" />
            <Image
              src={logoCnpq}
              alt="Logotipo do CNPq — Conselho Nacional de Desenvolvimento Científico e Tecnológico"
              width={72}
              height={72}
              className={styles.footerLogoImg}
            />
          </div>

          <div className={styles.footerInfoArea}>
            <p className={styles.footerUniversityName}>
              UNIVERSIDADE FEDERAL DO CARIRI — UFCA
            </p>
            <p className={styles.footerProjectName}>
              Sistema de Gestão e Catalogação das Nascentes do Cariri
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
