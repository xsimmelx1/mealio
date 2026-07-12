/**
 * Gemeinsames Interface für Online-Nährwert-Provider (opt-in).
 *
 * Provider liefern Werte pro 100 g. Bei fehlendem Treffer -> null (nie werfen für
 * "nicht gefunden"; Netz-/Parsefehler dürfen werfen und werden vom Aufrufer still
 * geschluckt -> Fallback auf "unbekannt").
 */

import type { Per100g } from '../nutritionSeed.js';

export interface NutritionProvider {
  /** Menschlich lesbarer Name (für Logs/Attribution). */
  readonly name: string;
  /** Sucht Nährwerte pro 100 g für einen Zutatnamen; null = kein Treffer. */
  lookup(name: string): Promise<Per100g | null>;
}

/** Wandelt einen unbekannten Wert robust in eine endliche Zahl oder null. */
export function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(',', '.');
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * fetch mit hartem Timeout via AbortController. Wirft bei Timeout/Netzfehler.
 * Bewusst dünn gehalten; nutzt das globale fetch (Node >= 18).
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
