/**
 * Nascentes do Cariri — Contratos e Tipos de Servidor do Módulo de Importações
 *
 * Reexporta os contratos puros (importacoes.contracts.ts) e adiciona os contratos
 * exclusivos de infraestrutura servidor (Prisma, drivers de storage e serviços).
 */

import { StatusImportacao } from '@prisma/client';
import type { FileIntegrityResult, StorageDriver, StoragePayload } from '@/lib/storage';
import type { UploadedFileEntry } from './file-validator';
import type { ImportacaoValidationResponseDto } from './importacoes.contracts';

export * from './importacoes.contracts';
export { StatusImportacao };

// ============================================================================
// CONTRATOS E TIPOS DE ARMAZENAMENTO, AUDITORIA E ORQUESTRAÇÃO (SERVER-ONLY)
// ============================================================================

/**
 * Parâmetros de entrada para o armazenamento do arquivo TXT original.
 */
export interface StoreOriginalFileInput {
  readonly filename: string;
  readonly content: StoragePayload;
  readonly usuarioId: number;
}

/**
 * Opções de configuração para o armazenamento do arquivo original.
 */
export interface StoreOriginalFileOptions {
  readonly maxSizeBytes?: number | undefined;
  readonly storageDriver?: StorageDriver | undefined;
}

/**
 * Metadados imutáveis consolidados do arquivo original armazenado e registrado no banco.
 */
export interface StoredImportacaoFile {
  readonly importacaoId: number;
  readonly usuarioId: number;
  readonly nomeArquivoOriginal: string;
  readonly caminhoPrivadoArquivo: string;
  readonly hashArquivoSha256: string;
  readonly tamanhoBytes: number;
  readonly storageUrl: string;
  readonly status: StatusImportacao;
  readonly createdAt: Date;
}

/**
 * Resultado da recuperação e conferência de integridade do arquivo original.
 */
export interface RetrieveOriginalFileResult {
  readonly importacaoId: number;
  readonly nomeArquivo: string;
  readonly caminhoPrivadoArquivo: string;
  readonly hashArquivo: string;
  readonly buffer: Buffer;
  readonly integrity: FileIntegrityResult;
}

/**
 * Interface de contrato do serviço de armazenamento de importações.
 */
export interface IImportacaoStorageService {
  storeOriginalFile(
    input: StoreOriginalFileInput,
    options?: StoreOriginalFileOptions
  ): Promise<StoredImportacaoFile>;
  retrieveOriginalFile(caminhoPrivadoArquivo: string): Promise<Buffer>;
  verifyStoredFileIntegrity(importacaoId: number): Promise<FileIntegrityResult>;
  rollbackStoredFile(caminhoPrivadoArquivo: string, importacaoId?: number): Promise<void>;
}

/**
 * Parâmetros de entrada para o fluxo orquestrado de validação e prévia.
 */
export interface ValidateAndPreviewImportacaoInput {
  readonly files: readonly UploadedFileEntry[];
  readonly usuarioId: number;
}

/**
 * Opções de configuração para validação e prévia.
 */
export interface ValidateAndPreviewOptions {
  readonly maxSizeBytes?: number | undefined;
  readonly storageDriver?: StorageDriver | undefined;
}

/**
 * Interface de contrato do serviço orquestrador de validação.
 */
export interface IImportacaoValidationService {
  validateAndPreview(
    input: ValidateAndPreviewImportacaoInput,
    options?: ValidateAndPreviewOptions
  ): Promise<ImportacaoValidationResponseDto>;
}
