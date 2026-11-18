/**
 * Nascentes do Cariri — Gerador CLI de Sessão Administrativa para Desenvolvimento
 *
 * Emite um token HMAC-SHA256 assinado com AUTH_SECRET para um administrador ativo
 * do banco de dados (ou provisiona o admin inicial caso ainda não exista) e imprime
 * o link de ativação de cookie HttpOnly para acesso ao painel /admin sem tela de login.
 *
 * Uso: npm run auth:dev
 */

import 'dotenv/config';
import { prisma } from '../src/lib/db/prisma';
import { createAdminSessionToken } from '../src/lib/security/admin-guard';
import { bootstrapAdmin } from '../src/lib/security/bootstrap';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('[auth:dev] ERRO: Este utilitário não pode ser executado com NODE_ENV=production.');
    process.exit(1);
  }

  try {
    let admin = await prisma.usuario.findFirst({
      where: { ativo: true },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        nome: true,
        email: true,
        ativo: true,
      },
    });

    if (!admin) {
      console.log('[auth:dev] Nenhum administrador ativo encontrado. Tentando provisionar via ADMIN_*...');
      const seeded = await bootstrapAdmin();
      if (!seeded.user.ativo) {
        throw new Error('O administrador provisionado está inativo no banco de dados.');
      }
      admin = seeded.user;
    }

    const token = createAdminSessionToken({
      userId: admin.id,
      email: admin.email,
      role: 'ADMIN',
      expiresInSeconds: 7 * 24 * 60 * 60, // 7 dias para desenvolvimento local
    });

    const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const activationUrl = `${appUrl}/api/admin/dev-session?token=${encodeURIComponent(token)}`;

    console.log('');
    console.log('=== Sessão Administrativa de Desenvolvimento (Sprint 3) ===');
    console.log(`Administrador : ${admin.nome} <${admin.email}> (ID: ${admin.id})`);
    console.log('');
    console.log('1) Para autenticar o navegador (grava cookie HttpOnly e redireciona para /admin/importacoes):');
    console.log(`   ${activationUrl}`);
    console.log('');
    console.log('2) Para testar endpoints diretamente via curl/Postman:');
    console.log(`   Authorization: Bearer ${token}`);
    console.log('');
    console.log('Mantenha este token apenas no ambiente local. Nunca exponha AUTH_SECRET em produção.');
  } catch (error) {
    console.error('[auth:dev] Falha ao gerar sessão de desenvolvimento:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
