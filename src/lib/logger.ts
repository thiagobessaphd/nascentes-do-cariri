export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: Record<string, unknown>;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}

/**
 * Regex para identificação de chaves confidenciais ou PII sujeitas a mascaramento total sob LGPD.
 */
export const SENSITIVE_KEY_REGEX =
  /password|senha|secret|token|auth|cookie|hash|authorization|cpf|rg|telefone|phone|celular|creditcard|cartao|documento/i;

/**
 * Regex para chaves que representam endereços de rede (IP).
 */
export const IP_KEY_REGEX = /^(ip|ip_address|ipaddress|remote_addr|client_ip)$/i;

/**
 * Regex para caminhos absolutos do sistema operacional (Windows e Unix/POSIX).
 */
const WINDOWS_PATH_REGEX = /[a-zA-Z]:\\(?:[^\\/:*?"<>|\r\n\s]+\\)*[^\\/:*?"<>|\r\n\s]*/g;
const UNIX_PATH_REGEX = /\/(?:home|Users|app|var|tmp|etc|usr)\/(?:[^\s"'`):]+\/)*[^\s"'`):]*/g;

/**
 * Anonimiza endereços IP para conformidade com o princípio de minimização da LGPD.
 * - IPv4: zera o último octeto
 * - IPv6: trunca os hextetos finais, preservando apenas o prefixo de rede (/48)
 */
export function anonymizeIp(ip: string): string {
  if (!ip || typeof ip !== 'string') {
    return '';
  }

  const trimmed = ip.trim();

  // IPv4
  const ipv4Match = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (ipv4Match?.[1]) {
    return `${ipv4Match[1]}.0`;
  }

  // IPv6
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length >= 3) {
      return `${parts.slice(0, 3).join(':')}::`;
    }
    return '::';
  }

  return '[ANONYMIZED_IP]';
}

/**
 * Sanitiza caminhos absolutos do sistema de arquivos para evitar exposição de topologia e nomes de usuários.
 */
export function sanitizePath(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  return text
    .replace(WINDOWS_PATH_REGEX, '[PATH]')
    .replace(UNIX_PATH_REGEX, '[PATH]');
}

/**
 * Mascara endereços de e-mail preservando apenas os caracteres iniciais e o domínio para auditoria segura.
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  const parts = email.trim().split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return '[REDACTED_EMAIL]';
  }

  const user = parts[0];
  const domain = parts[1];

  if (user.length <= 2) {
    return `*@${domain}`;
  }

  const visible = user.slice(0, 2);
  return `${visible}***@${domain}`;
}

/**
 * Sanitiza recursivamente estruturas de dados, aplicando mascaramento de segredos,
 * anonimização de IPs e remoção de caminhos absolutos do sistema operacional.
 */
export function sanitize(data: unknown, seen = new WeakSet<object>()): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizePath(data);
  }

  if (typeof data !== 'object') {
    return data;
  }

  // Previne loops de referências circulares
  if (seen.has(data)) {
    return '[CIRCULAR]';
  }
  seen.add(data);

  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item, seen));
  }

  // Tratamento de instâncias de Error
  if (data instanceof Error) {
    return {
      name: data.name,
      message: sanitizePath(data.message),
      ...(process.env.NODE_ENV !== 'production' && data.stack
        ? { stack: sanitizePath(data.stack) }
        : {}),
    };
  }

  // Tratamento de instâncias de Date
  if (data instanceof Date) {
    return data.toISOString();
  }

  // Tratamento de Objetos genéricos
  const sanitizedObj: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitizedObj[key] = '[REDACTED]';
    } else if (IP_KEY_REGEX.test(key) && typeof value === 'string') {
      sanitizedObj[key] = anonymizeIp(value);
    } else {
      sanitizedObj[key] = sanitize(value, seen);
    }
  }

  return sanitizedObj;
}

/**
 * Formata e emite o log estruturado no stdout ou stderr em conformidade com o ambiente.
 */
function emitLog(entry: LogEntry): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  if (isTest && !process.env.DEBUG_TESTS) {
    return;
  }

  if (isProduction) {
    const jsonOutput = JSON.stringify(entry);
    if (entry.level === 'error') {
      console.error(jsonOutput);
    } else if (entry.level === 'warn') {
      console.warn(jsonOutput);
    } else {
      console.log(jsonOutput);
    }
  } else {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]:`;
    const details = entry.context ? JSON.stringify(entry.context, null, 2) : '';

    if (entry.level === 'error') {
      console.error(prefix, entry.message, details, entry.error ?? '');
    } else if (entry.level === 'warn') {
      console.warn(prefix, entry.message, details);
    } else {
      console.log(prefix, entry.message, details);
    }
  }
}

/**
 * Logger estruturado central da aplicação com sanitização obrigatória de dados confidenciais e PII (LGPD).
 */
export const logger = {
  debug(message: string, context?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      message: sanitizePath(message),
      ...(context ? { context: sanitize(context) as Record<string, unknown> } : {}),
    };
    emitLog(entry);
    return entry;
  },

  info(message: string, context?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: sanitizePath(message),
      ...(context ? { context: sanitize(context) as Record<string, unknown> } : {}),
    };
    emitLog(entry);
    return entry;
  },

  warn(message: string, context?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: sanitizePath(message),
      ...(context ? { context: sanitize(context) as Record<string, unknown> } : {}),
    };
    emitLog(entry);
    return entry;
  },

  error(message: string, error?: unknown, context?: Record<string, unknown>): LogEntry {
    let errorDetails: LogEntry['error'] | undefined;

    if (error instanceof Error) {
      errorDetails = {
        name: error.name,
        message: sanitizePath(error.message),
        ...(process.env.NODE_ENV !== 'production' && error.stack
          ? { stack: sanitizePath(error.stack) }
          : {}),
      };
    } else if (typeof error === 'string') {
      errorDetails = {
        name: 'Error',
        message: sanitizePath(error),
      };
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: sanitizePath(message),
      ...(errorDetails ? { error: errorDetails } : {}),
      ...(context ? { context: sanitize(context) as Record<string, unknown> } : {}),
    };

    emitLog(entry);
    return entry;
  },
};
