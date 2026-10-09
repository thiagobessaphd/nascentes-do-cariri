import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  generateSafeBlobPathname,
  sanitizeFilename,
  sanitizeMapText,
  stripHtml,
  validateUploadFilename,
} from '@/lib/security/sanitizer';

describe('Módulo de Sanitização e Defesa Web', () => {
  describe('Escape Seguro de Strings HTML (Anti-XSS)', () => {
    describe('escapeHtml()', () => {
      it('deve escapar entidades básicas do HTML', () => {
        expect(escapeHtml('&')).toBe('&amp;');
        expect(escapeHtml('<')).toBe('&lt;');
        expect(escapeHtml('>')).toBe('&gt;');
        expect(escapeHtml('"')).toBe('&quot;');
        expect(escapeHtml("'")).toBe('&#x27;');
        expect(escapeHtml('/')).toBe('&#x2F;');
        expect(escapeHtml('`')).toBe('&#96;');
      });

      it('deve neutralizar tags <script> com escape completo de delimitadores e barras', () => {
        const payload = '<script>alert("xss")</script>';
        const escaped = escapeHtml(payload);

        expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
        expect(escaped).not.toContain('<script>');
        expect(escaped).not.toContain('</script>');
      });

      it('deve neutralizar vetores de injeção em atributos (event handlers)', () => {
        const payload1 = '" onfocus="alert(1)';
        const payload2 = "' onmouseover='alert(1)";
        const payload3 = '` onclick=`alert(1)';

        expect(escapeHtml(payload1)).toBe('&quot; onfocus=&quot;alert(1)');
        expect(escapeHtml(payload2)).toBe('&#x27; onmouseover=&#x27;alert(1)');
        expect(escapeHtml(payload3)).toBe('&#96; onclick=&#96;alert(1)');
      });

      it('deve neutralizar vetores com tags de mídia e onerror/onload', () => {
        const payload = '<img src="x" onerror="alert(\'xss\')" />';
        const escaped = escapeHtml(payload);

        expect(escaped).toBe(
          '&lt;img src=&quot;x&quot; onerror=&quot;alert(&#x27;xss&#x27;)&quot; &#x2F;&gt;'
        );
      });

      it('deve retornar string vazia para valores nulos ou indefinidos de forma defensiva', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
      });

      it('deve converter primitivos numéricos e booleanos com segurança', () => {
        expect(escapeHtml(12345)).toBe('12345');
        expect(escapeHtml(0)).toBe('0');
        expect(escapeHtml(false)).toBe('false');
      });
    });

    describe('stripHtml()', () => {
      it('deve remover todas as tags HTML de uma string', () => {
        const html = '<b>Fonte dos Remédios</b> - <i>Crato</i> <script>alert(1)</script>';
        expect(stripHtml(html)).toBe('Fonte dos Remédios - Crato alert(1)');
      });

      it('deve remover caracteres de controle ASCII invisíveis', () => {
        const textWithControls = 'Nascente\u0000 do\u0007 Cariri\u001B';
        expect(stripHtml(textWithControls)).toBe('Nascente do Cariri');
      });

      it('deve retornar string vazia para nulo ou indefinido', () => {
        expect(stripHtml(null)).toBe('');
        expect(stripHtml(undefined)).toBe('');
      });
    });

    describe('sanitizeMapText()', () => {
      it('deve sanitizar atributos de nascentes para renderização segura em popups do Leaflet', () => {
        const maliciousFonte = '  Fonte <script>alert("hack")</script> do Meio  ';
        const sanitized = sanitizeMapText(maliciousFonte);

        expect(sanitized).toBe('Fonte &lt;script&gt;alert(&quot;hack&quot;)&lt;&#x2F;script&gt; do Meio');
        expect(sanitized).not.toContain('<script>');
      });

      it('deve normalizar quebras de linha e múltiplos espaços para manter layout consistente', () => {
        const messyInput = 'Nascente\n\n  Principal   \t\tdo   Crato';
        expect(sanitizeMapText(messyInput)).toBe('Nascente Principal do Crato');
      });

      it('deve lidar com dados vazios sem quebrar a renderização do mapa', () => {
        expect(sanitizeMapText(null)).toBe('');
        expect(sanitizeMapText(undefined)).toBe('');
        expect(sanitizeMapText('')).toBe('');
      });
    });
  });

  describe('Sanitização de Nomes de Arquivos para Upload (Anti-Path-Traversal)', () => {
    describe('validateUploadFilename()', () => {
      it('deve aprovar nomes de arquivos válidos com extensão .txt', () => {
        const res = validateUploadFilename('nascentes_crato_2026.txt');
        expect(res.isValid).toBe(true);
        expect(res.reason).toBeUndefined();
      });

      it('deve rejeitar nomes nulos, vazios ou apenas com espaços', () => {
        expect(validateUploadFilename(null).isValid).toBe(false);
        expect(validateUploadFilename(undefined).isValid).toBe(false);
        expect(validateUploadFilename('').isValid).toBe(false);
        expect(validateUploadFilename('   ').isValid).toBe(false);
      });

      it('deve rejeitar tentativas de Path Traversal no nome do arquivo', () => {
        expect(validateUploadFilename('../../etc/passwd.txt').isValid).toBe(false);
        expect(validateUploadFilename('..\\..\\Windows\\System32\\cmd.txt').isValid).toBe(false);
        expect(validateUploadFilename('pasta/arquivo.txt').isValid).toBe(false);
        expect(validateUploadFilename('pasta\\arquivo.txt').isValid).toBe(false);
      });

      it('deve rejeitar extensões proibidas ou diferentes de .txt', () => {
        expect(validateUploadFilename('payload.php').isValid).toBe(false);
        expect(validateUploadFilename('script.sh').isValid).toBe(false);
        expect(validateUploadFilename('foto.png').isValid).toBe(false);
        expect(validateUploadFilename('executavel.exe').isValid).toBe(false);
      });

      it('deve rejeitar caracteres de controle e null bytes', () => {
        expect(validateUploadFilename('malicioso\u0000.txt').isValid).toBe(false);
        expect(validateUploadFilename('teste\n.txt').isValid).toBe(false);
      });

      it('deve rejeitar nomes de dispositivos reservados no Windows', () => {
        expect(validateUploadFilename('con.txt').isValid).toBe(false);
        expect(validateUploadFilename('PRN.TXT').isValid).toBe(false);
        expect(validateUploadFilename('aux.txt').isValid).toBe(false);
        expect(validateUploadFilename('NUL.txt').isValid).toBe(false);
        expect(validateUploadFilename('com1.txt').isValid).toBe(false);
      });

      it('deve rejeitar nomes com mais de 255 caracteres', () => {
        const longName = `${'a'.repeat(252)}.txt`;
        expect(validateUploadFilename(longName).isValid).toBe(false);
      });
    });

    describe('sanitizeFilename()', () => {
      it('deve extrair estritamente o nome base eliminando caminhos de diretório', () => {
        expect(sanitizeFilename('../../etc/passwd.txt')).toBe('passwd.txt');
        expect(sanitizeFilename('C:\\Windows\\System32\\cmd.txt')).toBe('cmd.txt');
        expect(sanitizeFilename('/var/uploads/import.txt')).toBe('import.txt');
      });

      it('deve decodificar e neutralizar sequências codificadas em URL', () => {
        expect(sanitizeFilename('%2e%2e%2fsegredo.txt')).toBe('segredo.txt');
      });

      it('deve remover caracteres ilegais e normalizar acentos para formato seguro', () => {
        const raw = 'Relatório de Nascentes (Crato & Juazeiro) [2026]!.txt';
        const sanitized = sanitizeFilename(raw);

        expect(sanitized).toBe('Relatorio_de_Nascentes_Crato_Juazeiro_2026.txt');
        expect(sanitized).not.toContain('(');
        expect(sanitized).not.toContain('&');
        expect(sanitized).not.toContain('ó');
      });

      it('deve forçar a extensão .txt autorizada mesmo se fornecida outra extensão', () => {
        expect(sanitizeFilename('malware.php')).toBe('malware.txt');
        expect(sanitizeFilename('script.sh')).toBe('script.txt');
        expect(sanitizeFilename('sem_extensao')).toBe('sem_extensao.txt');
      });

      it('deve aplicar fallback para nomes vazios ou reservados do Windows', () => {
        expect(sanitizeFilename('...')).toBe('upload.txt');
        expect(sanitizeFilename('CON.txt')).toBe('upload.txt');
        expect(sanitizeFilename('')).toBe('upload.txt');
        expect(sanitizeFilename(null)).toBe('upload.txt');
      });

      it('deve respeitar o limite de tamanho maxLength preservando a extensão', () => {
        const longName = `${'x'.repeat(300)}.txt`;
        const sanitized = sanitizeFilename(longName, { maxLength: 50 });

        expect(sanitized.length).toBeLessThanOrEqual(50);
        expect(sanitized.endsWith('.txt')).toBe(true);
      });
    });

    describe('generateSafeBlobPathname()', () => {
      it('deve gerar pathname único contendo namespace, timestamp e nome sanitizado', () => {
        const pathname = generateSafeBlobPathname('Minhas Nascentes (2026).txt');

        expect(pathname).toMatch(/^importacoes\/\d+-[a-z0-9]+-Minhas_Nascentes_2026\.txt$/);
      });

      it('deve permitir customização de namespace', () => {
        const pathname = generateSafeBlobPathname('dados.txt', 'staging');

        expect(pathname.startsWith('staging/')).toBe(true);
        expect(pathname.endsWith('-dados.txt')).toBe(true);
      });
    });
  });
});
