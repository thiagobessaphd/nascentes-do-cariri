/**
 * Nascentes do Cariri — Lógica de Filtros, Normalização e Debounce do Mapa
 * Implementa normalização previsível (acentos, caixa e espaços), construção de query params,
 * filtragem imutável e controle cancelável de debounce para a interface pública do mapa.
 */

import type {
    NascentePublicDto,
    NascentesQueryParams,
} from "@/modules/nascentes/nascentes.dto";

/**
 * Tempo padrão de debounce para busca textual no mapa.
 * Evita requisições excessivas e reajustes bruscos de enquadramento a cada tecla digitada.
 */
export const DEFAULT_SEARCH_DEBOUNCE_MS = 500;

/**
 * Limites máximos de caracteres alinhados ao contrato da API pública.
 */
export const MAX_SEARCH_QUERY_LENGTH = 100;
export const MAX_MUNICIPIO_FILTER_LENGTH = 150;

/**
 * Representa os valores de filtro aplicáveis à consulta de nascentes.
 */
export interface MapFilterValues {
    readonly municipio: string;
    readonly q: string;
}

/**
 * Estado completo dos controles de filtro do mapa.
 */
export interface MapFilterState {
    readonly municipio: string;
    readonly searchInput: string;
    readonly debouncedSearch: string;
}

/**
 * Interface de controle determinístico para timers de debounce.
 */
export interface DebounceController<T> {
    schedule(value: T, callback: (val: T) => void): void;
    cancel(): void;
    flush(value: T, callback: (val: T) => void): void;
    isPending(): boolean;
}

/**
 * Remove caracteres de controle, compacta espaços múltiplos e limita o comprimento do texto.
 */
export function normalizeFilterText(
    value: unknown,
    maxLength: number = MAX_SEARCH_QUERY_LENGTH,
): string {
    if (typeof value !== "string") {
        return "";
    }

    const cleaned = value
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (cleaned.length === 0) {
        return "";
    }

    return maxLength > 0 ? cleaned.slice(0, maxLength).trim() : cleaned;
}

/**
 * Normaliza texto para comparação insensível a acentos e caixa (maiúsculas/minúsculas).
 */
export function normalizeFoldedText(value: unknown): string {
    const normalized = normalizeFilterText(value, MAX_MUNICIPIO_FILTER_LENGTH);
    if (!normalized) {
        return "";
    }

    return normalized
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

/**
 * Cria o estado inicial dos filtros do mapa a partir de parâmetros externos opcionais.
 */
export function createInitialMapFilterState(
    initialParams?: NascentesQueryParams,
): MapFilterState {
    const municipio = normalizeFilterText(
        initialParams?.municipio,
        MAX_MUNICIPIO_FILTER_LENGTH,
    );
    const q = normalizeFilterText(initialParams?.q, MAX_SEARCH_QUERY_LENGTH);

    return {
        municipio,
        searchInput: q,
        debouncedSearch: q,
    };
}

/**
 * Retorna um estado de filtros completamente limpo para restaurar o conjunto inicial.
 */
export function clearMapFilterState(): MapFilterState {
    return {
        municipio: "",
        searchInput: "",
        debouncedSearch: "",
    };
}

/**
 * Verifica se há qualquer filtro ativo.
 */
export function hasActiveMapFilters(
    input:
        | Partial<MapFilterState>
        | Partial<MapFilterValues>
        | NascentesQueryParams
        | null
        | undefined,
): boolean {
    if (!input) {
        return false;
    }

    const municipio = normalizeFilterText(
        input.municipio,
        MAX_MUNICIPIO_FILTER_LENGTH,
    );
    if (municipio.length > 0) {
        return true;
    }

    if ("searchInput" in input) {
        const searchInput = normalizeFilterText(
            input.searchInput,
            MAX_SEARCH_QUERY_LENGTH,
        );
        if (searchInput.length > 0) {
            return true;
        }
    }

    if ("debouncedSearch" in input) {
        const debouncedSearch = normalizeFilterText(
            input.debouncedSearch,
            MAX_SEARCH_QUERY_LENGTH,
        );
        if (debouncedSearch.length > 0) {
            return true;
        }
    }

    if ("q" in input) {
        const q = normalizeFilterText(input.q, MAX_SEARCH_QUERY_LENGTH);
        if (q.length > 0) {
            return true;
        }
    }

    return false;
}

/**
 * Constrói o objeto `NascentesQueryParams` combinando os filtros ativos com
 * eventuais parâmetros externos (como bounding box geográfico).
 */
export function buildNascentesQueryParams(
    filters:
        | Pick<MapFilterState, "municipio" | "debouncedSearch">
        | Partial<MapFilterValues>,
    externalParams?: NascentesQueryParams,
): NascentesQueryParams {
    const municipio = normalizeFilterText(
        filters.municipio,
        MAX_MUNICIPIO_FILTER_LENGTH,
    );

    const rawQuery =
        "debouncedSearch" in filters ? filters.debouncedSearch : filters.q;
    const q = normalizeFilterText(rawQuery, MAX_SEARCH_QUERY_LENGTH);

    const result: {
        municipio?: string;
        q?: string;
        north?: number;
        south?: number;
        east?: number;
        west?: number;
    } = {};

    if (municipio.length > 0) {
        result.municipio = municipio;
    }

    if (q.length > 0) {
        result.q = q;
    }

    if (
        externalParams?.north !== undefined &&
        externalParams?.south !== undefined &&
        externalParams?.east !== undefined &&
        externalParams?.west !== undefined
    ) {
        result.north = externalParams.north;
        result.south = externalParams.south;
        result.east = externalParams.east;
        result.west = externalParams.west;
    }

    return result;
}

/**
 * Avalia se um item público de nascente atende aos critérios de filtro de município e busca textual (`q`),
 * aplicando comparação insensível a acentos e maiúsculas/minúsculas.
 */
export function matchesNascenteFilter(
    nascente: NascentePublicDto,
    filters?: Partial<MapFilterValues>,
): boolean {
    if (!filters) {
        return true;
    }

    const targetMunicipio = normalizeFoldedText(filters.municipio);
    if (targetMunicipio.length > 0) {
        const itemMunicipio = normalizeFoldedText(nascente.municipio);
        if (itemMunicipio !== targetMunicipio) {
            return false;
        }
    }

    const targetQuery = normalizeFoldedText(filters.q);
    if (targetQuery.length > 0) {
        const itemFonte = normalizeFoldedText(nascente.fonte);
        const itemLocalidade = normalizeFoldedText(nascente.localidade);

        if (
            !itemFonte.includes(targetQuery) &&
            !itemLocalidade.includes(targetQuery)
        ) {
            return false;
        }
    }

    return true;
}

/**
 * Filtra de forma pura e imutável uma coleção de nascentes públicas sem alterar o array de entrada.
 */
export function filterNascentesPublicas(
    nascentes: readonly NascentePublicDto[],
    filters?: Partial<MapFilterValues>,
): NascentePublicDto[] {
    if (!filters || !hasActiveMapFilters(filters)) {
        return [...nascentes];
    }

    return nascentes.filter((nascente) =>
        matchesNascenteFilter(nascente, filters),
    );
}

/**
 * Cria um controlador de debounce determinístico e cancelável.
 * Impede que chamadas agendadas disparem após limpeza de filtros ou desmontagem.
 */
export function createDebounceController<T>(
    delayMs: number = DEFAULT_SEARCH_DEBOUNCE_MS,
): DebounceController<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const effectiveDelay = Math.max(0, delayMs);

    const cancel = (): void => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    const schedule = (value: T, callback: (val: T) => void): void => {
        cancel();
        timeoutId = setTimeout(() => {
            timeoutId = null;
            callback(value);
        }, effectiveDelay);
    };

    const flush = (value: T, callback: (val: T) => void): void => {
        cancel();
        callback(value);
    };

    const isPending = (): boolean => timeoutId !== null;

    return {
        schedule,
        cancel,
        flush,
        isPending,
    };
}
