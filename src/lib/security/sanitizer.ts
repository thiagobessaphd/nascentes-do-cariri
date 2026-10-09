/**
 * Mapeamento de caracteres especiais HTML para entidades seguras (mitigação de XSS).
 */
const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
};

const HTML_ESCAPE_REGEX = /[&<>"'`/]/g;

/**
 * Escapa caracteres especiais em strings HTML para mitigar injeção de scripts (XSS).
 * Essencial para sanitizar dados externos antes de
 * interpolação em popups, tooltips ou templates do Leaflet.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  return str.replace(HTML_ESCAPE_REGEX, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

/**
 * Remove tags HTML e caracteres de controle, retornando texto puro.
 */
export function stripHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();
}

/**
 * Normaliza e sanitiza campos de texto de nascentes
 * garantindo ausência de tags maliciosas e caracteres de controle antes da renderização.
 */
export function sanitizeMapText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const cleaned = String(value)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return escapeHtml(cleaned);
}
