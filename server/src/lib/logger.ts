/**
 * Schlanker Logger mit Secret-Redaktion.
 * Verhindert, dass bekannte Secret-Keys (API-Keys etc.) jemals ins Log gelangen.
 * KEINE externen Abhängigkeiten — bewusst minimal gehalten.
 */

/** Feld-Namen, deren Werte grundsätzlich redigiert werden. */
const SECRET_KEYS = [
  'llm_api_key',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'token',
  'secret',
  'password',
  'usda_api_key',
  'x-api-key',
];

const REDACTED = '«redacted»';

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_KEYS.some((s) => k === s || k.includes(s));
}

/**
 * Redigiert rekursiv Werte, deren Schlüssel als Secret gelten.
 * Robust gegen Zyklen und begrenzt in der Tiefe.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value as object)) {
    return '«circular»';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSecretKey(k) ? REDACTED : redact(v, depth + 1, seen);
  }
  return out;
}

type Level = 'info' | 'warn' | 'error' | 'debug';

function emit(level: Level, message: string, meta?: unknown): void {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(meta !== undefined ? { meta: redact(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', message, meta);
  },
};
