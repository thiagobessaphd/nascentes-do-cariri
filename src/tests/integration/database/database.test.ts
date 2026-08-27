import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../lib/db/prisma';

describe('Integração com o Banco de Dados (Prisma)', () => {
    beforeAll(async () => {
        // Conexão
        await prisma.$connect();

        // Prepara banco limpo para testes
        await prisma.nascente.deleteMany();
        await prisma.importacao.deleteMany();
        await prisma.usuario.deleteMany();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('Migração em banco vazio', () => {
        it('deve verificar se as tabelas principais existem e estão acessíveis', async () => {
            const countUsuarios = await prisma.usuario.count();
            const countImportacoes = await prisma.importacao.count();
            const countNascentes = await prisma.nascente.count();

            expect(typeof countUsuarios).toBe('number');
            expect(typeof countImportacoes).toBe('number');
            expect(typeof countNascentes).toBe('number');
        });
    });

    describe('Constraints e Relacionamentos (Integridade Referencial)', () => {
        it('deve impedir a exclusão de um Usuário que possui uma Importação (Restrict)', async () => {

            const usuario = await prisma.usuario.create({
                data: {
                    nome: 'QA User',
                    email: `qa-restrict-user-${Date.now()}@exemplo.com`,
                    passwordHash: 'hash',
                },
            });

            const importacao = await prisma.importacao.create({
                data: {
                    usuarioId: usuario.id,
                    nomeArquivo: 'dados.txt',
                    caminhoPrivadoArquivo: '/tmp/dados.txt',
                    hashArquivo: 'abc123hash',
                },
            });

            await expect(
                prisma.usuario.delete({
                    where: { id: usuario.id },
                })
            ).rejects.toThrow(/P2003|Foreign key constraint/i);

            await prisma.importacao.delete({ where: { id: importacao.id } });
            await prisma.usuario.delete({ where: { id: usuario.id } });
        });

        it('deve impedir a exclusão de uma Importação que possui Nascentes (Restrict)', async () => {

            const usuario = await prisma.usuario.create({
                data: {
                    nome: 'QA User 2',
                    email: `qa-restrict-import-${Date.now()}@exemplo.com`,
                    passwordHash: 'hash',
                },
            });

            const importacao = await prisma.importacao.create({
                data: {
                    usuarioId: usuario.id,
                    nomeArquivo: 'nascentes.txt',
                    caminhoPrivadoArquivo: '/tmp/nascentes.txt',
                    hashArquivo: 'def456hash',
                },
            });

            const nascente = await prisma.nascente.create({
                data: {
                    importacaoId: importacao.id,
                    latitude: -7.234567,
                    longitude: -39.345678,
                    municipio: 'Crato',
                    fonte: 'Pesquisa Campo',
                    localidade: 'Sítio Teste',
                    dataCriacao: new Date('2023-01-01'),
                    vazaoMedia: 1.5,
                },
            });

            await expect(
                prisma.importacao.delete({
                    where: { id: importacao.id },
                })
            ).rejects.toThrow(/P2003|Foreign key constraint/i);

            await prisma.nascente.delete({ where: { id: nascente.id } });
            await prisma.importacao.delete({ where: { id: importacao.id } });
            await prisma.usuario.delete({ where: { id: usuario.id } });
        });
    });
});
