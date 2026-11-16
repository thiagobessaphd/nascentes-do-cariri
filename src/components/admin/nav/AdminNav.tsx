'use client';

/**
 * Nascentes do Cariri — Navegação Principal do Cabeçalho Administrativo
 *
 * Isola o uso de `usePathname()` na menor fronteira cliente possível, mantendo
 * AdminLayout como Server Component e destacando dinamicamente a rota ativa.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isAdminNavItemActive } from '@/services/importacoes.client';
import styles from './AdminNav.module.css';

interface AdminNavItem {
  readonly label: string;
  readonly href: string;
  readonly isPlaceholder?: boolean | undefined;
}

const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { label: 'Visão Geral', href: '#pagina-futura', isPlaceholder: true },
  { label: 'Nascentes', href: '#pagina-futura', isPlaceholder: true },
  { label: 'Importação de Dados', href: '/admin/importacoes' },
  { label: 'Histórico de Lotes', href: '/admin/importacoes/historico' },
];

export interface AdminNavProps {
  readonly fallbackPathname?: string | undefined;
}

export default function AdminNav({
  fallbackPathname = '/admin/importacoes',
}: AdminNavProps) {
  const pathname = usePathname();
  const activePathname = pathname ?? fallbackPathname;

  return (
    <ul className={styles.navMenuList}>
      {ADMIN_NAV_ITEMS.map((item) => {
        if (item.isPlaceholder) {
          return (
            <li key={item.label} className={styles.navMenuItem}>
              <a href={item.href} className={styles.navMenuLink}>
                {item.label}
              </a>
            </li>
          );
        }

        const isActive = isAdminNavItemActive(activePathname, item.href);
        return (
          <li key={item.href} className={styles.navMenuItem}>
            <Link
              href={item.href}
              className={isActive ? styles.navMenuLinkActive : styles.navMenuLink}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
