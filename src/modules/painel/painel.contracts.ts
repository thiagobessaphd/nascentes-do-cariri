/**
 * Nascentes do Cariri — Contratos Client-Safe do Painel Administrativo
 *
 * Centraliza constantes, schemas Zod v4 (.strict()), tipos DTO imutáveis e
 * helpers puros de perfil/estado sem qualquer dependência de servidor (Prisma/Node/Next).
 */

import { z } from 'zod';
import {
  IMPORTACAO_STATUS_VALUES,
  type ImportacaoStatus,
} from '@/modules/importacoes/importacoes.contracts';

export const ADMIN_RECENT_IMPORTACOES_LIMIT = 5 as const;
export const MAX_ADMIN_RECENT_IMPORTACOES_LIMIT = 20 as const;
export const DEFAULT_PAINEL_REQUEST_TIMEOUT_MS = 15_000;

export const PAINEL_ERROR_CODES = {
  INVALID_PAINEL_INPUT: 'INVALID_PAINEL_INPUT',
  INVALID_SERVER_RESPONSE: 'INVALID_SERVER_RESPONSE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN_INACTIVE_USER: 'FORBIDDEN_INACTIVE_USER',
  NETWORK_ERROR: 'NETWORK_ERROR',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type PainelErrorCode =
  (typeof PAINEL_ERROR_CODES)[keyof typeof PAINEL_ERROR_CODES];

export const GENERIC_PAINEL_LOAD_ERROR_MESSAGE =
  'Não foi possível carregar os indicadores do painel no momento. Tente novamente em instantes.' as const;

export const UNAUTHORIZED_PAINEL_ERROR_MESSAGE =
  'Sua sessão administrativa expirou ou não é mais válida. Faça login novamente.' as const;

export const FORBIDDEN_PAINEL_ERROR_MESSAGE =
  'Sua conta administrativa está inativa ou sem permissão para acessar este painel.' as const;

export const adminResumoUsuarioSchema = z
  .object({
    id: z.number().int().positive(),
    nome: z.string().min(1).max(255),
  })
  .strict();

export const adminResumoImportacaoItemSchema = z
  .object({
    id: z.number().int().positive(),
    nomeArquivo: z.string().min(1).max(255),
    status: z.enum(IMPORTACAO_STATUS_VALUES),
    totalLinhas: z.number().int().nonnegative(),
    totalValidas: z.number().int().nonnegative(),
    totalInvalidas: z.number().int().nonnegative(),
    totalDuplicadas: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    concluidaAt: z.iso.datetime().nullable(),
    usuario: adminResumoUsuarioSchema,
  })
  .strict();

export const adminResumoIndicadoresSchema = z
  .object({
    totalNascentesAtivas: z.number().int().nonnegative(),
    totalImportacoes: z.number().int().nonnegative(),
    ultimaImportacao: adminResumoImportacaoItemSchema.nullable(),
  })
  .strict();

export const adminResumoMetaSchema = z
  .object({
    recentLimit: z.number().int().positive(),
    generatedAt: z.iso.datetime(),
  })
  .strict();

export const adminResumoResponseSchema = z
  .object({
    indicadores: adminResumoIndicadoresSchema,
    historicoRecente: z
      .array(adminResumoImportacaoItemSchema)
      .max(MAX_ADMIN_RECENT_IMPORTACOES_LIMIT),
    meta: adminResumoMetaSchema,
  })
  .strict();

export interface AdminResumoUsuarioDto {
  readonly id: number;
  readonly nome: string;
}

export interface AdminResumoImportacaoItemDto {
  readonly id: number;
  readonly nomeArquivo: string;
  readonly status: ImportacaoStatus;
  readonly totalLinhas: number;
  readonly totalValidas: number;
  readonly totalInvalidas: number;
  readonly totalDuplicadas: number;
  readonly createdAt: string;
  readonly concluidaAt: string | null;
  readonly usuario: AdminResumoUsuarioDto;
}

export interface AdminResumoIndicadoresDto {
  readonly totalNascentesAtivas: number;
  readonly totalImportacoes: number;
  readonly ultimaImportacao: AdminResumoImportacaoItemDto | null;
}

export interface AdminResumoMetaDto {
  readonly recentLimit: number;
  readonly generatedAt: string;
}

export interface AdminResumoResponseDto {
  readonly indicadores: AdminResumoIndicadoresDto;
  readonly historicoRecente: readonly AdminResumoImportacaoItemDto[];
  readonly meta: AdminResumoMetaDto;
}

/**
 * Projeção estrita de perfil para o cabeçalho do shell administrativo.
 * Impede exposição de `id`, `sessionId`, `sessionExpiresAt`, `passwordHash` ou `tokenHash`.
 */
export interface AdminProfileViewDto {
  readonly nome: string;
  readonly email: string;
  readonly iniciais: string;
}

/**
 * União discriminada para modelagem explícita dos 4 estados de interface do painel `/admin`.
 */
export type AdminDashboardViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty'; readonly data: AdminResumoResponseDto }
  | { readonly status: 'success'; readonly data: AdminResumoResponseDto }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly retryable: boolean;
      readonly isAuthError: boolean;
    };

const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F-\u009F]/g;
const UNICODE_ALPHANUM_REGEX = /[\p{L}\p{N}]/u;

function sanitizeDisplayText(rawValue: string | null | undefined): string {
  if (typeof rawValue !== 'string') {
    return '';
  }

  return rawValue.replace(CONTROL_CHARS_REGEX, ' ').replace(/\s+/g, ' ').trim();
}

function extractLeadingChars(token: string, count: number): string {
  const chars = Array.from(token).filter((char) => UNICODE_ALPHANUM_REGEX.test(char));
  return chars.slice(0, count).join('').toLocaleUpperCase('pt-BR');
}

/**
 * Deriva iniciais seguras em Unicode/pt-BR para o avatar do administrador no shell:
 * - 2+ palavras: 1º caractere da primeira e da última palavra;
 * - 1 palavra: 2 primeiros caracteres;
 * - Nome vazio: 2 primeiros caracteres alfanuméricos do local-part do e-mail;
 * - Fallback final: "AD".
 */
export function deriveAdminInitials(
  nome: string | null | undefined,
  email?: string | null | undefined
): string {
  const cleanedName = sanitizeDisplayText(nome);
  const words = cleanedName
    .split(' ')
    .map((word) => Array.from(word).filter((char) => UNICODE_ALPHANUM_REGEX.test(char)).join(''))
    .filter((word) => word.length > 0);

  const firstWord = words[0];
  if (firstWord) {
    if (words.length === 1) {
      const singleInitials = extractLeadingChars(firstWord, 2);
      if (singleInitials.length > 0) {
        return singleInitials;
      }
    } else {
      const lastWord = words[words.length - 1];
      const firstInitial = extractLeadingChars(firstWord, 1);
      const lastInitial = lastWord ? extractLeadingChars(lastWord, 1) : '';
      const combined = `${firstInitial}${lastInitial}`;
      if (combined.length > 0) {
        return combined;
      }
    }
  }

  const cleanedEmail = sanitizeDisplayText(email);
  if (cleanedEmail.length > 0) {
    const localPart = cleanedEmail.split('@', 1)[0] ?? '';
    const emailInitials = extractLeadingChars(localPart, 2);
    if (emailInitials.length > 0) {
      return emailInitials;
    }
  }

  return 'AD';
}

/**
 * Projeta uma sessão administrativa autenticada exclusivamente para os 3 campos
 * de apresentação do cabeçalho (`nome`, `email`, `iniciais`).
 */
export function toAdminProfileView(session: {
  readonly nome: string;
  readonly email: string;
}): AdminProfileViewDto {
  const nome = sanitizeDisplayText(session.nome) || 'Administrador';
  const email = sanitizeDisplayText(session.email);

  return {
    nome,
    email,
    iniciais: deriveAdminInitials(session.nome, email),
  };
}

/**
 * Classifica um DTO de resumo em estado vazio total (`empty`) ou populado (`success`).
 * Casos parciais (ex.: 0 nascentes com 1 importação que falhou ou aguarda confirmação)
 * permanecem em `success` para manter última importação e histórico recentes visíveis.
 */
export function deriveAdminDashboardState(
  data: AdminResumoResponseDto
): Extract<AdminDashboardViewState, { readonly status: 'empty' | 'success' }> {
  const isCompletelyEmpty =
    data.indicadores.totalNascentesAtivas === 0 &&
    data.indicadores.totalImportacoes === 0 &&
    data.historicoRecente.length === 0;

  if (isCompletelyEmpty) {
    return { status: 'empty', data };
  }

  return { status: 'success', data };
}
