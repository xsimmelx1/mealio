import type { IngredientSpec, RawProduct } from './types';

/**
 * Wählt aus echten Quell-Produkten das repräsentative Standardprodukt für eine Zutat.
 * Streng: alle Pflicht-Tokens im Namen, erlaubte Kategorie, keine Ausschluss-Tokens,
 * passende Einheit, plausible Größe. Scoring bevorzugt Eigenmarken, kurze/klare Namen,
 * Token am Namensanfang und niedrigen Grundpreis. Kein Treffer -> null (nie falsch raten).
 */
const lc = (s: string) => s.toLowerCase();

export interface MatchResult {
  product: RawProduct;
  score: number;
}

export function matchProduct(
  spec: IngredientSpec,
  products: RawProduct[],
  opts: { offers?: boolean } = {},
): MatchResult | null {
  const terms = spec.terms.map(lc);
  const excludes = (spec.exclude ?? []).map(lc);
  const prefer = (spec.preferBrands ?? ['ja!', 'rewe']).map(lc);
  const cats = spec.categories;
  const wantOffers = opts.offers === true;

  const candidates = products.filter((p) => {
    if (p.sale !== wantOffers) return false; // Normalprodukte bzw. (offers:true) nur Angebote
    if (p.price <= 0 || p.size <= 0) return false;
    if (p.unit !== spec.packageUnit) return false;
    if (cats && cats.length && !cats.includes(p.category)) return false;
    const name = lc(p.name);
    if (!terms.every((t) => name.includes(t))) return false;
    if (excludes.some((x) => name.includes(x))) return false;
    if (spec.size?.min != null && p.size < spec.size.min) return false;
    if (spec.size?.max != null && p.size > spec.size.max) return false;
    return true;
  });
  if (!candidates.length) return null;

  const scored = candidates.map((p) => {
    const name = lc(p.name);
    const brand = lc(p.brand ?? '');
    let score = 0;
    if (prefer.some((b) => brand.includes(b) || name.includes(b))) score += 100;
    if (terms.length && name.startsWith(terms[0])) score += 30;
    score += Math.max(0, 40 - name.length); // kürzere, klarere Namen bevorzugen
    score -= (p.price / p.size) * 5; // günstigerer Grundpreis als Tiebreak
    return { product: p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}
