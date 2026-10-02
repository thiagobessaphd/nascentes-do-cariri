export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const SENSITIVE_KEY_REGEX = /password|senha|secret|token|auth|cookie|hash|authorization/i;

/**
 * Sanitiza recursivamente estruturas de dados, mascarando chaves sensíveis como '[REDACTED]'.
 */
export function sanitize(data: unknown, seen = new WeakSet<object>()): unknown {
  if (data === null || data === undefined) {
    return data;
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
      message: data.message,
      ...(process.env.NODE_ENV !== 'production' && data.stack ? { stack: data.stack } : {}),
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
 * Logger estruturado central da aplicação com sanitização obrigatória de dados confidenciais.
 */
export const logger = {
  debug(message: string, context?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'debug',
      message,
      ...(context ? { context: sanitize(context) as Record<string, unknown> } : {}),
    };
    emitLog(entry);
    return entry;
  },

  info(message: string, context?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      ...(context ? { context: sanitize(context) as Record<string, unknown> } : {}),
    };
    emitLog(entry);
    return entry;
  },

  warn(message: string, context?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
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
        message: error.message,
        ...(process.env.NODE_ENV !== 'production' && error.stack ? { stack: error.stack } : {}),
      };
    } else if (typeof error === 'string') {
      errorDetails = {
        name: 'Error',
        message: error,
      };
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      ...(errorDetails ? { error: errorDetails } : {}),
      ...(context ? { context: sanitize(context) as Record<string, unknown> } : {}),
    };

    emitLog(entry);
    return entry;
  },
};
