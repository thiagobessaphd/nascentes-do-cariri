/**
 * Testes Unitários: Driver de Storage em Memória (MemoryStorageDriver)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorageDriver } from '@/lib/storage/drivers/memory-storage.driver';
import { StorageFileNotFoundError } from '@/lib/storage/storage.errors';
import { computeFileSha256 } from '@/lib/storage/crypto';

describe('MemoryStorageDriver (src/lib/storage/drivers/memory-storage.driver.ts)', () => {
  let driver: MemoryStorageDriver;

  beforeEach(() => {
    driver = new MemoryStorageDriver();
  });

  it('deve realizar upload e retornar metadados estritos', async () => {
    const payload = 'linha1;linha2\nlinha3';
    const expectedHash = computeFileSha256(payload);

    const result = await driver.upload(payload, {
      pathname: 'importacoes/2026/11/teste.txt',
      contentType: 'text/plain; charset=utf-8',
    });

    expect(result.pathname).toBe('importacoes/2026/11/teste.txt');
    expect(result.url).toBe('memory://storage/importacoes/2026/11/teste.txt');
    expect(result.contentType).toBe('text/plain; charset=utf-8');
    expect(result.sizeBytes).toBe(Buffer.byteLength(payload));
    expect(result.hashSha256).toBe(expectedHash);
    expect(result.uploadedAt).toBeInstanceOf(Date);
  });

  it('deve recuperar o conteúdo gravado com download e manter imutabilidade defensiva', async () => {
    const payload = Buffer.from('conteudo-imutavel');
    await driver.upload(payload, { pathname: 'dados.txt' });

    const downloaded = await driver.download('dados.txt');
    expect(downloaded.toString('utf-8')).toBe('conteudo-imutavel');

    // Modificar o buffer retornado não deve afetar o armazenamento interno
    downloaded[0] = 0x58; // 'X'
    const downloadedNovamente = await driver.download('dados.txt');
    expect(downloadedNovamente.toString('utf-8')).toBe('conteudo-imutavel');
  });

  it('deve lançar StorageFileNotFoundError ao tentar baixar arquivo inexistente', async () => {
    await expect(driver.download('arquivo-inexistente.txt')).rejects.toThrow(
      StorageFileNotFoundError
    );
  });

  it('deve verificar existência de arquivos com exists() e head()', async () => {
    expect(await driver.exists('arquivo.txt')).toBe(false);
    expect(await driver.head('arquivo.txt')).toBeNull();

    await driver.upload('conteudo', { pathname: 'arquivo.txt', contentType: 'text/plain' });

    expect(await driver.exists('arquivo.txt')).toBe(true);
    const head = await driver.head('arquivo.txt');
    expect(head).not.toBeNull();
    expect(head?.pathname).toBe('arquivo.txt');
    expect(head?.sizeBytes).toBe(Buffer.byteLength('conteudo'));
    expect(head?.contentType).toBe('text/plain');
  });

  it('deve deletar arquivos com sucesso e limpar estado com clear()', async () => {
    await driver.upload('1', { pathname: 'a.txt' });
    await driver.upload('2', { pathname: 'b.txt' });
    expect(driver.size()).toBe(2);

    await driver.delete('a.txt');
    expect(await driver.exists('a.txt')).toBe(false);
    expect(driver.size()).toBe(1);

    driver.clear();
    expect(driver.size()).toBe(0);
    expect(await driver.exists('b.txt')).toBe(false);
  });
});

