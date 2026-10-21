import { z } from 'zod';

/**
 * Schema Zod estrito para validação em runtime dos metadados da listagem pública de municípios.
 * Garante que total seja um número inteiro não-negativo e rejeita propriedades estranhas.
 */
export const municipiosPublicMetaContractSchema = z
  .object({
    total: z.number().int().nonnegative({
      message: 'O total deve ser um número inteiro maior ou igual a zero.',
    }),
  })
  .strict();

export type MunicipiosPublicMetaContract = z.infer<typeof municipiosPublicMetaContractSchema>;

/**
 * Schema Zod estrito para validação do envelope de resposta pública: GET /api/public/municipios.
 * Garante que data contenha apenas strings válidas não-vazias de municípios e rejeita propriedades adicionais.
 */
export const municipiosPublicResponseContractSchema = z
  .object({
    data: z.array(
      z
        .string()
        .trim()
        .min(1, { message: 'O nome do município não pode ser vazio.' })
        .max(150, { message: 'O nome do município deve ter no máximo 150 caracteres.' })
    ),
    meta: municipiosPublicMetaContractSchema,
  })
  .strict();

export type MunicipiosPublicResponseContract = z.infer<
  typeof municipiosPublicResponseContractSchema
>;

/**
 * Validador em runtime do contrato de resposta pública de municípios.
 * Lança ZodError caso o payload viole a tipagem ou contenha propriedades adicionais vazadas.
 */
export function parseMunicipiosPublicResponse(raw: unknown): MunicipiosPublicResponseContract {
  return municipiosPublicResponseContractSchema.parse(raw);
}
