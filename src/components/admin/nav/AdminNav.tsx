'use client';

/**
 * Nascentes do Cariri — Navegação Principal do Cabeçalho Administrativo
 *
 * Isola o uso de `usePathname()` na menor fronteira cliente possível, mantendo
 * AdminLayout como Server Component e destacando dinamicamente a rota ativa
 * entre os 3 módulos operacionais do MVP.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isAdminNavItemActive } from '@/services/importacoes.client';
import styles from './AdminNav.module.css';

interface AdminNavItem {
  readonly label: string;
  readonly href: string;
}

const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { label: 'Visão Geral', href: '/admin' },
  { label: 'Importação de Dados', href: '/admin/importacoes' },
  { label: 'Histórico de Lotes', href: '/admin/importacoes/historico' },
];

export interface AdminNavProps {
  readonly fallbackPathname?: string | undefined;
}

export default function AdminNav({
  fallbackPathname = '/admin',
}: AdminNavProps) {
  const pathname = usePathname();
  const activePathname = pathname ?? fallbackPathname;

  return (
    <ul className={styles.navMenuList}>
      {ADMIN_NAV_ITEMS.map((item) => {
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
