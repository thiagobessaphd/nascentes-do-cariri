import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../lib/db/prisma';

describe('Transações Atômicas e Rollback', () => {
  let testUser: { id: number; email: string };

  beforeAll(async () => {
    testUser = await prisma.usuario.create({
      data: {
        nome: 'QA User Transacoes',
        email: `qa_tx_${Date.now()}@exemplo.com`,
        passwordHash: '$2b$12$fakehashforintegrationtestingonly1234567890',
      },
    });
  });

  afterAll(async () => {
    if (testUser) {
      // Limpeza segura dos registros residuais de teste
      await prisma.nascente.deleteMany({
        where: {
          importacao: {
            usuarioId: testUser.id,
          },
        },
      });
      await prisma.importacao.deleteMany({
        where: { usuarioId: testUser.id },
      });
      await prisma.usuario.delete({
        where: { id: testUser.id },
      });
    }
  });

  it('deve persistir atomicamente lote de importação e nascentes quando todas as operações são válidas', async () => {
    const nomeArquivo = `lote_sucesso_${Date.now()}.txt`;
    const hashArquivo = `hash_sucesso_${Date.now()}`;

    const resultado = await prisma.$transaction(async (tx) => {
      const importacao = await tx.importacao.create({
        data: {
          usuarioId: testUser.id,
          nomeArquivo,
          caminhoPrivadoArquivo: `/private/test/${nomeArquivo}`,
          hashArquivo,
          totalLinhas: 2,
          totalValidas: 2,
        },
      });

      const nascente1 = await tx.nascente.create({
        data: {
          importacaoId: importacao.id,
          latitude: -7.111111,
          longitude: -39.111111,
          municipio: 'Crato',
          localidade: 'Sítio Fundão',
          fonte: `FONTE_TX_1_${Date.now()}`,
          vazaoMedia: 3.5,
          dataCriacao: new Date('2026-01-15T10:00:00.000Z'),
        },
      });

      const nascente2 = await tx.nascente.create({
        data: {
          importacaoId: importacao.id,
          latitude: -7.222222,
          longitude: -39.222222,
          municipio: 'Juazeiro do Norte',
          localidade: 'Horto',
          fonte: `FONTE_TX_2_${Date.now()}`,
          vazaoMedia: 1.2,
          dataCriacao: new Date('2026-01-15T11:00:00.000Z'),
        },
      });

      return { importacao, nascente1, nascente2 };
    });

    expect(resultado.importacao.id).toBeGreaterThan(0);
    expect(resultado.nascente1.importacaoId).toBe(resultado.importacao.id);
    expect(resultado.nascente2.importacaoId).toBe(resultado.importacao.id);

    // Valida persistência real no banco
    const importacaoNoBanco = await prisma.importacao.findUnique({
      where: { id: resultado.importacao.id },
      include: { nascentes: true },
    });

    expect(importacaoNoBanco).toBeDefined();
    expect(importacaoNoBanco?.nascentes).toHaveLength(2);
  });

  it('deve executar rollback completo e não persistir registros quando ocorre erro no meio da transação', async () => {
    const nomeArquivo = `lote_falha_manual_${Date.now()}.txt`;
    const hashArquivo = `hash_falha_manual_${Date.now()}`;
    let idImportacaoCriada: number | undefined;

    await expect(
      prisma.$transaction(async (tx) => {
        const importacao = await tx.importacao.create({
          data: {
            usuarioId: testUser.id,
            nomeArquivo,
            caminhoPrivadoArquivo: `/private/test/${nomeArquivo}`,
            hashArquivo,
          },
        });

        idImportacaoCriada = importacao.id;

        await tx.nascente.create({
          data: {
            importacaoId: importacao.id,
            latitude: -7.333333,
            longitude: -39.333333,
            municipio: 'Barbalha',
            localidade: 'Arajara',
            fonte: `FONTE_TX_FAIL_${Date.now()}`,
            vazaoMedia: 5.0,
            dataCriacao: new Date('2026-02-01T12:00:00.000Z'),
          },
        });

        // Simula falha crítica de negócio ou sistema interrompendo a transação
        throw new Error('SIMULATED_TRANSACTION_FAILURE: Falha forçada no processamento do lote');
      })
    ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

    // Valida que o rollback foi executado: a importação iniciada não deve existir no banco
    expect(idImportacaoCriada).toBeDefined();

    const importacaoAposRollback = await prisma.importacao.findUnique({
      where: { id: idImportacaoCriada! },
    });
    expect(importacaoAposRollback).toBeNull();

    // Valida que nenhuma nascente órfã foi criada
    const nascenteOrfa = await prisma.nascente.findFirst({
      where: {
        fonte: {
          startsWith: 'FONTE_TX_FAIL_',
        },
        latitude: -7.333333,
      },
    });
    expect(nascenteOrfa).toBeNull();
  });

  it('deve abortar lote e desfazer todas as operações se houver violação de constraint no meio do lote', async () => {
    const nomeArquivo = `lote_falha_constraint_${Date.now()}.txt`;
    const hashArquivo = `hash_falha_constraint_${Date.now()}`;
    const latitudeConflitante = -7.444444;
    const longitudeConflitante = -39.444444;
    const fonteConflitante = `FONTE_CONFLITO_${Date.now()}`;

    // 1. Prepara uma nascente pré-existente no banco fora da transação
    const importacaoBase = await prisma.importacao.create({
      data: {
        usuarioId: testUser.id,
        nomeArquivo: `base_conflito_${Date.now()}.txt`,
        caminhoPrivadoArquivo: `/private/test/base_${Date.now()}.txt`,
        hashArquivo: `hash_base_${Date.now()}`,
      },
    });

    await prisma.nascente.create({
      data: {
        importacaoId: importacaoBase.id,
        latitude: latitudeConflitante,
        longitude: longitudeConflitante,
        municipio: 'Missão Velha',
        localidade: 'Jamacaru',
        fonte: fonteConflitante,
        vazaoMedia: 2.0,
        dataCriacao: new Date('2026-03-01T00:00:00.000Z'),
      },
    });

    let idNovaImportacao: number | undefined;

    // 2. Tenta transação que insere novo lote onde o segundo registro viola a Unique Constraint
    await expect(
      prisma.$transaction(async (tx) => {
        const novaImportacao = await tx.importacao.create({
          data: {
            usuarioId: testUser.id,
            nomeArquivo,
            caminhoPrivadoArquivo: `/private/test/${nomeArquivo}`,
            hashArquivo,
          },
        });

        idNovaImportacao = novaImportacao.id;

        // Registro 1 do lote (válido)
        await tx.nascente.create({
          data: {
            importacaoId: novaImportacao.id,
            latitude: -7.555555,
            longitude: -39.555555,
            municipio: 'Missão Velha',
            localidade: 'Sede',
            fonte: `FONTE_VALIDA_${Date.now()}`,
            vazaoMedia: 0.8,
            dataCriacao: new Date('2026-03-01T01:00:00.000Z'),
          },
        });

        // Registro 2 do lote (violação da Unique Constraint [latitude, longitude, fonte])
        await tx.nascente.create({
          data: {
            importacaoId: novaImportacao.id,
            latitude: latitudeConflitante,
            longitude: longitudeConflitante,
            municipio: 'Missão Velha',
            localidade: 'Jamacaru Duplicado',
            fonte: fonteConflitante, // Já existe! Dispara P2002
            vazaoMedia: 4.5,
            dataCriacao: new Date('2026-03-01T02:00:00.000Z'),
          },
        });
      })
    ).rejects.toMatchObject({
      code: 'P2002',
    });

    // 3. Comprova que a nova importação e o Registro 1 válido foram desfeitos pelo rollback
    expect(idNovaImportacao).toBeDefined();

    const importacaoAbortada = await prisma.importacao.findUnique({
      where: { id: idNovaImportacao! },
    });
    expect(importacaoAbortada).toBeNull();

    const nascenteRegistro1 = await prisma.nascente.findFirst({
      where: {
        latitude: -7.555555,
        longitude: -39.555555,
      },
    });
    expect(nascenteRegistro1).toBeNull();
  });
});
