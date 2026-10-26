import type { NascentesPublicResponse, NascentesQueryParams } from './nascentes.dto';

/**
 * Interface que representa as estatísticas de telemetria e observabilidade do cache.
 */
export interface NascentesCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
  readonly maxEntries: number;
}

/**
 * Interface interna de entrada do cache com timestamp de expiração estrito.
 */
interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

/**
 * Opções de configuração para inicialização do cache de nascentes.
 */
export interface NascentesCacheOptions {
  readonly defaultTtlMs?: number;
  readonly maxEntries?: number;
}

/**
 * Configurações padrão do cache em memória.
 */
export const DEFAULT_NASCENTES_CACHE_TTL_MS = 60_000; // 60 segundos
export const DEFAULT_NASCENTES_CACHE_MAX_ENTRIES = 500; // Máximo de combinações em memória

/**
 * Constrói uma chave determinística e normalizada para o cache de nascentes
 * a partir dos parâmetros de consulta informados.
 *
 * Normaliza textos com trim e minúsculas, preservando a precisão dos limites.
 * A serialização estruturada distingue campos ausentes de valores literais e
 * impede colisões quando o texto contém separadores.
 *
 * @param filters Parâmetros validados da consulta pública.
 * @returns Chave canônica serializada em string.
 */
export function buildNascentesCacheKey(filters: NascentesQueryParams = {}): string {
  const municipio = filters.municipio?.trim().toLowerCase() || null;
  const query = filters.q?.trim().toLowerCase() || null;
  const bounds = [filters.north, filters.south, filters.east, filters.west];
  const hasBounds = bounds.every((value) => typeof value === 'number' && Number.isFinite(value));

  return `nascentes:public:${JSON.stringify([municipio, query, hasBounds ? bounds : null])}`;
}

/**
 * Classe responsável pelo armazenamento em memória com expiração por TTL
 * e política de despejo LRU (Least Recently Used) baseada em limite de entradas.
 */
export class NascentesMemoryCache {
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private readonly store: Map<string, CacheEntry<NascentesPublicResponse>>;

  private hitsCount = 0;
  private missesCount = 0;

  constructor(options?: NascentesCacheOptions) {
    this.defaultTtlMs = options?.defaultTtlMs ?? DEFAULT_NASCENTES_CACHE_TTL_MS;
    this.maxEntries = options?.maxEntries ?? DEFAULT_NASCENTES_CACHE_MAX_ENTRIES;
    this.store = new Map<string, CacheEntry<NascentesPublicResponse>>();
  }

  /**
   * Recupera um item do cache caso presente e ainda válido pelo TTL.
   * Promove o item para o topo para manter política LRU.
   */
  public get(key: string): NascentesPublicResponse | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      this.missesCount++;
      return undefined;
    }

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      this.missesCount++;
      return undefined;
    }

    // Atualiza a posição no Map para simular política LRU
    this.store.delete(key);
    this.store.set(key, entry);

    this.hitsCount++;
    return entry.value;
  }

  /**
   * Armazena uma resposta no cache com TTL definido.
   * Despeja a entrada mais antiga se atingir o tamanho máximo permitido.
   */
  public set(
    key: string,
    value: NascentesPublicResponse,
    ttlMs: number = this.defaultTtlMs
  ): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      // O primeiro elemento do iterator de chaves do Map é a entrada mais antiga (LRU)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    const expiresAt = Date.now() + Math.max(0, ttlMs);
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Invalida atomicamente todas as entradas do cache de nascentes.
   */
  public invalidate(): void {
    this.store.clear();
  }

  /**
   * Retorna as métricas atuais de acesso e tamanho do cache.
   */
  public getStats(): NascentesCacheStats {
    return {
      hits: this.hitsCount,
      misses: this.missesCount,
      size: this.store.size,
      maxEntries: this.maxEntries,
    };
  }

  /**
   * Reinicia as estatísticas de telemetria (hits e misses).
   */
  public resetStats(): void {
    this.hitsCount = 0;
    this.missesCount = 0;
  }
}

/**
 * Instância singleton compartilhada na execução da aplicação.
 */
const defaultNascentesCache = new NascentesMemoryCache();

/**
 * Helper para obter dados do cache compartilhado.
 */
export function getNascentesFromCache(key: string): NascentesPublicResponse | undefined {
  return defaultNascentesCache.get(key);
}

/**
 * Helper para gravar dados no cache compartilhado.
 */
export function setNascentesInCache(
  key: string,
  value: NascentesPublicResponse,
  ttlMs?: number
): void {
  defaultNascentesCache.set(key, value, ttlMs);
}

/**
 * Helper para invalidar atomicamente todo o cache compartilhado.
 */
export function invalidateNascentesCache(): void {
  defaultNascentesCache.invalidate();
}

/**
 * Executa uma operação assíncrona de mutação e, se for concluída com sucesso (sem erros),
 * dispara a invalidação atômica do cache de nascentes garantindo consistência pós-commit.
 * Em caso de erro na operação, a invalidação é prevenida para preservar o estado do cache.
 *
 * @param operation Função assíncrona que executa a transação ou mutação.
 * @returns Resultado da operação original.
 */
export async function withNascentesCacheInvalidation<T>(
  operation: () => Promise<T>
): Promise<T> {
  const result = await operation();
  invalidateNascentesCache();
  return result;
}

/**
 * Gatilho formal de ciclo de vida para ser disparado quando uma importação
 * for concluída com sucesso (StatusImportacao.CONCLUIDA).
 * Invalida atomicamente todo o catálogo público em cache.
 *
 * @param importacaoId Identificador numérico da importação finalizada.
 */
export function onImportacaoConcluida(importacaoId?: number): void {
  void importacaoId;
  invalidateNascentesCache();
}

/**
 * Helper para inspecionar métricas do cache compartilhado.
 */
export function getNascentesCacheStats(): NascentesCacheStats {
  return defaultNascentesCache.getStats();
}

/**
 * Helper para zerar contadores de métricas no cache compartilhado (útil em testes).
 */
export function resetNascentesCacheStats(): void {
  defaultNascentesCache.resetStats();
}
