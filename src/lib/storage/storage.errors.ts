/**
 * Nascentes do Cariri — Classes de Erro do Módulo de Storage
 */

import { AppError } from '@/lib/errors';

/**
 * Erro base para falhas operacionais do subsistema de armazenamento.
 */
export class StorageError extends AppError {
  constructor(message: string, statusCode = 500, code = 'STORAGE_ERROR') {
    super(message, statusCode, code);
    this.name = 'StorageError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando o arquivo excede o limite máximo configurado (MAX_UPLOAD_SIZE_BYTES).
 */
export class FileTooLargeError extends StorageError {
  public readonly sizeBytes: number;
  public readonly maxBytes: number;

  constructor(sizeBytes: number, maxBytes: number) {
    super(
      `O arquivo (${sizeBytes} bytes) excede o limite máximo permitido de ${maxBytes} bytes.`,
      413,
      'FILE_TOO_LARGE'
    );
    this.name = 'FileTooLargeError';
    this.sizeBytes = sizeBytes;
    this.maxBytes = maxBytes;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando o nome do arquivo viola regras de sanitização ou extensões autorizadas.
 */
export class InvalidFilenameError extends StorageError {
  constructor(reason: string) {
    super(`Nome de arquivo inválido: ${reason}`, 400, 'INVALID_FILENAME');
    this.name = 'InvalidFilenameError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando a verificação criptográfica de integridade SHA-256 falha.
 */
export class FileIntegrityError extends StorageError {
  constructor(message = 'A integridade do arquivo armazenado falhou.') {
    super(message, 422, 'FILE_INTEGRITY_MISMATCH');
    this.name = 'FileIntegrityError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando um arquivo solicitado não é encontrado no storage.
 */
export class StorageFileNotFoundError extends StorageError {
  public readonly pathname: string;

  constructor(pathname: string) {
    super(`Arquivo não encontrado no storage: "${pathname}".`, 404, 'STORAGE_FILE_NOT_FOUND');
    this.name = 'StorageFileNotFoundError';
    this.pathname = pathname;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando o driver de storage solicitado não está configurado adequadamente.
 */
export class StorageDriverNotConfiguredError extends StorageError {
  constructor(driverName: string, reason: string) {
    super(
      `Driver de storage "${driverName}" não pôde ser inicializado: ${reason}`,
      500,
      'STORAGE_NOT_CONFIGURED'
    );
    this.name = 'StorageDriverNotConfiguredError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

