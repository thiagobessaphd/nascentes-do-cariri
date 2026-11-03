/**
 * Nascentes do Cariri — Serviço de Armazenamento e Auditoria de Importações
 *
 * Responsável pela validação de entrada, cálculo determinístico de SHA-256,
 * gravação no storage privado e registro inicial da entidade Importacao no MySQL
 * com suporte a rollback compensatório automático.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db/prisma';
import { env } from '@/config/env';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  computeFileSha256,
  getSharedStorageDriver,
  toBinaryBuffer,
  verifyFileIntegrity,
  FileTooLargeError,
  InvalidFilenameError,
  type FileIntegrityResult,
  type StorageDriver,
} from '@/lib/storage';
import {
  sanitizeFilename,
  validateUploadFilename,
} from '@/lib/security/sanitizer';
import {
  StatusImportacao,
  type IImportacaoStorageService,
  type StoreOriginalFileInput,
  type StoreOriginalFileOptions,
  type StoredImportacaoFile,
} from './importacoes.types';

/**
 * Gera um pathname privado determinístico e único para o arquivo original no storage,
 * contendo particionamento temporal (ano/mês), timestamp, UUID criptográfico e slug seguro.
 *
 * Garante que uploads com o mesmo nome original coexistam sem risco de colisão ou sobrescrita.
 */
export function generateUniqueImportacaoPathname(originalFilename: string): string {
  const safeName = sanitizeFilename(originalFilename);
  const now = new Date();
  const ano = now.getUTCFullYear();
  const mes = String(now.getUTCMonth() + 1).padStart(2, '0');
  const timestamp = Date.now();
  const uniqueId = randomUUID();

  return `importacoes/${ano}/${mes}/${timestamp}-${uniqueId}-${safeName}`;
}

export class ImportacaoStorageService implements IImportacaoStorageService {
  private readonly driver: StorageDriver;
  private readonly prisma: PrismaClient;

  constructor(options?: {
    readonly storageDriver?: StorageDriver | undefined;
    readonly prismaClient?: PrismaClient | undefined;
  }) {
    this.driver = options?.storageDriver ?? getSharedStorageDriver();
    this.prisma = options?.prismaClient ?? defaultPrisma;
  }

  /**
   * Valida, calcula o hash SHA-256, grava no storage privado e cria o registro
   * da Importacao no MySQL com status VALIDANDO.
   *
   * Se a gravação no banco falhar, aciona imediatamente o rollback compensatório
   * no storage para prevenir arquivos órfãos.
   */
  async storeOriginalFile(
    input: StoreOriginalFileInput,
    options?: StoreOriginalFileOptions
  ): Promise<StoredImportacaoFile> {
    // 1. Validação do nome do arquivo (anti-path-traversal, extensão permitida e tamanho)
    const fileValidation = validateUploadFilename(input.filename);
    if (!fileValidation.isValid) {
      throw new InvalidFilenameError(fileValidation.reason ?? 'Nome de arquivo inválido.');
    }

    // 2. Normalização do payload binário
    const buffer = toBinaryBuffer(input.content);

    // 3. Validação de arquivo vazio
    if (buffer.byteLength === 0) {
      throw new AppError('O arquivo TXT enviado está vazio.', 400, 'EMPTY_FILE');
    }

    // 4. Validação de cota de tamanho (limite configurado)
    const maxBytes = options?.maxSizeBytes ?? env.MAX_UPLOAD_SIZE_BYTES;
    if (buffer.byteLength > maxBytes) {
      throw new FileTooLargeError(buffer.byteLength, maxBytes);
    }

    // 5. Cálculo determinístico do hash SHA-256 (64 hex lowercase)
    const hashArquivoSha256 = computeFileSha256(buffer);

    // 6. Geração de caminho único particionado e não colidente
    const caminhoPrivadoArquivo = generateUniqueImportacaoPathname(input.filename);

    const activeDriver = options?.storageDriver ?? this.driver;

    // 7. Gravação no storage privado primeiro (fora da transação de banco)
    const uploadResult = await activeDriver.upload(buffer, {
      pathname: caminhoPrivadoArquivo,
      contentType: 'text/plain; charset=utf-8',
      isPrivate: true,
      metadata: {
        nomeOriginal: input.filename,
        usuarioId: String(input.usuarioId),
      },
    });

    try {
      // 8. Registro inicial da Importacao no MySQL
      const importacao = await this.prisma.importacao.create({
        data: {
          usuarioId: input.usuarioId,
          nomeArquivo: input.filename.slice(0, 255),
          caminhoPrivadoArquivo: uploadResult.pathname,
          hashArquivo: hashArquivoSha256,
          status: StatusImportacao.VALIDANDO,
          totalLinhas: 0,
          totalValidas: 0,
          totalInvalidas: 0,
          totalDuplicadas: 0,
          mensagemErro: null,
          concluidaAt: null,
        },
      });

      return {
        importacaoId: importacao.id,
        usuarioId: importacao.usuarioId,
        nomeArquivoOriginal: importacao.nomeArquivo,
        caminhoPrivadoArquivo: importacao.caminhoPrivadoArquivo,
        hashArquivoSha256: importacao.hashArquivo,
        tamanhoBytes: buffer.byteLength,
        storageUrl: uploadResult.url,
        status: importacao.status,
        createdAt: importacao.createdAt,
      };
    } catch (dbError) {
      // Ação compensatória: se a criação no MySQL falhar, apaga o blob para evitar orfanato
      await activeDriver.delete(uploadResult.pathname).catch((cleanupError: unknown) => {
        logger.warn('Storage: Falha na limpeza compensatória do blob após erro no banco.', {
          caminhoPrivadoArquivo: uploadResult.pathname,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });

      throw dbError;
    }
  }

  /**
   * Recupera o conteúdo binário integral de um arquivo original armazenado.
   */
  async retrieveOriginalFile(
    caminhoPrivadoArquivo: string,
    options?: { readonly storageDriver?: StorageDriver | undefined }
  ): Promise<Buffer> {
    const activeDriver = options?.storageDriver ?? this.driver;
    return activeDriver.download(caminhoPrivadoArquivo);
  }

  /**
   * Valida a integridade do arquivo armazenado contra o hash registrado no MySQL.
   */
  async verifyStoredFileIntegrity(
    importacaoId: number,
    options?: { readonly storageDriver?: StorageDriver | undefined }
  ): Promise<FileIntegrityResult> {
    const importacao = await this.prisma.importacao.findUnique({
      where: { id: importacaoId },
    });

    if (!importacao) {
      throw new AppError(
        `Registro de importação com ID ${importacaoId} não foi encontrado.`,
        404,
        'IMPORTACAO_NOT_FOUND'
      );
    }

    const buffer = await this.retrieveOriginalFile(importacao.caminhoPrivadoArquivo, options);
    return verifyFileIntegrity(buffer, importacao.hashArquivo);
  }

  /**
   * Executa rollback de um arquivo armazenado (exclui do storage e atualiza o status para FALHOU).
   */
  async rollbackStoredFile(
    caminhoPrivadoArquivo: string,
    importacaoId?: number,
    options?: { readonly storageDriver?: StorageDriver | undefined }
  ): Promise<void> {
    const activeDriver = options?.storageDriver ?? this.driver;
    await activeDriver.delete(caminhoPrivadoArquivo);

    if (importacaoId) {
      await this.prisma.importacao
        .update({
          where: { id: importacaoId },
          data: {
            status: StatusImportacao.FALHOU,
            mensagemErro: 'Arquivo cancelado ou revertido administrativamente.',
          },
        })
        .catch(() => null);
    }
  }
}

/**
 * Instância Singleton padrão do serviço para uso no backend da aplicação.
 */
export const importacaoStorageService = new ImportacaoStorageService();