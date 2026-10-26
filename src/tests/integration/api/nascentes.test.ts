import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { GET } from '@/app/api/public/nascentes/route';
import { prisma } from '@/lib/db/prisma';
import {
  parseNascentesPublicResponse,
  nascentePublicItemContractSchema,
  invalidateNascentesCache,
  getNascentesCacheStats,
  resetNascentesCacheStats,
  onImportacaoConcluida,
} from '@/modules/nascentes';

function createRequest(pathAndQuery: string = '/api/public/nascentes'): NextRequest {
  const url = `http://localhost:3000${pathAndQuery}`;
  return new NextRequest(url);
}

describe('API Pública de Nascentes (GET /api/public/nascentes) - Integração', () => {
  let testUser: { id: number };
  let testImportacao: { id: number };
  const createdNascenteIds: number[] = [];

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Cria usuário e importação de teste para associar as nascentes
    testUser = await prisma.usuario.create({
      data: {
        nome: 'QA Integration Tester',
        email: `qa-nascentes-${Date.now()}@ufca.edu.br`,
        passwordHash: 'hash_para_testes',
      },
    });

    testImportacao = await prisma.importacao.create({
      data: {
        usuarioId: testUser.id,
        nomeArquivo: 'qa_nascentes.txt',
        caminhoPrivadoArquivo: `/blobs/qa_nascentes_${Date.now()}.txt`,
        hashArquivo: `hash_sha256_${Date.now()}`,
      },
    });

    // 2. Popula banco com registros de teste controlados:
    // Nascente 1: Crato, Ativa, "Nascente do Sítio A"
    const n1 = await prisma.nascente.create({
      data: {
        importacaoId: testImportacao.id,
        latitude: -7.21345600,
        longitude: -39.31567800,
        municipio: 'Crato',
        fonte: 'Nascente do Sítio A',
        localidade: 'Distrito de Santa Fé',
        dataCriacao: new Date('2026-08-01T00:00:00.000Z'),
        vazaoMedia: 2.750,
        ativo: true,
      },
    });
    createdNascenteIds.push(n1.id);

    // Nascente 2: Barbalha, Ativa, "Fonte Boa Esperança"
    const n2 = await prisma.nascente.create({
      data: {
        importacaoId: testImportacao.id,
        latitude: -7.24510000,
        longitude: -39.41020000,
        municipio: 'Barbalha',
        fonte: 'Fonte Boa Esperança',
        localidade: 'Sítio Boa Esperança',
        dataCriacao: new Date('2026-08-12T00:00:00.000Z'),
        vazaoMedia: 1.400,
        ativo: true,
      },
    });
    createdNascenteIds.push(n2.id);

    // Nascente 3: Crato, INATIVA
    const n3 = await prisma.nascente.create({
      data: {
        importacaoId: testImportacao.id,
        latitude: -7.22000000,
        longitude: -39.32000000,
        municipio: 'Crato',
        fonte: 'Nascente Inativa do Riacho',
        localidade: 'Serra do Araripe',
        dataCriacao: new Date('2026-08-15T00:00:00.000Z'),
        vazaoMedia: 0.500,
        ativo: false, // INATIVA
      },
    });
    createdNascenteIds.push(n3.id);

    // Nascente 4: Juazeiro do Norte, Ativa, fora do Bounding Box dos testes
    const n4 = await prisma.nascente.create({
      data: {
        importacaoId: testImportacao.id,
        latitude: -7.10000000,
        longitude: -39.10000000,
        municipio: 'Juazeiro do Norte',
        fonte: 'Olho D água do Centro',
        localidade: 'Centro',
        dataCriacao: new Date('2026-08-20T00:00:00.000Z'),
        vazaoMedia: 3.100,
        ativo: true,
      },
    });
    createdNascenteIds.push(n4.id);
  });

  afterAll(async () => {
    if (createdNascenteIds.length > 0) {
      await prisma.nascente.deleteMany({
        where: { id: { in: createdNascenteIds } },
      });
    }

    if (testImportacao) {
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
  });

  describe('Resposta da API somente com registros ativos', () => {
    it('deve retornar nascentes ativas e NUNCA incluir nascentes inativas no payload', async () => {
      const response = await GET(createRequest('/api/public/nascentes'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);

      const returnedIds = body.data.map((n: { id: number }) => n.id);

      // Deve incluir as ativas criadas
      expect(returnedIds).toContain(createdNascenteIds[0]);
      expect(returnedIds).toContain(createdNascenteIds[1]);
      expect(returnedIds).toContain(createdNascenteIds[3]);

      // NUNCA deve incluir a inativa
      expect(returnedIds).not.toContain(createdNascenteIds[2]);
    });
  });

  describe('Segurança de Dados e Allowlist de Campos Públicos', () => {
    it('deve expor estritamente os campos públicos autorizados e omitir colunas internas', async () => {
      const response = await GET(createRequest('/api/public/nascentes?municipio=Crato'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);

      const item = body.data.find((n: { id: number }) => n.id === createdNascenteIds[0]);
      expect(item).toBeDefined();

      // Campos autorizados
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('latitude');
      expect(item).toHaveProperty('longitude');
      expect(item).toHaveProperty('municipio', 'Crato');
      expect(item).toHaveProperty('fonte', 'Nascente do Sítio A');
      expect(item).toHaveProperty('localidade', 'Distrito de Santa Fé');
      expect(item).toHaveProperty('data_criacao', '2026-08-01');
      expect(item).toHaveProperty('vazao_media', 2.75);
      expect(item).toHaveProperty('unidade_vazao', 'm³/s');

      // Campos proibidos (Zero vazamento de dados internos)
      expect(item).not.toHaveProperty('usuarioId');
      expect(item).not.toHaveProperty('usuario_id');
      expect(item).not.toHaveProperty('importacaoId');
      expect(item).not.toHaveProperty('importacao_id');
      expect(item).not.toHaveProperty('caminhoPrivadoArquivo');
      expect(item).not.toHaveProperty('hashArquivo');
      expect(item).not.toHaveProperty('createdAt');
      expect(item).not.toHaveProperty('created_at');
    });

    it('deve formatar data_criacao como AAAA-MM-DD e vazao_media como número', async () => {
      const response = await GET(createRequest(`/api/public/nascentes`));
      const body = await response.json();

      for (const item of body.data) {
        expect(typeof item.vazao_media).toBe('number');
        expect(item.unidade_vazao).toBe('m³/s');
        expect(item.data_criacao).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('deve validar estritamente o payload retornado da API real contra o contrato Zod público', async () => {
      const response = await GET(createRequest('/api/public/nascentes'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/json');

      // Validação formal com schema Zod estrito em runtime
      const validated = parseNascentesPublicResponse(body);
      expect(validated.data.length).toBeGreaterThanOrEqual(3);
      expect(validated.meta.total).toBe(validated.data.length);
      expect(typeof validated.meta.updated_at).toBe('string');
    });

    it('deve validar contrato Zod mesmo quando a consulta pública retornar conjunto vazio', async () => {
      const response = await GET(createRequest('/api/public/nascentes?municipio=MunicipioInexistenteXYZ'));
      const body = await response.json();

      expect(response.status).toBe(200);
      const validated = parseNascentesPublicResponse(body);
      expect(validated.data).toEqual([]);
      expect(validated.meta.total).toBe(0);
      expect(validated.meta.updated_at).toBeNull();
    });

    it('deve reprovar a validação de contrato se qualquer campo interno for injetado nos itens', async () => {
      const response = await GET(createRequest('/api/public/nascentes?municipio=Crato'));
      const body = await response.json();

      expect(body.data.length).toBeGreaterThanOrEqual(1);
      const firstItem = body.data[0];

      // Prova de mutação negativa: simulação de vazamento inadvertido de dados internos
      const sensitiveInjections = [
        { usuarioId: 999 },
        { importacaoId: 888 },
        { caminhoPrivadoArquivo: '/blobs/segredo.txt' },
        { hashArquivo: 'sha256_injetado' },
        { passwordHash: '$2b$10$hashsecreto' },
        { createdAt: new Date().toISOString() },
        { ativo: true },
      ];

      for (const injection of sensitiveInjections) {
        const mutatedItem = { ...firstItem, ...injection };
        expect(() => nascentePublicItemContractSchema.parse(mutatedItem)).toThrow(ZodError);

        try {
          nascentePublicItemContractSchema.parse(mutatedItem);
        } catch (error) {
          const zodError = error as ZodError;
          expect(zodError.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
        }
      }
    });

    it('deve reprovar a validação de contrato se campos desconhecidos forem injetados na raiz do envelope', async () => {
      const response = await GET(createRequest('/api/public/nascentes'));
      const body = await response.json();

      const mutatedEnvelope = {
        ...body,
        adminAuditLog: 'registro_interno_indevido',
      };

      expect(() => parseNascentesPublicResponse(mutatedEnvelope)).toThrow(ZodError);
      try {
        parseNascentesPublicResponse(mutatedEnvelope);
      } catch (error) {
        const zodError = error as ZodError;
        expect(zodError.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
      }
    });
  });

  describe('Filtros Públicos (Município e Busca Textual)', () => {
    it('deve filtrar corretamente por município', async () => {
      const response = await GET(createRequest('/api/public/nascentes?municipio=Barbalha'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);

      for (const item of body.data) {
        expect(item.municipio.toLowerCase()).toBe('barbalha');
      }
    });

    it('deve realizar busca textual por termo contido na fonte', async () => {
      const response = await GET(createRequest('/api/public/nascentes?q=Esperança'));
      const body = await response.json();

      expect(response.status).toBe(200);
      const item = body.data.find((n: { id: number }) => n.id === createdNascenteIds[1]);
      expect(item).toBeDefined();
      expect(item.fonte).toContain('Boa Esperança');
    });

    it('deve realizar busca textual por termo contido na localidade', async () => {
      const response = await GET(createRequest('/api/public/nascentes?q=Santa%20Fé'));
      const body = await response.json();

      expect(response.status).toBe(200);
      const item = body.data.find((n: { id: number }) => n.id === createdNascenteIds[0]);
      expect(item).toBeDefined();
      expect(item.localidade).toContain('Santa Fé');
    });

    it('deve combinar filtros de município e busca textual (AND)', async () => {
      const response = await GET(createRequest('/api/public/nascentes?municipio=Crato&q=Sítio'));
      const body = await response.json();

      expect(response.status).toBe(200);
      const item = body.data.find((n: { id: number }) => n.id === createdNascenteIds[0]);
      expect(item).toBeDefined();
      expect(item.municipio).toBe('Crato');
      expect(item.fonte).toContain('Sítio');
    });
  });

  describe('Filtro por Bounding Box Geográfico', () => {
    it('deve retornar apenas registros dentro do retângulo delimitado', async () => {
      // Bounding box cobrindo apenas Crato e Barbalha das fixtures (lat: -7.21 a -7.25, lng: -39.42 a -39.30)
      const query = '/api/public/nascentes?north=-7.200000&south=-7.300000&east=-39.300000&west=-39.450000';
      const response = await GET(createRequest(query));
      const body = await response.json();

      expect(response.status).toBe(200);
      const returnedIds = body.data.map((n: { id: number }) => n.id);

      // Deve incluir n1 e n2
      expect(returnedIds).toContain(createdNascenteIds[0]);
      expect(returnedIds).toContain(createdNascenteIds[1]);

      // NUNCA deve incluir n4 que está em latitude -7.100000 e longitude -39.100000 (fora do box)
      expect(returnedIds).not.toContain(createdNascenteIds[3]);
    });

    it('deve responder 400 VALIDATION_ERROR se o Bounding Box for incompleto', async () => {
      const response = await GET(createRequest('/api/public/nascentes?north=-7.2'));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details.some((d: { campo: string }) => d.campo.includes('bounds'))).toBe(true);
    });

    it('deve responder 400 VALIDATION_ERROR se latitudes forem invertidas (north < south)', async () => {
      const query = '/api/public/nascentes?north=-7.5&south=-7.0&east=-39.0&west=-40.0';
      const response = await GET(createRequest(query));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Estados Vazios e Metadados', () => {
    it('deve retornar data vazio e updated_at nulo quando nenhum registro atender ao filtro', async () => {
      const response = await GET(createRequest('/api/public/nascentes?municipio=MunicipioInexistenteXYZ'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
      expect(body.meta.updated_at).toBeNull();
    });

    it('deve calcular meta.total correspondente ao total de registros retornados', async () => {
      const response = await GET(createRequest('/api/public/nascentes?municipio=Barbalha'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.meta.total).toBe(body.data.length);
      expect(typeof body.meta.updated_at).toBe('string');
    });
  });

  describe('Segurança, Integridade Relacional e Entradas Hostis', () => {
    it('deve garantir que buscas textuais coincidentes com dados de nascentes inativas NUNCA quebrem a cláusula ativo=true', async () => {
      // "Nascente Inativa do Riacho" (n3) possui "Riacho" e "Araripe", mas ativo=false
      const queries = [
        '/api/public/nascentes?q=Riacho',
        '/api/public/nascentes?q=Inativa',
        '/api/public/nascentes?q=Araripe',
        '/api/public/nascentes?municipio=Crato&q=Riacho',
      ];

      for (const query of queries) {
        const response = await GET(createRequest(query));
        const body = await response.json();

        expect(response.status).toBe(200);
        const returnedIds = body.data.map((n: { id: number }) => n.id);

        // A nascente inativa JAMAIS pode ser vazada, mesmo com busca de texto idêntica
        expect(returnedIds).not.toContain(createdNascenteIds[2]);
      }
    });

    it('deve neutralizar tentativas de SQL Injection em parâmetros de busca tratando-os como literais seguros', async () => {
      const sqliPayloads = [
        "' OR '1'='1",
        "'; DROP TABLE nascente; --",
        "Crato' UNION SELECT 1, 2, 3, 4, 5, 6, 7, 8 --",
        "' OR 1=1 --",
        "admin'--",
        "1' OR '1' = '1' /*",
      ];

      for (const payload of sqliPayloads) {
        // Testa via município
        const resMunicipio = await GET(
          createRequest(`/api/public/nascentes?municipio=${encodeURIComponent(payload)}`)
        );
        expect(resMunicipio.status).toBe(200);
        const bodyMun = await resMunicipio.json();
        expect(Array.isArray(bodyMun.data)).toBe(true);
        // Não deve retornar nascente inativa e deve ser payload válido
        const validatedMun = parseNascentesPublicResponse(bodyMun);
        expect(validatedMun.data.some((n) => n.id === createdNascenteIds[2])).toBe(false);

        // Testa via termo de busca 'q'
        const resQ = await GET(
          createRequest(`/api/public/nascentes?q=${encodeURIComponent(payload)}`)
        );
        expect(resQ.status).toBe(200);
        const bodyQ = await resQ.json();
        expect(Array.isArray(bodyQ.data)).toBe(true);
        const validatedQ = parseNascentesPublicResponse(bodyQ);
        expect(validatedQ.data.some((n) => n.id === createdNascenteIds[2])).toBe(false);
      }

      // Prova de integridade de banco de dados: a tabela 'nascente' continua íntegra e acessível
      const totalCount = await prisma.nascente.count();
      expect(totalCount).toBeGreaterThanOrEqual(4);
    });

    it('deve neutralizar vetores de XSS em query strings sem quebra de execução ou injeção de HTML (QA)', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<svg/onload=alert(1)>',
        '"><img src=x onerror=alert(1)>',
        '<iframe src="javascript:alert(1)"></iframe>',
        'javascript:/*--></title></style></textarea>*/<script>alert(1)</script>',
      ];

      for (const payload of xssPayloads) {
        const response = await GET(
          createRequest(`/api/public/nascentes?q=${encodeURIComponent(payload)}`)
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/json');

        const body = await response.json();
        const validated = parseNascentesPublicResponse(body);
        expect(Array.isArray(validated.data)).toBe(true);
      }
    });

    it('deve rejeitar com 400 VALIDATION_ERROR tentativas de overflow/DoS que excedam o tamanho máximo permitido', async () => {
      // Limite máximo: municipio <= 150 caracteres, q <= 100 caracteres
      const oversizedMunicipio = 'A'.repeat(151);
      const resMunicipio = await GET(
        createRequest(`/api/public/nascentes?municipio=${oversizedMunicipio}`)
      );
      expect(resMunicipio.status).toBe(400);
      const bodyMun = await resMunicipio.json();
      expect(bodyMun.code).toBe('VALIDATION_ERROR');
      expect(bodyMun.details.some((d: { campo: string }) => d.campo === 'municipio')).toBe(true);

      const oversizedQ = 'B'.repeat(101);
      const resQ = await GET(
        createRequest(`/api/public/nascentes?q=${oversizedQ}`)
      );
      expect(resQ.status).toBe(400);
      const bodyQ = await resQ.json();
      expect(bodyQ.code).toBe('VALIDATION_ERROR');
      expect(bodyQ.details.some((d: { campo: string }) => d.campo === 'q')).toBe(true);
    });

    it('deve rejeitar com 400 VALIDATION_ERROR coordenadas de Bounding Box fora da escala global ou inválidas', async () => {
      // Coordenadas fora da faixa [-90, 90] ou [-180, 180]
      const invalidQueries = [
        '/api/public/nascentes?north=91&south=0&east=0&west=0',
        '/api/public/nascentes?north=0&south=-91&east=0&west=0',
        '/api/public/nascentes?north=0&south=0&east=181&west=0',
        '/api/public/nascentes?north=0&south=0&east=0&west=-181',
        '/api/public/nascentes?north=not_a_number&south=0&east=0&west=0',
      ];

      for (const query of invalidQueries) {
        const response = await GET(createRequest(query));
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('deve garantir que payloads de erro 400 não vazem stack traces, paths internos ou credenciais', async () => {
      const response = await GET(
        createRequest('/api/public/nascentes?north=invalido&south=0&east=0&west=0')
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      const serialized = JSON.stringify(body);

      // Não deve vazar caminhos de arquivos, stack trace ou variáveis de ambiente
      expect(serialized).not.toContain('node_modules');
      expect(serialized).not.toContain('stack');
      expect(serialized).not.toContain('DATABASE_URL');
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('mysql://');
    });
  });

  describe('Otimização e Cache em Memória', () => {
    beforeEach(() => {
      invalidateNascentesCache();
      resetNascentesCacheStats();
    });

    it('deve manter a busca literal none isolada da listagem sem filtros', async () => {
      const unfiltered = await GET(createRequest('/api/public/nascentes'));
      expect((await unfiltered.json()).data.length).toBeGreaterThan(0);
      const filtered = await GET(createRequest('/api/public/nascentes?q=none'));
      expect(filtered.status).toBe(200);
      expect((await filtered.json()).data).toEqual([]);
    });

    it('deve respeitar limites geográficos próximos mesmo após armazenar outra área em cache', async () => {
      const common = '/api/public/nascentes?south=-7.3&east=-39.3&west=-39.4';
      const included = await GET(createRequest(`${common}&north=-7.21345599`));
      expect(included.status).toBe(200);
      const includedData = (await included.json()).data;
      expect(includedData.some((item: { id: number }) => item.id === createdNascenteIds[0])).toBe(true);
      const excluded = await GET(createRequest(`${common}&north=-7.21345601`));
      expect(excluded.status).toBe(200);
      const excludedData = (await excluded.json()).data;
      expect(excludedData.some((item: { id: number }) => item.id === createdNascenteIds[0])).toBe(false);
    });

    it('deve incluir o cabeçalho Cache-Control com diretivas públicas corretas', async () => {
      const response = await GET(createRequest('/api/public/nascentes'));
      expect(response.status).toBe(200);

      const cacheControl = response.headers.get('Cache-Control');
      expect(cacheControl).toBe('public, s-maxage=60, stale-while-revalidate=300');
    });

    it('deve armazenar a primeira resposta em cache e atender chamadas subsequentes com cache hit', async () => {
      const query = '/api/public/nascentes?municipio=Crato';

      // 1ª requisição (Cache MISS -> Banco de Dados)
      const res1 = await GET(createRequest(query));
      expect(res1.status).toBe(200);
      const json1 = await res1.json();

      const stats1 = getNascentesCacheStats();
      expect(stats1.size).toBe(1);
      expect(stats1.misses).toBe(1);
      expect(stats1.hits).toBe(0);

      // 2ª requisição idêntica (Cache HIT -> Memória)
      const res2 = await GET(createRequest(query));
      expect(res2.status).toBe(200);
      const json2 = await res2.json();

      const stats2 = getNascentesCacheStats();
      expect(stats2.size).toBe(1);
      expect(stats2.hits).toBe(1);
      expect(stats2.misses).toBe(1);

      // Integridade referencial do contrato retornado
      expect(json2).toEqual(json1);
    });

    it('deve invalidar o cache atomicamente via invalidateNascentesCache restaurando leitura fresca', async () => {
      const query = '/api/public/nascentes?municipio=Barbalha';

      // Popula o cache
      const res1 = await GET(createRequest(query));
      expect(res1.status).toBe(200);
      expect(getNascentesCacheStats().size).toBe(1);

      // Invalidação atômica
      invalidateNascentesCache();
      expect(getNascentesCacheStats().size).toBe(0);

      // Nova chamada deve computar MISS e consultar o banco
      const res2 = await GET(createRequest(query));
      expect(res2.status).toBe(200);
      expect(getNascentesCacheStats().size).toBe(1);
      expect(getNascentesCacheStats().misses).toBe(2);
    });

    it('deve invalidar o cache quando o gatilho onImportacaoConcluida for acionado', async () => {
      const query = '/api/public/nascentes?municipio=Crato';

      // Popula o cache
      const res1 = await GET(createRequest(query));
      expect(res1.status).toBe(200);
      expect(getNascentesCacheStats().size).toBe(1);

      // Gatilho de importação concluída
      onImportacaoConcluida(testImportacao.id);
      expect(getNascentesCacheStats().size).toBe(0);

      // Próxima requisição computa miss
      const res2 = await GET(createRequest(query));
      expect(res2.status).toBe(200);
      expect(getNascentesCacheStats().size).toBe(1);
    });
  });
});
