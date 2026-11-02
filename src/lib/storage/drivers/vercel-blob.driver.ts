/**
 * Nascentes do Cariri — Driver de Produção Vercel Blob (VercelBlobStorageDriver)
 *
 * Envolve a SDK oficial do Vercel Blob (@vercel/blob) para persistência em store privado.
 * Implementa carregamento dinâmico para não quebrar a aplicação caso o pacote opcional
 * não esteja instalado em ambientes de teste.
 */

import { computeFileSha256, toBinaryBuffer } from '../crypto';
import {
  StorageDriverNotConfiguredError,
  StorageError,
  StorageFileNotFoundError,
} from '../storage.errors';
import type {
  StorageDriver,
  StorageFileInfo,
  StoragePayload,
  StorageUploadOptions,
  StorageUploadResult,
} from '../storage.types';

interface VercelBlobSdk {
  put: (
    pathname: string,
    body: Buffer,
    options: {
      access: 'public';
      token: string;
      addRandomSuffix?: boolean;
      contentType?: string;
    }
  ) => Promise<{ url: string; pathname: string; contentType?: string }>;
  del: (urlOrPathname: string, options: { token: string }) => Promise<void>;
  head: (
    urlOrPathname: string,
    options: { token: string }
  ) => Promise<{
    url: string;
    pathname: string;
    size: number;
    contentType?: string;
    uploadedAt: Date;
  }>;
}

export class VercelBlobStorageDriver implements StorageDriver {
  private readonly token: string;
  private sdkPromise: Promise<VercelBlobSdk> | null = null;

  constructor(token: string) {
    if (!token || !token.trim()) {
      throw new StorageDriverNotConfiguredError(
        'VercelBlobStorageDriver',
        'Token de autenticação BLOB_READ_WRITE_TOKEN não informado.'
      );
    }
    this.token = token.trim();
  }

  /**
   * Importa a SDK @vercel/blob dinamicamente sob demanda.
   */
  private async getSdk(): Promise<VercelBlobSdk> {
    if (!this.sdkPromise) {
      this.sdkPromise = (async () => {
        try {
          // Import dinâmico tolerante a ausência da dependência em modo desenvolvimento/testes
          const packageName = '@vercel/blob';
          const sdk = (await import(/* webpackIgnore: true */ packageName)) as unknown as VercelBlobSdk;
          return sdk;
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Módulo não encontrado';
          throw new StorageDriverNotConfiguredError(
            'VercelBlobStorageDriver',
            `Falha ao carregar @vercel/blob (${detail}). Certifique-se de que o pacote está instalado.`
          );
        }
      })();
    }
    return this.sdkPromise;
  }

  async upload(
    payload: StoragePayload,
    options: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    const sdk = await this.getSdk();
    const rawBuffer = toBinaryBuffer(payload);
    const hashSha256 = computeFileSha256(rawBuffer);
    const contentType = options.contentType ?? 'application/octet-stream';

    try {
      const blobResult = await sdk.put(options.pathname, rawBuffer, {
        access: 'public',
        token: this.token,
        addRandomSuffix: false,
        contentType,
      });

      return {
        pathname: blobResult.pathname,
        url: blobResult.url,
        sizeBytes: rawBuffer.byteLength,
        contentType: blobResult.contentType ?? contentType,
        hashSha256,
        uploadedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof StorageError) throw error;
      const message = error instanceof Error ? error.message : 'Erro no upload para o Vercel Blob';
      throw new StorageError(`Falha no upload para o Vercel Blob: ${message}`, 502);
    }
  }

  async download(pathname: string): Promise<Buffer> {
    const fileInfo = await this.head(pathname);
    if (!fileInfo) {
      throw new StorageFileNotFoundError(pathname);
    }

    try {
      const sdk = await this.getSdk();
      const headResult = await sdk.head(pathname, { token: this.token });
      const response = await fetch(headResult.url, {
        headers: { Authorization: `Bearer ${this.token}` },
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new StorageFileNotFoundError(pathname);
        }
        throw new StorageError(
          `Falha ao baixar arquivo do Vercel Blob: status HTTP ${response.status}`,
          response.status >= 500 ? 502 : 400
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (error instanceof StorageError) throw error;
      const message = error instanceof Error ? error.message : 'Erro ao recuperar arquivo do Vercel Blob';
      throw new StorageError(message, 502);
    }
  }

  async delete(pathname: string): Promise<void> {
    try {
      const sdk = await this.getSdk();
      await sdk.del(pathname, { token: this.token });
    } catch (error) {
      if (error instanceof StorageError) throw error;
      const message = error instanceof Error ? error.message : 'Erro ao deletar arquivo do Vercel Blob';
      throw new StorageError(message, 502);
    }
  }

  async head(pathname: string): Promise<StorageFileInfo | null> {
    try {
      const sdk = await this.getSdk();
      const meta = await sdk.head(pathname, { token: this.token });
      return {
        pathname: meta.pathname,
        sizeBytes: meta.size,
        contentType: meta.contentType ?? 'application/octet-stream',
        uploadedAt: new Date(meta.uploadedAt),
      };
    } catch (error) {
      // 404 retornado pela API da Vercel significa arquivo inexistente
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('not found') || message.includes('404')) {
        return null;
      }
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Erro ao consultar metadados do Vercel Blob: ${message}`, 502);
    }
  }

  async exists(pathname: string): Promise<boolean> {
    const info = await this.head(pathname);
    return info !== null;
  }
}