/**
 * Testes Unitários: Módulo de Criptografia e Integridade (SHA-256)
 */

import { describe, expect, it } from 'vitest';
import {
  computeFileSha256,
  SHA256_HEX_REGEX,
  toBinaryBuffer,
  verifyFileIntegrity,
} from '@/lib/storage/crypto';

describe('Utilitários Criptográficos e de Integridade (src/lib/storage/crypto.ts)', () => {
  const CONTEUDO_TXT = 'latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media\n-7.2289;-39.4144;Crato;Fonte;Local;2024-05-10;0.450';

  describe('toBinaryBuffer', () => {
    it('deve converter string, Buffer e Uint8Array para Buffer preservando o conteúdo exato', () => {
      const bufferDeString = toBinaryBuffer('teste utf-8');
      expect(Buffer.isBuffer(bufferDeString)).toBe(true);
      expect(bufferDeString.toString('utf-8')).toBe('teste utf-8');

      const bufferOriginal = Buffer.from('conteúdo binário');
      expect(toBinaryBuffer(bufferOriginal)).toBe(bufferOriginal);

      const uint8 = new Uint8Array([65, 66, 67]); // "ABC"
      const bufferDeUint8 = toBinaryBuffer(uint8);
      expect(bufferDeUint8.toString('utf-8')).toBe('ABC');
    });
  });

  describe('computeFileSha256', () => {
    it('deve calcular o hash SHA-256 canônico de 64 caracteres hexadecimais em caixa baixa', () => {
      const hash = computeFileSha256(CONTEUDO_TXT);

      expect(hash).toHaveLength(64);
      expect(SHA256_HEX_REGEX.test(hash)).toBe(true);
      expect(hash).toBe(hash.toLowerCase());
    });

    it('deve ser estritamente determinístico (mesmo conteúdo produz o mesmo hash)', () => {
      const hash1 = computeFileSha256(CONTEUDO_TXT);
      const hash2 = computeFileSha256(Buffer.from(CONTEUDO_TXT));
      const hash3 = computeFileSha256(new TextEncoder().encode(CONTEUDO_TXT));

      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);
    });

    it('deve alterar o hash completamente com a modificação de apenas 1 byte (Efeito Avalanche)', () => {
      const hashOriginal = computeFileSha256('latitude;longitude;municipio');
      const hashAlterado = computeFileSha256('latitude;longitude;municipiX');

      expect(hashOriginal).not.toBe(hashAlterado);
      expect(hashOriginal).toHaveLength(64);
      expect(hashAlterado).toHaveLength(64);
    });

    it('deve calcular corretamente o hash do arquivo vazio (e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855)', () => {
      const emptyHash = computeFileSha256('');
      expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('verifyFileIntegrity', () => {
    it('deve aprovar a integridade quando o hash coincide exatamente', () => {
      const hash = computeFileSha256(CONTEUDO_TXT);
      const resultado = verifyFileIntegrity(CONTEUDO_TXT, hash);

      expect(resultado.valid).toBe(true);
      if (resultado.valid) {
        expect(resultado.hash).toBe(hash);
      }
    });

    it('deve ser insensível a espaços e caixa alta no hash esperado', () => {
      const hash = computeFileSha256(CONTEUDO_TXT);
      const hashUpperCase = `  ${hash.toUpperCase()}  `;
      const resultado = verifyFileIntegrity(CONTEUDO_TXT, hashUpperCase);

      expect(resultado.valid).toBe(true);
    });

    it('deve rejeitar se o hash esperado não possui o formato hexadecimal de 64 caracteres', () => {
      const resultadoInvalido = verifyFileIntegrity(CONTEUDO_TXT, 'hash-curto-invalido');

      expect(resultadoInvalido.valid).toBe(false);
      if (!resultadoInvalido.valid) {
        expect(resultadoInvalido.reason).toBe('INVALID_HASH_FORMAT');
      }
    });

    it('deve rejeitar e apontar HASH_MISMATCH quando o conteúdo foi adulterado', () => {
      const hashOriginal = computeFileSha256(CONTEUDO_TXT);
      const conteudoAdulterado = `${CONTEUDO_TXT} `; // 1 espaço adicionado
      const resultado = verifyFileIntegrity(conteudoAdulterado, hashOriginal);

      expect(resultado.valid).toBe(false);
      if (!resultado.valid) {
        expect(resultado.reason).toBe('HASH_MISMATCH');
        expect(resultado.expectedHash).toBe(hashOriginal);
        expect(resultado.computedHash).not.toBe(hashOriginal);
      }
    });
  });
});

