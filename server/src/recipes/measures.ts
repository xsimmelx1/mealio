/**
 * measures — Parser für imperiale/gemischte TheMealDB-Maßangaben in unsere Einheiten
 * und eine Aisle-Heuristik. Wird ausschließlich vom STRUKTURELLEN Fallback genutzt
 * (wenn kein echtes Gemini verfügbar ist); die echte Normalisierung übernimmt Gemini.
 *
 * Umrechnungen (bewusst grob, dokumentiert im Prompt identisch):
 *   1 cup ≈ 240 ml, 1 oz ≈ 28 g, 1 lb ≈ 454 g, 1 can ≈ 400 g,
 *   tbsp/tsp bleiben tbsp/tsp, clove/slice/piece -> stück, pinch/dash -> prise.
 */

import type { Aisle, Unit } from '../llm/recipeSchema.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Plausible Obergrenzen je Einheit (Spiegel von validateRecipe.UNIT_MAX). */
const UNIT_CAP: Record<Unit, number> = {
  g: 20_000,
  kg: 20,
  ml: 20_000,
  l: 20,
  tsp: 60,
  tbsp: 60,
  stück: 100,
  prise: 10,
};

/** Unicode-Brüche auf Dezimalwerte. */
const VULGAR_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

/**
 * Parst den führenden Zahlenwert einer Maßangabe. Unterstützt Ganzzahlen, Dezimal-,
 * einfache und gemischte Brüche ("1 1/2") sowie Unicode-Brüche ("½", "1½").
 * Liefert null, wenn keine Zahl erkennbar ist.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;

  // Unicode-Brüche in "a/b" umschreiben, ggf. mit Leerzeichen als Trennung.
  let prefix = 0;
  for (const [glyph, value] of Object.entries(VULGAR_FRACTIONS)) {
    if (s.includes(glyph)) {
      // führende Ganzzahl direkt vor dem Bruch (z. B. "1½") aufsammeln
      const m = s.match(new RegExp(`(\\d+)\\s*${glyph}`));
      if (m) prefix += Number(m[1]);
      prefix += value;
      s = s.replace(new RegExp(`(\\d+)?\\s*${glyph}`), ' ');
    }
  }

  // gemischter Bruch "1 1/2"
  const mixed = s.match(/(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den !== 0) return round2(prefix + whole + num / den);
  }

  // einfacher Bruch "1/2"
  const frac = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (den !== 0) return round2(prefix + num / den);
  }

  // Dezimal-/Ganzzahl (auch als Bereich "1-2" -> untere Grenze)
  const dec = s.match(/(\d+(?:[.,]\d+)?)/);
  if (dec) return round2(prefix + Number(dec[1].replace(',', '.')));

  return prefix > 0 ? round2(prefix) : null;
}

/** Ergebnis einer geparsten Maßangabe. */
export interface ParsedMeasure {
  amount: number;
  unit: Unit;
}

/**
 * Wandelt eine rohe Maßangabe (z. B. "1 cup", "200g", "2 tbsp", "1 can", "2 cloves")
 * in {amount, unit} unserer Einheiten. Unbekannte/leere Angaben -> 1 stück.
 * Ergebnis ist immer > 0 und auf die Einheiten-Obergrenze gedeckelt.
 */
export function parseMeasure(raw: string): ParsedMeasure {
  const s = raw.trim().toLowerCase();
  const amount = parseAmount(s);
  const n = amount === null || amount <= 0 ? 1 : amount;

  // Zahlen/Brüche/Bereiche entfernen, damit der Einheiten-Token isoliert steht
  // (fängt zusammengeschriebene Angaben wie "200g" oder "3/4 cup" korrekt).
  const rest = s.replace(/[\d./\-\s¼½¾⅓⅔⅕⅖⅗⅘⅛⅜⅝⅞]+/g, ' ').trim();

  const clamp = (value: number, unit: Unit): ParsedMeasure => ({
    amount: Math.min(round2(value <= 0 ? 1 : value), UNIT_CAP[unit]),
    unit,
  });

  // Reihenfolge wichtig: spezifische/zusammengesetzte Begriffe zuerst.
  if (/\bkgs?\b|kilograms?\b|kilos?\b/.test(rest)) return clamp(n, 'kg');
  if (/\bcups?\b/.test(rest)) return clamp(n * 240, 'ml');
  if (/\btablespoons?\b|\btbsp\b|\btbs\b|\btbl\b/.test(rest)) return clamp(n, 'tbsp');
  if (/\bteaspoons?\b|\btsp\b|\btsps\b/.test(rest)) return clamp(n, 'tsp');
  if (/\bounces?\b|\boz\b/.test(rest)) return clamp(n * 28, 'g');
  if (/\bpounds?\b|\blbs?\b/.test(rest)) return clamp(n * 454, 'g');
  if (/\bcans?\b|\btins?\b/.test(rest)) return clamp(n * 400, 'g');
  if (/\bpinch(es)?\b|\bdash(es)?\b/.test(rest)) return clamp(n, 'prise');
  if (/\bcloves?\b|\bslices?\b|\bpieces?\b|\bsprigs?\b/.test(rest)) return clamp(n, 'stück');
  if (/\bmilliliters?\b|\bmillilitres?\b|\bml\b/.test(rest)) return clamp(n, 'ml');
  if (/\bliters?\b|\blitres?\b|\bl\b/.test(rest)) return clamp(n, 'l');
  if (/\bgrams?\b|\bgr\b|\bg\b/.test(rest)) return clamp(n, 'g');

  // Reine Zahl ohne Einheit (z. B. "2") -> Stückzahl; sonst 1 Stück.
  return clamp(n, 'stück');
}

/** Aisle-Heuristik über englische Zutat-Schlüsselwörter (nur Fallback). */
const AISLE_KEYWORDS: ReadonlyArray<[Aisle, RegExp]> = [
  ['fleisch-fisch', /\b(chicken|beef|pork|lamb|bacon|sausage|ham|turkey|fish|salmon|tuna|cod|shrimp|prawn|seafood|mince|steak)\b/],
  ['kühlregal', /\b(milk|butter|cheese|cream|yog(h)?urt|egg|eggs|creme fraiche|mozzarella|parmesan|feta|quark)\b/],
  ['obst-gemüse', /\b(onion|garlic|tomato|potato|carrot|pepper|spinach|lettuce|cucumber|apple|banana|lemon|lime|orange|ginger|chilli|chili|mushroom|broccoli|courgette|zucchini|celery|leek|herb|parsley|coriander|cilantro|basil|avocado)\b/],
  ['konserven', /\b(canned|tin|beans|chickpea|lentil|coconut milk|passata|tomato puree|stock|broth|olives)\b/],
  ['backwaren', /\b(bread|bun|tortilla|baguette|roll|pita|naan|dough|pastry)\b/],
  ['getränke', /\b(wine|beer|water|juice|cola|stock cube)\b/],
  ['gewürze', /\b(salt|pepper|spice|cumin|paprika|curry|cinnamon|nutmeg|oregano|thyme|bay leaf|chilli powder|turmeric|masala|vanilla|cardamom|clove)\b/],
  ['tiefkühl', /\b(frozen|peas)\b/],
  ['trockenwaren', /\b(rice|pasta|spaghetti|noodle|flour|sugar|oil|oats|couscous|quinoa|sauce|vinegar|honey|cornflour|cornstarch|baking)\b/],
];

/** Ordnet einen (englischen) Zutatnamen dem plausibelsten Supermarkt-Gang zu. */
export function guessAisle(name: string): Aisle {
  const n = name.toLowerCase();
  for (const [aisle, re] of AISLE_KEYWORDS) {
    if (re.test(n)) return aisle;
  }
  return 'sonstiges';
}
