import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../../lib/db/prisma';
import { bootstrapAdmin } from '../../../lib/security/bootstrap';
import { verifyPassword } from '../../../lib/security/password';

describe('Bootstrap do Administrador (bootstrap.ts)', () => {
  const testEmail = `qa_bootstrap_admin_${Date.now()}@ufca.edu.br`;
  const rawPassword = 'SenhaSuperSeguraAdmin2026!';
  let createdUserId: number | undefined;

  afterAll(async () => {
    if (createdUserId) {
      await prisma.usuario.deleteMany({
        where: { id: createdUserId },
      });
    }
  });

  it('deve provisionar o primeiro administrador com hash seguro na primeira execução', async () => {
    const result = await bootstrapAdmin({
      nome: 'Administrador Inicial QA',
      email: testEmail,
      password: rawPassword,
    });

    expect(result.created).toBe(true);
    expect(result.user.email).toBe(testEmail);
    expect(result.user.ativo).toBe(true);
    expect(result.user.id).toBeDefined();

    createdUserId = result.user.id;

    const dbUser = await prisma.usuario.findUnique({
      where: { id: createdUserId },
    });

    expect(dbUser).toBeDefined();
    expect(dbUser?.email).toBe(testEmail);
    expect(dbUser?.passwordHash).not.toBe(rawPassword);
    expect(dbUser?.passwordHash).toMatch(/^\$2[ab]\$12\$/);

    const passwordMatches = await verifyPassword(rawPassword, dbUser!.passwordHash);
    expect(passwordMatches).toBe(true);
  });

  it('deve garantir idempotência na segunda execução sem duplicar usuário', async () => {
    const totalUsersBefore = await prisma.usuario.count({
      where: { email: testEmail },
    });
    expect(totalUsersBefore).toBe(1);

    const resultSegundaExecucao = await bootstrapAdmin({
      nome: 'Administrador Inicial QA',
      email: testEmail,
      password: rawPassword,
    });

    expect(resultSegundaExecucao.created).toBe(false);
    expect(resultSegundaExecucao.user.id).toBe(createdUserId);

    const totalUsersAfter = await prisma.usuario.count({
      where: { email: testEmail },
    });
    expect(totalUsersAfter).toBe(1);
  });

  it('deve rejeitar o provisionamento se a senha tiver menos de 8 caracteres (fail-fast)', async () => {
    const invalidEmail = `qa_invalid_${Date.now()}@ufca.edu.br`;

    await expect(
      bootstrapAdmin({
        nome: 'Admin Invalido',
        email: invalidEmail,
        password: 'curta',
      })
    ).rejects.toThrow();

    const userExists = await prisma.usuario.findUnique({
      where: { email: invalidEmail },
    });
    expect(userExists).toBeNull();
  });
});
