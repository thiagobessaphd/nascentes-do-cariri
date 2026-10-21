import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import { ZodError } from 'zod';
import { GET } from '@/app/api/public/municipios/route';
import { prisma } from '@/lib/db/prisma';
import type { Usuario, Importacao } from '@prisma/client';
import { parseMunicipiosPublicResponse } from '@/modules/municipios';

describe('Integração — API Pública de Municípios (GET /api/public/municipios)', () => {
  let testUser: Usuario;
  let testImportacao: Importacao;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Cria usuário e importação de teste para associar as nascentes
    testUser = await prisma.usuario.create({
      data: {
        nome: 'Tester Municipios QA',
        email: `qa-municipios-${Date.now()}@exemplo.com`,
        passwordHash: '$2b$10$fakehashformunicipiostestingsuite0000000000000000000',
      },
    });

    testImportacao = await prisma.importacao.create({
      data: {
        usuarioId: testUser.id,
        nomeArquivo: 'municipios_test.txt',
        caminhoPrivadoArquivo: 'privado/municipios_test.txt',
        hashArquivo: `hash_mun_${Date.now()}`,
        status: 'CONCLUIDA',
      },
    });

    // 2. Cria fixtures via createMany para alta performance
    await prisma.nascente.createMany({
      data: [
        {
          importacaoId: testImportacao.id,
          latitude: -7.23000000,
          longitude: -39.41000000,
          municipio: 'Crato',
          fonte: `Fonte Crato 1 - ${Date.now()}`,
          localidade: 'Sítio Fundão',
          dataCriacao: new Date('2026-08-01T00:00:00.000Z'),
          vazaoMedia: 1.500,
          ativo: true,
        },
        {
          importacaoId: testImportacao.id,
          latitude: -7.24000000,
          longitude: -39.42000000,
          municipio: 'Crato',
          fonte: `Fonte Crato 2 - ${Date.now()}`,
          localidade: 'Sítio Lameiro',
          dataCriacao: new Date('2026-08-02T00:00:00.000Z'),
          vazaoMedia: 2.100,
          ativo: true,
        },
        {
          importacaoId: testImportacao.id,
          latitude: -7.31000000,
          longitude: -39.30000000,
          municipio: 'Barbalha',
          fonte: `Fonte Barbalha 1 - ${Date.now()}`,
          localidade: 'Arajara',
          dataCriacao: new Date('2026-08-03T00:00:00.000Z'),
          vazaoMedia: 3.200,
          ativo: true,
        },
        {
          importacaoId: testImportacao.id,
          latitude: -7.25000000,
          longitude: -39.14000000,
          municipio: 'Missão Velha',
          fonte: `Fonte Missao Velha 1 - ${Date.now()}`,
          localidade: 'Jamacaru',
          dataCriacao: new Date('2026-08-04T00:00:00.000Z'),
          vazaoMedia: 0.850,
          ativo: true,
        },
        {
          importacaoId: testImportacao.id,
          latitude: -7.20000000,
          longitude: -39.31000000,
          municipio: 'Juazeiro do Norte',
          fonte: `Fonte Juazeiro 1 - ${Date.now()}`,
          localidade: 'Horto',
          dataCriacao: new Date('2026-08-05T00:00:00.000Z'),
          vazaoMedia: 2.400,
          ativo: true,
        },
        {
          importacaoId: testImportacao.id,
          latitude: -7.49000000,
          longitude: -38.98000000,
          municipio: 'Brejo Santo Inativo',
          fonte: `Fonte Brejo Santo Inativa - ${Date.now()}`,
          localidade: 'Zona Rural',
          dataCriacao: new Date('2026-08-06T00:00:00.000Z'),
          vazaoMedia: 0.500,
          ativo: false,
        },
      ],
    });
  }, 30000);

  afterAll(async () => {
    if (testImportacao) {
      await prisma.nascente.deleteMany({
        where: { importacaoId: testImportacao.id },
      });

      await prisma.importacao.delete({
        where: { id: testImportacao.id },
      });
    }

    if (testUser) {
      await prisma.usuario.delete({
        where: { id: testUser.id },
      });
    }

    await prisma.$disconnect();
  }, 30000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Regras de Negócio e Filtragem por Ativos', () => {
    it('deve retornar apenas municípios com nascentes ativas e NUNCA incluir municípios com nascentes exclusivamente inativas', async () => {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);

      // Deve incluir municípios com nascentes ativas
      expect(body.data).toContain('Crato');
      expect(body.data).toContain('Barbalha');
      expect(body.data).toContain('Missão Velha');
      expect(body.data).toContain('Juazeiro do Norte');

      // NUNCA deve incluir município com apenas nascente inativa
      expect(body.data).not.toContain('Brejo Santo Inativo');
    });

    it('deve deduplicar municípios que possuem múltiplas nascentes cadastradas', async () => {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);

      // Crato possui 2 nascentes ativas no seed, mas deve constar exatamente 1 vez
      const cratoOccurrences = body.data.filter((m: string) => m === 'Crato').length;
      expect(cratoOccurrences).toBe(1);
    });

    it('deve retornar a lista em ordem alfabética crescente respeitando a acentuação pt-BR', async () => {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);

      const municipios: string[] = body.data;
      const sortedMunicipios = [...municipios].sort((a, b) =>
        a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
      );

      expect(municipios).toEqual(sortedMunicipios);
    });
  });

  describe('Contrato, Segurança e Metadados', () => {
    it('deve retornar estrutura com envelope padronizado { data, meta: { total } } e cabeçalho json utf-8', async () => {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      // Validação de política de cache para CDN / Edge
      const cacheControl = response.headers.get('Cache-Control');
      expect(cacheControl).toBeDefined();
      expect(cacheControl).toContain('public');
      expect(cacheControl).toContain('s-maxage=60');
      expect(cacheControl).toContain('stale-while-revalidate=300');

      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(typeof body.meta.total).toBe('number');
      expect(body.meta.total).toBe(body.data.length);
      expect(body.meta.total).toBeGreaterThanOrEqual(4);
    });

    it('não deve vazar identificadores internos, dados de usuário ou metadados de importação', async () => {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);

      // Cada item do array deve ser estritamente uma string
      for (const item of body.data) {
        expect(typeof item).toBe('string');
      }

      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain('passwordHash');
      expect(bodyStr).not.toContain('usuarioId');
      expect(bodyStr).not.toContain('importacaoId');
      expect(bodyStr).not.toContain('caminhoPrivadoArquivo');
    });

    it('deve validar estritamente a resposta da API real contra o contrato Zod público', async () => {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);

      // Validação formal com schema Zod estrito em runtime
      const validated = parseMunicipiosPublicResponse(body);
      expect(Array.isArray(validated.data)).toBe(true);
      expect(validated.meta.total).toBe(validated.data.length);
      expect(validated.meta.total).toBeGreaterThanOrEqual(4);
      expect(validated.data).toContain('Crato');
      expect(validated.data).toContain('Barbalha');
    });

    it('deve reprovar a validação de contrato (ZodError com unrecognized_keys) se colunas internas forem injetadas na resposta', async () => {
      const response = await GET();
      const body = await response.json();

      const mutatedPayload = {
        ...body,
        usuarioId: 10,
        passwordHash: '$2b$10$hashsecreto',
      };

      expect(() => parseMunicipiosPublicResponse(mutatedPayload)).toThrow(ZodError);

      try {
        parseMunicipiosPublicResponse(mutatedPayload);
      } catch (error) {
        const zodError = error as ZodError;
        expect(zodError.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
      }
    });

    it('deve reprovar a validação de contrato se campos extras forem injetados nos metadados', async () => {
      const response = await GET();
      const body = await response.json();

      const mutatedMeta = {
        ...body,
        meta: {
          ...body.meta,
          dbQueryDurationMs: 4.2,
        },
      };

      expect(() => parseMunicipiosPublicResponse(mutatedMeta)).toThrow(ZodError);

      try {
        parseMunicipiosPublicResponse(mutatedMeta);
      } catch (error) {
        const zodError = error as ZodError;
        expect(zodError.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
      }
    });
  });

  describe('Cenários de Fronteira e Resiliência', () => {
    it('deve retornar array vazio e total 0 quando não houver nenhuma nascente ativa no banco', async () => {
      vi.spyOn(prisma.nascente, 'findMany').mockResolvedValueOnce([]);

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('deve retornar 500 INTERNAL_SERVER_ERROR e mensagem segura caso ocorra falha de conexão com o banco', async () => {
      vi.spyOn(prisma.nascente, 'findMany').mockRejectedValueOnce(
        new Error('Can not connect to MySQL server at 127.0.0.1:3307')
      );

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.code).toBe('INTERNAL_SERVER_ERROR');
      expect(body.error).toBe('Ocorreu um erro interno ao processar a solicitação.');

      // Garante que detalhes de rede ou credenciais não vazam no erro
      expect(JSON.stringify(body)).not.toContain('127.0.0.1');
      expect(JSON.stringify(body)).not.toContain('3307');
    });
  });
});
