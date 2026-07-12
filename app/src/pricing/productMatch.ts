/**
 * Zutat -> Produkt-Matching (heuristisch, deterministisch).
 * Bildet freie Zutatnamen aus Rezepten auf stabile productKeys ab, wie sie in
 * prices.seed.json / PriceOverride verwendet werden.
 */

/** Normalisiert einen Namen zu einem ASCII-kebab-Schlüssel-Kandidaten. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, '') // Klammerinhalte entfernen
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Alias-Tabelle: normalisierter Name -> productKey.
 * Deckt gängige Varianten der Seed-Rezepte ab (erweiterbar).
 */
const ALIASES: Record<string, string> = {
  // Tomaten-Varianten
  'gehackte-tomaten': 'dosentomaten',
  'passierte-tomaten': 'dosentomaten',
  'stueckige-tomaten': 'dosentomaten',
  dosentomaten: 'dosentomaten',
  kirschtomaten: 'tomaten',
  // Pasta
  spaghetti: 'nudeln',
  penne: 'nudeln',
  fusilli: 'nudeln',
  tagliatelle: 'nudeln',
  // Öle
  olivenoel: 'olivenoel',
  sonnenblumenoel: 'rapsoel',
  pflanzenoel: 'rapsoel',
  // Proteine
  haehnchenbrustfilet: 'haehnchenbrust',
  haehnchenbrust: 'haehnchenbrust',
  hackfleisch: 'hackfleisch',
  lachsfilet: 'lachsfilet',
  lachs: 'lachsfilet',
  'thunfisch-in-dose': 'thunfisch',
  thunfisch: 'thunfisch',
  // Gemüse
  zwiebel: 'zwiebeln',
  zwiebeln: 'zwiebeln',
  'rote-zwiebel': 'zwiebeln',
  'rote-zwiebeln': 'zwiebeln',
  fruehlingszwiebeln: 'zwiebeln',
  blattspinat: 'spinat-tk',
  spinat: 'spinat-tk',
  knoblauch: 'knoblauch',
  paprika: 'paprika',
  // Milchprodukte
  naturjoghurt: 'joghurt',
  vollmilch: 'milch',
  'geriebener-kaese': 'gouda',
  reibekaese: 'gouda',
  kaese: 'gouda',
  // Hülsenfrüchte
  'rote-linsen': 'rote-linsen',
  kidneybohnen: 'kidneybohnen',
  kichererbsen: 'kichererbsen',
  // Brühen (Gemüse-/Rinderbrühe -> generischer Brühe-Key)
  gemuesebruehe: 'bruehe',
  rinderbruehe: 'bruehe',
  bruehe: 'bruehe',
  // Kräuter/Gewürze
  chilipulver: 'chili',
  chiliflocken: 'chili',
  majoran: 'oregano',
  schnittlauch: 'petersilie',
  // Zitrusfrüchte
  limette: 'zitrone',
  // weitere Zwiebel-Variante (Singular)
  fruehlingszwiebel: 'zwiebeln',
};

/**
 * Findet den productKey für einen Zutatnamen anhand einer bekannten Schlüsselmenge.
 * Reihenfolge: expliziter Alias -> exakter Treffer -> Präfix/Teilstring-Heuristik.
 * Gibt null zurück, wenn kein plausibler Treffer existiert (nie falsch raten).
 */
export function matchProductKey(name: string, knownKeys: ReadonlySet<string>): string | null {
  const norm = normalizeName(name);
  if (!norm) return null;

  // 1. Alias, aber nur wenn der Zielschlüssel tatsächlich bekannt ist.
  const alias = ALIASES[norm];
  if (alias && knownKeys.has(alias)) return alias;

  // 2. Exakter Treffer.
  if (knownKeys.has(norm)) return norm;

  // 3. Heuristik: bekannter Schlüssel ist Teilstring des Namens (z. B. "reis" in "milchreis")
  //    oder umgekehrt. Längster Treffer gewinnt (spezifischer).
  let best: string | null = null;
  for (const key of knownKeys) {
    if (norm === key) return key;
    if (norm.includes(key) || key.includes(norm)) {
      if (!best || key.length > best.length) best = key;
    }
  }
  return best;
}
