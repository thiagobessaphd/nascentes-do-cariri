import { z } from 'zod';

const envSchema = z.object({
  // Ambiente
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Banco de Dados
  DATABASE_URL: z.string().url("A URL do banco de dados deve ser uma URL válida"),

  // Domínio e Aplicação
  APP_URL: z.string().url("A URL da aplicação deve ser válida"),

  // Sessão / Autenticação
  AUTH_URL: z.string().url("A URL de autenticação deve ser válida"),
  AUTH_SECRET: z.string().min(32, "O segredo de autenticação deve ter no mínimo 32 caracteres"),

  // Upload e Storage
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().positive().default(5242880), // 5MB padrão
  BLOB_READ_WRITE_TOKEN: z.string().optional(), // Vercel Blob (Opcional até habilitar funcionalidade)

  // Tiles do Mapa
  NEXT_PUBLIC_TILE_URL: z.string().url("A URL do servidor de tiles deve ser válida"),
  NEXT_PUBLIC_TILE_ATTRIBUTION: z.string().min(1, "A atribuição do mapa é obrigatória"),
  NEXT_PUBLIC_TILE_MAX_ZOOM: z.coerce.number().positive().default(19),

  // Mapa Padrão
  NEXT_PUBLIC_MAP_DEFAULT_LAT: z.coerce.number().min(-90).max(90).default(-7.23456789),
  NEXT_PUBLIC_MAP_DEFAULT_LNG: z.coerce.number().min(-180).max(180).default(-39.12345678),
  NEXT_PUBLIC_MAP_DEFAULT_ZOOM: z.coerce.number().positive().default(10),
});

const _env = envSchema.safeParse(process.env);

const isBuildPhase = process.env.npm_lifecycle_event === 'build';

if (!_env.success) {
  console.error('Erro na validação das variáveis de ambiente:', _env.error.format());

  if (!isBuildPhase) {
    throw new Error('Variáveis de ambiente inválidas. A aplicação não pode iniciar.');
  }
}

export const env = _env.success ? _env.data : (process.env as unknown as z.infer<typeof envSchema>);
