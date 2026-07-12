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
import { defaultMockResponder } from './mockResponder.js';

export interface GenerateStructuredArgs {
  /** Aufgaben-/Kontext-Prompt (kommt von der recipe-engine). */
  prompt: string;
  /** Optionales JSON-Schema, das das Modell erzwingen soll (Structured Output). */
  schema?: Record<string, unknown>;
  /** Optionaler System-Prompt. */
  system?: string;
  /** Transport-Optionen (Timeout/Retry) — überschreibt Defaults. */
  retry?: RetryOptions;
  /**
   * Opaker Kontext, den NUR der MockLlmClient auswerten darf (z. B. UserPrefs),
   * um deterministisch prefs-konforme Rezepte zu erzeugen. Echte HTTP-Clients
   * ignorieren dieses Feld — es verlässt niemals den Prozess.
   */
  context?: unknown;
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

/** Eine Mock-Antwort-Funktion: bildet die Aufruf-Args auf eine rohe Nutzlast ab. */
export type MockResponder = (args: GenerateStructuredArgs) => unknown;

/**
 * MockLlmClient — deterministisch, ohne Netzwerk. Default, wenn kein Key gesetzt ist.
 *
 * Ohne injizierten Responder gibt er standardmäßig ein leeres Objekt zurück
 * (rückwärtskompatibel). Die recipe-engine übergibt einen Responder, der aus dem
 * Kontext (UserPrefs) schema-konforme, prefs-respektierende Rezepte baut, damit die
 * Pipeline auch ohne echten Key End-to-End funktioniert. In Tests wird der Responder
 * genutzt, um gezielt auch KAPUTTE Ausgaben zu simulieren.
 */
export class MockLlmClient implements LlmClient {
  readonly kind = 'mock' as const;
  private readonly responder?: MockResponder;

  constructor(responder?: MockResponder) {
    this.responder = responder;
  }

  async generateStructured<T>(args: GenerateStructuredArgs): Promise<StructuredResult<T>> {
    const data = (this.responder ? this.responder(args) : {}) as T;
    return { source: 'mock', data };
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
    // Standard-Responder: baut aus den Prefs schema-konforme Rezepte (E2E ohne Key).
    return new MockLlmClient(defaultMockResponder);
  }

  logger.info('LLM client: using HttpLlmClient', { model });
  return new HttpLlmClient({ apiKey, model });
}
