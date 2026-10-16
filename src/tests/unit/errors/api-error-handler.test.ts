import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, formatPublicError, handleApiError } from '../../../lib/errors';

describe('Tratamento de Erros e Proteção de Stack Trace (errors/index.ts)', () => {
  it('deve ocultar stack trace e detalhes internos em erros inesperados (status 500)', () => {
    const internalError = new Error('Falha de driver: ECONNREFUSED 127.0.0.1:3306');
    internalError.stack = 'Error: Falha de driver\n at internalMethod (/var/app/secret.ts:12:34)';

    const result = formatPublicError(internalError);

    expect(result.statusCode).toBe(500);
    expect(result.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(result.body.error).toBe('Ocorreu um erro interno ao processar a solicitação.');

    const jsonString = JSON.stringify(result.body);
    expect(jsonString).not.toContain('ECONNREFUSED');
    expect(jsonString).not.toContain('/var/app/secret.ts');
    expect(jsonString).not.toContain('stack');
  });

  it('deve converter erro P2002 do Prisma em resposta HTTP 409 sem vazar SQL ou tabelas', () => {
    const prismaDuplicateError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      {
        code: 'P2002',
        clientVersion: '7.10.0',
      }
    );

    const result = formatPublicError(prismaDuplicateError);

    expect(result.statusCode).toBe(409);
    expect(result.body.code).toBe('DUPLICATE_ENTRY');
    expect(result.body.error).toBe('Conflito: já existe um registro com os dados informados.');

    const jsonString = JSON.stringify(result.body);
    expect(jsonString).not.toContain('Unique constraint failed');
    expect(jsonString).not.toContain('clientVersion');
  });

  it('deve converter erro P2025 do Prisma em resposta HTTP 404', () => {
    const prismaNotFoundError = new Prisma.PrismaClientKnownRequestError(
      'An operation failed because it depends on one or more records that were required but not found.',
      {
        code: 'P2025',
        clientVersion: '7.10.0',
      }
    );

    const result = formatPublicError(prismaNotFoundError);

    expect(result.statusCode).toBe(404);
    expect(result.body.code).toBe('RECORD_NOT_FOUND');
    expect(result.body.error).toBe('O registro solicitado não foi encontrado.');
  });

  it('deve formatar erros de validação Zod como HTTP 400 estruturado', () => {
    const testSchema = z.object({
      email: z.string().email('E-mail inválido'),
      quantidade: z.number().positive('Quantidade deve ser positiva'),
    });

    const parseResult = testSchema.safeParse({ email: 'invalido', quantidade: -5 });
    expect(parseResult.success).toBe(false);

    if (!parseResult.success) {
      const result = formatPublicError(parseResult.error);

      expect(result.statusCode).toBe(400);
      expect(result.body.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(result.body.details)).toBe(true);
    }
  });

  it('deve respeitar status e mensagem de erros operacionais controlados (AppError)', () => {
    const appError = new AppError('Acesso não autorizado', 401, 'UNAUTHORIZED');

    const result = formatPublicError(appError);

    expect(result.statusCode).toBe(401);
    expect(result.body.code).toBe('UNAUTHORIZED');
    expect(result.body.error).toBe('Acesso não autorizado');
  });

  it('handleApiError deve retornar um NextResponse seguro com cabeçalho no-store', async () => {
    const error = new Error('Falha inesperada');
    const response = handleApiError(error);

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const data = await response.json();
    expect(data.code).toBe('INTERNAL_SERVER_ERROR');
    expect(data.error).toBe('Ocorreu um erro interno ao processar a solicitação.');
  });
});
