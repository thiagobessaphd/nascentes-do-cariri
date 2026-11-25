import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import logoCnpq from '@/assets/images/logo_cnpq.png';
import logoUfcaFull from '@/assets/images/logo_ufca-full.png';
import logoUfcaSymbol from '@/assets/images/logo_ufca.png';
import { LoginForm } from '@/components/admin/auth';
import { getOptionalAdminPageSession } from '@/lib/security/admin-page-guard';
import { sanitizeAdminRedirectPath } from '@/modules/auth/auth.contracts';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Acesso Administrativo | Projeto Nascentes do Cariri — UFCA',
  description:
    'Autenticação institucional restrita para gestão da base cartográfica e importação de dados das Nascentes do Cariri.',
  robots: {
    index: false,
    follow: false,
  },
};

export interface AdminLoginPageProps {
  readonly searchParams?:
    | Promise<{
        readonly next?: string | readonly string[] | undefined;
      }>
    | undefined;
}

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const rawNext = Array.isArray(resolvedParams?.next)
    ? resolvedParams.next[0]
    : resolvedParams?.next;
  const redirectTo = sanitizeAdminRedirectPath(rawNext);

  let existingSession = null;
  try {
    existingSession = await getOptionalAdminPageSession();
  } catch {
    existingSession = null;
  }

  if (existingSession !== null) {
    redirect(redirectTo);
  }

  return (
    <div className={styles.loginShell}>
      {/* Barra Institucional Superior */}
      <header className={styles.topHeader} role="banner">
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
                Acesso Restrito • Administração
              </span>

              <span className={styles.topBarDivider} aria-hidden="true">
                |
              </span>

              <Link
                href="/mapa"
                className={styles.topBarMapLink}
                data-testid="login-public-map-link"
              >
                <span aria-hidden="true">←</span>
                <span>Voltar ao Mapa Público</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Filete Cromático Oficial UFCA */}
        <div className={styles.ufcaAccentStrip} aria-hidden="true" />
      </header>

      {/* Área Central de Autenticação */}
      <main id="login-main" className={styles.loginMain} tabIndex={-1}>
        <section
          className={styles.loginCard}
          aria-labelledby="admin-login-heading"
        >
          <div className={styles.cardHeader}>
            <div className={styles.brandRow}>
              <Image
                src={logoUfcaSymbol}
                alt="Símbolo da Universidade Federal do Cariri (UFCA)"
                width={96}
                height={34}
                className={styles.brandLogo}
                priority
              />
            </div>

            <span className={styles.projectOverline}>
              PROJETO NASCENTES DO CARIRI
            </span>
            <h1 id="admin-login-heading" className={styles.cardTitle}>
              Acesso Administrativo
            </h1>
            <p className={styles.cardSubtitle}>
              Entre com seu e-mail institucional e senha para gerenciar importações e
              atualizar a base cartográfica do Cariri cearense.
            </p>
          </div>

          <LoginForm redirectTo={redirectTo} />

          <div className={styles.cardFooterNotice}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>
              Área exclusiva para equipe técnica autorizada. Tentativas excessivas são
              limitadas automaticamente.
            </span>
          </div>
        </section>
      </main>

      {/* Rodapé Institucional */}
      <footer className={styles.loginFooter} role="contentinfo">
        <div className={styles.footerContainer}>
          <div className={styles.footerLogoWrapper}>
            <Image
              src={logoUfcaFull}
              alt="Logotipo da Universidade Federal do Cariri (UFCA)"
              width={92}
              height={92}
              className={styles.footerLogoImg}
            />
            <div className={styles.footerLogoDivider} aria-hidden="true" />
            <Image
              src={logoCnpq}
              alt="Logotipo do CNPq — Conselho Nacional de Desenvolvimento Científico e Tecnológico"
              width={92}
              height={92}
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
