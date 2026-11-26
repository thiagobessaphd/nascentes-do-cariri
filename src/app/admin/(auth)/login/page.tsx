import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import logoCnpq from '@/assets/images/logo_cnpq.png';
import logoUfcaFull from '@/assets/images/logo_ufca-full.png';
import nascenteLoginPhoto from '@/assets/images/nascente-cariri-login.png';
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
    <div className={styles.splitShell}>
      {/* Metade Esquerda: Fotografia com Overlay e Identidade do Projeto */}
      <aside
        className={styles.photoPane}
        aria-label="Apresentação institucional do projeto Nascentes do Cariri"
      >
        <Image
          src={nascenteLoginPhoto}
          alt=""
          fill
          priority
          quality={90}
          sizes="(max-width: 960px) 0px, 52vw"
          className={styles.photoImage}
        />
        <div className={styles.photoOverlay} aria-hidden="true" />

        <div className={styles.photoHeroContent}>
          <p className={styles.heroProjectTitle}>Projeto <br />Nascentes do Cariri</p>
          <div className={styles.heroAccentBar} aria-hidden="true" />
          <p className={styles.heroDescription}>
            Conhecer as nascentes é o primeiro passo para protegê-las.
          </p>
        </div>
      </aside>

      {/* Metade Direita: Área Limpa de Autenticação */}
      <div className={styles.authPane}>
        <div className={styles.paneAccentStrip} aria-hidden="true" />

        <div className={styles.authContentWrapper}>
          <main id="login-main" className={styles.loginMain} tabIndex={-1}>
            <section
              className={styles.loginSection}
              aria-labelledby="admin-login-heading"
            >
              <div className={styles.headerBlock}>
                <span className={styles.mobileProjectOverline}>
                  Nascentes do Cariri
                </span>
                <h1 id="admin-login-heading" className={styles.pageTitle}>
                  Administrativo
                </h1>
                <p className={styles.pageSubtitle}>
                  Informe suas credenciais para acessar o sistema.
                </p>
              </div>

              <LoginForm redirectTo={redirectTo} />

              <div className={styles.backLinkRow}>
                <Link
                  href="/mapa"
                  className={styles.backToMapLink}
                  data-testid="login-public-map-link"
                >
                  <span aria-hidden="true">←</span>
                  <span>Voltar ao mapa público</span>
                </Link>
              </div>
            </section>
          </main>

          <footer
            className={styles.logosFooter}
            aria-label="Instituições realizadoras e apoiadoras"
          >
            <Image
              src={logoUfcaFull}
              alt="Universidade Federal do Cariri (UFCA)"
              width={88}
              height={88}
              className={styles.partnerLogo}
              priority
            />
            <span className={styles.logoDivider} aria-hidden="true" />
            <Image
              src={logoCnpq}
              alt="CNPq — Conselho Nacional de Desenvolvimento Científico e Tecnológico"
              width={88}
              height={88}
              className={styles.partnerLogo}
              priority
            />
          </footer>
        </div>
      </div>
    </div>
  );
}
