/**
 * Nascentes do Cariri — Testes Unitários de QA
 *
 * Módulo: ImportacaoStorageService
 * Armazenamento privado com hash SHA-256 determinístico, caminho único,
 * integridade criptográfica, validações de limite e rollback compensatório.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  ImportacaoStorageService,
  generateUniqueImportacaoPathname,
} from '@/modules/importacoes/importacoes-storage.service';
import { StatusImportacao } from '@/modules/importacoes/importacoes.types';
import { MemoryStorageDriver } from '@/lib/storage/drivers/memory-storage.driver';
import { computeFileSha256 } from '@/lib/storage/crypto';
import {
  FileTooLargeError,
  InvalidFilenameError,
  StorageFileNotFoundError,
} from '@/lib/storage/storage.errors';
import { logger } from '@/lib/logger';

describe('QA Unitário — Serviço de Armazenamento de Importações', () => {
  let memoryDriver: MemoryStorageDriver;
  let mockPrisma: PrismaClient;

  const DEFAULT_CONTENT = 'latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media\n-7.2289;-39.4144;Crato;Fonte;Local;2024-05-10;0.450';
  const DEFAULT_BUFFER = Buffer.from(DEFAULT_CONTENT, 'utf-8');
  const DEFAULT_USER_ID = 42;

  beforeEach(() => {
    vi.clearAllMocks();
    memoryDriver = new MemoryStorageDriver();

    mockPrisma = {
      importacao: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as PrismaClient;
  });

  // ---------------------------------------------------------------------------
  // 1. generateUniqueImportacaoPathname
  // ---------------------------------------------------------------------------
  describe('Função: generateUniqueImportacaoPathname', () => {
    it('deve gerar pathname particionado por ano e mês no formato importacoes/YYYY/MM/timestamp-uuid-slug.txt', () => {
      const pathname = generateUniqueImportacaoPathname('dados_nascentes_2024.txt');

      const pathPattern = /^importacoes\/\d{4}\/\d{2}\/\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-dados_nascentes_2024\.txt$/;
      expect(pathname).toMatch(pathPattern);
    });

    it('deve sanitizar caracteres especiais e acentos no slug mantendo o formato seguro', () => {
      const pathname = generateUniqueImportacaoPathname('Nascentes Crato & Barbalha (Versão Final).txt');

      expect(pathname).toMatch(/^importacoes\/\d{4}\/\d{2}\//);
      expect(pathname).toContain('Nascentes_Crato_Barbalha_Versao_Final.txt');
      expect(pathname).not.toContain('(');
      expect(pathname).not.toContain(')');
      expect(pathname).not.toContain('&');
    });

    it('deve neutralizar tentativas de path traversal transformando em slug seguro sob importacoes/', () => {
      const pathname = generateUniqueImportacaoPathname('../../etc/passwd.txt');

      expect(pathname.startsWith('importacoes/')).toBe(true);
      expect(pathname).not.toContain('..');
      expect(pathname).toContain('passwd.txt');
    });

    it('deve garantir unicidade estrita mesmo para arquivos com o mesmo nome original chamados em sequência', () => {
      const path1 = generateUniqueImportacaoPathname('nascentes.txt');
      const path2 = generateUniqueImportacaoPathname('nascentes.txt');

      expect(path1).not.toBe(path2);
      expect(path1).toContain('nascentes.txt');
      expect(path2).toContain('nascentes.txt');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. storeOriginalFile — Validações de Entrada e Limites
  // ---------------------------------------------------------------------------
  describe('storeOriginalFile — Validações de Entrada e Limites (Fail-Fast)', () => {
    it('deve rejeitar arquivo com extensão diferente de .txt com InvalidFilenameError', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      await expect(
        service.storeOriginalFile({
          filename: 'nascentes.csv',
          content: DEFAULT_BUFFER,
          usuarioId: DEFAULT_USER_ID,
        })
      ).rejects.toThrow(InvalidFilenameError);

      expect(mockPrisma.importacao.create).not.toHaveBeenCalled();
      expect(memoryDriver.size()).toBe(0);
    });

    it('deve rejeitar arquivo com tentativa explícita de path traversal com InvalidFilenameError', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      await expect(
        service.storeOriginalFile({
          filename: '../malicioso.txt',
          content: DEFAULT_BUFFER,
          usuarioId: DEFAULT_USER_ID,
        })
      ).rejects.toThrow(InvalidFilenameError);

      expect(mockPrisma.importacao.create).not.toHaveBeenCalled();
      expect(memoryDriver.size()).toBe(0);
    });

    it('deve rejeitar arquivo vazio (0 bytes) com AppError 400 (EMPTY_FILE)', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      await expect(
        service.storeOriginalFile({
          filename: 'vazio.txt',
          content: Buffer.alloc(0),
          usuarioId: DEFAULT_USER_ID,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          message: 'O arquivo TXT enviado está vazio.',
          statusCode: 400,
          code: 'EMPTY_FILE',
        })
      );

      expect(mockPrisma.importacao.create).not.toHaveBeenCalled();
      expect(memoryDriver.size()).toBe(0);
    });

    it('deve rejeitar arquivo que ultrapassa o tamanho máximo permitido com FileTooLargeError (HTTP 413)', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const bufferGrande = Buffer.alloc(100);
      const limiteCustomizado = 50; // 50 bytes

      await expect(
        service.storeOriginalFile(
          {
            filename: 'grande.txt',
            content: bufferGrande,
            usuarioId: DEFAULT_USER_ID,
          },
          { maxSizeBytes: limiteCustomizado }
        )
      ).rejects.toThrow(FileTooLargeError);

      expect(mockPrisma.importacao.create).not.toHaveBeenCalled();
      expect(memoryDriver.size()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. storeOriginalFile — Fluxo correto e Criptografia
  // ---------------------------------------------------------------------------
  describe('storeOriginalFile — Persistência, Hash Determinístico e Auditoria', () => {
    it('deve armazenar no storage privado e registrar no banco com status VALIDANDO e hash exato', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const expectedHash = computeFileSha256(DEFAULT_BUFFER);

      vi.mocked(mockPrisma.importacao.create).mockImplementation((args) => {
        const data = args.data as {
          usuarioId: number;
          nomeArquivo: string;
          caminhoPrivadoArquivo: string;
          hashArquivo: string;
          status: StatusImportacao;
          totalLinhas?: number;
          totalValidas?: number;
          totalInvalidas?: number;
          totalDuplicadas?: number;
        };
        return Promise.resolve({
          id: 101,
          usuarioId: data.usuarioId,
          nomeArquivo: data.nomeArquivo,
          caminhoPrivadoArquivo: data.caminhoPrivadoArquivo,
          hashArquivo: data.hashArquivo,
          status: data.status,
          totalLinhas: data.totalLinhas ?? 0,
          totalValidas: data.totalValidas ?? 0,
          totalInvalidas: data.totalInvalidas ?? 0,
          totalDuplicadas: data.totalDuplicadas ?? 0,
          mensagemErro: null,
          createdAt: new Date('2026-11-02T21:00:00Z'),
          concluidaAt: null,
        }) as unknown as ReturnType<typeof mockPrisma.importacao.create>;
      });

      const result = await service.storeOriginalFile({
        filename: 'lote_nascentes.txt',
        content: DEFAULT_BUFFER,
        usuarioId: DEFAULT_USER_ID,
      });

      expect(result).toMatchObject({
        importacaoId: 101,
        usuarioId: DEFAULT_USER_ID,
        nomeArquivoOriginal: 'lote_nascentes.txt',
        hashArquivoSha256: expectedHash,
        tamanhoBytes: DEFAULT_BUFFER.byteLength,
        status: StatusImportacao.VALIDANDO,
      });

      expect(mockPrisma.importacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          usuarioId: DEFAULT_USER_ID,
          nomeArquivo: 'lote_nascentes.txt',
          hashArquivo: expectedHash,
          status: StatusImportacao.VALIDANDO,
          totalLinhas: 0,
          totalValidas: 0,
          totalInvalidas: 0,
          totalDuplicadas: 0,
        }),
      });

      // Verifica se o arquivo foi realmente persistido no storage driver em memória
      expect(memoryDriver.size()).toBe(1);
      const storedContent = await memoryDriver.download(result.caminhoPrivadoArquivo);
      expect(storedContent.toString('utf-8')).toBe(DEFAULT_CONTENT);
    });

    it('deve aceitar payload enviado como Uint8Array ou string UTF-8 com o mesmo hash canônico', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const stringInput = DEFAULT_CONTENT;
      const expectedHash = computeFileSha256(stringInput);

      vi.mocked(mockPrisma.importacao.create).mockImplementation((args) => {
        const data = args.data as {
          usuarioId: number;
          nomeArquivo: string;
          caminhoPrivadoArquivo: string;
          hashArquivo: string;
          status: StatusImportacao;
          totalLinhas?: number;
          totalValidas?: number;
          totalInvalidas?: number;
          totalDuplicadas?: number;
        };
        return Promise.resolve({
          id: 102,
          usuarioId: data.usuarioId,
          nomeArquivo: data.nomeArquivo,
          caminhoPrivadoArquivo: data.caminhoPrivadoArquivo,
          hashArquivo: data.hashArquivo,
          status: data.status,
          totalLinhas: data.totalLinhas ?? 0,
          totalValidas: data.totalValidas ?? 0,
          totalInvalidas: data.totalInvalidas ?? 0,
          totalDuplicadas: data.totalDuplicadas ?? 0,
          mensagemErro: null,
          createdAt: new Date(),
          concluidaAt: null,
        }) as unknown as ReturnType<typeof mockPrisma.importacao.create>;
      });

      const result = await service.storeOriginalFile({
        filename: 'nascentes_string.txt',
        content: stringInput,
        usuarioId: DEFAULT_USER_ID,
      });

      expect(result.hashArquivoSha256).toBe(expectedHash);
      expect(result.tamanhoBytes).toBe(Buffer.byteLength(DEFAULT_CONTENT, 'utf-8'));
    });

    it('deve permitir coexistência de múltiplos arquivos com mesmo nome original sem colisão', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      let nextId = 1;
      vi.mocked(mockPrisma.importacao.create).mockImplementation((args) => {
        const data = args.data as {
          usuarioId: number;
          nomeArquivo: string;
          caminhoPrivadoArquivo: string;
          hashArquivo: string;
          status: StatusImportacao;
          totalLinhas?: number;
          totalValidas?: number;
          totalInvalidas?: number;
          totalDuplicadas?: number;
        };
        return Promise.resolve({
          id: nextId++,
          usuarioId: data.usuarioId,
          nomeArquivo: data.nomeArquivo,
          caminhoPrivadoArquivo: data.caminhoPrivadoArquivo,
          hashArquivo: data.hashArquivo,
          status: data.status,
          totalLinhas: data.totalLinhas ?? 0,
          totalValidas: data.totalValidas ?? 0,
          totalInvalidas: data.totalInvalidas ?? 0,
          totalDuplicadas: data.totalDuplicadas ?? 0,
          mensagemErro: null,
          createdAt: new Date(),
          concluidaAt: null,
        }) as unknown as ReturnType<typeof mockPrisma.importacao.create>;
      });

      const upload1 = await service.storeOriginalFile({
        filename: 'nascentes.txt',
        content: DEFAULT_BUFFER,
        usuarioId: 10,
      });

      const upload2 = await service.storeOriginalFile({
        filename: 'nascentes.txt',
        content: DEFAULT_BUFFER,
        usuarioId: 20,
      });

      expect(upload1.caminhoPrivadoArquivo).not.toBe(upload2.caminhoPrivadoArquivo);
      expect(memoryDriver.size()).toBe(2);
      expect(await memoryDriver.exists(upload1.caminhoPrivadoArquivo)).toBe(true);
      expect(await memoryDriver.exists(upload2.caminhoPrivadoArquivo)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. storeOriginalFile — Rollback Compensatório Automático
  // ---------------------------------------------------------------------------
  describe('storeOriginalFile — Resiliência e Rollback Compensatório', () => {
    it('deve excluir o blob do storage e re-lançar a exceção quando a criação no Prisma falhar', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const dbError = new Error('Database connection pool exhausted');
      vi.mocked(mockPrisma.importacao.create).mockRejectedValueOnce(dbError);

      const deleteSpy = vi.spyOn(memoryDriver, 'delete');

      await expect(
        service.storeOriginalFile({
          filename: 'falha_banco.txt',
          content: DEFAULT_BUFFER,
          usuarioId: DEFAULT_USER_ID,
        })
      ).rejects.toThrow('Database connection pool exhausted');

      // Verifica se a exclusão compensatória foi executada
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      // Nenhum arquivo órfão deve permanecer no storage
      expect(memoryDriver.size()).toBe(0);
    });

    it('deve logar aviso com logger.warn e propagar o erro do banco caso a limpeza compensatória falhe', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const warnSpy = vi.spyOn(logger, 'warn');
      vi.mocked(mockPrisma.importacao.create).mockRejectedValueOnce(new Error('Constraint error'));
      vi.spyOn(memoryDriver, 'delete').mockRejectedValueOnce(new Error('Storage disk I/O timeout'));

      await expect(
        service.storeOriginalFile({
          filename: 'falha_dupla.txt',
          content: DEFAULT_BUFFER,
          usuarioId: DEFAULT_USER_ID,
        })
      ).rejects.toThrow('Constraint error');

      expect(warnSpy).toHaveBeenCalledWith(
        'Storage: Falha na limpeza compensatória do blob após erro no banco.',
        expect.objectContaining({
          error: 'Storage disk I/O timeout',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. retrieveOriginalFile
  // ---------------------------------------------------------------------------
  describe('retrieveOriginalFile', () => {
    it('deve fazer o download do buffer original previamente gravado no storage', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const uploadResult = await memoryDriver.upload(DEFAULT_BUFFER, {
        pathname: 'importacoes/2026/11/sample.txt',
      });

      const retrievedBuffer = await service.retrieveOriginalFile(uploadResult.pathname);

      expect(Buffer.isBuffer(retrievedBuffer)).toBe(true);
      expect(retrievedBuffer.toString('utf-8')).toBe(DEFAULT_CONTENT);
    });

    it('deve propagar StorageFileNotFoundError quando o caminho não existir', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      await expect(
        service.retrieveOriginalFile('importacoes/2026/11/inexistente.txt')
      ).rejects.toThrow(StorageFileNotFoundError);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. verifyStoredFileIntegrity
  // ---------------------------------------------------------------------------
  describe('verifyStoredFileIntegrity', () => {
    it('deve retornar { valid: true } quando o arquivo no storage bate exatamente com o hash do banco', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const hashOriginal = computeFileSha256(DEFAULT_BUFFER);
      const uploadResult = await memoryDriver.upload(DEFAULT_BUFFER, {
        pathname: 'importacoes/2026/11/integro.txt',
      });

      vi.mocked(mockPrisma.importacao.findUnique).mockResolvedValueOnce({
        id: 50,
        caminhoPrivadoArquivo: uploadResult.pathname,
        hashArquivo: hashOriginal,
      } as unknown as Awaited<ReturnType<typeof mockPrisma.importacao.findUnique>>);

      const verification = await service.verifyStoredFileIntegrity(50);

      expect(verification.valid).toBe(true);
      if (verification.valid) {
        expect(verification.hash).toBe(hashOriginal);
      }
    });

    it('deve detectar adulteração de 1 byte no arquivo armazenado', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const hashEsperado = computeFileSha256(DEFAULT_BUFFER);

      // Upload de conteúdo adulterado no storage (1 byte a mais)
      const conteudoAdulterado = Buffer.from(`${DEFAULT_CONTENT}#`, 'utf-8');
      const uploadResult = await memoryDriver.upload(conteudoAdulterado, {
        pathname: 'importacoes/2026/11/adulterado.txt',
      });

      vi.mocked(mockPrisma.importacao.findUnique).mockResolvedValueOnce({
        id: 51,
        caminhoPrivadoArquivo: uploadResult.pathname,
        hashArquivo: hashEsperado,
      } as unknown as Awaited<ReturnType<typeof mockPrisma.importacao.findUnique>>);

      const verification = await service.verifyStoredFileIntegrity(51);

      expect(verification.valid).toBe(false);
      if (!verification.valid) {
        expect(verification.reason).toBe('HASH_MISMATCH');
        expect(verification.expectedHash).toBe(hashEsperado);
        expect(verification.computedHash).toBe(computeFileSha256(conteudoAdulterado));
      }
    });

    it('deve lançar AppError 404 (IMPORTACAO_NOT_FOUND) se o ID de importação não existir no banco', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      vi.mocked(mockPrisma.importacao.findUnique).mockResolvedValueOnce(null);

      await expect(service.verifyStoredFileIntegrity(999)).rejects.toThrowError(
        expect.objectContaining({
          message: 'Registro de importação com ID 999 não foi encontrado.',
          statusCode: 404,
          code: 'IMPORTACAO_NOT_FOUND',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 7. rollbackStoredFile
  // ---------------------------------------------------------------------------
  describe('rollbackStoredFile', () => {
    it('deve remover o arquivo do storage e atualizar status para FALHOU no Prisma quando importacaoId é fornecido', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const uploadResult = await memoryDriver.upload(DEFAULT_BUFFER, {
        pathname: 'importacoes/2026/11/cancelar.txt',
      });

      vi.mocked(mockPrisma.importacao.update).mockResolvedValueOnce({
        id: 70,
        status: StatusImportacao.FALHOU,
      } as unknown as Awaited<ReturnType<typeof mockPrisma.importacao.update>>);

      await service.rollbackStoredFile(uploadResult.pathname, 70);

      expect(await memoryDriver.exists(uploadResult.pathname)).toBe(false);
      expect(mockPrisma.importacao.update).toHaveBeenCalledWith({
        where: { id: 70 },
        data: {
          status: StatusImportacao.FALHOU,
          mensagemErro: 'Arquivo cancelado ou revertido administrativamente.',
        },
      });
    });

    it('deve apenas excluir do storage sem falhar caso importacaoId não seja informado', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const uploadResult = await memoryDriver.upload(DEFAULT_BUFFER, {
        pathname: 'importacoes/2026/11/limpeza-avulsa.txt',
      });

      await service.rollbackStoredFile(uploadResult.pathname);

      expect(await memoryDriver.exists(uploadResult.pathname)).toBe(false);
      expect(mockPrisma.importacao.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Validação de Isolamento e Acesso Público Negado
  // ---------------------------------------------------------------------------
  describe('Validação de Isolamento e Acesso Público Negado', () => {
    it('deve instruir o storage driver com permissão privada obrigatória (isPrivate: true)', async () => {
      const service = new ImportacaoStorageService({
        storageDriver: memoryDriver,
        prismaClient: mockPrisma,
      });

      const uploadSpy = vi.spyOn(memoryDriver, 'upload');

      vi.mocked(mockPrisma.importacao.create).mockImplementation((args) => {
        const data = args.data as {
          usuarioId: number;
          nomeArquivo: string;
          caminhoPrivadoArquivo: string;
          hashArquivo: string;
          status: StatusImportacao;
        };
        return Promise.resolve({
          id: 201,
          usuarioId: data.usuarioId,
          nomeArquivo: data.nomeArquivo,
          caminhoPrivadoArquivo: data.caminhoPrivadoArquivo,
          hashArquivo: data.hashArquivo,
          status: data.status,
          totalLinhas: 0,
          totalValidas: 0,
          totalInvalidas: 0,
          totalDuplicadas: 0,
          mensagemErro: null,
          createdAt: new Date(),
          concluidaAt: null,
        }) as unknown as ReturnType<typeof mockPrisma.importacao.create>;
      });

      await service.storeOriginalFile({
        filename: 'documento_privado.txt',
        content: DEFAULT_BUFFER,
        usuarioId: DEFAULT_USER_ID,
      });

      expect(uploadSpy).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          isPrivate: true,
        })
      );
    });

    it('deve garantir que o caminho do storage é virtualizado e não expõe diretórios físicos do servidor', () => {
      const pathname = generateUniqueImportacaoPathname('dados_sigilosos.txt');

      // Deve estar sob o namespace virtualizado de importações
      expect(pathname.startsWith('importacoes/')).toBe(true);
      // Não pode conter referências a drivers Windows
      expect(pathname).not.toMatch(/^[a-zA-Z]:\\/);
      // Não pode conter raiz absoluta de sistemas Unix
      expect(pathname).not.toMatch(/^\//);
      // Não pode conter quebras de hierarquia
      expect(pathname).not.toContain('..');
    });
  });
});
