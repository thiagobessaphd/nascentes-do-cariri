import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../../lib/security/password';

describe('Segurança de Senhas (password.ts)', () => {
  it('deve gerar um hash bcrypt válido com salt rounds adequado', async () => {
    const rawPassword = 'senhaSeguraAdministrador123!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^\$2[ab]\$12\$/);
    expect(hash).not.toBe(rawPassword);
  });

  it('deve verificar com sucesso a senha correta contra o hash gerado', async () => {
    const rawPassword = 'minhaSenhaForte2026';
    const hash = await hashPassword(rawPassword);

    const isValid = await verifyPassword(rawPassword, hash);
    expect(isValid).toBe(true);
  });

  it('deve rejeitar uma senha incorreta contra o hash', async () => {
    const rawPassword = 'senhaCorreta123';
    const wrongPassword = 'senhaIncorretaErrada';
    const hash = await hashPassword(rawPassword);

    const isValid = await verifyPassword(wrongPassword, hash);
    expect(isValid).toBe(false);
  });

  it('deve falhar a validação se a senha tiver menos de 8 caracteres', async () => {
    const shortPassword = 'curta';
    await expect(hashPassword(shortPassword)).rejects.toThrow();
  });

  it('deve retornar false se a senha ou o hash forem nulos/vazios', async () => {
    expect(await verifyPassword('', 'hash')).toBe(false);
    expect(await verifyPassword('senha', '')).toBe(false);
  });
});
