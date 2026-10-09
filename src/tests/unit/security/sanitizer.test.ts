import { describe, expect, it } from 'vitest';
import { escapeHtml, sanitizeMapText, stripHtml } from '@/lib/security/sanitizer';

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
});
