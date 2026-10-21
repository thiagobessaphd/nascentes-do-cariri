import { z } from 'zod';
import { UNIDADE_VAZAO_PADRAO, type NascentesQueryParams } from './nascentes.dto';

/**
 * Validador e normalizador para coordenadas geográficas opcionais recebidas via query string.
 * Trata strings vazias ou nulas como undefined e converte strings numéricas em number.
 */
const optionalCoordinate = z
  .union([z.string(), z.number()])
  .optional()
  .transform((val): number | undefined => {
    if (val === undefined || val === null) {
      return undefined;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.length === 0) {
        return undefined;
      }
      return Number(trimmed);
    }
    return val;
  });

/**
 * Validador e normalizador para campos textuais opcionais em query strings.
 * Remove espaços em branco redundantes e converte strings vazias em undefined.
 */
const optionalQueryString = (maxLen: number) =>
  z
    .string()
    .trim()
    .max(maxLen, { message: `O campo deve ter no máximo ${maxLen} caracteres.` })
    .optional()
    .transform((val): string | undefined => {
      if (val === undefined || val === null || val.length === 0) {
        return undefined;
      }
      return val;
    });

/**
 * Schema Zod para validação e tipagem dos parâmetros de busca de GET /api/public/nascentes.
 */
export const nascentesQuerySchema = z
  .object({
    municipio: optionalQueryString(150),
    q: optionalQueryString(100),
    north: optionalCoordinate,
    south: optionalCoordinate,
    east: optionalCoordinate,
    west: optionalCoordinate,
  })
  .superRefine((data, ctx) => {
    const { north, south, east, west } = data;
    const bounds = [north, south, east, west];
    const countProvided = bounds.filter((v) => v !== undefined).length;

    // Caso 1: Nenhuma coordenada informada
    if (countProvided === 0) {
      return;
    }

    // Caso 2: Coordenadas parciais
    if (countProvided > 0 && countProvided < 4) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Para filtrar por área geográfica, todos os 4 limites (north, south, east, west) devem ser informados em conjunto.',
        path: ['bounds'],
      });
      return;
    }

    // Caso 3: As 4 foram informadas -> validar valores numéricos
    const hasNaN = bounds.some((v) => typeof v === 'number' && Number.isNaN(v));
    if (hasNaN) {
      ctx.addIssue({
        code: 'custom',
        message: 'As coordenadas do bounding box devem ser valores numéricos válidos.',
        path: ['bounds'],
      });
      return;
    }

    // Intervalo de Latitude [-90, 90]
    if (north! < -90 || north! > 90) {
      ctx.addIssue({
        code: 'custom',
        message: 'O limite norte (north) deve estar entre -90 e 90 graus.',
        path: ['north'],
      });
    }
    if (south! < -90 || south! > 90) {
      ctx.addIssue({
        code: 'custom',
        message: 'O limite sul (south) deve estar entre -90 e 90 graus.',
        path: ['south'],
      });
    }

    // Intervalo de Longitude [-180, 180]
    if (east! < -180 || east! > 180) {
      ctx.addIssue({
        code: 'custom',
        message: 'O limite leste (east) deve estar entre -180 e 180 graus.',
        path: ['east'],
      });
    }
    if (west! < -180 || west! > 180) {
      ctx.addIssue({
        code: 'custom',
        message: 'O limite oeste (west) deve estar entre -180 e 180 graus.',
        path: ['west'],
      });
    }

    // Coerência espacial: north >= south
    if (north! < south!) {
      ctx.addIssue({
        code: 'custom',
        message: 'O limite norte (north) deve ser maior ou igual ao limite sul (south).',
        path: ['north'],
      });
    }

    // Coerência espacial: east >= west
    if (east! < west!) {
      ctx.addIssue({
        code: 'custom',
        message: 'O limite leste (east) deve ser maior ou igual ao limite oeste (west).',
        path: ['east'],
      });
    }
  });

export type NascentesQueryInput = z.infer<typeof nascentesQuerySchema>;

/**
 * Função utilitária para validar e sanitizar parâmetros de busca brutos.
 */
export function parseNascentesQueryParams(rawInput: unknown): NascentesQueryParams {
  return nascentesQuerySchema.parse(rawInput);
}

/**
 * Schema Zod para validação em runtime do DTO de item público de Nascente.
 * Impõe o fechamento estrito do objeto, garantindo que nenhum campo
 * interno ou administrativo seja exposto.
 */
export const nascentePublicItemContractSchema = z
  .object({
    id: z.number().int().positive({ message: 'O id deve ser um número inteiro positivo.' }),
    latitude: z
      .number()
      .finite({ message: 'A latitude deve ser um número finito.' })
      .min(-90, { message: 'A latitude deve estar entre -90 e 90 graus.' })
      .max(90, { message: 'A latitude deve estar entre -90 e 90 graus.' }),
    longitude: z
      .number()
      .finite({ message: 'A longitude deve ser um número finito.' })
      .min(-180, { message: 'A longitude deve estar entre -180 e 180 graus.' })
      .max(180, { message: 'A longitude deve estar entre -180 e 180 graus.' }),
    municipio: z
      .string()
      .trim()
      .min(1, { message: 'O município não pode ser vazio.' })
      .max(150, { message: 'O município deve ter no máximo 150 caracteres.' }),
    fonte: z
      .string()
      .trim()
      .min(1, { message: 'A fonte não pode ser vazia.' })
      .max(255, { message: 'A fonte deve ter no máximo 255 caracteres.' }),
    localidade: z
      .string()
      .trim()
      .min(1, { message: 'A localidade não pode ser vazia.' })
      .max(255, { message: 'A localidade deve ter no máximo 255 caracteres.' }),
    data_criacao: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'data_criacao deve ser uma data civil estrita no formato AAAA-MM-DD.',
      }),
    vazao_media: z
      .number()
      .finite({ message: 'A vazão média deve ser um número finito.' })
      .nonnegative({ message: 'A vazão média não pode ser negativa.' }),
    unidade_vazao: z.literal(UNIDADE_VAZAO_PADRAO),
  })
  .strict();

export type NascentePublicItemContract = z.infer<typeof nascentePublicItemContractSchema>;

/**
 * Schema Zod estrito para validação em runtime dos metadados da consulta pública de Nascentes.
 */
export const nascentesPublicMetaContractSchema = z
  .object({
    total: z.number().int().nonnegative({
      message: 'O total deve ser um número inteiro maior ou igual a zero.',
    }),
    updated_at: z
      .string()
      .datetime({ message: 'updated_at deve ser uma data/hora no padrão ISO 8601 UTC ou null.' })
      .nullable(),
  })
  .strict();

export type NascentesPublicMetaContract = z.infer<typeof nascentesPublicMetaContractSchema>;

/**
 * Schema Zod estrito para validação do envelope de resposta pública: GET /api/public/nascentes.
 * Garante em runtime conformidade total com o contrato público e rejeição de atributos não previstos.
 */
export const nascentesPublicResponseContractSchema = z
  .object({
    data: z.array(nascentePublicItemContractSchema),
    meta: nascentesPublicMetaContractSchema,
  })
  .strict();

export type NascentesPublicResponseContract = z.infer<typeof nascentesPublicResponseContractSchema>;

/**
 * Validador e deserializador em runtime do contrato de resposta pública de nascentes.
 * Lança ZodError caso o payload viole os tipos, limites ou contenha propriedades adicionais vazadas.
 */
export function parseNascentesPublicResponse(raw: unknown): NascentesPublicResponseContract {
  return nascentesPublicResponseContractSchema.parse(raw);
}
