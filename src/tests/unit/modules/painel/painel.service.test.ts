/**
 * Nascentes do Cariri — Testes Unitários: Serviço e Contratos do Painel Administrativo
 *
 * Cobre `src/modules/painel/painel.service.ts` e `src/modules/painel/painel.contracts.ts`:
 * - Consultas paralelas no Prisma com projeção fechada (allowlist sem campos privados/PII);
 * - Contagem estrita de nascentes ativas (`ativo: true`) e limite determinístico de 5 lotes;
 * - Derivação de `ultimaImportacao` a partir de `historicoRecente[0]` sem query extra;
 * - Validação Zod v4 (.strict()) e helpers puros Unicode/pt-BR de perfil e estado.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { StatusImportacao, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import {
  ADMIN_RECENT_IMPORTACOES_LIMIT,
  PAINEL_ERROR_CODES,
  PainelService,
  adminResumoResponseSchema,
  deriveAdminDashboardState,
  deriveAdminInitials,
  toAdminProfileView,
} from '@/modules/painel';

function createMockPrisma() {
  return {
    nascente: {
      count: vi.fn(),
    },
    importacao: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
  };
}

describe('PainelService e contratos do painel administrativo (Task-31 / Etapa 1)', () => {
  describe('1. Isolamento client-safe e helpers puros (painel.contracts.ts)', () => {
    it('painel.contracts.ts não deve importar módulos server-only (Prisma, Node ou Next)', () => {
      const contractsPath = path.resolve(
        process.cwd(),
        'src/modules/painel/painel.contracts.ts'
      );
      const source = fs.readFileSync(contractsPath, 'utf-8');

      expect(source).not.toMatch(/from\s+['"]@prisma\/client['"]/);
      expect(source).not.toMatch(/from\s+['"]node:/);
      expect(source).not.toMatch(/from\s+['"]next\//);
    });

    it('deriveAdminInitials deve cobrir 1 nome, múltiplos nomes, espaços, acentos pt-BR e fallbacks', () => {
      expect(deriveAdminInitials('Thiago Bessa')).toBe('TB');
      expect(deriveAdminInitials('Maria de Lourdes da Silva')).toBe('MS');
      expect(deriveAdminInitials('  José    da   Silva  ')).toBe('JS');
      expect(deriveAdminInitials('Érica Óscar')).toBe('ÉÓ');
      expect(deriveAdminInitials('Álvaro')).toBe('ÁL');
      expect(deriveAdminInitials('Admin')).toBe('AD');
      expect(deriveAdminInitials('A')).toBe('A');
      expect(deriveAdminInitials('   ', 'thiago.bessa@ufca.edu.br')).toBe('TH');
      expect(deriveAdminInitials('', 'é.silva@ufca.edu.br')).toBe('ÉS');
      expect(deriveAdminInitials('\u0000\t\n', '')).toBe('AD');
      expect(deriveAdminInitials(null, null)).toBe('AD');
    });

    it('toAdminProfileView deve projetar exclusivamente nome, email e iniciais sem vazar metadados internos', () => {
      const rawSession = {
        id: 42,
        nome: '  Ana Clara Medeiros  ',
        email: '  ana.medeiros@ufca.edu.br  ',
        ativo: true,
        sessionId: 999,
        sessionExpiresAt: new Date('2026-12-31T23:59:59.000Z'),
        passwordHash: '$2b$12$secret',
      };

      const profile = toAdminProfileView(rawSession);

      expect(profile).toEqual({
        nome: 'Ana Clara Medeiros',
        email: 'ana.medeiros@ufca.edu.br',
        iniciais: 'AM',
      });
      expect(Object.keys(profile).sort()).toEqual(['email', 'iniciais', 'nome']);
    });

    it('toAdminProfileView deve aplicar fallback "Administrador" quando nome estiver vazio', () => {
      const profile = toAdminProfileView({
        nome: '   ',
        email: 'gestor@ufca.edu.br',
      });

      expect(profile).toEqual({
        nome: 'Administrador',
        email: 'gestor@ufca.edu.br',
        iniciais: 'GE',
      });
    });

    it('deriveAdminDashboardState deve distinguir vazio total de casos parciais e populados', () => {
      const emptyDto = {
        indicadores: {
          totalNascentesAtivas: 0,
          totalImportacoes: 0,
          ultimaImportacao: null,
        },
        historicoRecente: [],
        meta: {
          recentLimit: 5,
          generatedAt: '2026-11-26T14:00:00.000Z',
        },
      } as const;

      expect(deriveAdminDashboardState(emptyDto).status).toBe('empty');

      const failedFirstImportDto = {
        indicadores: {
          totalNascentesAtivas: 0,
          totalImportacoes: 1,
          ultimaImportacao: {
            id: 7,
            nomeArquivo: 'lote-com-erro.txt',
            status: 'FALHOU' as const,
            totalLinhas: 10,
            totalValidas: 0,
            totalInvalidas: 10,
            totalDuplicadas: 0,
            createdAt: '2026-11-26T13:50:00.000Z',
            concluidaAt: '2026-11-26T13:50:05.000Z',
            usuario: { id: 1, nome: 'Admin UFCA' },
          },
        },
        historicoRecente: [
          {
            id: 7,
            nomeArquivo: 'lote-com-erro.txt',
            status: 'FALHOU' as const,
            totalLinhas: 10,
            totalValidas: 0,
            totalInvalidas: 10,
            totalDuplicadas: 0,
            createdAt: '2026-11-26T13:50:00.000Z',
            concluidaAt: '2026-11-26T13:50:05.000Z',
            usuario: { id: 1, nome: 'Admin UFCA' },
          },
        ],
        meta: {
          recentLimit: 5,
          generatedAt: '2026-11-26T14:00:00.000Z',
        },
      };

      expect(deriveAdminDashboardState(failedFirstImportDto).status).toBe('success');

      const springsWithoutImportsDto = {
        ...emptyDto,
        indicadores: {
          ...emptyDto.indicadores,
          totalNascentesAtivas: 12,
        },
      };

      expect(deriveAdminDashboardState(springsWithoutImportsDto).status).toBe('success');
    });
  });

  describe('2. PainelService.getResumo()', () => {
    it('deve consultar nascentes ativas e 5 lotes recentes com projeção fechada sem query findFirst extra', async () => {
      const mockPrisma = createMockPrisma();
      const fixedNow = new Date('2026-11-26T14:30:00.000Z');

      mockPrisma.nascente.count.mockResolvedValue(128);
      mockPrisma.importacao.count.mockResolvedValue(9);
      mockPrisma.importacao.findMany.mockResolvedValue([
        {
          id: 25,
          nomeArquivo: 'cariri-novembro.txt',
          status: StatusImportacao.CONCLUIDA,
          totalLinhas: 40,
          totalValidas: 38,
          totalInvalidas: 0,
          totalDuplicadas: 2,
          createdAt: new Date('2026-11-26T12:00:00.000Z'),
          concluidaAt: new Date('2026-11-26T12:01:00.000Z'),
          usuario: { id: 1, nome: 'Prof. Coordenador' },
        },
        {
          id: 24,
          nomeArquivo: 'cariri-outubro.txt',
          status: StatusImportacao.AGUARDANDO_CONFIRMACAO,
          totalLinhas: 15,
          totalValidas: 15,
          totalInvalidas: 0,
          totalDuplicadas: 0,
          createdAt: new Date('2026-11-20T10:00:00.000Z'),
          concluidaAt: null,
          usuario: { id: 2, nome: 'Pesquisadora UFCA' },
        },
      ]);

      const service = new PainelService({
        prismaClient: mockPrisma as unknown as PrismaClient,
      });

      const result = await service.getResumo({ now: fixedNow });

      expect(mockPrisma.nascente.count).toHaveBeenCalledWith({
        where: { ativo: true },
      });
      expect(mockPrisma.importacao.count).toHaveBeenCalledTimes(1);
      expect(mockPrisma.importacao.findFirst).not.toHaveBeenCalled();

      const findManyArg = mockPrisma.importacao.findMany.mock.calls[0]?.[0] as {
        readonly select: Record<string, unknown>;
        readonly orderBy: unknown;
        readonly take: number;
      };

      expect(findManyArg.take).toBe(ADMIN_RECENT_IMPORTACOES_LIMIT);
      expect(findManyArg.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);

      // Projeção allowlist estrita: campos sensíveis/internos ausentes na origem
      expect(findManyArg.select).not.toHaveProperty('caminhoPrivadoArquivo');
      expect(findManyArg.select).not.toHaveProperty('hashArquivo');
      expect(findManyArg.select).not.toHaveProperty('mensagemErro');
      expect(findManyArg.select.usuario).toEqual({
        select: { id: true, nome: true },
      });

      expect(result.indicadores.totalNascentesAtivas).toBe(128);
      expect(result.indicadores.totalImportacoes).toBe(9);
      expect(result.indicadores.ultimaImportacao).toEqual(result.historicoRecente[0]);
      expect(result.historicoRecente).toHaveLength(2);
      expect(result.historicoRecente[1]?.concluidaAt).toBeNull();
      expect(result.meta).toEqual({
        recentLimit: 5,
        generatedAt: '2026-11-26T14:30:00.000Z',
      });

      // Conformidade com schema Zod v4 .strict()
      const parsed = adminResumoResponseSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('deve retornar ultimaImportacao null e lista vazia quando o banco estiver vazio', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.nascente.count.mockResolvedValue(0);
      mockPrisma.importacao.count.mockResolvedValue(0);
      mockPrisma.importacao.findMany.mockResolvedValue([]);

      const service = new PainelService({
        prismaClient: mockPrisma as unknown as PrismaClient,
      });

      const result = await service.getResumo({
        now: new Date('2026-11-26T15:00:00.000Z'),
      });

      expect(result.indicadores).toEqual({
        totalNascentesAtivas: 0,
        totalImportacoes: 0,
        ultimaImportacao: null,
      });
      expect(result.historicoRecente).toEqual([]);
      expect(adminResumoResponseSchema.safeParse(result).success).toBe(true);
    });

    it('deve aceitar recentLimit válido dentro do limite e rejeitar entradas inválidas com AppError 400', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.nascente.count.mockResolvedValue(5);
      mockPrisma.importacao.count.mockResolvedValue(0);
      mockPrisma.importacao.findMany.mockResolvedValue([]);

      const service = new PainelService({
        prismaClient: mockPrisma as unknown as PrismaClient,
      });

      const custom = await service.getResumo({ recentLimit: 10 });
      expect(custom.meta.recentLimit).toBe(10);
      expect(mockPrisma.importacao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );

      for (const invalidLimit of [0, -3, 21, 2.5, Number.NaN]) {
        await expect(
          service.getResumo({ recentLimit: invalidLimit })
        ).rejects.toMatchObject({
          statusCode: 400,
          code: PAINEL_ERROR_CODES.INVALID_PAINEL_INPUT,
        });
      }

      try {
        await service.getResumo({ recentLimit: 0 });
        expect.unreachable('Deveria lançar AppError para recentLimit inválido');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
      }
    });
  });
});
