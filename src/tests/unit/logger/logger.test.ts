import { describe, it, expect } from 'vitest';
import {
  anonymizeIp,
  logger,
  maskEmail,
  sanitize,
  sanitizePath,
} from '../../../lib/logger';

describe('Módulo de Logging e Sanitização (logger.ts)', () => {
  describe('Função sanitize()', () => {
    it('deve mascarar credenciais e tokens sensíveis como [REDACTED]', () => {
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

    it('deve mascarar dados pessoais sensíveis (PII) sob LGPD como [REDACTED]', () => {
      const piiInput = {
        cpf: '123.456.789-00',
        rg: '12345678-9',
        telefone: '(88) 99999-1234',
        celular: '(88) 98888-5678',
        phone: '+5588999991234',
        creditcard: '4111111111111234',
        cartao: '5500000000005678',
        documento: '987654321',
        cidade: 'Crato',
        uf: 'CE',
      };

      const resultado = sanitize(piiInput) as Record<string, unknown>;

      expect(resultado.cpf).toBe('[REDACTED]');
      expect(resultado.rg).toBe('[REDACTED]');
      expect(resultado.telefone).toBe('[REDACTED]');
      expect(resultado.celular).toBe('[REDACTED]');
      expect(resultado.phone).toBe('[REDACTED]');
      expect(resultado.creditcard).toBe('[REDACTED]');
      expect(resultado.cartao).toBe('[REDACTED]');
      expect(resultado.documento).toBe('[REDACTED]');

      // Dados de domínio público da nascente são mantidos
      expect(resultado.cidade).toBe('Crato');
      expect(resultado.uf).toBe('CE');
    });

    it('deve anonimizar endereços IP em conformidade com minimização da LGPD', () => {
      const networkInput = {
        ip: '177.18.29.142',
        ip_address: '192.168.1.105',
        remote_addr: '10.0.0.55',
        client_ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        userAgent: 'Mozilla/5.0 Chrome',
      };

      const resultado = sanitize(networkInput) as Record<string, unknown>;

      expect(resultado.ip).toBe('177.18.29.0');
      expect(resultado.ip_address).toBe('192.168.1.0');
      expect(resultado.remote_addr).toBe('10.0.0.0');
      expect(resultado.client_ip).toBe('2001:0db8:85a3::');
    });

    it('deve sanitizar recursivamente objetos aninhados e arrays', () => {
      const input = {
        meta: {
          versao: '1.0',
          credenciais: {
            senha: '123',
            api_key_secret: 'segredo',
            cpf_responsavel: '000.111.222-33',
          },
        },
        usuarios: [
          { id: 1, password: 'abc', ip: '192.168.0.15' },
          { id: 2, password: 'def', ip: '10.1.2.3' },
        ],
      };

      const resultado = sanitize(input) as {
        meta: {
          versao: string;
          credenciais: {
            senha: string;
            api_key_secret: string;
            cpf_responsavel: string;
          };
        };
        usuarios: Array<{ id: number; password: string; ip: string }>;
      };

      expect(resultado.meta.versao).toBe('1.0');
      expect(resultado.meta.credenciais.senha).toBe('[REDACTED]');
      expect(resultado.meta.credenciais.api_key_secret).toBe('[REDACTED]');
      expect(resultado.meta.credenciais.cpf_responsavel).toBe('[REDACTED]');
      expect(resultado.usuarios[0]?.password).toBe('[REDACTED]');
      expect(resultado.usuarios[0]?.ip).toBe('192.168.0.0');
      expect(resultado.usuarios[1]?.password).toBe('[REDACTED]');
      expect(resultado.usuarios[1]?.ip).toBe('10.1.2.0');
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

    it('deve sanitizar caminhos locais absolutos do sistema contidos em strings', () => {
      const windowsString = 'Arquivo salvo em C:\\Users\\projetos\\nascentes\\segredo.key';
      const linuxString = 'Falha no binário em /home/ubuntu/app/server.js';

      expect(sanitize(windowsString)).toBe('Arquivo salvo em [PATH]');
      expect(sanitize(linuxString)).toBe('Falha no binário em [PATH]');
    });
  });

  describe('Utilitários de Anonimização e Minimização', () => {
    describe('anonymizeIp()', () => {
      it('deve zerar o último octeto em endereços IPv4', () => {
        expect(anonymizeIp('192.168.1.150')).toBe('192.168.1.0');
        expect(anonymizeIp('10.0.0.1')).toBe('10.0.0.0');
        expect(anonymizeIp(' 172.16.254.1 ')).toBe('172.16.254.0');
      });

      it('deve truncar hextetos preservando prefixo /48 em IPv6', () => {
        expect(anonymizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:85a3::');
        expect(anonymizeIp('fe80:0000:0000:0000:0204:61ff:fe9d:f156')).toBe('fe80:0000:0000::');
      });

      it('deve retornar string vazia ou fallback seguro para valores inválidos', () => {
        expect(anonymizeIp('')).toBe('');
        expect(anonymizeIp('invalid-ip')).toBe('[ANONYMIZED_IP]');
      });
    });

    describe('sanitizePath()', () => {
      it('deve substituir caminhos Windows por [PATH]', () => {
        const text = 'Erro ao ler C:\\Users\\projetos\\test\\pasta\\arquivo.txt no host';
        expect(sanitizePath(text)).toBe('Erro ao ler [PATH] no host');
      });

      it('deve substituir caminhos Unix/Linux por [PATH]', () => {
        const text = 'Erro no processo /home/deploy/nascentes/src/index.ts detectado';
        expect(sanitizePath(text)).toBe('Erro no processo [PATH] detectado');
      });

      it('deve manter intacto textos que não contêm caminhos de arquivos', () => {
        const safeText = 'Operação de consulta concluída sem anormalidades.';
        expect(sanitizePath(safeText)).toBe(safeText);
      });
    });

    describe('maskEmail()', () => {
      it('deve mascarar a parte local do e-mail mantendo domínio intacto', () => {
        expect(maskEmail('admin@cariri.ufca.edu.br')).toBe('ad***@cariri.ufca.edu.br');
        expect(maskEmail('joao.silva@gmail.com')).toBe('jo***@gmail.com');
      });

      it('deve tratar e-mails curtos de forma defensiva', () => {
        expect(maskEmail('a@ufca.edu.br')).toBe('*@ufca.edu.br');
        expect(maskEmail('ab@ufca.edu.br')).toBe('*@ufca.edu.br');
      });

      it('deve retornar fallback para strings inválidas', () => {
        expect(maskEmail('')).toBe('');
        expect(maskEmail('sem-arroba')).toBe('[REDACTED_EMAIL]');
      });
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
        cpfTentativa: '123.456.789-00',
      });

      expect(entryWarn.level).toBe('warn');
      expect(entryWarn.message).toBe('Tentativa com credencial incorreta');
      expect(entryWarn.context).toEqual({
        email: 'invasor@teste.com',
        senhaDigitada: '[REDACTED]',
        cpfTentativa: '[REDACTED]',
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

    it('deve sanitizar caminhos locais do sistema em mensagens de erro e contexto', () => {
      const errorWithHostPath = new Error('Falha ao abrir socket em C:\\ProgramData\\MySQL\\mysql.sock');
      const entryError = logger.error('Erro de I/O em /var/log/mysql/error.log', errorWithHostPath, {
        ip: '192.168.1.200',
      });

      expect(entryError.message).toBe('Erro de I/O em [PATH]');
      expect(entryError.error?.message).toBe('Falha ao abrir socket em [PATH]');
      expect(entryError.context?.ip).toBe('192.168.1.0');
    });
  });
});
