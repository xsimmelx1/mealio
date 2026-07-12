/**
 * Wiederverwendbares Gerüst für LLM-Calls: Timeout (AbortController) + Retry.
 *
 * Auch wenn aktuell nur der Mock genutzt wird, ist dies der einzige Ort,
 * an dem Transport-Robustheit (Timeout/Retry) für externe Modell-Aufrufe lebt.
 */

export interface RetryOptions {
  /** Maximale Anzahl zusätzlicher Versuche nach dem ersten (Default: 1). */
  maxRetries?: number;
  /** Timeout pro Versuch in Millisekunden (Default: 15000). */
  timeoutMs?: number;
  /** Basis-Backoff zwischen Versuchen in Millisekunden (Default: 300). */
  backoffMs?: number;
}

export class TimeoutError extends Error {
  constructor(message = 'LLM call timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Führt eine Operation mit Timeout und begrenzten Retries aus.
 * Die Operation erhält ein AbortSignal, das bei Timeout ausgelöst wird.
 */
export async function withRetry<T>(
  op: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 1, timeoutMs = 15_000, backoffMs = 300 } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new TimeoutError()), timeoutMs);
    try {
      return await op(controller.signal);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(backoffMs * (attempt + 1));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
