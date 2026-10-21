// DTOs e contratos de tipos do módulo de municípios.

/**
 * Metadados da listagem pública de municípios.
 */
export interface MunicipiosPublicMeta {
  readonly total: number;
}

/**
 * Contrato de resposta pública padronizada para listagem de municípios com nascentes ativas.
 */
export interface MunicipiosPublicResponse {
  readonly data: readonly string[];
  readonly meta: MunicipiosPublicMeta;
}
