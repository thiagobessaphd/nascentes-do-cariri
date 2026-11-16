import Link from 'next/link';
import styles from './not-found.module.css';

export default function GlobalNotFound() {
  return (
    <main className={styles.pageWrapper}>
      <section className={styles.card} aria-labelledby="not-found-title">
        <div className={styles.iconBadge} aria-hidden="true">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="11.5" />
            <line x1="11" y1="14.2" x2="11.01" y2="14.2" />
          </svg>
        </div>

        <span className={styles.codeBadge}>Erro 404</span>

        <h1 id="not-found-title" className={styles.title}>
          Página não encontrada
        </h1>

        <p className={styles.description}>
          O endereço acessado não existe ou foi movido dentro da plataforma Nascentes do Cariri.
          Utilize os atalhos abaixo para retornar ao mapa público ou ao painel administrativo.
        </p>

        <div className={styles.actions}>
          <Link href="/mapa" className={styles.primaryLink}>
            Ir para o Mapa Público
          </Link>
          <Link href="/admin/importacoes/historico" className={styles.secondaryLink}>
            Histórico de Importações
          </Link>
        </div>
      </section>
    </main>
  );
}
