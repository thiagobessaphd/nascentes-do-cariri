import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildNascentesCacheKey,
  NascentesMemoryCache,
  getNascentesFromCache,
  setNascentesInCache,
  invalidateNascentesCache,
  getNascentesCacheStats,
  resetNascentesCacheStats,
  withNascentesCacheInvalidation,
  onImportacaoConcluida,
  DEFAULT_NASCENTES_CACHE_TTL_MS,
  DEFAULT_NASCENTES_CACHE_MAX_ENTRIES,
} from '@/modules/nascentes/nascentes.cache';
import { getNascentesPublicas } from '@/modules/nascentes/nascentes.service';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { NascentesPublicResponse } from '@/modules/nascentes/nascentes.dto';

const mockResponse: NascentesPublicResponse = {
  data: [
    {
      id: 1,
      latitude: -7.2,
      longitude: -39.3,
      municipio: 'Crato',
      fonte: 'Fonte Teste',
      localidade: 'Localidade Teste',
      data_criacao: '2026-01-01',
      vazao_media: 2.5,
      unidade_vazao: 'm³/s',
    },
  ],
  meta: {
    total: 1,
    updated_at: '2026-01-01T00:00:00.000Z',
  },
};

describe('Módulo de Cache de Nascentes (Unitário)', () => {
  beforeEach(() => {
    invalidateNascentesCache();
    resetNascentesCacheStats();
    vi.restoreAllMocks();
  });

  describe('buildNascentesCacheKey', () => {
    it('deve separar filtros ausentes das buscas literais all e none', () => {
      const unfiltered = buildNascentesCacheKey({});
      expect(buildNascentesCacheKey({ municipio: 'all' })).not.toBe(unfiltered);
      expect(buildNascentesCacheKey({ q: 'none' })).not.toBe(unfiltered);
    });

    it('deve separar valores que contêm os delimitadores usados na chave', () => {
      expect(buildNascentesCacheKey({ municipio: 'Crato:q=fonte', q: 'teste' }))
        .not.toBe(buildNascentesCacheKey({ municipio: 'Crato', q: 'fonte:q=teste' }));
    });

    it('deve distinguir limites geográficos com diferenças abaixo de seis casas decimais', () => {
      const bounds = { south: -7.3, east: -39.3, west: -39.4 };
      expect(buildNascentesCacheKey({ ...bounds, north: -7.21345599 }))
        .not.toBe(buildNascentesCacheKey({ ...bounds, north: -7.21345601 }));
    });

    it('deve gerar chave canônica padrão quando nenhum filtro for informado', () => {
      const key = buildNascentesCacheKey();
      expect(key).toBe('nascentes:public:[null,null,null]');
    });

    it('deve gerar chave canônica padrão quando filtros forem vazios', () => {
      const key = buildNascentesCacheKey({});
      expect(key).toBe('nascentes:public:[null,null,null]');
    });

    it('deve normalizar municipio com trim e minúsculas', () => {
      const key1 = buildNascentesCacheKey({ municipio: '  Crato  ' });
      const key2 = buildNascentesCacheKey({ municipio: 'crato' });
      expect(key1).toBe('nascentes:public:["crato",null,null]');
      expect(key1).toBe(key2);
    });

    it('deve normalizar busca textual "q" com trim e minúsculas', () => {
      const key1 = buildNascentesCacheKey({ q: '  Riacho Do Meio  ' });
      const key2 = buildNascentesCacheKey({ q: 'riacho do meio' });
      expect(key1).toBe('nascentes:public:[null,"riacho do meio",null]');
      expect(key1).toBe(key2);
    });

    it('deve preservar a precisão original do Bounding Box', () => {
      const key1 = buildNascentesCacheKey({
        north: -7.1234567,
        south: -7.9876543,
        east: -39.1111111,
        west: -39.9999999,
      });
      expect(key1).toBe('nascentes:public:[null,null,[-7.1234567,-7.9876543,-39.1111111,-39.9999999]]');
    });

    it('deve omitir o Bounding Box se algum limite estiver ausente ou inválido', () => {
      const keyIncomplete = buildNascentesCacheKey({
        north: -7.1,
        south: -7.9,
      });
      expect(keyIncomplete).toBe('nascentes:public:[null,null,null]');

      const keyNaN = buildNascentesCacheKey({
        north: NaN,
        south: -7.9,
        east: -39.1,
        west: -39.9,
      });
      expect(keyNaN).toBe('nascentes:public:[null,null,null]');
    });
  });

  describe('NascentesMemoryCache (Classe Isolada)', () => {
    it('deve expirar a entrada exatamente no limite do TTL', () => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
      const cache = new NascentesMemoryCache({ defaultTtlMs: 100 });
      cache.set('limite', mockResponse);
      clock.mockReturnValue(1100);
      expect(cache.get('limite')).toBeUndefined();
    });

    it('deve inicializar com configurações padrão de TTL e maxEntries', () => {
      const cache = new NascentesMemoryCache();
      const stats = cache.getStats();
      expect(stats.maxEntries).toBe(DEFAULT_NASCENTES_CACHE_MAX_ENTRIES);
      expect(DEFAULT_NASCENTES_CACHE_TTL_MS).toBe(60_000);
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('deve armazenar e recuperar dados com sucesso (Cache HIT)', () => {
      const cache = new NascentesMemoryCache();
      cache.set('key1', mockResponse);

      const cached = cache.get('key1');
      expect(cached).toEqual(mockResponse);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1);
    });

    it('deve contabilizar miss para chaves inexistentes (Cache MISS)', () => {
      const cache = new NascentesMemoryCache();
      const result = cache.get('chave_inexistente');

      expect(result).toBeUndefined();
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
    });

    it('deve expirar item após o TTL estipulado', async () => {
      const cache = new NascentesMemoryCache({ defaultTtlMs: 20 });
      cache.set('temp_key', mockResponse, 20);

      expect(cache.get('temp_key')).toEqual(mockResponse);

      // Aguarda passar o TTL
      await new Promise((resolve) => setTimeout(resolve, 30));

      const expired = cache.get('temp_key');
      expect(expired).toBeUndefined();
      expect(cache.getStats().misses).toBe(1);
      expect(cache.getStats().size).toBe(0);
    });

    it('deve aplicar política LRU e desalocar a chave mais antiga ao atingir maxEntries', () => {
      const cache = new NascentesMemoryCache({ maxEntries: 2 });
      cache.set('key1', mockResponse);
      cache.set('key2', mockResponse);

      expect(cache.getStats().size).toBe(2);

      // Adicionar 3ª entrada deve descartar a mais antiga (key1)
      cache.set('key3', mockResponse);

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeDefined();
      expect(cache.get('key3')).toBeDefined();
      expect(cache.getStats().size).toBe(2);
    });

    it('deve promover chave acessada no LRU prevenindo que seja descartada antes de chaves não acessadas', () => {
      const cache = new NascentesMemoryCache({ maxEntries: 2 });
      cache.set('key1', mockResponse);
      cache.set('key2', mockResponse);

      // Acessa key1, tornando key2 a mais antiga
      cache.get('key1');

      // Adiciona key3, deve expulsar key2
      cache.set('key3', mockResponse);

      expect(cache.get('key1')).toBeDefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBeDefined();
    });

    it('deve limpar todas as entradas com invalidate()', () => {
      const cache = new NascentesMemoryCache();
      cache.set('k1', mockResponse);
      cache.set('k2', mockResponse);
      expect(cache.getStats().size).toBe(2);

      cache.invalidate();
      expect(cache.getStats().size).toBe(0);
      expect(cache.get('k1')).toBeUndefined();
      expect(cache.get('k2')).toBeUndefined();
    });

    it('deve zerar as estatísticas de telemetria com resetStats()', () => {
      const cache = new NascentesMemoryCache();
      cache.get('miss1');
      cache.set('k1', mockResponse);
      cache.get('k1');

      expect(cache.getStats().hits).toBe(1);
      expect(cache.getStats().misses).toBe(1);

      cache.resetStats();
      expect(cache.getStats().hits).toBe(0);
      expect(cache.getStats().misses).toBe(0);
      expect(cache.getStats().size).toBe(1);
    });
  });

  describe('Gatilhos de Invalidação e Transações', () => {
    it('withNascentesCacheInvalidation deve executar a operação e invalidar o cache em caso de sucesso', async () => {
      setNascentesInCache('teste', mockResponse);
      expect(getNascentesCacheStats().size).toBe(1);

      const resultado = await withNascentesCacheInvalidation(async () => {
        return { alterado: true };
      });

      expect(resultado).toEqual({ alterado: true });
      expect(getNascentesCacheStats().size).toBe(0);
    });

    it('withNascentesCacheInvalidation NÃO deve invalidar o cache se a transação falhar', async () => {
      setNascentesInCache('teste', mockResponse);
      expect(getNascentesCacheStats().size).toBe(1);

      await expect(
        withNascentesCacheInvalidation(async () => {
          throw new Error('Falha simulada na transação do banco');
        })
      ).rejects.toThrow('Falha simulada na transação do banco');

      // O cache deve ser preservado para integridade
      expect(getNascentesCacheStats().size).toBe(1);
      expect(getNascentesFromCache('teste')).toEqual(mockResponse);
    });

    it('onImportacaoConcluida deve invalidar o cache compartilhado', () => {
      setNascentesInCache('item1', mockResponse);
      expect(getNascentesCacheStats().size).toBe(1);

      onImportacaoConcluida(999);
      expect(getNascentesCacheStats().size).toBe(0);
    });
  });

  describe('Integração de getNascentesPublicas com o Cache', () => {
    it('deve consultar o Prisma na primeira chamada e servir do cache na segunda chamada', async () => {
      const mockRecord = {
        id: 1,
        latitude: new Prisma.Decimal(-7.2),
        longitude: new Prisma.Decimal(-39.3),
        municipio: 'Crato',
        fonte: 'Fonte Teste',
        localidade: 'Localidade Teste',
        dataCriacao: new Date('2026-01-01T00:00:00.000Z'),
        vazaoMedia: new Prisma.Decimal(2.5),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      const prismaSpy = vi
        .spyOn(prisma.nascente, 'findMany')
        .mockResolvedValueOnce([mockRecord] as unknown as Awaited<ReturnType<typeof prisma.nascente.findMany>>);

      // 1ª chamada: Cache MISS -> vai ao banco
      const res1 = await getNascentesPublicas({ municipio: 'Crato' });
      expect(prismaSpy).toHaveBeenCalledTimes(1);
      expect(res1.data.length).toBe(1);
      expect(getNascentesCacheStats().hits).toBe(0);
      expect(getNascentesCacheStats().misses).toBe(1);

      // 2ª chamada: Cache HIT -> NÃO vai ao banco
      const res2 = await getNascentesPublicas({ municipio: 'Crato' });
      expect(prismaSpy).toHaveBeenCalledTimes(1); // Não incrementou chamada ao Prisma
      expect(res2).toEqual(res1);
      expect(getNascentesCacheStats().hits).toBe(1);
      expect(getNascentesCacheStats().misses).toBe(1);
    });

    it('deve respeitar a opção bypassCache e ir ao banco mesmo com cache existente', async () => {
      const mockDbRow = {
        id: 2,
        latitude: new Prisma.Decimal(-7.3),
        longitude: new Prisma.Decimal(-39.4),
        municipio: 'Barbalha',
        fonte: 'Fonte B',
        localidade: 'Local B',
        dataCriacao: new Date('2026-02-01T00:00:00.000Z'),
        vazaoMedia: new Prisma.Decimal(1.8),
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      };

      const prismaSpy = vi
        .spyOn(prisma.nascente, 'findMany')
        .mockResolvedValue([mockDbRow] as unknown as Awaited<ReturnType<typeof prisma.nascente.findMany>>);

      // Popula o cache
      await getNascentesPublicas({ municipio: 'Barbalha' });
      expect(prismaSpy).toHaveBeenCalledTimes(1);

      // Força bypassCache
      await getNascentesPublicas({ municipio: 'Barbalha' }, { bypassCache: true });
      expect(prismaSpy).toHaveBeenCalledTimes(2);
    });
  });
});
