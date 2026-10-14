import { z } from 'zod';

/**
 * Limites Geográficos de Referência do Cariri Cearense
 */
export const CARIRI_BOUNDS = {
  MIN_LAT: -8.0,
  MAX_LAT: -6.5,
  MIN_LNG: -40.5,
  MAX_LNG: -38.5,
} as const;

/**
 * Validador de pertencimento geográfico à macrorregião do Cariri.
 */
export function isWithinCaririBounds(latitude: number, longitude: number): boolean {
  return (
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude) &&
    latitude >= CARIRI_BOUNDS.MIN_LAT &&
    latitude <= CARIRI_BOUNDS.MAX_LAT &&
    longitude >= CARIRI_BOUNDS.MIN_LNG &&
    longitude <= CARIRI_BOUNDS.MAX_LNG
  );
}

/**
 * Schema de validação Zod para os dados de uma Nascente.
 */
export const nascenteDomainSchema = z.object({
  latitude: z
    .coerce
    .number({
      error: 'Latitude é obrigatória e deve ser numérica',
    })
    .refine((val) => !Number.isNaN(val), {
      message: 'Latitude não pode ser NaN',
    })
    .refine((val) => val >= -90 && val <= 90, {
      message: 'Latitude deve estar entre -90 e 90 graus',
    })
    .refine((val) => val >= CARIRI_BOUNDS.MIN_LAT && val <= CARIRI_BOUNDS.MAX_LAT, {
      message: `Latitude fora dos limites do Cariri [${CARIRI_BOUNDS.MIN_LAT}, ${CARIRI_BOUNDS.MAX_LAT}]`,
    }),

  longitude: z
    .coerce
    .number({
      error: 'Longitude é obrigatória e deve ser numérica',
    })
    .refine((val) => !Number.isNaN(val), {
      message: 'Longitude não pode ser NaN',
    })
    .refine((val) => val >= -180 && val <= 180, {
      message: 'Longitude deve estar entre -180 e 180 graus',
    })
    .refine((val) => val >= CARIRI_BOUNDS.MIN_LNG && val <= CARIRI_BOUNDS.MAX_LNG, {
      message: `Longitude fora dos limites do Cariri [${CARIRI_BOUNDS.MIN_LNG}, ${CARIRI_BOUNDS.MAX_LNG}]`,
    }),

  municipio: z
    .string({
      error: 'Município é obrigatório',
    })
    .trim()
    .min(1, { message: 'Município não pode ser vazio' })
    .max(150, { message: 'Município deve ter no máximo 150 caracteres' }),

  fonte: z
    .string({
      error: 'Fonte é obrigatória',
    })
    .trim()
    .min(1, { message: 'Fonte não pode ser vazia' })
    .max(255, { message: 'Fonte deve ter no máximo 255 caracteres' }),

  localidade: z
    .string({
      error: 'Localidade é obrigatória',
    })
    .trim()
    .min(1, { message: 'Localidade não pode ser vazia' })
    .max(255, { message: 'Localidade deve ter no máximo 255 caracteres' }),

  dataCriacao: z
    .union([z.string(), z.date()], {
      error: 'Data de criação é obrigatória',
    })
    .transform((val) => {
      if (val instanceof Date) return val;
      const parsed = new Date(val);
      return parsed;
    })
    .refine((d) => !Number.isNaN(d.getTime()), {
      message: 'Data de criação deve ser uma data válida no formato AAAA-MM-DD',
    })
    .refine((d) => {
      // Data não pode ser no futuro (tolerância de 24h para fusos)
      const agora = new Date();
      agora.setDate(agora.getDate() + 1);
      return d <= agora;
    }, {
      message: 'Data de criação não pode ser futura',
    }),

  vazaoMedia: z
    .coerce
    .number({
      error: 'Vazão média é obrigatória e deve ser numérica',
    })
    .refine((val) => !Number.isNaN(val), {
      message: 'Vazão média não pode ser NaN',
    })
    .refine((val) => val >= 0, {
      message: 'Vazão média deve ser maior ou igual a zero (m³/s)',
    }),
});

export type NascenteDomainInput = z.input<typeof nascenteDomainSchema>;
export type NascenteDomainOutput = z.output<typeof nascenteDomainSchema>;

/**
 * Função utilitária de validação com retorno tipado.
 */
export function validateNascente(data: unknown): {
  success: boolean;
  data?: NascenteDomainOutput;
  errors?: Record<string, string>;
} {
  const result = nascenteDomainSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0]?.toString() || 'geral';
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }

  return { success: false, errors };
}
