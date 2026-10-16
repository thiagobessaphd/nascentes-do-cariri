import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../logger';

export interface PublicErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Erro operacional com código de status HTTP e código semântico de erro.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Converte exceções internas em respostas públicas sem expor stack traces ou detalhes do banco.
 */
export function formatPublicError(error: unknown): {
  statusCode: number;
  body: PublicErrorResponse;
} {
  if (error instanceof ZodError) {
    const formattedIssues = error.issues.map((issue) => ({
      campo: issue.path.join('.'),
      mensagem: issue.message,
    }));

    return {
      statusCode: 400,
      body: {
        error: 'Os dados fornecidos são inválidos.',
        code: 'VALIDATION_ERROR',
        details: formattedIssues,
      },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return {
        statusCode: 409,
        body: {
          error: 'Conflito: já existe um registro com os dados informados.',
          code: 'DUPLICATE_ENTRY',
        },
      };
    }

    if (error.code === 'P2025') {
      return {
        statusCode: 404,
        body: {
          error: 'O registro solicitado não foi encontrado.',
          code: 'RECORD_NOT_FOUND',
        },
      };
    }

    return {
      statusCode: 500,
      body: {
        error: 'Erro de integridade ou persistência de dados.',
        code: 'DATABASE_ERROR',
      },
    };
  }

  // Erros operacionais explícitos do domínio
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.message,
        code: error.code,
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: 'Ocorreu um erro interno ao processar a solicitação.',
      code: 'INTERNAL_SERVER_ERROR',
    },
  };
}

/**
 * Registra o erro internamente e retorna resposta HTTP segura para Route Handlers.
 */
export function handleApiError(error: unknown): NextResponse<PublicErrorResponse> {
  const { statusCode, body } = formatPublicError(error);

  logger.error('Erro interceptado na API', error, {
    statusCode,
    errorCode: body.code,
  });

  return NextResponse.json(body, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
