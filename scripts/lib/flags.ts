import type { ProductFlag } from '../../app/src/domain/enums';

/**
 * Erkennt Produkt-Eigenschaften aus Name + Marke (Heuristik). Fairtrade steht selten im Namen
 * → wird primär über Open Food Facts (per EAN) ergänzt (`sources/off.ts`).
 */
export function detectFlags(name: string, brand: string | null): ProductFlag[] {
  const t = `${name} ${brand ?? ''}`.toLowerCase();
  const flags: ProductFlag[] = [];
  if (/\bbio\b|biozentrale|demeter|bioland|naturkind|nur nur natur/.test(t)) flags.push('bio');
  if (/\bvegan\b/.test(t)) flags.push('vegan');
  if (/fairtrade|fair trade|fair-trade|gepa/.test(t)) flags.push('fairtrade');
  if (/regional|aus der region|von hier|heimatliebe|unsere heimat/.test(t)) flags.push('regional');
  return flags;
}

/** Mergt zwei Flag-Listen ohne Duplikate. */
export function mergeFlags(a: ProductFlag[] = [], b: ProductFlag[] = []): ProductFlag[] {
  return [...new Set([...a, ...b])];
}
