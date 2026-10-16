import 'dotenv/config';
import { bootstrapAdmin } from '../src/lib/security/bootstrap';
import { prisma } from '../src/lib/db/prisma';

/**
 * Provisionamento do administrador inicial via seed.
 */
async function main() {
  console.log('[Seed] Iniciando provisionamento do administrador inicial...');

  try {
    const result = await bootstrapAdmin();

    if (result.created) {
      console.log(`[Seed] ✓ Administrador inicial criado com sucesso: ${result.user.email} (ID: ${result.user.id})`);
    } else {
      console.log(`[Seed] ✓ Administrador já existente: ${result.user.email} (ID: ${result.user.id})`);
    }
  } catch (error) {
    console.error('[Seed] ✗ Falha no provisionamento do administrador:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
