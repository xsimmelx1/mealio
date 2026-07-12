/**
 * llmClient — austauschbarer LLM-Zugang hinter einem schmalen Interface.
 *
 * WICHTIG (Zuständigkeitsgrenze M4):
 *  - Dieses Modul liefert NUR den Transport: Interface, Mock, HTTP-Gerüst, Factory,
 *    plus Retry/Timeout (siehe withRetry).
 *  - Die eigentliche Prompt-Konstruktion, JSON-Schema-Erzwingung und
 *    Validierungs-/Repair-Pipeline kommen später aus der recipe-engine (M9).
 *  - Der API-Key existiert ausschließlich hier im Backend (aus process.env) und
 *    wird niemals in Responses oder Logs ausgegeben.
 */

import { logger } from '../lib/logger.js';
import { withRetry, type RetryOptions } from './withRetry.js';

export interface GenerateStructuredArgs {
  /** Aufgaben-/Kontext-Prompt (kommt später von der recipe-engine). */
  prompt: string;
  /** Optionales JSON-Schema, das das Modell erzwingen soll (Structured Output). */
  schema?: Record<string, unknown>;
  /** Optionaler System-Prompt. */
  system?: string;
  /** Transport-Optionen (Timeout/Retry) — überschreibt Defaults. */
  retry?: RetryOptions;
}

/** Ergebnis eines strukturierten Aufrufs inkl. Quelle für sauberes Degradieren. */
export interface StructuredResult<T> {
  source: 'mock' | 'llm';
  data: T;
}

export interface LlmClient {
  /** Kennzeichnet die konkrete Implementierung (für Diagnose/Status). */
  readonly kind: 'mock' | 'http';
  /**
   * Ruft das Modell mit erzwungenem strukturiertem Output auf.
   * Der Aufrufer (recipe-engine) ist für Prompt + Schema + Nachvalidierung zuständig.
   */
  generateStructured<T>(args: GenerateStructuredArgs): Promise<StructuredResult<T>>;
}

/**
 * MockLlmClient — deterministisch, ohne Netzwerk. Default, wenn kein Key gesetzt ist.
 * Gibt ein leeres Objekt zurück; die konkreten Mock-Daten für /generate-plan liefert
 * die Route selbst (Fixtures), damit der Client generisch bleibt.
 */
export class MockLlmClient implements LlmClient {
  readonly kind = 'mock' as const;

  async generateStructured<T>(_args: GenerateStructuredArgs): Promise<StructuredResult<T>> {
    // Deterministisch, kein I/O. Nutzlast bleibt leer — der Content stammt aus Fixtures.
    return { source: 'mock', data: {} as T };
  }
}

/**
 * HttpLlmClient — GERÜST für einen echten HTTP-Anbieter.
 *
 * Liest Key/Model ausschließlich aus der Umgebung. Der eigentliche Request-Aufbau
 * (Provider-spezifischer Body, Structured-Output-Format) wird in M9 ergänzt.
 * Enthält bereits Retry/Timeout via withRetry.
 */
export class HttpLlmClient implements LlmClient {
  readonly kind = 'http' as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly defaultRetry: RetryOptions;

  constructor(config: { apiKey: string; model: string; retry?: RetryOptions }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.defaultRetry = config.retry ?? {};
  }

  async generateStructured<T>(args: GenerateStructuredArgs): Promise<StructuredResult<T>> {
    // Transport-Gerüst mit Timeout/Retry. Der eigentliche Call ist noch nicht
    // implementiert (M9) — bis dahin wird bewusst ein klarer Fehler geworfen,
    // damit die Route sauber auf Mock/Degradation zurückfallen kann.
    return withRetry<StructuredResult<T>>(async (_signal) => {
      // Der Key wird NIE geloggt. Nur Modellname zu Diagnosezwecken.
      logger.debug('HttpLlmClient.generateStructured invoked', {
        model: this.model,
        hasApiKey: this.apiKey.length > 0, // niemals den Key selbst loggen
        hasSchema: Boolean(args.schema),
      });
      throw new Error(
        'HttpLlmClient ist noch nicht implementiert (kommt in M9 via recipe-engine).',
      );
    }, args.retry ?? this.defaultRetry);
  }
}

/**
 * Factory: wählt die Implementierung anhand der Umgebung.
 * Ohne gültigen LLM_API_KEY -> MockLlmClient (sauberer Fallback, keine Fehler).
 */
export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const provider = (env.LLM_PROVIDER ?? '').trim().toLowerCase();
  const apiKey = (env.LLM_API_KEY ?? '').trim();
  const model = (env.LLM_MODEL ?? 'gemini-1.5-flash').trim();

  if (provider === 'mock' || apiKey.length === 0) {
    logger.info('LLM client: using MockLlmClient (kein API-Key gesetzt oder LLM_PROVIDER=mock)');
    return new MockLlmClient();
  }

  logger.info('LLM client: using HttpLlmClient', { model });
  return new HttpLlmClient({ apiKey, model });
}
