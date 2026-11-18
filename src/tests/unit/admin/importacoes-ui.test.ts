/**
 * Suíte de Testes Unitários e de Componentes: Interface de Prévia, Resumo e Erros de Importação (US-12 / Task-24)
 *
 * Módulos cobertos:
 * - src/app/admin/layout.tsx
 * - src/app/admin/importacoes/page.tsx
 * - src/app/admin/importacoes/loading.tsx
 * - src/app/admin/importacoes/error.tsx
 * - src/components/admin/importacoes/summary-cards/ImportSummaryCards.tsx
 * - src/components/admin/importacoes/errors-list/ImportErrorsList.tsx
 * - src/components/admin/importacoes/preview-table/ImportPreviewTable.tsx
 * - src/components/admin/importacoes/action-bar/ImportActionBar.tsx
 * - src/components/admin/importacoes/upload-form/ImportUploadForm.tsx
 * - src/components/admin/importacoes/workspace/ImportacaoWorkspace.tsx
 * - src/app/api/admin/dev-session/route.ts
 */

import 'dotenv/config';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminLayout, { metadata as adminLayoutMetadata } from '@/app/admin/layout';
import ImportacoesAdminPage, { metadata as importacoesPageMetadata } from '@/app/admin/importacoes/page';
import ImportacoesLoading from '@/app/admin/importacoes/loading';
import ImportacoesError from '@/app/admin/importacoes/error';
import ImportSummaryCards from '@/components/admin/importacoes/summary-cards/ImportSummaryCards';
import ImportErrorsList from '@/components/admin/importacoes/errors-list/ImportErrorsList';
import ImportPreviewTable from '@/components/admin/importacoes/preview-table/ImportPreviewTable';
import ImportActionBar from '@/components/admin/importacoes/action-bar/ImportActionBar';
import ImportUploadForm from '@/components/admin/importacoes/upload-form/ImportUploadForm';
import ImportacaoWorkspace from '@/components/admin/importacoes/workspace/ImportacaoWorkspace';
import { derivePreviewState } from '@/services/importacoes.client';
import {
  DUPLICATE_REASONS,
  IMPORT_ERROR_CODES,
  type DuplicateTxtPreviewRow,
  type ImportRowError,
  type TxtParseSummary,
  type ValidTxtPreviewRow,
} from '@/modules/importacoes/importacoes.contracts';
import { createAdminSessionToken } from '@/lib/security/admin-guard';
import { prisma } from '@/lib/db/prisma';
import { GET as devSessionGET, DELETE as devSessionDELETE } from '@/app/api/admin/dev-session/route';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
    },
  },
}));

const MOCK_VALID_ROWS: readonly ValidTxtPreviewRow[] = [
  {
    line: 2,
    duplicateKey: '-7.228900|-39.414400|fonte da batateira',
    data: {
      latitude: -7.2289,
      longitude: -39.4144,
      municipio: 'Crato',
      fonte: 'Fonte da Batateira',
      localidade: 'Sítio Fundão',
      dataCriacao: '2024-05-10T00:00:00.000Z',
      dataCriacaoIso: '2024-05-10',
      vazaoMedia: 0.876,
      unidadeVazao: 'm³/s',
    },
  },
  {
    line: 4,
    duplicateKey: '-7.311200|-39.301500|fonte do caldas',
    data: {
      latitude: -7.3112,
      longitude: -39.3015,
      municipio: 'Barbalha',
      fonte: 'Fonte do Caldas',
      localidade: 'Estância Hidromineral',
      dataCriacao: '2023-11-20T00:00:00.000Z',
      dataCriacaoIso: '2023-11-20',
      vazaoMedia: 12.5,
      unidadeVazao: 'm³/s',
    },
  },
];

const MOCK_DUPLICATE_ROWS: readonly DuplicateTxtPreviewRow[] = [
  {
    line: 3,
    duplicateKey: '-7.172500|-39.731400|fonte do saco',
    reason: DUPLICATE_REASONS.DATABASE,
    data: {
      latitude: -7.1725,
      longitude: -39.7314,
      municipio: 'Santana do Cariri',
      fonte: 'Fonte do Saco',
      localidade: 'Sítio Saco',
      dataCriacao: '2024-01-01T00:00:00.000Z',
      dataCriacaoIso: '2024-01-01',
      vazaoMedia: 4.2,
      unidadeVazao: 'm³/s',
    },
  },
];

const MOCK_ERRORS: readonly ImportRowError[] = [
  {
    line: 5,
    field: 'latitude',
    code: IMPORT_ERROR_CODES.OUT_OF_BOUNDS_CARIRI,
    message: 'A latitude informada (-3.717220) está fora dos limites da região do Cariri [-8.0, -6.5].',
    rawValue: '-3.717220',
  },
  {
    line: 6,
    field: 'municipio',
    code: IMPORT_ERROR_CODES.REQUIRED_FIELD_EMPTY,
    message: 'O campo obrigatório "municipio" está vazio.',
  },
  {
    line: 7,
    field: 'vazao_media',
    code: IMPORT_ERROR_CODES.NEGATIVE_FLOW,
    message: 'A vazão média não pode ser negativa (-0.500).',
    rawValue: '-0.500',
  },
];

describe('US-12 / Task-24 — Interface Administrativa de Prévia, Resumo e Erros de Importação', () => {
  describe('1. Páginas, Layout Institucional e Boundaries do App Router (/admin/importacoes)', () => {
    it('deve declarar robots noindex/nofollow em AdminLayout e ImportacoesAdminPage', () => {
      expect(adminLayoutMetadata.robots).toEqual({
        index: false,
        follow: false,
      });
      expect(importacoesPageMetadata.robots).toEqual({
        index: false,
        follow: false,
      });
    });

    it('deve renderizar ImportacoesAdminPage com cabeçalho semântico único <h1> e landmark de workspace', () => {
      const html = renderToStaticMarkup(React.createElement(ImportacoesAdminPage));

      expect(html).toContain('<h1');
      expect(html).toContain('Importação e Validação de Nascentes');
      expect(html).toContain('GESTÃO DA BASE CARTOGRÁFICA');
      expect(html).toContain('aria-label="Área de trabalho de importação e prévia"');
    });

    it('deve renderizar AdminLayout com barra institucional UFCA, item ativo aria-current="page", links #pagina-futura e botão Sair desabilitado', () => {
      const html = renderToStaticMarkup(
        React.createElement(
          AdminLayout,
          null,
          React.createElement('div', { id: 'child-content' }, 'Conteúdo Interno')
        )
      );

      expect(html).toContain('Universidade Federal do Cariri (UFCA)');
      expect(html).toContain('href="/admin/importacoes"');
      expect(html).toContain('aria-current="page"');
      expect(html).toContain('href="#pagina-futura"');
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain('Conteúdo Interno');
    });

    it('deve renderizar ImportacoesLoading com semântica acessível role="status", aria-live="polite" e aria-busy="true"', () => {
      const html = renderToStaticMarkup(React.createElement(ImportacoesLoading));

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('Carregando painel de importação e validação...');
    });

    it('deve renderizar ImportacoesError com role="alert", aria-live="assertive" e ações de recuperação', () => {
      const mockReset = vi.fn();
      const testError = new Error('Falha simulada de renderização');
      const html = renderToStaticMarkup(
        React.createElement(ImportacoesError, {
          error: testError,
          reset: mockReset,
        })
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('Não foi possível carregar o módulo de importação');
      expect(html).toContain('Tentar novamente');
      expect(html).toContain('href="/mapa"');
    });
  });

  describe('2. Cards de Resumo e Diagnóstico do Lote (ImportSummaryCards)', () => {
    it('deve renderizar os 4 cards quantitativos, metadados do arquivo, hash SHA-256 truncado e completo em srOnly', () => {
      const summary: TxtParseSummary = {
        totalLinhas: 15,
        totalValidas: 12,
        totalInvalidas: 0,
        totalDuplicadas: 3,
      };
      const classification = derivePreviewState({
        canConfirm: true,
        summary,
        allErrors: [],
      });
      const fullHash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';

      const html = renderToStaticMarkup(
        React.createElement(ImportSummaryCards, {
          summary,
          fileName: 'levantamento_crato_2026.txt',
          fileSize: 2048,
          hashSha256: fullHash,
          classification,
        })
      );

      // Metadados e hash
      expect(html).toContain('levantamento_crato_2026.txt');
      expect(html).toContain('(2,0 KB)');
      expect(html).toContain('a1b2c3d4e5...9abcdef0');
      expect(html).toContain(`(hash completo: ${fullHash})`);

      // Banner acessível
      expect(html).toContain('data-testid="diagnostic-banner-valid"');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Arquivo validado com sucesso! 12 novas nascentes prontas para confirmação.');

      // 4 cards numéricos
      expect(html).toContain('data-testid="card-total-linhas"');
      expect(html).toContain('>15<');
      expect(html).toContain('data-testid="card-validas"');
      expect(html).toContain('>12<');
      expect(html).toContain('Válidas para inclusão na base');
      expect(html).toContain('data-testid="card-duplicadas"');
      expect(html).toContain('>3<');
      expect(html).toContain('Ignoradas sem sobrescrever');
      expect(html).toContain('data-testid="card-invalidas"');
      expect(html).toContain('>0<');
      expect(html).toContain('Nenhuma falha encontrada');
    });

    it('deve exibir banner de erro impeditivo (diagnostic-banner-invalid) e aviso de cabeçalho inválido quando aplicável', () => {
      const summary: TxtParseSummary = {
        totalLinhas: 1,
        totalValidas: 0,
        totalInvalidas: 1,
        totalDuplicadas: 0,
      };
      const classification = derivePreviewState({
        canConfirm: false,
        summary,
        allErrors: MOCK_ERRORS.slice(0, 1),
      });

      const html = renderToStaticMarkup(
        React.createElement(ImportSummaryCards, {
          summary,
          fileName: 'cabecalho_errado.txt',
          classification,
          hasHeaderError: true,
        })
      );

      expect(html).toContain('data-testid="diagnostic-banner-invalid"');
      expect(html).toContain('Falha estrutural na Linha 1 (cabeçalho)');
      expect(html).toContain('Impedem confirmação definitiva');
    });
  });

  describe('3. Lista e Tabela Acessível de Erros Impeditivos (ImportErrorsList)', () => {
    it('não deve renderizar nada (null) quando a lista de erros estiver vazia', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportErrorsList, {
          errors: [],
        })
      );

      expect(html).toBe('');
    });

    it('deve renderizar seção com role="alert" aria-live="assertive", linha, campo traduzido, motivo e conteúdo informado ou fallback "Não informado"', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportErrorsList, {
          errors: MOCK_ERRORS,
        })
      );

      expect(html).toContain('data-testid="import-errors-list"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('3 erros impeditivos');

      // Linha 5 - Latitude
      expect(html).toContain('Linha 5');
      expect(html).toContain('Latitude');
      expect(html).toContain('Coordenada fora da macrorregião do Cariri');
      expect(html).toContain('-3.717220');

      // Linha 6 - Município vazio (fallback acessível)
      expect(html).toContain('Linha 6');
      expect(html).toContain('Município');
      expect(html).toContain('Campo obrigatório vazio');
      expect(html).toContain('Não informado');

      // Linha 7 - Vazão negativa
      expect(html).toContain('Linha 7');
      expect(html).toContain('Vazão média');
      expect(html).toContain('Vazão média negativa não permitida');
      expect(html).toContain('-0.500');
    });

    it('deve exibir controles de paginação quando o total de erros ultrapassar pageSize', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportErrorsList, {
          errors: MOCK_ERRORS,
          pageSize: 2,
        })
      );

      expect(html).toContain('aria-label="Navegação da lista de erros"');
      expect(html).toContain('Página anterior de erros');
      expect(html).toContain('Próxima página de erros');
    });
  });

  describe('4. Tabela de Prévia dos Dados Mapeados (ImportPreviewTable)', () => {
    it('deve unificar e ordenar linhas válidas e duplicadas cronologicamente com abas WAI-ARIA e vazão em m³/s', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportPreviewTable, {
          validRows: MOCK_VALID_ROWS,
          duplicateRows: MOCK_DUPLICATE_ROWS,
        })
      );

      // Abas WAI-ARIA
      expect(html).toContain('role="tablist"');
      expect(html).toContain('Todos (3)');
      expect(html).toContain('Novos Válidos (2)');
      expect(html).toContain('Duplicados (1)');
      expect(html).toContain('role="tabpanel"');
      expect(html).toContain('id="preview-tabpanel"');

      // Ordem cronológica das linhas: Linha 2 -> Linha 3 -> Linha 4
      const indexLine2 = html.indexOf('Linha 2');
      const indexLine3 = html.indexOf('Linha 3');
      const indexLine4 = html.indexOf('Linha 4');
      expect(indexLine2).toBeGreaterThan(-1);
      expect(indexLine3).toBeGreaterThan(indexLine2);
      expect(indexLine4).toBeGreaterThan(indexLine3);

      // Formatação de dados: coordenadas (6 casas), data (DD/MM/AAAA), vazão (m³/s com até 3 decimais) e duplicidade
      expect(html).toContain('Fonte da Batateira');
      expect(html).toContain('-7.228900, -39.414400');
      expect(html).toContain('10/05/2024');
      expect(html).toContain('0,876 m³/s');
      expect(html).toContain('12,50 m³/s');
      expect(html).toContain('Já cadastrada na base de dados');
    });

    it('deve exibir estado vazio (preview-empty-state) quando não houver linhas para exibir', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportPreviewTable, {
          validRows: [],
          duplicateRows: [],
        })
      );

      expect(html).toContain('data-testid="preview-empty-state"');
      expect(html).toContain('Nenhum registro encontrado para a categoria selecionada.');
    });
  });

  describe('5. Barra de Decisão e Regra de Habilitação da Confirmação (ImportActionBar)', () => {
    it('deve habilitar o botão de confirmação APENAS quando canConfirm=true, exibindo a contagem de novas nascentes', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportActionBar, {
          canConfirm: true,
          totalValidas: 2,
          totalInvalidas: 0,
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );

      expect(html).toContain('Lote aprovado para integração');
      expect(html).toContain('Confirmar e Adicionar 2 Nascentes');
      expect(html).toContain('Cancelar / Enviar outro');
      expect(html).toContain('aria-disabled="false"');
    });

    it('deve desabilitar o botão de confirmação e exibir mensagem de bloqueio quando houver erros impeditivos (totalInvalidas > 0)', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportActionBar, {
          canConfirm: false,
          totalValidas: 5,
          totalInvalidas: 2,
          blockingReason: 'Corrija os erros apontados no arquivo TXT e envie novamente.',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );

      expect(html).toContain('Confirmação bloqueada por regras de integridade');
      expect(html).toContain('Corrija os erros apontados no arquivo TXT e envie novamente.');
      expect(html).toContain('Enviar Arquivo Corrigido');
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain('aria-describedby="action-bar-help-text"');
    });

    it('deve desabilitar o botão de confirmação e exibir estado neutro quando o lote tiver 100% de duplicadas (totalValidas=0, totalInvalidas=0)', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportActionBar, {
          canConfirm: false,
          totalValidas: 0,
          totalInvalidas: 0,
          blockingReason: 'Todas as 3 linhas do arquivo já estão cadastradas ou duplicadas.',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );

      expect(html).toContain('Nenhum registro novo para confirmar');
      expect(html).toContain('Todas as 3 linhas do arquivo já estão cadastradas ou duplicadas.');
      expect(html).toContain('Cancelar / Enviar outro');
      expect(html).toContain('aria-disabled="true"');
    });

    it('deve desabilitar o botão de confirmação quando isConfirmed=true ("Lote Validado") ou isConfirming=true ("Confirmando...")', () => {
      const confirmedHtml = renderToStaticMarkup(
        React.createElement(ImportActionBar, {
          canConfirm: true,
          totalValidas: 4,
          isConfirmed: true,
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );
      expect(confirmedHtml).toContain('Lote Validado');
      expect(confirmedHtml).toContain('aria-disabled="true"');

      const confirmingHtml = renderToStaticMarkup(
        React.createElement(ImportActionBar, {
          canConfirm: true,
          totalValidas: 4,
          isConfirming: true,
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );
      expect(confirmingHtml).toContain('Confirmando...');
      expect(confirmingHtml).toContain('aria-disabled="true"');
    });
  });

  describe('6. Formulário de Upload e Orquestrador do Workspace (ImportUploadForm / ImportacaoWorkspace)', () => {
    it('deve renderizar o estado inicial do ImportacaoWorkspace na Etapa 1 com cabeçalho canônico e botão de validação desabilitado', () => {
      const html = renderToStaticMarkup(React.createElement(ImportacaoWorkspace));

      expect(html).toContain('data-testid="importacao-workspace"');
      expect(html).toContain('1. Submissão e Validação Sintática');
      expect(html).toContain('2. Auditoria de Prévia e Parecer');
      expect(html).toContain('3. Homologação Transacional');
      expect(html).toContain('latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media');
      expect(html).toContain('data-testid="validate-file-button"');
      expect(html).toContain('Validar Arquivo');
    });

    it('deve exibir banner de alerta (role="alert" aria-live="assertive") no ImportUploadForm quando houver erro de validação', () => {
      const html = renderToStaticMarkup(
        React.createElement(ImportUploadForm, {
          onValidate: vi.fn(),
          isValidating: false,
          error: 'O arquivo enviado excede o limite máximo permitido (5 MB).',
        })
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('O arquivo enviado excede o limite máximo permitido (5 MB).');
    });
  });

  describe('7. Segurança da Sessão de Desenvolvimento (/api/admin/dev-session)', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      if (originalNodeEnv !== undefined) {
        vi.stubEnv('NODE_ENV', originalNodeEnv);
      }
    });

    it('deve retornar 404 Not Found em GET e DELETE quando NODE_ENV não for development', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const getReq = new NextRequest('http://localhost:3000/api/admin/dev-session?token=abc');
      const getRes = await devSessionGET(getReq);
      expect(getRes.status).toBe(404);

      const delReq = new NextRequest('http://localhost:3000/api/admin/dev-session', {
        method: 'DELETE',
      });
      const delRes = await devSessionDELETE();
      expect(delRes.status).toBe(404);
      expect(delReq.method).toBe('DELETE');
    });

    it('deve retornar 400 MISSING_DEV_TOKEN quando o parâmetro token estiver ausente em development', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const req = new NextRequest('http://localhost:3000/api/admin/dev-session');
      const res = await devSessionGET(req);
      const body = (await res.json()) as { code: string };

      expect(res.status).toBe(400);
      expect(body.code).toBe('MISSING_DEV_TOKEN');
    });

    it('deve retornar 401 UNAUTHORIZED quando o token for inválido ou adulterado em development', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const req = new NextRequest('http://localhost:3000/api/admin/dev-session?token=token.invalido.assinatura');
      const res = await devSessionGET(req);
      const body = (await res.json()) as { code: string };

      expect(res.status).toBe(401);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('deve emitir cookie HttpOnly e redirecionar 303 para rota administrativa segura quando o token pertencer a admin ativo em development', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const validToken = createAdminSessionToken({
        userId: 10,
        email: 'admin@ufca.edu.br',
      });

      vi.mocked(prisma.usuario.findUnique).mockResolvedValueOnce({
        id: 10,
        ativo: true,
      } as unknown as Awaited<ReturnType<typeof prisma.usuario.findUnique>>);

      // Testa também a proteção contra Open Redirect (next=//evil.com deve cair em /admin/importacoes)
      const req = new NextRequest(
        `http://localhost:3000/api/admin/dev-session?token=${encodeURIComponent(validToken)}&next=//evil.com`
      );
      const res = await devSessionGET(req);

      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('http://localhost:3000/admin/importacoes');
      expect(res.headers.get('set-cookie')).toContain('HttpOnly');
      expect(res.headers.get('set-cookie')).toContain('SameSite=Lax');
    });
  });
});
