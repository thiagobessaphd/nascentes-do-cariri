/**
 * Nascentes do Cariri — Testes Unitários de QA: Shell Responsivo e Painel Administrativo (/admin)
 *
 * Cobre US-16 / Task-31 (#13):
 * - Guarda server-side contra soft navigation em AdminDashboardPage (`requireAdminPageSession({ nextPath: '/admin' })`);
 * - Renderização SSR (`renderToStaticMarkup`) dos 4 estados em AdminPainelView (`loading`, `empty`, `success`/parciais, `error`/auth);
 * - Boundaries de carregamento (`loading.tsx` sem spinners) e erro (`error.tsx` com `<h1>` único e zero vazamento técnico);
 * - Identidade real no shell (`AdminLayout`), skip link, separação `<nav>` / `role="group"`, `AdminNav` sem falso positivo;
 * - Guardrails estáticos de segurança (zero Prisma/innerHTML/Web Storage), acessibilidade (`:focus-visible`, `44px`, `tabular-nums`, `prefers-reduced-motion`) e responsividade `360px` (cards mobile, `ellipsis`, `scrollbar-gutter`, zero spinners).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GENERIC_PAINEL_LOAD_ERROR_MESSAGE,
  UNAUTHORIZED_PAINEL_ERROR_MESSAGE,
  type AdminResumoResponseDto,
} from '@/modules/painel/painel.contracts';

vi.mock('next/navigation', () => ({
  usePathname: () => null,
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('@/lib/security/admin-page-guard', () => ({
  requireAdminPageSession: vi.fn(),
  getOptionalAdminPageSession: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/modules/painel', async () => {
  const actual = await vi.importActual<typeof import('@/modules/painel')>(
    '@/modules/painel'
  );
  return {
    ...actual,
    painelService: {
      getResumo: vi.fn(),
    },
  };
});

import { logger } from '@/lib/logger';
import { requireAdminPageSession } from '@/lib/security/admin-page-guard';
import { painelService } from '@/modules/painel';
import AdminLayout from '@/app/admin/(protected)/layout';
import AdminDashboardPage, {
  dynamic as dashboardDynamic,
  metadata as dashboardMetadata,
} from '@/app/admin/(protected)/page';
import AdminDashboardLoading from '@/app/admin/(protected)/loading';
import AdminDashboardError from '@/app/admin/(protected)/error';
import { AdminNav } from '@/components/admin/nav';
import { AdminPainelView } from '@/components/admin/painel';

const POPULATED_RESUMO: AdminResumoResponseDto = {
  indicadores: {
    totalNascentesAtivas: 142,
    totalImportacoes: 7,
    ultimaImportacao: {
      id: 31,
      nomeArquivo: 'nascentes-cariri-novembro.txt',
      status: 'CONCLUIDA',
      totalLinhas: 25,
      totalValidas: 24,
      totalInvalidas: 0,
      totalDuplicadas: 1,
      createdAt: '2026-11-26T15:30:00.000Z',
      concluidaAt: '2026-11-26T15:31:00.000Z',
      usuario: {
        id: 1,
        nome: 'Dra. Érica Óscar',
      },
    },
  },
  historicoRecente: [
    {
      id: 31,
      nomeArquivo: 'nascentes-cariri-novembro.txt',
      status: 'CONCLUIDA',
      totalLinhas: 25,
      totalValidas: 24,
      totalInvalidas: 0,
      totalDuplicadas: 1,
      createdAt: '2026-11-26T15:30:00.000Z',
      concluidaAt: '2026-11-26T15:31:00.000Z',
      usuario: { id: 1, nome: 'Dra. Érica Óscar' },
    },
    {
      id: 30,
      nomeArquivo: 'lote-pendente-crato.txt',
      status: 'AGUARDANDO_CONFIRMACAO',
      totalLinhas: 12,
      totalValidas: 12,
      totalInvalidas: 0,
      totalDuplicadas: 0,
      createdAt: '2026-11-25T18:10:00.000Z',
      concluidaAt: null,
      usuario: { id: 2, nome: 'Prof. Coordenador' },
    },
    {
      id: 29,
      nomeArquivo: 'lote-com-falha.txt',
      status: 'FALHOU',
      totalLinhas: 8,
      totalValidas: 0,
      totalInvalidas: 8,
      totalDuplicadas: 0,
      createdAt: '2026-11-24T14:00:00.000Z',
      concluidaAt: '2026-11-24T14:00:02.000Z',
      usuario: { id: 1, nome: 'Dra. Érica Óscar' },
    },
  ],
  meta: {
    recentLimit: 5,
    generatedAt: '2026-11-26T16:00:00.000Z',
  },
};

const EMPTY_RESUMO: AdminResumoResponseDto = {
  indicadores: {
    totalNascentesAtivas: 0,
    totalImportacoes: 0,
    ultimaImportacao: null,
  },
  historicoRecente: [],
  meta: {
    recentLimit: 5,
    generatedAt: '2026-11-26T16:00:00.000Z',
  },
};

describe('US-16 / Task-31 — Shell Responsivo e Resumo Operacional do Painel (/admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminPageSession).mockResolvedValue({
      id: 1,
      nome: 'Érica Óscar',
      email: 'erica.oscar@ufca.edu.br',
      ativo: true,
      sessionId: 888,
      sessionExpiresAt: new Date('2026-12-31T23:59:59.000Z'),
    });
  });

  describe('1. Rota /admin (AdminDashboardPage), Defesa contra Soft Navigation e Boundaries', () => {
    it('deve declarar force-dynamic e robots noindex/nofollow em AdminDashboardPage', () => {
      expect(dashboardDynamic).toBe('force-dynamic');
      expect(dashboardMetadata.robots).toEqual({
        index: false,
        follow: false,
      });
      expect(String(dashboardMetadata.title)).toContain('Painel Administrativo');
    });

    it('deve revalidar requireAdminPageSession({ nextPath: "/admin" }) antes de consultar o banco e propagar NEXT_REDIRECT sem chamar painelService', async () => {
      vi.mocked(requireAdminPageSession).mockRejectedValueOnce(
        new Error('NEXT_REDIRECT:/admin/login?next=%2Fadmin')
      );

      await expect(AdminDashboardPage()).rejects.toThrow(
        'NEXT_REDIRECT:/admin/login?next=%2Fadmin'
      );
      expect(requireAdminPageSession).toHaveBeenCalledWith({ nextPath: '/admin' });
      expect(painelService.getResumo).not.toHaveBeenCalled();
    });

    it('deve renderizar AdminDashboardPage populada com único <h1>, CTA Nova Importação, KPIs, data America/Fortaleza e histórico recente', async () => {
      vi.mocked(painelService.getResumo).mockResolvedValue(POPULATED_RESUMO);

      const element = await AdminDashboardPage();
      const html = renderToStaticMarkup(element);

      expect(requireAdminPageSession).toHaveBeenCalledWith({ nextPath: '/admin' });
      expect(painelService.getResumo).toHaveBeenCalledTimes(1);

      // Estrutura de página e único H1
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain('Painel Administrativo');
      expect(html).toContain('VISÃO GERAL');
      expect(html).not.toContain('VISÃO GERAL OPERACIONAL');
      expect(html).toContain('data-testid="dashboard-new-import-cta"');
      expect(html).toContain('Nova Importação (.txt)');
      expect(html).toContain('href="/admin/importacoes"');

      // KPIs e datas formatadas em America/Fortaleza (15:30Z -> 12:30)
      expect(html).toContain('data-testid="kpi-nascentes-ativas-valor"');
      expect(html).toContain('>142<');
      expect(html).toContain('href="/mapa"');
      expect(html).toContain('nascentes-cariri-novembro.txt');
      expect(html).toContain('Lote #31');
      expect(html).toContain('26/11/2026 às 12:30');
      expect(html).toContain('Dra. Érica Óscar');
      expect(html).toContain('data-testid="status-badge-CONCLUIDA"');
      expect(html).toContain('href="/admin/importacoes/31"');

      // Histórico recente (tabela semântica + cards mobile + link histórico completo)
      expect(html).toContain('data-testid="dashboard-recent-imports"');
      expect(html).toContain('href="/admin/importacoes/historico"');
      expect(html).toContain('Ver histórico completo');
      expect(html).toContain('<caption');
      expect(html).toContain('scope="col"');
      expect(html).toContain('data-testid="recent-import-row-30"');
      expect(html).toContain('data-testid="recent-import-row-29"');
      expect(html).toContain('href="/admin/importacoes/30"');
      expect(html).toContain('href="/admin/importacoes/29"');
      expect(html).toContain('Exibindo as 3 mais recentes de 7 importações registradas.');
    });

    it('deve degradar com segurança em falha de banco no SSR sem vazar SQL/Prisma/caminhos internos', async () => {
      vi.mocked(painelService.getResumo).mockRejectedValueOnce(
        new Error('PrismaClientKnownRequestError ECONNREFUSED SELECT * FROM nascentes /var/private')
      );

      const element = await AdminDashboardPage();
      const html = renderToStaticMarkup(element);

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(html).toContain('data-testid="dashboard-error-state"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain(GENERIC_PAINEL_LOAD_ERROR_MESSAGE);
      expect(html).toContain('Tentar novamente');
      expect(html).not.toContain('PrismaClientKnownRequestError');
      expect(html).not.toContain('ECONNREFUSED');
      expect(html).not.toContain('/var/private');
    });

    it('AdminDashboardLoading deve renderizar skeleton acessível sem spinners', () => {
      const html = renderToStaticMarkup(React.createElement(AdminDashboardLoading));

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('Carregando resumo do painel administrativo...');
      expect(html).toContain('aria-hidden="true"');
      expect(html.toLowerCase()).not.toContain('spinner');
    });

    it('AdminDashboardError deve renderizar único <h1> com role="alert", recuperação e zero vazamento de error.message', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminDashboardError, {
          error: new Error('ER_BAD_DB_ERROR stack internal /srv/secret'),
          reset: vi.fn(),
        })
      );

      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('Não foi possível carregar o painel administrativo');
      expect(html).toContain('Tentar novamente');
      expect(html).toContain('href="/admin/importacoes"');
      expect(html).toContain('href="/admin/importacoes/historico"');
      expect(html).not.toContain('ER_BAD_DB_ERROR');
      expect(html).not.toContain('/srv/secret');
    });
  });

  describe('2. Os 4 Estados de AdminPainelView (loading, empty, parciais/populado, error)', () => {
    it('deve renderizar estado loading (skeleton sem spinner) quando montado sem initialData nem initialError', () => {
      const html = renderToStaticMarkup(React.createElement(AdminPainelView));

      expect(html).toContain('data-testid="dashboard-loading-state"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('Carregando resumo do painel administrativo...');
      expect(html.toLowerCase()).not.toContain('spinner');
    });

    it('deve renderizar estado vazio total (0 nascentes e 0 importações) com CTA orientador para primeira importação', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminPainelView, { initialData: EMPTY_RESUMO })
      );

      expect(html).toContain('data-testid="dashboard-empty-state"');
      expect(html).toContain('role="status"');
      expect(html).toContain('>0<');
      expect(html).toContain('Nenhuma importação realizada até o momento.');
      expect(html).toContain('Comece publicando o primeiro lote de nascentes');
      expect(html).toContain('data-testid="dashboard-first-import-cta"');
      expect(html).toContain('Realizar primeira importação (.txt)');
      expect(html).toContain('href="/admin/importacoes"');
    });

    it('deve tratar vazios parciais preservando histórico quando 0 nascentes + lote falho, ou KPI quando nascentes > 0 + 0 lotes', () => {
      const zeroSpringsWithFailedLot: AdminResumoResponseDto = {
        indicadores: {
          totalNascentesAtivas: 0,
          totalImportacoes: 1,
          ultimaImportacao: POPULATED_RESUMO.historicoRecente[2] ?? null,
        },
        historicoRecente: POPULATED_RESUMO.historicoRecente.slice(2, 3),
        meta: POPULATED_RESUMO.meta,
      };

      const partialHtml1 = renderToStaticMarkup(
        React.createElement(AdminPainelView, { initialData: zeroSpringsWithFailedLot })
      );
      expect(partialHtml1).toContain('data-testid="dashboard-populated-state"');
      expect(partialHtml1).toContain('Nenhuma nascente publicada no mapa ainda.');
      expect(partialHtml1).toContain('lote-com-falha.txt');
      expect(partialHtml1).toContain('data-testid="status-badge-FALHOU"');

      const springsWithoutLots: AdminResumoResponseDto = {
        indicadores: {
          totalNascentesAtivas: 18,
          totalImportacoes: 0,
          ultimaImportacao: null,
        },
        historicoRecente: [],
        meta: POPULATED_RESUMO.meta,
      };

      const partialHtml2 = renderToStaticMarkup(
        React.createElement(AdminPainelView, { initialData: springsWithoutLots })
      );
      expect(partialHtml2).toContain('data-testid="dashboard-populated-state"');
      expect(partialHtml2).toContain('>18<');
      expect(partialHtml2).toContain('data-testid="dashboard-recent-empty"');
    });

    it('deve renderizar estado de erro recuperável padrão e variante de sessão expirada (initialAuthError)', () => {
      const genericErrorHtml = renderToStaticMarkup(
        React.createElement(AdminPainelView, {
          initialError: GENERIC_PAINEL_LOAD_ERROR_MESSAGE,
          initialAuthError: false,
        })
      );
      expect(genericErrorHtml).toContain('data-testid="dashboard-error-state"');
      expect(genericErrorHtml).toContain('role="alert"');
      expect(genericErrorHtml).toContain('tabindex="-1"');
      expect(genericErrorHtml).toContain('data-testid="dashboard-retry-button"');
      expect(genericErrorHtml).not.toContain('data-testid="dashboard-login-recovery-link"');

      const authErrorHtml = renderToStaticMarkup(
        React.createElement(AdminPainelView, {
          initialError: UNAUTHORIZED_PAINEL_ERROR_MESSAGE,
          initialAuthError: true,
        })
      );
      expect(authErrorHtml).toContain('Sessão administrativa expirada ou sem permissão');
      expect(authErrorHtml).toContain('data-testid="dashboard-login-recovery-link"');
      expect(authErrorHtml).toContain('href="/admin/login?next=%2Fadmin"');
    });
  });

  describe('3. Shell Protegido (AdminLayout) e Navegação (AdminNav)', () => {
    it('deve renderizar identidade real Unicode no shell, marca unificada /admin, skip link e <nav> separado do perfil', async () => {
      const element = await AdminLayout({
        children: React.createElement('div', null, 'Dashboard Child'),
      });
      const html = renderToStaticMarkup(element);

      expect(html).toContain('data-admin-shell="true"');
      expect(html).toContain('href="#admin-main"');
      expect(html).toContain('Pular para o conteúdo principal');
      expect(html).toContain('aria-label="Projeto Nascentes do Cariri — Visão Geral do Painel Administrativo"');
      expect(html).toContain('alt=""');
      expect(html).toContain('>ÉÓ<');
      expect(html).toContain('Érica Óscar');
      expect(html).toContain('erica.oscar@ufca.edu.br');
      expect(html).toContain('role="group"');
      expect(html).toContain('aria-label="Perfil do usuário conectado"');
      expect(html).toContain('data-testid="admin-logout-button"');
      expect(html).toContain('aria-label="Sair da conta administrativa"');
      expect(html).not.toContain('aria-disabled="true"');
      expect(html).not.toContain('Thiago Bessa');
      expect(html).not.toContain('888');
      expect(html).not.toContain('Sprint 4');

      // Garante que <nav> fecha ANTES da div de perfil do usuário
      const navCloseIndex = html.indexOf('</nav>');
      const profileIndex = html.indexOf('Perfil do usuário conectado');
      expect(navCloseIndex).toBeGreaterThan(-1);
      expect(profileIndex).toBeGreaterThan(navCloseIndex);
    });

    it('AdminNav deve exibir exatamente 3 itens reais do MVP com apenas 1 aria-current="page" por rota', () => {
      const routes: readonly [string, string][] = [
        ['/admin', '/admin'],
        ['/admin/importacoes', '/admin/importacoes'],
        ['/admin/importacoes/historico', '/admin/importacoes/historico'],
        ['/admin/importacoes/99', '/admin/importacoes/historico'],
      ];

      for (const [pathname, expectedActiveHref] of routes) {
        const html = renderToStaticMarkup(
          React.createElement(AdminNav, { fallbackPathname: pathname })
        );
        const escapedHref = expectedActiveHref.replace(/\//g, '\\/');
        const activeAnchorPattern = new RegExp(
          `<a[^>]*aria-current="page"[^>]*href="${escapedHref}"[^>]*>|<a[^>]*href="${escapedHref}"[^>]*aria-current="page"[^>]*>`
        );

        expect(html.match(/<li\b/g)).toHaveLength(3);
        expect(html.match(/aria-current="page"/g)).toHaveLength(1);
        expect(html).toMatch(activeAnchorPattern);
        expect(html).not.toContain('#pagina-futura');
      }
    });
  });

  describe('4. Guardrails Estáticos de Segurança, Acessibilidade, Responsividade e Política Zero Spinner', () => {
    it('componentes cliente do painel NÃO devem importar Prisma nem usar innerHTML ou Web Storage', () => {
      const componentFiles = [
        'src/components/admin/painel/painel-view/AdminPainelView.tsx',
        'src/components/admin/painel/kpi-cards/PainelKpiCards.tsx',
        'src/components/admin/painel/recent-importacoes/RecentImportacoesSection.tsx',
        'src/components/admin/nav/AdminNav.tsx',
        'src/app/admin/(protected)/error.tsx',
      ];

      for (const relPath of componentFiles) {
        const source = fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
        expect(source).not.toMatch(/from\s+['"]@prisma\/client['"]/);
        expect(source).not.toContain('dangerouslySetInnerHTML');
        expect(source).not.toContain('.innerHTML');
        expect(source).not.toContain('localStorage');
        expect(source).not.toContain('sessionStorage');
      }
    });

    it('CSS Modules do shell e painel devem garantir foco visível, tabular-nums, truncamento, 44px, responsividade 360px, reduced-motion e zero spinners', () => {
      const layoutCss = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/admin/(protected)/admin-layout.module.css'),
        'utf-8'
      );
      const globalsCss = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/globals.css'),
        'utf-8'
      );
      const kpiCss = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'src/components/admin/painel/kpi-cards/PainelKpiCards.module.css'
        ),
        'utf-8'
      );
      const recentCss = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'src/components/admin/painel/recent-importacoes/RecentImportacoesSection.module.css'
        ),
        'utf-8'
      );
      const viewCss = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'src/components/admin/painel/painel-view/AdminPainelView.module.css'
        ),
        'utf-8'
      );
      const loadingCss = fs.readFileSync(
        path.resolve(process.cwd(), 'src/app/admin/(protected)/loading.module.css'),
        'utf-8'
      );

      // Shell responsivo, truncamento, skip link e scrollbar-gutter isolado
      expect(layoutCss).toContain('.skipLink:focus-visible');
      expect(layoutCss).toContain('text-overflow: ellipsis');
      expect(layoutCss).toContain('min-height: 44px');
      expect(layoutCss).toContain('@media (max-width: 768px)');
      expect(layoutCss).toContain('position: static');
      expect(layoutCss).toContain('@media (prefers-reduced-motion: reduce)');
      expect(globalsCss).toContain('html:has([data-admin-shell])');
      expect(globalsCss).toContain('scrollbar-gutter: stable');

      // KPIs e tabela/cards responsivos (360px sem overflow)
      expect(kpiCss).toContain('font-variant-numeric: tabular-nums');
      expect(kpiCss).toContain(':focus-visible');
      expect(kpiCss).toContain('min-height: 44px');
      expect(recentCss).toContain('@media (max-width: 768px)');
      expect(recentCss).toContain('.mobileCardsList');
      expect(recentCss).toContain('overflow-wrap: anywhere');
      expect(recentCss).toContain(':focus-visible');
      expect(recentCss).toContain('min-height: 44px');

      // Zero spinners visíveis em estados de carregamento (ignorando comentários CSS)
      for (const css of [viewCss, loadingCss]) {
        const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(cssWithoutComments).toContain('@media (prefers-reduced-motion: reduce)');
        expect(cssWithoutComments).toContain('animation: none');
        expect(cssWithoutComments.toLowerCase()).not.toContain('spinner');
        expect(cssWithoutComments).not.toMatch(/rotate\(\s*360deg\s*\)/i);
      }
    });
  });
});
