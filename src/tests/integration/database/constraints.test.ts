import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../lib/db/prisma';

describe('Database Constraints: Validação da Regra de Duplicidade (Unique Constraint)', () => {
  let testUser: { id: number };
  let testImport: { id: number };

  beforeAll(async () => {
    testUser = await prisma.usuario.create({
      data: {
        nome: 'Usuario Teste QA Constraints',
        email: `qa_constraints_${Date.now()}@example.com`,
        passwordHash: 'fake_hash',
      },
    });

    testImport = await prisma.importacao.create({
      data: {
        usuarioId: testUser.id,
        nomeArquivo: 'teste_constraints.csv',
        caminhoPrivadoArquivo: '/tmp/fake/teste_constraints.csv',
        hashArquivo: `hash_constraints_${Date.now()}`,
      },
    });
  });

  afterAll(async () => {
    if (testImport) {
      await prisma.nascente.deleteMany({
        where: { importacaoId: testImport.id },
      });
      await prisma.importacao.delete({
        where: { id: testImport.id },
      });
    }
    if (testUser) {
      await prisma.usuario.delete({
        where: { id: testUser.id },
      });
    }
  });

  it('deve impedir a inserção de duas nascentes com a mesma latitude, longitude e fonte', async () => {
    const latitudeFixa = -7.23456789;
    const longitudeFixa = -39.12345678;
    const fonteFixa = 'TESTE_QA';

    const dadosNascente = {
      latitude: latitudeFixa,
      longitude: longitudeFixa,
      municipio: 'Crato',
      fonte: fonteFixa,
      localidade: 'Sítio Teste',
      dataCriacao: new Date('2026-01-01T00:00:00.000Z'),
      vazaoMedia: 10.5,
      importacaoId: testImport.id,
    };

    const primeiraNascente = await prisma.nascente.create({
      data: dadosNascente,
    });

    expect(primeiraNascente).toBeDefined();
    expect(primeiraNascente.id).toBeGreaterThan(0);
    expect(Number(primeiraNascente.latitude)).toBe(latitudeFixa);


    const insercaoDuplicada = prisma.nascente.create({
      data: dadosNascente,
    });

    // Unique Constraint (Prisma Error Code P2002)
    await expect(insercaoDuplicada).rejects.toMatchObject({
      code: 'P2002'
    });
  });
});
