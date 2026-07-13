/**
 * KI-Preisschätzung: für Zutaten OHNE gefundenen Preis (weder Seed noch Open Prices)
 * schätzt Gemini einen typischen deutschen Supermarkt-Packungspreis. EIN Batch-Aufruf
 * für alle Zutaten (spart Quota). Ergebnis-Shape = /prices (source "ai").
 *
 * Prinzip: Preise sind Schätzwerte (in der UI gekennzeichnet). Bei LLM-Fehler
 * (429/Timeout) -> alle "unknown" (nie raten, App-Flow nie blockiert).
 */
import { logger } from '../lib/logger.js';
import type { LlmClient } from '../llm/llmClient.js';

export type PackageUnit = 'g' | 'ml' | 'stück';

export interface EstimateItem {
  key: string;
  name: string;
}

export interface EstimatedPrice {
  key: string;
  pricePerPackage: number | null;
  packageSize: number | null;
  packageUnit: PackageUnit | null;
  /** Typische Handelsmarke (marktneutral); optional. */
  brand?: string;
  currency: string;
  source: 'ai' | 'unknown';
  updatedAt: string | null;
}

const UNKNOWN = (key: string): EstimatedPrice => ({
  key,
  pricePerPackage: null,
  packageSize: null,
  packageUnit: null,
  currency: 'EUR',
  source: 'unknown',
  updatedAt: null,
});

function buildSystemPrompt(): string {
  return [
    'Du schätzt typische Endkunden-Preise in DEUTSCHEN Supermärkten (Mitte 2026, EUR).',
    'Antworte AUSSCHLIESSLICH mit reinem JSON, keine Prosa/Markdown.',
    'Format: {"estimates":[{"key":string,"pricePerPackage":number,"packageSize":number,"packageUnit":"g"|"ml"|"stück","brand":string}]}',
    '- pricePerPackage: realistischer Preis für eine ÜBLICHE Handelspackung (EUR, > 0).',
    '- packageSize + packageUnit: übliche Packungsgröße (z. B. 500 g, 1000 ml, 6 stück).',
    '- brand: typische Handels-/Eigenmarke für dieses Produkt in DE (z. B. "Barilla", "Milbona"). Wenn unklar: weglassen.',
    '- Gib für JEDEN key genau einen Eintrag zurück, gleiche keys wie in der Anfrage.',
    '- Keine Erklärungen, nur das JSON.',
  ].join('\n');
}

function buildUserPrompt(items: EstimateItem[]): string {
  const lines = items.map((it) => `- key="${it.key}" | Zutat: ${it.name}`).join('\n');
  return `Schätze Packungspreise für diese Zutaten:\n${lines}\n\nAntworte nur mit dem JSON.`;
}

function coercePrice(raw: unknown, key: string): EstimatedPrice {
  if (!raw || typeof raw !== 'object') return UNKNOWN(key);
  const o = raw as Record<string, unknown>;
  const price = Number(o.pricePerPackage);
  const size = Number(o.packageSize);
  const unit = o.packageUnit;
  const validUnit = unit === 'g' || unit === 'ml' || unit === 'stück';
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0 || !validUnit) {
    return UNKNOWN(key);
  }
  const brand = typeof o.brand === 'string' ? o.brand.trim().slice(0, 60) : '';
  return {
    key,
    pricePerPackage: Math.round(price * 100) / 100,
    packageSize: size,
    packageUnit: unit,
    ...(brand ? { brand } : {}),
    currency: 'EUR',
    source: 'ai',
    updatedAt: null,
  };
}

/** Schätzt Preise für alle Items in EINEM LLM-Aufruf; bei Fehler alle "unknown". */
export async function estimatePrices(
  items: EstimateItem[],
  llm: LlmClient,
): Promise<EstimatedPrice[]> {
  if (items.length === 0) return [];
  try {
    const res = await llm.generateStructured<unknown>({
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(items),
      retry: { timeoutMs: 45_000, maxRetries: 0 },
    });
    const data = res.data as { estimates?: unknown[] } | undefined;
    const list = Array.isArray(data?.estimates) ? (data!.estimates as Record<string, unknown>[]) : [];
    const byKey = new Map<string, Record<string, unknown>>();
    for (const e of list) if (e && typeof e.key === 'string') byKey.set(e.key, e);
    return items.map((it) => coercePrice(byKey.get(it.key), it.key));
  } catch (err) {
    logger.warn('estimatePrices: LLM fehlgeschlagen -> unknown', {
      message: err instanceof Error ? err.message : String(err),
    });
    return items.map((it) => UNKNOWN(it.key));
  }
}
