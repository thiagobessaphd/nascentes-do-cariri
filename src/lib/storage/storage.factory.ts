/**
 * Nascentes do Cariri — Fábrica e Provedor Global de StorageDriver (StorageFactory)
 *
 * Desacopla a resolução do driver de armazenamento com base no ambiente (dev, test, prod).
 */

import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { MemoryStorageDriver } from './drivers/memory-storage.driver';
import { VercelBlobStorageDriver } from './drivers/vercel-blob.driver';
import { StorageDriverNotConfiguredError } from './storage.errors';
import type { StorageDriver } from './storage.types';

export type StorageDriverType = 'memory' | 'vercel-blob' | 'auto';

let sharedDriverInstance: StorageDriver | null = null;

/**
 * Cria uma nova instância de StorageDriver de acordo com o tipo solicitado.
 */
export function createStorageDriver(type: StorageDriverType = 'auto'): StorageDriver {
  if (type === 'memory') {
    return new MemoryStorageDriver();
  }

  if (type === 'vercel-blob') {
    if (!env.BLOB_READ_WRITE_TOKEN) {
      throw new StorageDriverNotConfiguredError(
        'VercelBlobStorageDriver',
        'Variável de ambiente BLOB_READ_WRITE_TOKEN não está configurada.'
      );
    }
    return new VercelBlobStorageDriver(env.BLOB_READ_WRITE_TOKEN);
  }

  // Modo 'auto':
  // Em testes automatizados ou quando não há token configurado, utiliza o MemoryStorageDriver
  if (env.NODE_ENV === 'test' || !env.BLOB_READ_WRITE_TOKEN) {
    return new MemoryStorageDriver();
  }

  try {
    return new VercelBlobStorageDriver(env.BLOB_READ_WRITE_TOKEN);
  } catch (error) {
    logger.warn('Storage: Falha ao inicializar VercelBlobStorageDriver, usando fallback em memória.', {
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
    return new MemoryStorageDriver();
  }
}

/**
 * Retorna a instância compartilhada (Singleton) do StorageDriver para a aplicação.
 */
export function getSharedStorageDriver(): StorageDriver {
  if (!sharedDriverInstance) {
    sharedDriverInstance = createStorageDriver('auto');
  }
  return sharedDriverInstance;
}

/**
 * Permite substituir a instância compartilhada durante a execução de testes automatizados.
 */
export function setSharedStorageDriverForTesting(driver: StorageDriver | null): void {
  sharedDriverInstance = driver;
}

