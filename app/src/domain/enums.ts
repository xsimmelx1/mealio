/**
 * Zentrale Enum-/Konstantenlisten der Domäne (Single Source of Truth).
 * Werden von den zod-Schemas, der UI und den Seed-Daten gemeinsam genutzt.
 */

/** Mengeneinheiten für Zutaten. */
export const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'stück', 'prise'] as const;
export type Unit = (typeof UNITS)[number];

/** Meal-Styles (bevorzugte Rezept-Charaktere), siehe Onboarding. */
export const MEAL_STYLES = [
  'schnell',
  'high-protein',
  'familienfreundlich',
  'fakeaway',
  'veggie',
  'budget',
] as const;
export type MealStyle = (typeof MEAL_STYLES)[number];

/** Mahlzeit-Typen (Tageszeit). */
export const MEAL_TYPES = ['fruehstueck', 'mittagessen', 'abendessen'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  fruehstueck: 'Frühstück',
  mittagessen: 'Mittagessen',
  abendessen: 'Abendessen',
};

/** Ernährungsform / Diät-Tags eines Rezepts (was das Rezept erfüllt). */
export const DIET_TAGS = [
  'omnivor',
  'vegetarisch',
  'vegan',
  'pescetarisch',
  'glutenfrei',
  'laktosefrei',
  'low-carb',
] as const;
export type DietTag = (typeof DIET_TAGS)[number];

/** Ernährungsform als Nutzer-Präferenz (Single-Choice). */
export const DIETS = ['omnivor', 'vegetarisch', 'vegan', 'pescetarisch'] as const;
export type Diet = (typeof DIETS)[number];

/** Allergien / Unverträglichkeiten (EU-Hauptallergene, reduziert). */
export const ALLERGIES = [
  'gluten',
  'laktose',
  'nüsse',
  'erdnüsse',
  'ei',
  'soja',
  'fisch',
  'schalentiere',
  'sellerie',
  'senf',
  'sesam',
] as const;
export type Allergy = (typeof ALLERGIES)[number];

/** Küchengeräte. */
export const APPLIANCES = [
  'herd',
  'backofen',
  'mikrowelle',
  'airfryer',
  'mixer',
  'pürierstab',
  'toaster',
  'wasserkocher',
] as const;
export type Appliance = (typeof APPLIANCES)[number];

/** Supermarkt-Gänge (für Einkaufsliste-Gruppierung). */
export const AISLES = [
  'obst-gemüse',
  'kühlregal',
  'tiefkühl',
  'trockenwaren',
  'konserven',
  'backwaren',
  'fleisch-fisch',
  'getränke',
  'gewürze',
  'sonstiges',
] as const;
export type Aisle = (typeof AISLES)[number];

/** Vordefinierte Supermärkte (Wert = productKey-kompatibler storeId-Hint). */
export const SUPERMARKETS = [
  { value: '', label: 'Egal', storeType: null },
  { value: 'aldi', label: 'Aldi', storeType: 'discounter' },
  { value: 'lidl', label: 'Lidl', storeType: 'discounter' },
  { value: 'penny', label: 'Penny', storeType: 'discounter' },
  { value: 'netto', label: 'Netto', storeType: 'discounter' },
  { value: 'rewe', label: 'Rewe', storeType: 'vollsortimenter' },
  { value: 'edeka', label: 'Edeka', storeType: 'vollsortimenter' },
  { value: 'kaufland', label: 'Kaufland', storeType: 'vollsortimenter' },
] as const;

export type StoreType = 'discounter' | 'vollsortimenter';

/** Liefert den Store-Typ (Preisniveau) zu einem Supermarkt-Wert. */
export function storeTypeFor(supermarket: string): StoreType | null {
  return SUPERMARKETS.find((s) => s.value === supermarket)?.storeType ?? null;
}

/** Die 7 vergleichbaren Supermärkte (ohne „Egal"), in Anzeige-Reihenfolge. */
export const STORE_IDS = ['aldi', 'lidl', 'penny', 'netto', 'rewe', 'edeka', 'kaufland'] as const;
export type StoreId = (typeof STORE_IDS)[number];

/** Anzeigename je storeId. */
export const STORE_LABELS: Record<StoreId, string> = {
  aldi: 'Aldi',
  lidl: 'Lidl',
  penny: 'Penny',
  netto: 'Netto',
  rewe: 'Rewe',
  edeka: 'Edeka',
  kaufland: 'Kaufland',
};

/**
 * Relativer Preisindex je Markt — NUR für den KI-Fallback (Zutaten ohne kuratierten
 * Katalogpreis). Der KI-Basispreis ist marktneutral; hiermit leiten wir plausible
 * Einzelpreise je Markt ab. Kuratierte Katalogpreise (prices.seed.json) haben je Markt
 * echte Werte und nutzen diesen Index NICHT.
 */
export const STORE_PRICE_INDEX: Record<StoreId, number> = {
  aldi: 0.92,
  lidl: 0.93,
  penny: 0.94,
  netto: 0.95,
  kaufland: 1.0,
  rewe: 1.06,
  edeka: 1.08,
};

/** Typische Eigenmarke je Markt — Fallback-Anzeige, v. a. für KI-geschätzte Positionen. */
export const STORE_DEFAULT_BRAND: Record<StoreId, string> = {
  aldi: 'Eigenmarke',
  lidl: 'Eigenmarke',
  penny: 'Penny',
  netto: 'Netto',
  rewe: 'ja!',
  edeka: 'GUT&GÜNSTIG',
  kaufland: 'K-Classic',
};

/** Preisniveau (StoreType) je storeId — abgeleitet aus SUPERMARKETS. */
export function storeTypeOf(storeId: StoreId): StoreType {
  return storeTypeFor(storeId) ?? 'discounter';
}

/** Typische ungeliebte Zutaten (vordefinierte Schnellauswahl, ergänzt Freitext). */
export const COMMON_DISLIKED = [
  'koriander',
  'oliven',
  'pilze',
  'rosenkohl',
  'sellerie',
  'fenchel',
  'tofu',
  'feta',
  'rosinen',
  'lakritz',
  'blauschimmelkäse',
  'sardellen',
] as const;

/** Unterstützte Währungen. */
export const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Menschenlesbare Labels für Gänge (UI). */
export const AISLE_LABELS: Record<Aisle, string> = {
  'obst-gemüse': 'Obst & Gemüse',
  kühlregal: 'Kühlregal',
  tiefkühl: 'Tiefkühl',
  trockenwaren: 'Trockenwaren',
  konserven: 'Konserven',
  backwaren: 'Backwaren',
  'fleisch-fisch': 'Fleisch & Fisch',
  getränke: 'Getränke',
  gewürze: 'Gewürze',
  sonstiges: 'Sonstiges',
};

/** Menschenlesbare Labels für Meal-Styles (UI). */
export const MEAL_STYLE_LABELS: Record<MealStyle, string> = {
  schnell: 'Schnell',
  'high-protein': 'High-Protein',
  familienfreundlich: 'Familienfreundlich',
  fakeaway: 'Fakeaway',
  veggie: 'Veggie',
  budget: 'Budget',
};
