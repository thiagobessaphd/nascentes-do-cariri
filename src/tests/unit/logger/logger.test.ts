import { describe, it, expect } from 'vitest';
import { logger, sanitize } from '../../../lib/logger';

describe('Módulo de Logging e Sanitização (logger.ts)', () => {
  describe('Função sanitize()', () => {
    it('deve mascarar campos sensíveis como [REDACTED]', () => {
      const input = {
        usuarioId: 1,
        nome: 'Admin Cariri',
        email: 'admin@cariri.ufca.edu.br',
        password: 'senhaSuperSecreta123',
        passwordHash: '$2b$12$abcdef1234567890',
        token: 'jwt-token-secreto-aqui',
        AUTH_SECRET: 'chave-mestra-32-caracteres-de-seguranca',
        authorization: 'Bearer token123',
      };

      const resultado = sanitize(input) as Record<string, unknown>;

      // Campos sensíveis devem ser mascarados
      expect(resultado.password).toBe('[REDACTED]');
      expect(resultado.passwordHash).toBe('[REDACTED]');
      expect(resultado.token).toBe('[REDACTED]');
      expect(resultado.AUTH_SECRET).toBe('[REDACTED]');
      expect(resultado.authorization).toBe('[REDACTED]');

      // Campos normais devem ser preservados
      expect(resultado.usuarioId).toBe(1);
      expect(resultado.nome).toBe('Admin Cariri');
      expect(resultado.email).toBe('admin@cariri.ufca.edu.br');
    });

    it('deve sanitizar recursivamente objetos aninhados e arrays', () => {
      const input = {
        meta: {
          versao: '1.0',
          credenciais: {
            senha: '123',
            api_key_secret: 'segredo',
          },
        },
        usuarios: [
          { id: 1, password: 'abc' },
          { id: 2, password: 'def' },
        ],
      };

      const resultado = sanitize(input) as {
        meta: {
          versao: string;
          credenciais: {
            senha: string;
            api_key_secret: string;
          };
        };
        usuarios: Array<{ id: number; password: string }>;
      };

      expect(resultado.meta.versao).toBe('1.0');
      expect(resultado.meta.credenciais.senha).toBe('[REDACTED]');
      expect(resultado.meta.credenciais.api_key_secret).toBe('[REDACTED]');
      expect(resultado.usuarios[0]?.password).toBe('[REDACTED]');
      expect(resultado.usuarios[1]?.password).toBe('[REDACTED]');
    });

    it('deve lidar com referências circulares sem estourar pilha de recursão', () => {
      const circularObj: Record<string, unknown> = {
        nome: 'Objeto Circular',
        senha: 'segredo-circular',
      };
      circularObj.propriaReferencia = circularObj;

      const resultado = sanitize(circularObj) as Record<string, unknown>;

      expect(resultado.nome).toBe('Objeto Circular');
      expect(resultado.senha).toBe('[REDACTED]');
      expect(resultado.propriaReferencia).toBe('[CIRCULAR]');
    });

    it('deve preservar primitivos nulos, indefinidos ou números', () => {
      expect(sanitize(null)).toBe(null);
      expect(sanitize(undefined)).toBe(undefined);
      expect(sanitize(12345)).toBe(12345);
      expect(sanitize('string comum')).toBe('string comum');
      expect(sanitize(true)).toBe(true);
    });
  });

  describe('Instância logger', () => {
    it('deve gerar entradas de log estruturadas com timestamp e nível correto', () => {
      const entryInfo = logger.info('Operação realizada com sucesso', {
        acao: 'importacao_nascentes',
        total: 50,
      });

      expect(entryInfo.level).toBe('info');
      expect(entryInfo.message).toBe('Operação realizada com sucesso');
      expect(entryInfo.timestamp).toBeDefined();
      expect(entryInfo.context).toEqual({ acao: 'importacao_nascentes', total: 50 });
    });

    it('deve sanitizar o contexto automaticamente ao emitir logs', () => {
      const entryWarn = logger.warn('Tentativa com credencial incorreta', {
        email: 'invasor@teste.com',
        senhaDigitada: 'minha_senha_secreta',
      });

      expect(entryWarn.level).toBe('warn');
      expect(entryWarn.context).toEqual({
        email: 'invasor@teste.com',
        senhaDigitada: '[REDACTED]',
      });
    });

    it('deve capturar detalhes de erros sem quebrar', () => {
      const errorObj = new Error('Falha de conexão com MySQL');
      const entryError = logger.error('Falha crítica na persistência', errorObj, {
        database_user: 'nascentes_app',
        database_password: 'senha_db_123',
      });

      expect(entryError.level).toBe('error');
      expect(entryError.message).toBe('Falha crítica na persistência');
      expect(entryError.error?.message).toBe('Falha de conexão com MySQL');
      expect(entryError.context?.database_password).toBe('[REDACTED]');
    });
  });
});
