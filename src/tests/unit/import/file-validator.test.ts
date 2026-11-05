/**
 * Suíte de Testes Unitários de QA: Validador Preliminar de Upload (CT-BE-03, CT-BE-04, CT-BE-05)
 *
 * Módulo: src/modules/importacoes/file-validator.ts
 * Cobertura:
 * - CT-BE-03: Rejeição de extensão inválida, dupla extensão e Path Traversal;
 * - CT-BE-04: Rejeição de arquivo acima do limite máximo (5MB / customizado);
 * - CT-BE-05: Rejeição de arquivo vazio (0 bytes ou apenas espaços/quebras de linha);
 * - Extração de FormData, unicidade de arquivo, MIME types proibidos, bytes nulos (binários) e UTF-8.
 */

import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import {
  extractUploadedFilesFromFormData,
  validatePreliminaryUpload,
  type UploadedFileEntry,
} from '@/modules/importacoes/file-validator';
import { AppError } from '@/lib/errors';
import {
  FileTooLargeError,
  InvalidFilenameError,
} from '@/lib/storage/storage.errors';
import { EXPECTED_TXT_HEADER_STRING } from '@/modules/importacoes/importacoes.types';

describe('QA Unitário — Validador Preliminar de Upload TXT (CT-BE-03, CT-BE-04, CT-BE-05)', () => {
  const VALID_TXT_CONTENT = [
    EXPECTED_TXT_HEADER_STRING,
    '-7.228900;-39.414400;Crato;Fonte da Batateira;Sítio Fundão;2024-05-10;0.450',
  ].join('\n');

  const VALID_TXT_BUFFER = Buffer.from(VALID_TXT_CONTENT, 'utf-8');

  function makeFileEntry(overrides?: Partial<UploadedFileEntry>): UploadedFileEntry {
    const content = overrides?.content ?? VALID_TXT_BUFFER;
    return {
      filename: overrides?.filename ?? 'importacao_cariri.txt',
      sizeBytes: overrides?.sizeBytes ?? content.byteLength,
      mimeType: overrides?.mimeType ?? 'text/plain',
      content,
    };
  }

  describe('1. Extração de arquivos do FormData (extractUploadedFilesFromFormData)', () => {
    it('deve extrair corretamente um único arquivo enviado no FormData ignorando campos de texto', async () => {
      const formData = new FormData();
      formData.append('descricao', 'Importação mensal do Cariri');
      const file = new File([VALID_TXT_CONTENT], 'nascentes_crato.txt', {
        type: 'text/plain',
      });
      formData.append('file', file);

      const extracted = await extractUploadedFilesFromFormData(formData);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]?.filename).toBe('nascentes_crato.txt');
      expect(extracted[0]?.sizeBytes).toBe(VALID_TXT_BUFFER.byteLength);
      expect(extracted[0]?.mimeType).toContain('text/plain');
      expect(Buffer.from(extracted[0]?.content ?? []).toString('utf-8')).toBe(
        VALID_TXT_CONTENT
      );
    });

    it('deve retornar lista vazia quando o FormData não contiver arquivos', async () => {
      const formData = new FormData();
      formData.append('campo_texto', 'apenas_texto');

      const extracted = await extractUploadedFilesFromFormData(formData);
      expect(extracted).toHaveLength(0);
    });

    it('deve extrair todos os arquivos quando múltiplos arquivos forem anexados no FormData', async () => {
      const formData = new FormData();
      formData.append(
        'file1',
        new File([VALID_TXT_CONTENT], 'arq1.txt', { type: 'text/plain' })
      );
      formData.append(
        'file2',
        new File([VALID_TXT_CONTENT], 'arq2.txt', { type: 'text/plain' })
      );

      const extracted = await extractUploadedFilesFromFormData(formData);
      expect(extracted).toHaveLength(2);
    });
  });

  describe('2. Regra de Unicidade de Arquivo por Operação', () => {
    it('deve rejeitar quando nenhum arquivo for enviado (0 arquivos)', () => {
      expect(() => validatePreliminaryUpload([])).toThrowError(AppError);

      try {
        validatePreliminaryUpload([]);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe('NO_FILE_UPLOADED');
      }
    });

    it('deve rejeitar quando múltiplos arquivos forem enviados na mesma requisição', () => {
      const files = [
        makeFileEntry({ filename: 'parte1.txt' }),
        makeFileEntry({ filename: 'parte2.txt' }),
      ];

      expect(() => validatePreliminaryUpload(files)).toThrowError(AppError);

      try {
        validatePreliminaryUpload(files);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe('MULTIPLE_FILES_NOT_ALLOWED');
      }
    });
  });

  describe('3. CT-BE-03 — Rejeição de Extensão Inválida e Segurança de Nome', () => {
    it.each([
      'planilha.csv',
      'relatorio.pdf',
      'script.exe',
      'dados.json',
      'imagem.png',
      'compactado.zip',
      'malware.txt.exe',
      'ataque.txt.js',
      'sem_extensao',
      '',
      '   ',
    ])('deve rejeitar arquivo com nome ou extensão inválida: "%s"', (invalidFilename) => {
      const entry = makeFileEntry({ filename: invalidFilename });

      expect(() => validatePreliminaryUpload([entry])).toThrowError(
        InvalidFilenameError
      );

      try {
        validatePreliminaryUpload([entry]);
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidFilenameError);
        const fileErr = err as InvalidFilenameError;
        expect(fileErr.statusCode).toBe(400);
        expect(fileErr.code).toBe('INVALID_FILENAME');
      }
    });

    it.each([
      '../nascentes.txt',
      '..\\nascentes.txt',
      '../../etc/passwd.txt',
      'subpasta/arquivo.txt',
      'subpasta\\arquivo.txt',
      'CON.txt',
      'NUL.txt',
      'COM1.txt',
    ])(
      'deve bloquear tentativas de Path Traversal ou nomes reservados de sistema: "%s"',
      (hostileFilename) => {
        const entry = makeFileEntry({ filename: hostileFilename });

        expect(() => validatePreliminaryUpload([entry])).toThrowError(
          InvalidFilenameError
        );
      }
    );

    it('deve aceitar extensão .txt em maiúsculas (.TXT) ou mista (.Txt)', () => {
      const upper = makeFileEntry({ filename: 'NASCENTES_CARIRI.TXT' });
      const result = validatePreliminaryUpload([upper]);

      expect(result.filename).toBe('NASCENTES_CARIRI.TXT');
      expect(result.hashSha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('4. CT-BE-04 — Rejeição de Tamanho Excessivo', () => {
    const FIVE_MB = 5 * 1024 * 1024; // 5.242.880 bytes

    it('deve rejeitar arquivo cujo conteúdo ultrapasse o limite de 5 MB com FileTooLargeError (413)', () => {
      const oversizedBuffer = Buffer.alloc(FIVE_MB + 1, 'a');
      const oversizedEntry = makeFileEntry({
        filename: 'grande_demais.txt',
        sizeBytes: oversizedBuffer.byteLength,
        content: oversizedBuffer,
      });

      expect(() =>
        validatePreliminaryUpload([oversizedEntry], { maxSizeBytes: FIVE_MB })
      ).toThrowError(FileTooLargeError);

      try {
        validatePreliminaryUpload([oversizedEntry], { maxSizeBytes: FIVE_MB });
      } catch (err) {
        expect(err).toBeInstanceOf(FileTooLargeError);
        const sizeErr = err as FileTooLargeError;
        expect(sizeErr.statusCode).toBe(413);
        expect(sizeErr.code).toBe('FILE_TOO_LARGE');
        expect(sizeErr.sizeBytes).toBe(FIVE_MB + 1);
        expect(sizeErr.maxBytes).toBe(FIVE_MB);
      }
    });

    it('deve rejeitar arquivo cujo buffer real exceda maxSizeBytes mesmo que sizeBytes declarado seja menor', () => {
      const realBuffer = Buffer.alloc(1025, 'a');
      const spoofedEntry = makeFileEntry({
        filename: 'spoofed.txt',
        sizeBytes: 100, // Declarado menor que o buffer real
        content: realBuffer,
      });

      expect(() =>
        validatePreliminaryUpload([spoofedEntry], { maxSizeBytes: 1024 })
      ).toThrowError(FileTooLargeError);
    });

    it('deve aceitar arquivo cujo tamanho seja exatamente igual ao limite máximo permitido', () => {
      const exactContent = Buffer.from(VALID_TXT_CONTENT, 'utf-8');
      const exactEntry = makeFileEntry({
        filename: 'no_limite.txt',
        sizeBytes: exactContent.byteLength,
        content: exactContent,
      });

      const result = validatePreliminaryUpload([exactEntry], {
        maxSizeBytes: exactContent.byteLength,
      });

      expect(result.sizeBytes).toBe(exactContent.byteLength);
    });
  });

  describe('5. CT-BE-05 — Rejeição de Arquivo Vazio', () => {
    it('deve rejeitar arquivo com 0 bytes (sizeBytes = 0 e buffer vazio)', () => {
      const emptyEntry = makeFileEntry({
        filename: 'vazio.txt',
        sizeBytes: 0,
        content: Buffer.alloc(0),
      });

      expect(() => validatePreliminaryUpload([emptyEntry])).toThrowError(AppError);

      try {
        validatePreliminaryUpload([emptyEntry]);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe('EMPTY_FILE');
      }
    });

    it('deve rejeitar arquivo contendo apenas espaços em branco, tabulações e quebras de linha', () => {
      const whitespaceBuffer = Buffer.from('   \r\n  \t\t  \n   ', 'utf-8');
      const whitespaceEntry = makeFileEntry({
        filename: 'apenas_espacos.txt',
        sizeBytes: whitespaceBuffer.byteLength,
        content: whitespaceBuffer,
      });

      expect(() => validatePreliminaryUpload([whitespaceEntry])).toThrowError(
        AppError
      );

      try {
        validatePreliminaryUpload([whitespaceEntry]);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe('EMPTY_FILE');
      }
    });
  });

  describe('6. Segurança de Conteúdo: MIME Types, Binários e UTF-8', () => {
    it.each([
      'application/pdf',
      'application/x-msdownload',
      'application/zip',
      'application/json',
      'text/html',
      'image/png',
      'image/jpeg',
      'audio/mpeg',
      'video/mp4',
    ])(
      'deve rejeitar arquivo .txt quando o MIME type informado for proibido: "%s"',
      (prohibitedMime) => {
        const entry = makeFileEntry({
          filename: 'disfarcado.txt',
          mimeType: prohibitedMime,
        });

        try {
          validatePreliminaryUpload([entry]);
          expect.fail('Deveria ter lançado AppError para MIME proibido');
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          const appErr = err as AppError;
          expect(appErr.statusCode).toBe(400);
          expect(appErr.code).toBe('INVALID_MIME_TYPE');
        }
      }
    );

    it('deve rejeitar arquivo binário disfarçado de .txt contendo byte nulo (\\x00)', () => {
      const binaryBuffer = Buffer.from([
        0x6c, 0x61, 0x74, 0x00, 0x6c, 0x6e, 0x67,
      ]);
      const binaryEntry = makeFileEntry({
        filename: 'binario_nulo.txt',
        sizeBytes: binaryBuffer.byteLength,
        content: binaryBuffer,
      });

      try {
        validatePreliminaryUpload([binaryEntry]);
        expect.fail('Deveria ter rejeitado arquivo contendo byte nulo');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe('BINARY_FILE_NOT_ALLOWED');
      }
    });

    it('deve rejeitar arquivo com sequência de bytes UTF-8 inválida', () => {
      const invalidUtf8Buffer = Buffer.from([0xff, 0xfe, 0x80, 0xbf, 0x41]);
      const invalidUtf8Entry = makeFileEntry({
        filename: 'encoding_invalido.txt',
        sizeBytes: invalidUtf8Buffer.byteLength,
        content: invalidUtf8Buffer,
      });

      try {
        validatePreliminaryUpload([invalidUtf8Entry]);
        expect.fail('Deveria ter rejeitado codificação UTF-8 inválida');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe('INVALID_ENCODING');
      }
    });

    it('deve aprovar arquivo .txt UTF-8 íntegro e retornar buffer, texto limpo e hash SHA-256 determinístico', () => {
      const entry = makeFileEntry();
      const result = validatePreliminaryUpload([entry]);

      expect(result.filename).toBe('importacao_cariri.txt');
      expect(result.sizeBytes).toBe(VALID_TXT_BUFFER.byteLength);
      expect(result.textContent).toBe(VALID_TXT_CONTENT);
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.hashSha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
