import { z } from 'zod';
import { prisma } from '../db/prisma';
import { logger } from '../logger';
import { hashPassword, passwordSchema } from './password';

/**
 * Esquema de validação para as credenciais do bootstrap administrativo.
 */
export const bootstrapAdminSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'O nome do administrador é obrigatório')
    .default('Administrador Geral'),
  email: z
    .string()
    .trim()
    .email('E-mail do administrador inválido'),
  password: passwordSchema,
});

export type BootstrapAdminInput = z.input<typeof bootstrapAdminSchema>;

export interface BootstrapAdminResult {
  created: boolean;
  user: {
    id: number;
    nome: string;
    email: string;
    ativo: boolean;
  };
}

/**
 * Executa o provisionamento idempotente do usuário administrador inicial.
 * Se omitidos os parâmetros, lê das variáveis de ambiente ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD.
 */
export async function bootstrapAdmin(
  input?: Partial<BootstrapAdminInput>
): Promise<BootstrapAdminResult> {
  const rawInput = {
    nome: input?.nome ?? process.env.ADMIN_NAME,
    email: input?.email ?? process.env.ADMIN_EMAIL,
    password: input?.password ?? process.env.ADMIN_PASSWORD,
  };

  const parsed = bootstrapAdminSchema.parse(rawInput);

  const existingUser = await prisma.usuario.findUnique({
    where: { email: parsed.email },
  });

  if (existingUser) {
    logger.info('Administrador já existe no banco de dados.', {
      usuarioId: existingUser.id,
      email: existingUser.email,
    });

    return {
      created: false,
      user: {
        id: existingUser.id,
        nome: existingUser.nome,
        email: existingUser.email,
        ativo: existingUser.ativo,
      },
    };
  }

  const passwordHash = await hashPassword(parsed.password);

  const newUser = await prisma.usuario.create({
    data: {
      nome: parsed.nome,
      email: parsed.email,
      passwordHash,
      ativo: true,
    },
  });

  logger.info('Administrador inicial provisionado com sucesso.', {
    usuarioId: newUser.id,
    email: newUser.email,
  });

  return {
    created: true,
    user: {
      id: newUser.id,
      nome: newUser.nome,
      email: newUser.email,
      ativo: newUser.ativo,
    },
  };
}
