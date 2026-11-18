/**
 * Nascentes do Cariri — Contratos e Tipos de Servidor do Módulo de Importações
 *
 * Reexporta os contratos puros (importacoes.contracts.ts) e adiciona os contratos
 * exclusivos de infraestrutura servidor (Prisma, drivers de storage e serviços).
 */

import { Prisma, StatusImportacao, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { FileIntegrityResult, StorageDriver, StoragePayload } from '@/lib/storage';
import type { UploadedFileEntry } from './file-validator';
import type {
  ImportacaoConfirmResponseDto,
  ImportacaoValidationResponseDto,
} from './importacoes.contracts';

export * from './importacoes.contracts';
export { StatusImportacao };


// CONTRATOS E TIPOS DE ARMAZENAMENTO, AUDITORIA E ORQUESTRAÇÃO (SERVER-ONLY)

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
 * Opções de driver de storage para operações sobre arquivos já armazenados.
 */
export interface StorageDriverOperationOptions {
  readonly storageDriver?: StorageDriver | undefined;
}

/**
 * Interface de contrato do serviço de armazenamento de importações.
 */
export interface IImportacaoStorageService {
  storeOriginalFile(
    input: StoreOriginalFileInput,
    options?: StoreOriginalFileOptions
  ): Promise<StoredImportacaoFile>;
  retrieveOriginalFile(
    caminhoPrivadoArquivo: string,
    options?: StorageDriverOperationOptions
  ): Promise<Buffer>;
  verifyStoredFileIntegrity(
    importacaoId: number,
    options?: StorageDriverOperationOptions
  ): Promise<FileIntegrityResult>;
  rollbackStoredFile(
    caminhoPrivadoArquivo: string,
    importacaoId?: number,
    options?: StorageDriverOperationOptions
  ): Promise<void>;
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

// CONTRATOS E TIPOS DA PERSISTÊNCIA TRANSACIONAL E CONFIRMAÇÃO (SERVER-ONLY)

/**
 * Schema Zod para validação em runtime da entrada de confirmação de importação.
 */
export const confirmImportacaoInputSchema = z.object({
  importacaoId: z
    .number()
    .int('O identificador da importação deve ser um número inteiro.')
    .positive('O identificador da importação deve ser maior que zero.'),
  usuarioId: z
    .number()
    .int('O identificador do usuário deve ser um número inteiro.')
    .positive('O identificador do usuário deve ser maior que zero.')
    .optional(),
});

/**
 * Parâmetros de entrada validados para o fluxo de confirmação atômica da importação.
 */
export type ConfirmImportacaoInput = Readonly<z.infer<typeof confirmImportacaoInputSchema>>;

/**
 * Cliente transacional do Prisma utilizado dentro de prisma.$transaction.
 */
export type PrismaTransactionClient = Prisma.TransactionClient;

/**
 * Callback acionado exclusivamente após o commit bem-sucedido no banco de dados.
 */
export type OnCommitCacheInvalidator = (importacaoId: number) => void;

/**
 * Contexto entregue ao hook opcional pós-inserção de linha dentro da transação ativa.
 */
export interface AfterCommitRowInsertContext {
  readonly tx: PrismaTransactionClient;
  readonly importacaoId: number;
  readonly insertedCount: number;
  readonly totalToInsert: number;
}

/**
 * Hook opcional executado dentro da transação após cada inserção de nascente,
 * permitindo instrumentação e simulação determinística de falhas/rollback em testes.
 */
export type AfterCommitRowInsertHook = (
  context: AfterCommitRowInsertContext
) => Promise<void> | void;

/**
 * Opções de execução por chamada para confirmação transacional da importação.
 */
export interface ConfirmImportacaoOptions {
  readonly storageDriver?: StorageDriver | undefined;
  readonly onCacheInvalidate?: OnCommitCacheInvalidator | undefined;
  readonly onAfterRowInsert?: AfterCommitRowInsertHook | undefined;
}

/**
 * Dependências opcionais injetáveis no serviço de confirmação transacional.
 */
export interface ImportacaoCommitServiceDeps {
  readonly prismaClient?: PrismaClient | undefined;
  readonly storageService?: IImportacaoStorageService | undefined;
  readonly cacheInvalidator?: OnCommitCacheInvalidator | undefined;
}

/**
 * Interface de contrato do serviço de persistência transacional, deduplicação e rollback.
 */
export interface IImportacaoCommitService {
  confirmImportacao(
    input: ConfirmImportacaoInput,
    options?: ConfirmImportacaoOptions
  ): Promise<ImportacaoConfirmResponseDto>;
}
