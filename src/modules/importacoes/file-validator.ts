/**
 * Nascentes do Cariri — Validador Preliminar de Arquivos TXT (File Validator)
 *
 * Responsável pela validação prévia e estrita (fail-fast) de arquivos de importação
 * antes de qualquer processamento, parsing aprofundado ou gravação no storage.
 */

import { env } from '@/config/env';
import { AppError } from '@/lib/errors';
import {
  FileTooLargeError,
  InvalidFilenameError,
} from '@/lib/storage/storage.errors';
import { computeFileSha256, toBinaryBuffer } from '@/lib/storage/crypto';
import { validateUploadFilename } from '@/lib/security/sanitizer';
import { decodeTxtContent } from './txt-parser';

export interface UploadedFileEntry {
  readonly filename: string;
  readonly sizeBytes: number;
  readonly mimeType?: string | undefined;
  readonly content: Buffer | Uint8Array;
}

export interface PreliminaryValidationOptions {
  readonly maxSizeBytes?: number | undefined;
  readonly allowedExtensions?: readonly string[] | undefined;
}

export interface ValidatedPreliminaryUpload {
  readonly filename: string;
  readonly buffer: Buffer;
  readonly textContent: string;
  readonly sizeBytes: number;
  readonly hashSha256: string;
}

const PROHIBITED_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-msdownload',
  'application/x-dosexec',
  'application/zip',
  'application/x-tar',
  'application/x-gzip',
  'application/x-bzip2',
  'application/x-7z-compressed',
  'application/javascript',
  'application/json',
  'text/html',
  'text/javascript',
  'text/xml',
]);

export interface ExtractUploadedFilesOptions {
  readonly maxSizeBytes?: number | undefined;
}

/**
 * Extrai entradas de arquivo de um objeto FormData da Web API de forma padronizada e imutável,
 * aplicando proteção antecipada contra uploads que excedam maxSizeBytes antes de materializar o buffer.
 */
export async function extractUploadedFilesFromFormData(
  formData: FormData,
  options?: ExtractUploadedFilesOptions
): Promise<readonly UploadedFileEntry[]> {
  const maxBytes = options?.maxSizeBytes ?? env.MAX_UPLOAD_SIZE_BYTES;
  const fileEntries: UploadedFileEntry[] = [];

  for (const [, value] of formData.entries()) {
    if (
      typeof value === 'object' &&
      value !== null &&
      'arrayBuffer' in value &&
      typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
    ) {
      const file = value as File;
      if (typeof file.size === 'number' && Number.isFinite(file.size) && file.size > maxBytes) {
        throw new FileTooLargeError(file.size, maxBytes);
      }

      const arrayBuffer = await file.arrayBuffer();
      if (arrayBuffer.byteLength > maxBytes) {
        throw new FileTooLargeError(arrayBuffer.byteLength, maxBytes);
      }

      fileEntries.push({
        filename: file.name,
        sizeBytes: arrayBuffer.byteLength,
        mimeType: file.type || undefined,
        content: Buffer.from(arrayBuffer),
      });
    }
  }

  return fileEntries;
}

/**
 * Executa todas as verificações preliminares de segurança e integridade física do arquivo:
 * 1. Exatamente um arquivo por requisição;
 * 2. Validação rigorosa de nome e extensão (.txt) contra Path Traversal e nomes reservados;
 * 3. Bloqueio de MIME types manifestamente não textuais (executáveis, imagens, pdf, etc.);
 * 4. Bloqueio de arquivo vazio (0 bytes);
 * 5. Bloqueio de arquivo acima do limite configurado (MAX_UPLOAD_SIZE_BYTES);
 * 6. Bloqueio de arquivos contendo bytes nulos (\x00 — detecção de binários disfarçados);
 * 7. Validação de decodificação UTF-8 estrita;
 * 8. Bloqueio de arquivos com conteúdo textual vazio (apenas espaços/quebras de linha).
 *
 * @throws AppError / StorageError caso alguma regra preliminar seja violada.
 */
export function validatePreliminaryUpload(
  files: readonly UploadedFileEntry[],
  options?: PreliminaryValidationOptions
): ValidatedPreliminaryUpload {
  // 1. Quantidade única de arquivos
  if (files.length === 0) {
    throw new AppError(
      'Nenhum arquivo foi enviado. É necessário enviar exatamente um arquivo .txt.',
      400,
      'NO_FILE_UPLOADED'
    );
  }

  if (files.length > 1) {
    throw new AppError(
      `Múltiplos arquivos detectados (${files.length}). É permitido enviar apenas um arquivo por operação.`,
      400,
      'MULTIPLE_FILES_NOT_ALLOWED'
    );
  }

  const [file] = files;
  if (!file) {
    throw new AppError(
      'Nenhum arquivo foi enviado. É necessário enviar exatamente um arquivo .txt.',
      400,
      'NO_FILE_UPLOADED'
    );
  }

  // 2. Normalização do payload binário
  const buffer = toBinaryBuffer(file.content);

  // 3. Validação de arquivo vazio em bytes
  if (buffer.byteLength === 0) {
    throw new AppError(
      'O arquivo TXT enviado está vazio (0 bytes).',
      400,
      'EMPTY_FILE'
    );
  }

  // 4. Validação de cota máxima de tamanho
  const maxBytes = options?.maxSizeBytes ?? env.MAX_UPLOAD_SIZE_BYTES;
  if (buffer.byteLength > maxBytes) {
    throw new FileTooLargeError(buffer.byteLength, maxBytes);
  }

  // 5. Validação de nome e extensão (.txt)
  const allowedExtensions = options?.allowedExtensions ?? ['.txt'];
  const filenameValidation = validateUploadFilename(file.filename, allowedExtensions);
  if (!filenameValidation.isValid) {
    throw new InvalidFilenameError(
      filenameValidation.reason ?? 'Nome de arquivo inválido.'
    );
  }

  // 6. Validação de MIME Type (se fornecido pelo cliente)
  if (file.mimeType && file.mimeType.trim()) {
    const normalizedMime = file.mimeType.toLowerCase().trim();
    if (
      PROHIBITED_MIME_TYPES.has(normalizedMime) ||
      normalizedMime.startsWith('image/') ||
      normalizedMime.startsWith('audio/') ||
      normalizedMime.startsWith('video/')
    ) {
      throw new AppError(
        `Tipo de mídia não suportado: "${file.mimeType}". Apenas arquivos de texto puro (.txt) são aceitos.`,
        400,
        'INVALID_MIME_TYPE'
      );
    }
  }

  // 7. Bloqueio de arquivos binários disfarçados (bytes nulos)
  if (buffer.includes(0)) {
    throw new AppError(
      'O arquivo enviado contém dados binários ou bytes nulos, incompatíveis com arquivos de texto puro.',
      400,
      'BINARY_FILE_NOT_ALLOWED'
    );
  }

  // 8. Decodificação estrita UTF-8
  let textContent: string;
  try {
    textContent = decodeTxtContent(buffer);
  } catch (decodingError: unknown) {
    const detail =
      decodingError instanceof Error
        ? decodingError.message
        : 'Codificação não suportada';
    throw new AppError(
      `O arquivo enviado não possui codificação UTF-8 válida: ${detail}.`,
      400,
      'INVALID_ENCODING'
    );
  }

  // 9. Bloqueio de arquivo contendo apenas espaços ou quebras de linha
  if (textContent.trim().length === 0) {
    throw new AppError(
      'O arquivo TXT não possui conteúdo textual válido (apenas espaços em branco ou quebras de linha).',
      400,
      'EMPTY_FILE'
    );
  }

  // 10. Cálculo determinístico do hash SHA-256
  const hashSha256 = computeFileSha256(buffer);

  return {
    filename: file.filename,
    buffer,
    textContent,
    sizeBytes: buffer.byteLength,
    hashSha256,
  };
}

