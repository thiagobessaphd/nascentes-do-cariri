/**
 * Suíte de Testes Unitários e de Componentes: Histórico e Detalhe da Importação (US-14 / Task-28)
 *
 * Módulos cobertos:
 * - src/app/not-found.tsx
 * - src/components/admin/nav/AdminNav.tsx
 * - src/app/admin/importacoes/historico/page.tsx
 * - src/app/admin/importacoes/historico/loading.tsx
 * - src/app/admin/importacoes/historico/error.tsx
 * - src/app/admin/importacoes/[id]/page.tsx
 * - src/app/admin/importacoes/[id]/loading.tsx
 * - src/app/admin/importacoes/[id]/error.tsx
 * - src/app/admin/importacoes/[id]/not-found.tsx
 * - src/components/admin/importacoes/status-badge/ImportStatusBadge.tsx
 * - src/components/admin/importacoes/cancel-modal/ImportCancelModal.tsx
 * - src/components/admin/importacoes/history-view/ImportacaoHistoryView.tsx
 * - src/components/admin/importacoes/detail-view/ImportacaoDetailView.tsx
 */

import 'dotenv/config';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import GlobalNotFound from '@/app/not-found';
import { AdminNav } from '@/components/admin/nav';
import ImportacoesHistoryPage, {
  dynamic as historyPageDynamic,
  metadata as historyPageMetadata,
} from '@/app/admin/importacoes/historico/page';
import ImportacoesHistoryLoading from '@/app/admin/importacoes/historico/loading';
import ImportacoesHistoryError from '@/app/admin/importacoes/historico/error';
import ImportacaoDetailPage, {
  dynamic as detailPageDynamic,
  metadata as detailPageMetadata,
} from '@/app/admin/importacoes/[id]/page';
import ImportacaoDetailLoading from '@/app/admin/importacoes/[id]/loading';
import ImportacaoDetailError from '@/app/admin/importacoes/[id]/error';
import ImportacaoDetailNotFound from '@/app/admin/importacoes/[id]/not-found';
import {
  ImportacaoDetailView,
  ImportacaoHistoryView,
  ImportCancelModal,
  ImportStatusBadge,
  shouldCloseCancelModalOnKeyDown,
} from '@/components/admin/importacoes';
import {
  IMPORTACAO_STATUS_VALUES,
  type ImportacaoDetailResponseDto,
  type ImportacaoHistoryItemDto,
  type ImportacaoHistoryListResponseDto,
  type ImportacaoStatus,
} from '@/modules/importacoes/importacoes.contracts';

const FULL_SHA256 = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

function createHistoryItem(
  overrides?: Partial<ImportacaoHistoryItemDto>
): ImportacaoHistoryItemDto {
  return {
    id: 41,
    nomeArquivo: 'nascentes-crato-lote.txt',
    hashSha256: FULL_SHA256,
    status: 'AGUARDANDO_CONFIRMACAO',
    totalLinhas: 5,
    totalValidas: 4,
    totalInvalidas: 0,
    totalDuplicadas: 1,
    mensagemErro: null,
    createdAt: '2026-11-15T18:25:00.000Z',
    concluidaAt: null,
    usuario: {
      id: 10,
      nome: 'Thiago Bessa',
      email: 'thiago.bessa@ufca.edu.br',
    },
    ...overrides,
  };
}

function createDetailDto(
  overrides?: Partial<ImportacaoDetailResponseDto>
): ImportacaoDetailResponseDto {
  const base = createHistoryItem();
  return {
    ...base,
    nascentesInseridasCount: 0,
    isOwner: true,
    preview: {
      importacaoId: base.id,
      nomeArquivo: base.nomeArquivo,
      hashSha256: base.hashSha256,
      tamanhoBytes: 2048,
      status: base.status,
      canConfirm: true,
      summary: {
        totalLinhas: 5,
        totalValidas: 4,
        totalInvalidas: 0,
        totalDuplicadas: 1,
      },
      validRows: [
        {
          line: 2,
          duplicateKey: '-7.228900|-39.414400|fonte da batateira',
          data: {
            latitude: -7.2289,
            longitude: -39.4144,
            municipio: 'Crato',
            fonte: 'Fonte da Batateira',
            localidade: 'Sítio Fundão',
            dataCriacaoIso: '2024-05-10',
            dataCriacao: '2024-05-10T00:00:00.000Z',
            vazaoMedia: 0.876,
            unidadeVazao: 'm³/s',
          },
        },
      ],
      duplicateRows: [
        {
          line: 3,
          duplicateKey: '-7.172500|-39.731400|fonte do saco',
          reason: 'DUPLICATE_DATABASE',
          data: {
            latitude: -7.1725,
            longitude: -39.7314,
            municipio: 'Santana do Cariri',
            fonte: 'Fonte do Saco',
            localidade: 'Sítio Saco',
            dataCriacaoIso: '2024-01-01',
            dataCriacao: '2024-01-01T00:00:00.000Z',
            vazaoMedia: 4.2,
            unidadeVazao: 'm³/s',
          },
        },
      ],
      invalidRows: [],
      allErrors: [],
      createdAt: base.createdAt,
    },
    ...overrides,
  };
}

describe('US-14 / Task-28 — Telas Administrativas de Histórico, Detalhe e Navegação', () => {
  describe('1. Navegação Dinâmica, App Router Pages, Boundaries e 404', () => {
    it('AdminNav deve destacar dinamicamente a rota ativa entre Importação, Histórico e Detalhe', () => {
      const importPageHtml = renderToStaticMarkup(
        React.createElement(AdminNav, { fallbackPathname: '/admin/importacoes' })
      );
      expect(importPageHtml).toMatch(
        /<a[^>]*aria-current="page"[^>]*href="\/admin\/importacoes"[^>]*>Importação de Dados<\/a>|<a[^>]*href="\/admin\/importacoes"[^>]*aria-current="page"[^>]*>Importação de Dados<\/a>/
      );
      expect(importPageHtml).not.toMatch(
        /<a[^>]*aria-current="page"[^>]*href="\/admin\/importacoes\/historico"/
      );

      const historyPageHtml = renderToStaticMarkup(
        React.createElement(AdminNav, {
          fallbackPathname: '/admin/importacoes/historico',
        })
      );
      expect(historyPageHtml).toMatch(
        /<a[^>]*aria-current="page"[^>]*href="\/admin\/importacoes\/historico"[^>]*>Histórico de Lotes<\/a>|<a[^>]*href="\/admin\/importacoes\/historico"[^>]*aria-current="page"[^>]*>Histórico de Lotes<\/a>/
      );
      expect(historyPageHtml).not.toMatch(
        /<a[^>]*aria-current="page"[^>]*href="\/admin\/importacoes"[^>]*>Importação de Dados<\/a>/
      );

      const detailPageHtml = renderToStaticMarkup(
        React.createElement(AdminNav, { fallbackPathname: '/admin/importacoes/42' })
      );
      expect(detailPageHtml).toMatch(
        /<a[^>]*aria-current="page"[^>]*href="\/admin\/importacoes\/historico"[^>]*>Histórico de Lotes<\/a>|<a[^>]*href="\/admin\/importacoes\/historico"[^>]*aria-current="page"[^>]*>Histórico de Lotes<\/a>/
      );
      expect(detailPageHtml).toContain('aria-disabled="true"');
      expect(detailPageHtml).toContain('Módulo em desenvolvimento para as próximas sprints');
    });

    it('ImportacoesHistoryPage deve declarar robots noindex/nofollow, force-dynamic, <h1> único e sanitizar query params', async () => {
      expect(historyPageDynamic).toBe('force-dynamic');
      expect(historyPageMetadata.robots).toEqual({
        index: false,
        follow: false,
      });

      const validPageElement = await ImportacoesHistoryPage({
        searchParams: Promise.resolve({
          page: '2',
          pageSize: '20',
          status: 'CONCLUIDA',
        }),
      });
      const validHtml = renderToStaticMarkup(validPageElement);

      expect(validHtml).toContain('<h1');
      expect(validHtml).toContain('Histórico de Importações');
      expect(validHtml).toContain('AUDITORIA E RASTREABILIDADE');
      expect(validHtml).toContain('href="/admin/importacoes"');
      expect(validHtml).toContain('Nova Importação (.txt)');
      expect(validHtml).toContain('20 importações');
      expect(validHtml).toContain('Concluída');
      expect(validHtml).toContain('data-testid="history-clear-filter"');

      // Alias limit=10 e rejeição fail-safe de parâmetros inválidos/hostis
      const aliasElement = await ImportacoesHistoryPage({
        searchParams: Promise.resolve({
          limit: '10',
        }),
      });
      expect(renderToStaticMarkup(aliasElement)).toContain('10 importações');

      const invalidParamsElement = await ImportacoesHistoryPage({
        searchParams: Promise.resolve({
          page: '0',
          pageSize: '999',
          status: 'INVALID_STATUS',
        }),
      });
      const invalidHtml = renderToStaticMarkup(invalidParamsElement);
      expect(invalidHtml).toContain('5 importações');
      expect(invalidHtml).not.toContain('data-testid="history-clear-filter"');
    });

    it('ImportacaoDetailPage deve declarar noindex/force-dynamic, aceitar ID positivo e invocar notFound() para IDs inválidos', async () => {
      expect(detailPageDynamic).toBe('force-dynamic');
      expect(detailPageMetadata.robots).toEqual({
        index: false,
        follow: false,
      });

      const validElement = await ImportacaoDetailPage({
        params: Promise.resolve({ id: '42' }),
      });
      const validHtml = renderToStaticMarkup(validElement);
      expect(validHtml).toContain('data-testid="importacao-detail-loading"');
      expect(validHtml).toContain('Carregando detalhes do lote #42...');

      for (const invalidId of ['0', '-5', 'abc', '12.5', '42abc', '9007199254740992']) {
        let caughtError: unknown;
        try {
          await ImportacaoDetailPage({
            params: Promise.resolve({ id: invalidId }),
          });
        } catch (err: unknown) {
          caughtError = err;
        }
        expect(caughtError).toBeInstanceOf(Error);
        const digest = (caughtError as { digest?: string }).digest ?? '';
        const message = (caughtError as Error).message ?? '';
        expect(`${digest} ${message}`).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
      }
    });

    it('Boundaries de Loading (/historico e /[id]) devem expor Skeleton com role="status", aria-live="polite" e aria-busy="true"', () => {
      const historyLoadingHtml = renderToStaticMarkup(
        React.createElement(ImportacoesHistoryLoading)
      );
      expect(historyLoadingHtml).toContain('role="status"');
      expect(historyLoadingHtml).toContain('aria-live="polite"');
      expect(historyLoadingHtml).toContain('aria-busy="true"');
      expect(historyLoadingHtml).toContain(
        'Carregando histórico administrativo de importações...'
      );

      const detailLoadingHtml = renderToStaticMarkup(
        React.createElement(ImportacaoDetailLoading)
      );
      expect(detailLoadingHtml).toContain('role="status"');
      expect(detailLoadingHtml).toContain('aria-live="polite"');
      expect(detailLoadingHtml).toContain('aria-busy="true"');
      expect(detailLoadingHtml).toContain('Carregando detalhes da importação...');
    });

    it('Boundaries de Erro (/historico e /[id]) devem expor role="alert", aria-live="assertive" e ações de recuperação', () => {
      const resetMock = vi.fn();
      const testErr = new Error('Erro de renderização');

      const historyErrorHtml = renderToStaticMarkup(
        React.createElement(ImportacoesHistoryError, {
          error: testErr,
          reset: resetMock,
        })
      );
      expect(historyErrorHtml).toContain('role="alert"');
      expect(historyErrorHtml).toContain('aria-live="assertive"');
      expect(historyErrorHtml).toContain('Não foi possível carregar o histórico de importações');
      expect(historyErrorHtml).toContain('Tentar novamente');
      expect(historyErrorHtml).toContain('href="/admin/importacoes"');

      const detailErrorHtml = renderToStaticMarkup(
        React.createElement(ImportacaoDetailError, {
          error: testErr,
          reset: resetMock,
        })
      );
      expect(detailErrorHtml).toContain('role="alert"');
      expect(detailErrorHtml).toContain('aria-live="assertive"');
      expect(detailErrorHtml).toContain(
        'Não foi possível carregar os detalhes desta importação'
      );
      expect(detailErrorHtml).toContain('href="/admin/importacoes/historico"');
    });

    it('Páginas 404 (ImportacaoDetailNotFound e GlobalNotFound) devem renderizar estado centralizado sem exposição de ID ou #', () => {
      const featureNotFoundHtml = renderToStaticMarkup(
        React.createElement(ImportacaoDetailNotFound)
      );
      expect(featureNotFoundHtml).toContain('data-testid="importacao-detail-not-found"');
      expect(featureNotFoundHtml).toContain('Erro 404');
      expect(featureNotFoundHtml).toContain('Importação não encontrada');
      expect(featureNotFoundHtml).toContain('href="/admin/importacoes/historico"');
      expect(featureNotFoundHtml).toContain('<svg');
      expect(featureNotFoundHtml).not.toMatch(/Lote #|ID \d+/);

      const globalNotFoundHtml = renderToStaticMarkup(React.createElement(GlobalNotFound));
      expect(globalNotFoundHtml).toContain('<main');
      expect(globalNotFoundHtml).toContain('Erro 404');
      expect(globalNotFoundHtml).toContain('Página não encontrada');
      expect(globalNotFoundHtml).toContain('href="/mapa"');
      expect(globalNotFoundHtml).toContain('href="/admin/importacoes/historico"');
      expect(globalNotFoundHtml).toContain('<svg');
    });
  });

  describe('2. Badge Semântico (ImportStatusBadge) e Modal de Cancelamento (ImportCancelModal)', () => {
    it('ImportStatusBadge deve renderizar ícone decorativo, rótulo pt-BR e título descritivo para todos os 6 status', () => {
      const expectedLabels: Record<ImportacaoStatus, string> = {
        VALIDANDO: 'Validando',
        AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação',
        PROCESSANDO: 'Processando',
        CONCLUIDA: 'Concluída',
        FALHOU: 'Falhou',
        CANCELADA: 'Cancelada',
      };

      for (const status of IMPORTACAO_STATUS_VALUES) {
        const html = renderToStaticMarkup(
          React.createElement(ImportStatusBadge, { status, size: 'md' })
        );
        expect(html).toContain(`data-testid="status-badge-${status}"`);
        expect(html).toContain(`data-status="${status}"`);
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain(expectedLabels[status]);
        expect(html).not.toContain(`>${status}<`);
      }

      const largeBadgeHtml = renderToStaticMarkup(
        React.createElement(ImportStatusBadge, { status: 'CONCLUIDA', size: 'lg' })
      );
      expect(largeBadgeHtml).toContain('width="16"');
    });

    it('ImportCancelModal deve retornar vazio quando fechado e renderizar diálogo acessível quando aberto', () => {
      const closedHtml = renderToStaticMarkup(
        React.createElement(ImportCancelModal, {
          isOpen: false,
          importacaoId: 88,
          nomeArquivo: 'pendente.txt',
          isCanceling: false,
          onConfirmCancel: vi.fn(),
          onClose: vi.fn(),
        })
      );
      expect(closedHtml).toBe('');

      const openHtml = renderToStaticMarkup(
        React.createElement(ImportCancelModal, {
          isOpen: true,
          importacaoId: 88,
          nomeArquivo: 'pendente.txt',
          isCanceling: false,
          onConfirmCancel: vi.fn(),
          onClose: vi.fn(),
        })
      );
      expect(openHtml).toContain('data-testid="cancel-importacao-modal"');
      expect(openHtml).toContain('role="dialog"');
      expect(openHtml).toContain('aria-modal="true"');
      expect(openHtml).toContain('Lote #88');
      expect(openHtml).toContain('pendente.txt');
      expect(openHtml).toContain('Manter importação');
      expect(openHtml).toContain('Confirmar cancelamento');
      expect(openHtml).toContain('aria-busy="false"');
    });

    it('ImportCancelModal deve travar botões durante isCanceling, exibir erro com role="alert" e controlar tecla Escape', () => {
      const cancelingHtml = renderToStaticMarkup(
        React.createElement(ImportCancelModal, {
          isOpen: true,
          importacaoId: null,
          nomeArquivo: 'em-cancelamento.txt',
          isCanceling: true,
          errorMessage: 'Não foi possível cancelar o lote no servidor.',
          onConfirmCancel: vi.fn(),
          onClose: vi.fn(),
        })
      );

      expect(cancelingHtml).toContain('esta importação');
      expect(cancelingHtml).toContain('Cancelando...');
      expect(cancelingHtml).toContain('aria-busy="true"');
      expect(cancelingHtml).toContain('data-testid="cancel-modal-error"');
      expect(cancelingHtml).toContain('role="alert"');
      expect(cancelingHtml).toContain('aria-live="assertive"');
      expect(cancelingHtml).toContain('Não foi possível cancelar o lote no servidor.');

      // Regra de fechamento por teclado
      expect(shouldCloseCancelModalOnKeyDown('Escape', false)).toBe(true);
      expect(shouldCloseCancelModalOnKeyDown('Escape', true)).toBe(false);
      expect(shouldCloseCancelModalOnKeyDown('Enter', false)).toBe(false);
      expect(shouldCloseCancelModalOnKeyDown('Tab', false)).toBe(false);
    });
  });

  describe('3. Visão do Histórico de Importações (ImportacaoHistoryView)', () => {
    it('deve renderizar estado skeleton loading acessível quando sem initialData/initialError', () => {
      const html = renderToStaticMarkup(React.createElement(ImportacaoHistoryView));

      expect(html).toContain('data-testid="history-loading-state"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('Carregando histórico de importações...');
    });

    it('deve renderizar estado de erro acessível com role="alert" e botão de retentativa', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportacaoHistoryView, {
          initialError: 'Erro interno no servidor ao carregar o histórico de importações.',
        })
      );

      expect(html).toContain('data-testid="history-error-state"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('Erro interno no servidor ao carregar o histórico de importações.');
      expect(html).toContain('data-testid="history-retry-button"');
    });

    it('deve distinguir estado vazio sem filtro vs estado vazio com filtro aplicado', () => {
      const emptyNoFilterData: ImportacaoHistoryListResponseDto = {
        data: [],
        meta: {
          page: 1,
          pageSize: 5,
          totalItems: 0,
          totalPages: 0,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      };

      const emptyBaseHtml = renderToStaticMarkup(
        React.createElement(ImportacaoHistoryView, {
          initialData: emptyNoFilterData,
        })
      );
      expect(emptyBaseHtml).toContain('data-testid="history-empty-state"');
      expect(emptyBaseHtml).toContain('Nenhuma importação registrada ainda');
      expect(emptyBaseHtml).toContain('Nova Importação (.txt)');
      expect(emptyBaseHtml).not.toContain('data-testid="history-empty-clear-filter"');

      const emptyFilteredHtml = renderToStaticMarkup(
        React.createElement(ImportacaoHistoryView, {
          initialData: emptyNoFilterData,
          initialStatus: 'CANCELADA',
        })
      );
      expect(emptyFilteredHtml).toContain('Nenhuma importação com status &quot;Cancelada&quot;');
      expect(emptyFilteredHtml).toContain('data-testid="history-empty-clear-filter"');
    });

    it('deve tratar página fora do intervalo (meta.totalItems > 0 e data=[]) com e sem filtro sem exibir intervalo invertido (regressão)', () => {
      const outOfRangeData: ImportacaoHistoryListResponseDto = {
        data: [],
        meta: {
          page: 99,
          pageSize: 5,
          totalItems: 34,
          totalPages: 7,
          hasPreviousPage: true,
          hasNextPage: false,
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(ImportacaoHistoryView, {
          initialData: outOfRangeData,
        })
      );

      expect(html).not.toContain('491–490');
      expect(html).toContain('Página 99 sem registros (34 importações disponíveis).');
      expect(html).toContain('Página 99 sem registros');
      expect(html).toContain('data-testid="history-empty-back-page-one"');
      expect(html).toContain('Voltar para a página 1');

      const filteredEmptyPageHtml = renderToStaticMarkup(
        React.createElement(ImportacaoHistoryView, {
          initialStatus: 'AGUARDANDO_CONFIRMACAO',
          initialData: {
            data: [],
            meta: {
              page: 2,
              pageSize: 5,
              totalItems: 5,
              totalPages: 1,
              hasPreviousPage: true,
              hasNextPage: false,
            },
          },
        })
      );

      expect(filteredEmptyPageHtml).toContain(
        'Página 2 sem registros (5 importações disponíveis com status &quot;Aguardando confirmação&quot;).'
      );
      expect(filteredEmptyPageHtml).toContain('data-testid="history-empty-back-page-one"');
    });

    it('deve aplicar rigorosamente as travas de ownership, status e segurança (nunca exibir Confirmar nem caminho privado)', () => {
      const listData: ImportacaoHistoryListResponseDto = {
        data: [
          // Item 41: pendente do usuário atual (id 10) -> Ver detalhes + Reanalisar + Cancelar
          createHistoryItem({
            id: 41,
            status: 'AGUARDANDO_CONFIRMACAO',
            usuario: { id: 10, nome: 'Thiago Bessa', email: 'thiago@ufca.edu.br' },
          }),
          // Item 40: pendente de OUTRO administrador (id 99) -> Apenas Ver detalhes
          createHistoryItem({
            id: 40,
            nomeArquivo: 'outro-admin.txt',
            status: 'AGUARDANDO_CONFIRMACAO',
            usuario: { id: 99, nome: 'Outro Admin', email: 'outro@ufca.edu.br' },
          }),
          // Item 39: concluída do usuário atual (id 10) -> Apenas Ver detalhes
          createHistoryItem({
            id: 39,
            nomeArquivo: 'ja-concluida.txt',
            status: 'CONCLUIDA',
            concluidaAt: '2026-11-15T19:00:00.000Z',
            usuario: { id: 10, nome: 'Thiago Bessa', email: 'thiago@ufca.edu.br' },
          }),
          // Item 38: falhou do usuário atual (id 10) -> Apenas Ver detalhes
          createHistoryItem({
            id: 38,
            nomeArquivo: 'falhou-lote.txt',
            status: 'FALHOU',
            totalValidas: 0,
            totalInvalidas: 2,
            usuario: { id: 10, nome: 'Thiago Bessa', email: 'thiago@ufca.edu.br' },
          }),
          // Item 37: cancelada do usuário atual (id 10) -> Apenas Ver detalhes
          createHistoryItem({
            id: 37,
            nomeArquivo: 'cancelada-lote.txt',
            status: 'CANCELADA',
            concluidaAt: '2026-11-15T19:30:00.000Z',
            usuario: { id: 10, nome: 'Thiago Bessa', email: 'thiago@ufca.edu.br' },
          }),
        ],
        meta: {
          page: 1,
          pageSize: 5,
          totalItems: 5,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(ImportacaoHistoryView, {
          currentUserId: 10,
          initialData: listData,
        })
      );

      // Item 41 (dono + pendente): libera ações completas
      expect(html).toContain('data-testid="history-detail-link-41"');
      expect(html).toContain('href="/admin/importacoes/41"');
      expect(html).toContain('data-testid="history-analyze-link-41"');
      expect(html).toContain('href="/admin/importacoes?importacaoId=41"');
      expect(html).toContain('data-testid="history-cancel-button-41"');
      expect(html).toContain('Reanalisar');

      // Item 40 (não-dono + pendente): bloqueia Reanalisar e Cancelar
      expect(html).toContain('data-testid="history-detail-link-40"');
      expect(html).not.toContain('data-testid="history-analyze-link-40"');
      expect(html).not.toContain('data-testid="history-cancel-button-40"');

      // Itens 39, 38, 37 (dono + finalizados): bloqueiam Reanalisar e Cancelar
      expect(html).toContain('data-testid="history-detail-link-39"');
      expect(html).not.toContain('data-testid="history-analyze-link-39"');
      expect(html).not.toContain('data-testid="history-cancel-button-39"');
      expect(html).toContain('data-testid="history-detail-link-38"');
      expect(html).not.toContain('data-testid="history-analyze-link-38"');
      expect(html).not.toContain('data-testid="history-cancel-button-38"');
      expect(html).toContain('data-testid="history-detail-link-37"');
      expect(html).not.toContain('data-testid="history-analyze-link-37"');
      expect(html).not.toContain('data-testid="history-cancel-button-37"');

      // Proibição estrita de confirmação direta na listagem e vazamento interno
      expect(html).not.toContain('Confirmar importação');
      expect(html).not.toContain('Confirmar e Adicionar');
      expect(html).not.toContain('caminhoPrivadoArquivo');
      expect(html).not.toContain('passwordHash');
    });

    it('deve omitir ações de escrita quando currentUserId for null (fallback sem sessão SSR)', () => {
      const listData: ImportacaoHistoryListResponseDto = {
        data: [createHistoryItem({ id: 55, status: 'AGUARDANDO_CONFIRMACAO' })],
        meta: {
          page: 1,
          pageSize: 5,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(ImportacaoHistoryView, {
          currentUserId: null,
          initialData: listData,
        })
      );

      expect(html).toContain('data-testid="history-detail-link-55"');
      expect(html).not.toContain('data-testid="history-analyze-link-55"');
      expect(html).not.toContain('data-testid="history-cancel-button-55"');
    });

    it('deve renderizar paginação numérica com reticências em múltiplas páginas e comboboxes acessíveis de filtro/quantidade', () => {
      const paginatedData: ImportacaoHistoryListResponseDto = {
        data: [
          createHistoryItem({ id: 61 }),
          createHistoryItem({ id: 62 }),
          createHistoryItem({ id: 63 }),
          createHistoryItem({ id: 64 }),
          createHistoryItem({ id: 65 }),
        ],
        meta: {
          page: 6,
          pageSize: 5,
          totalItems: 60,
          totalPages: 12,
          hasPreviousPage: true,
          hasNextPage: true,
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(ImportacaoHistoryView, {
          currentUserId: 10,
          initialPage: 6,
          initialPageSize: 5,
          initialData: paginatedData,
        })
      );

      expect(html).toContain('Exibindo 26–30 de 60 importações');
      expect(html).toContain('data-testid="history-pagination"');
      expect(html).toContain('data-testid="history-prev-page"');
      expect(html).toContain('data-testid="history-next-page"');
      expect(html).toContain('data-testid="history-page-1"');
      expect(html).toContain('data-testid="history-page-6"');
      expect(html).toContain('aria-current="page"');
      expect(html).toContain('data-testid="history-page-12"');
      expect(html).toContain('…');

      // Comboboxes customizados e região rolável acessível por teclado
      expect(html).toContain('role="region"');
      expect(html).toContain('aria-label="Tabela do histórico de importações"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('data-testid="history-status-filter"');
      expect(html).toContain('data-testid="history-page-size-filter"');
      expect(html).toContain('5 importações');
    });
  });

  describe('4. Visão Detalhada da Importação (ImportacaoDetailView)', () => {
    it('deve renderizar estado skeleton loading acessível e breadcrumb para o histórico', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportacaoDetailView, { importacaoId: 77 })
      );

      expect(html).toContain('data-testid="importacao-detail-loading"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('Carregando detalhes do lote #77...');
      expect(html).toContain('data-testid="detail-back-to-history"');
      expect(html).toContain('href="/admin/importacoes/historico"');
    });

    it('deve renderizar estado 404 amigável sem exposição do ID quando initialStatusCode === 404', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportacaoDetailView, {
          importacaoId: 987654,
          initialError: 'Registro de importação não encontrado.',
          initialStatusCode: 404,
        })
      );

      expect(html).toContain('data-testid="importacao-detail-not-found-state"');
      expect(html).toContain('Erro 404');
      expect(html).toContain('Importação não encontrada');
      expect(html).not.toContain('987654');
      expect(html).not.toContain('#987654');
    });

    it('deve renderizar estado de erro não-404 com role="alert", retry button e retorno ao histórico', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportacaoDetailView, {
          importacaoId: 12,
          initialError: 'Erro interno no servidor ao carregar os detalhes da importação.',
          initialStatusCode: 500,
        })
      );

      expect(html).toContain('data-testid="importacao-detail-error"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('Erro interno no servidor ao carregar os detalhes da importação.');
      expect(html).toContain('data-testid="detail-retry-button"');
    });

    it('deve exibir banner de publicação, link externo ao mapa e KPI "Nascentes Inseridas" para importação CONCLUIDA', () => {
      const concludedDetail = createDetailDto({
        id: 105,
        status: 'CONCLUIDA',
        concluidaAt: '2026-11-15T19:10:00.000Z',
        nascentesInseridasCount: 4,
        preview: null,
      });

      const html = renderToStaticMarkup(
        React.createElement(ImportacaoDetailView, {
          importacaoId: 105,
          initialDetail: concludedDetail,
        })
      );

      expect(html).toContain('data-testid="detail-completed-banner"');
      expect(html).toContain('Importação concluída e publicada');
      expect(html).toContain(
        '4 novas nascentes foram adicionadas à base oficial e estão disponíveis no mapa público.'
      );
      expect(html).toContain('data-testid="detail-open-map-link"');
      expect(html).toContain('href="/mapa"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('Nascentes Inseridas');
      expect(html).toContain('Gravadas na base oficial');
      expect(html).not.toContain('data-testid="detail-pending-actions"');
      expect(html).not.toContain('data-testid="detail-readonly-preview"');

      // Forma singular quando nascentesInseridasCount === 1
      const singularHtml = renderToStaticMarkup(
        React.createElement(ImportacaoDetailView, {
          importacaoId: 108,
          initialDetail: createDetailDto({
            id: 108,
            status: 'CONCLUIDA',
            concluidaAt: '2026-11-15T19:10:00.000Z',
            nascentesInseridasCount: 1,
            preview: null,
          }),
        })
      );
      expect(singularHtml).toContain(
        '1 nova nascente foi adicionada à base oficial e está disponível no mapa público.'
      );
    });

    it('deve exibir diagnóstico em role="alert" para FALHOU e aviso de preservação para CANCELADA', () => {
      const failedHtml = renderToStaticMarkup(
        React.createElement(ImportacaoDetailView, {
          importacaoId: 106,
          initialDetail: createDetailDto({
            id: 106,
            status: 'FALHOU',
            totalValidas: 0,
            totalInvalidas: 3,
            mensagemErro: 'Arquivo rejeitado: cabeçalho incompatível na Linha 1.',
            concluidaAt: null,
            preview: null,
          }),
        })
      );

      expect(failedHtml).toContain('data-testid="detail-failed-banner"');
      expect(failedHtml).toContain('role="alert"');
      expect(failedHtml).toContain('aria-live="assertive"');
      expect(failedHtml).toContain('Arquivo rejeitado: cabeçalho incompatível na Linha 1.');

      const cancelledHtml = renderToStaticMarkup(
        React.createElement(ImportacaoDetailView, {
          importacaoId: 107,
          initialDetail: createDetailDto({
            id: 107,
            status: 'CANCELADA',
            mensagemErro: 'Importação cancelada pelo administrador antes da confirmação.',
            concluidaAt: '2026-11-15T19:15:00.000Z',
            preview: null,
          }),
        })
      );

      expect(cancelledHtml).toContain('data-testid="detail-cancelled-banner"');
      expect(cancelledHtml).toContain('Registro de Cancelamento');
      expect(cancelledHtml).toContain(
        'Importação cancelada pelo administrador antes da confirmação.'
      );
      expect(cancelledHtml).toContain('permanece preservado para auditoria');
    });

    it('deve exibir Reanalisar, Cancelar e prévia somente leitura ao dono em AGUARDANDO_CONFIRMACAO, nunca Confirmar direto', () => {
      const pendingOwnerDetail = createDetailDto({
        id: 201,
        status: 'AGUARDANDO_CONFIRMACAO',
        isOwner: true,
      });

      const html = renderToStaticMarkup(
        React.createElement(ImportacaoDetailView, {
          importacaoId: 201,
          initialDetail: pendingOwnerDetail,
        })
      );

      // Metadados de rastreabilidade + botão copiar hash
      expect(html).toContain('data-testid="detail-metadata-card"');
      expect(html).toContain('1234567890...90abcdef');
      expect(html).toContain(`Hash completo: ${FULL_SHA256}`);
      expect(html).toContain('data-testid="detail-copy-hash-button"');
      expect(html).toContain('Aguardando decisão');

      // Ações de retomada e cancelamento disponíveis sem confirmação direta
      expect(html).toContain('data-testid="detail-pending-actions"');
      expect(html).toContain('data-testid="detail-back-to-analyze-link"');
      expect(html).toContain('href="/admin/importacoes?importacaoId=201"');
      expect(html).toContain('Reanalisar');
      expect(html).toContain('data-testid="detail-cancel-button"');
      expect(html).not.toContain('Confirmar e Adicionar');
      expect(html).not.toContain('data-testid="import-confirm-button"');

      // Prévia somente leitura reconstruída
      expect(html).toContain('data-testid="detail-readonly-preview"');
      expect(html).toContain('Fonte da Batateira');
      expect(html).toContain('Fonte do Saco');
    });

    it('deve bloquear Reanalisar (mantendo Cancelar) quando preview === null e ocultar ambas ações para não-dono', () => {
      const ownerWithoutPreview = createDetailDto({
        id: 202,
        status: 'AGUARDANDO_CONFIRMACAO',
        isOwner: true,
        preview: null,
      });

      const ownerNoPreviewHtml = renderToStaticMarkup(
        React.createElement(ImportacaoDetailView, {
          importacaoId: 202,
          initialDetail: ownerWithoutPreview,
        })
      );

      expect(ownerNoPreviewHtml).toContain('data-testid="detail-preview-unavailable-notice"');
      expect(ownerNoPreviewHtml).not.toContain('data-testid="detail-back-to-analyze-link"');
      expect(ownerNoPreviewHtml).toContain('data-testid="detail-cancel-button"');
      expect(ownerNoPreviewHtml).not.toContain('data-testid="detail-readonly-preview"');

      const nonOwnerPending = createDetailDto({
        id: 203,
        status: 'AGUARDANDO_CONFIRMACAO',
        isOwner: false,
      });

      const nonOwnerHtml = renderToStaticMarkup(
        React.createElement(ImportacaoDetailView, {
          importacaoId: 203,
          initialDetail: nonOwnerPending,
        })
      );

      expect(nonOwnerHtml).toContain('data-testid="detail-ownership-notice"');
      expect(nonOwnerHtml).toContain('Thiago Bessa');
      expect(nonOwnerHtml).not.toContain('data-testid="detail-back-to-analyze-link"');
      expect(nonOwnerHtml).not.toContain('data-testid="detail-cancel-button"');
    });
  });
});
