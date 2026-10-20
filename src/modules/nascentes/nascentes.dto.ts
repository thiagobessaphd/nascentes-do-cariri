/**
 * Nascentes do Cariri — Contratos e DTOs Públicos
 */

/**
 * Unidade oficial e imutável de vazão média do sistema.
 */
export const UNIDADE_VAZAO_PADRAO = 'm³/s' as const;
export type UnidadeVazao = typeof UNIDADE_VAZAO_PADRAO;

/**
 * DTO público de uma Nascente ativa.
 */
export interface NascentePublicDto {
  readonly id: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly municipio: string;
  readonly fonte: string;
  readonly localidade: string;
  readonly data_criacao: string; // AAAA-MM-DD
  readonly vazao_media: number;
  readonly unidade_vazao: UnidadeVazao;
}

/**
 * Metadados da consulta pública.
 */
export interface NascentesPublicMeta {
  readonly total: number;
  readonly updated_at: string | null;
}

/**
 * Envelope padronizado de resposta da API pública: GET /api/public/nascentes.
 */
export interface NascentesPublicResponse {
  readonly data: readonly NascentePublicDto[];
  readonly meta: NascentesPublicMeta;
}

/**
 * Parâmetros de consulta validados e tipados para a API pública.
 */
export interface NascentesQueryParams {
  readonly municipio?: string | undefined;
  readonly q?: string | undefined;
  readonly north?: number | undefined;
  readonly south?: number | undefined;
  readonly east?: number | undefined;
  readonly west?: number | undefined;
}
