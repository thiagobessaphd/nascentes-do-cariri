/**
 * Nascentes do Cariri — Driver de Storage em Memória (MemoryStorageDriver)
 *
 * Implementação em memória do StorageDriver, voltada para testes automatizados
 * e desenvolvimento local sem necessidade de credenciais de nuvem.
 */

import { computeFileSha256, toBinaryBuffer } from '../crypto';
import { StorageFileNotFoundError } from '../storage.errors';
import type {
  StorageDriver,
  StorageFileInfo,
  StoragePayload,
  StorageUploadOptions,
  StorageUploadResult,
} from '../storage.types';

interface MemoryStoredFile {
  readonly buffer: Buffer;
  readonly contentType: string;
  readonly hashSha256: string;
  readonly uploadedAt: Date;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export class MemoryStorageDriver implements StorageDriver {
  private readonly files = new Map<string, MemoryStoredFile>();

  /**
   * Grava o payload em memória, calculando o hash SHA-256 e clonando os bytes.
   */
  async upload(
    payload: StoragePayload,
    options: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    const rawBuffer = toBinaryBuffer(payload);
    // Clona o buffer para garantir imutabilidade estrita em memória
    const clonedBuffer = Buffer.from(rawBuffer);
    const hashSha256 = computeFileSha256(clonedBuffer);
    const contentType = options.contentType ?? 'application/octet-stream';
    const uploadedAt = new Date();

    this.files.set(options.pathname, {
      buffer: clonedBuffer,
      contentType,
      hashSha256,
      uploadedAt,
      metadata: options.metadata,
    });

    return {
      pathname: options.pathname,
      url: `memory://storage/${options.pathname}`,
      sizeBytes: clonedBuffer.byteLength,
      contentType,
      hashSha256,
      uploadedAt,
    };
  }

  /**
   * Baixa uma cópia defensiva do buffer gravado em memória.
   * Lança StorageFileNotFoundError se o arquivo não existir.
   */
  async download(pathname: string): Promise<Buffer> {
    const file = this.files.get(pathname);
    if (!file) {
      throw new StorageFileNotFoundError(pathname);
    }
    // Retorna cópia defensiva para impedir mutação externa do estado interno
    return Buffer.from(file.buffer);
  }

  /**
   * Remove permanentemente o arquivo da memória.
   */
  async delete(pathname: string): Promise<void> {
    this.files.delete(pathname);
  }

  /**
   * Consulta os metadados do arquivo se existente.
   */
  async head(pathname: string): Promise<StorageFileInfo | null> {
    const file = this.files.get(pathname);
    if (!file) {
      return null;
    }

    return {
      pathname,
      sizeBytes: file.buffer.byteLength,
      contentType: file.contentType,
      uploadedAt: file.uploadedAt,
    };
  }

  /**
   * Verifica se o arquivo existe em memória.
   */
  async exists(pathname: string): Promise<boolean> {
    return this.files.has(pathname);
  }

  // Métodos utilitários exclusivos para isolamento de testes

  /**
   * Limpa todos os arquivos em memória (útil em beforeEach/afterEach nos testes).
   */
  clear(): void {
    this.files.clear();
  }

  /**
   * Retorna a quantidade atual de arquivos armazenados.
   */
  size(): number {
    return this.files.size;
  }
}

