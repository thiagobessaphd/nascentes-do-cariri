/**
 * Nascentes do Cariri — Utilitários Criptográficos e de Integridade de Arquivos
 *
 * Fornece cálculo determinístico de hash SHA-256 e validação em tempo constante
 * para prevenir ataques de canal lateral (timing attacks).
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Regex canônica para validação de hashes SHA-256 (exatamente 64 caracteres hexadecimais em caixa baixa).
 */
export const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

/**
 * Converte de forma segura o payload de entrada (Buffer, Uint8Array ou string) em Buffer Node.js,
 * preservando a sequência exata de bytes sem coerções de formatação.
 */
export function toBinaryBuffer(content: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(content)) {
    return content;
  }
  if (content instanceof Uint8Array) {
    return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
  }
  return Buffer.from(content, 'utf-8');
}

/**
 * Calcula o hash criptográfico SHA-256 a partir de um conteúdo binário ou string.
 * Retorna uma string hexadecimal de 64 caracteres em caixa baixa.
 */
export function computeFileSha256(content: Buffer | Uint8Array | string): string {
  const buffer = toBinaryBuffer(content);
  return createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

/**
 * União discriminada estrita para o resultado da verificação de integridade de arquivos.
 */
export type FileIntegrityResult =
  | {
      readonly valid: true;
      readonly hash: string;
    }
  | {
      readonly valid: false;
      readonly expectedHash: string;
      readonly computedHash: string;
      readonly reason: 'HASH_MISMATCH' | 'INVALID_HASH_FORMAT';
    };

/**
 * Valida a integridade de um arquivo comparando seu hash computado contra o hash esperado.
 */
export function verifyFileIntegrity(
  content: Buffer | Uint8Array | string,
  expectedHash: string
): FileIntegrityResult {
  const normalizedExpected = expectedHash.trim().toLowerCase();

  if (!SHA256_HEX_REGEX.test(normalizedExpected)) {
    return {
      valid: false,
      expectedHash: normalizedExpected,
      computedHash: '',
      reason: 'INVALID_HASH_FORMAT',
    };
  }

  const computedHash = computeFileSha256(content);

  const expectedBuffer = Buffer.from(normalizedExpected, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');

  // timingSafeEqual exige buffers de mesmo tamanho exato (32 bytes para digest SHA-256)
  if (
    expectedBuffer.byteLength !== 32 ||
    computedBuffer.byteLength !== 32 ||
    !timingSafeEqual(expectedBuffer, computedBuffer)
  ) {
    return {
      valid: false,
      expectedHash: normalizedExpected,
      computedHash,
      reason: 'HASH_MISMATCH',
    };
  }

  return {
    valid: true,
    hash: computedHash,
  };
}

