/**
 * Deterministische, offline-fähige Umstellung eines Rezepts auf vegetarisch/vegan:
 * ersetzt tierische Zutaten durch pflanzliche Äquivalente (Name, Menge×Ratio, Einheit, Gang,
 * productMatchId), schreibt dietTags um und ersetzt Zutatnamen wörtlich in den Schritten.
 * Die Kochschritte werden online optional per KI geglättet (siehe api/client.adaptRecipeSteps).
 *
 * Grundsatz wie recipe-engine: nie stumm als „vegan" ausgeben — Rest-Tierprodukte werden
 * über {@link findAnimalIngredients} gemeldet (Warnhinweis in der UI).
 */
import type { Aisle, Unit } from '../domain/enums';
import type { Ingredient, Recipe } from '../domain/schema';

export type TargetDiet = 'vegetarisch' | 'vegan';
type Category = 'meat' | 'fish' | 'dairy' | 'egg' | 'honey';

interface SubRule {
  category: Category;
  /** Kleingeschriebene Teilstring-Keywords (mit Leerzeichen-Padding gematcht). */
  match: string[];
  /** Zutatnamen, die trotz Treffer NICHT ersetzt werden (z. B. Erdnussbutter). */
  except?: string[];
  to: { name: string; productKey: string; aisle: Aisle; unit?: Unit; ratio?: number };
}

/**
 * Zutat ist bereits pflanzlich → nie ersetzen/als tierisch werten. Bare Teilstrings
 * (kein Leerzeichen-Padding), damit auch Komposita wie „Räuchertofu" oder „Kokosmilch"
 * sicher als pflanzlich erkannt werden.
 */
const PLANT_MARKERS = ['vegan', 'pflanz', 'soja', 'tofu', 'hafer', 'kokos', 'mandel', 'seitan'];

/** Reihenfolge = Priorität (spezifisch vor generisch). Erster Treffer gewinnt. */
const RULES: SubRule[] = [
  // Fleisch
  { category: 'meat', match: ['hackfleisch', 'hack', 'gehacktes'], to: { name: 'Sojagranulat', productKey: 'sojagranulat', aisle: 'trockenwaren', unit: 'g', ratio: 0.4 } },
  { category: 'meat', match: ['speck', 'bacon', 'schinken', 'salami', 'wurst', 'würst', 'chorizo', 'kassler'], to: { name: 'Räuchertofu', productKey: 'tofu', aisle: 'kühlregal', ratio: 1 } },
  { category: 'meat', match: ['hähnchen', 'haehnchen', 'hühn', 'hühner', 'huhn', 'pute', 'geflügel', 'rind', 'gulasch', 'steak', 'schwein', 'kalb', 'lamm', 'ente', 'fleisch'], to: { name: 'Tofu natur', productKey: 'tofu', aisle: 'kühlregal', ratio: 1 } },
  // Fisch & Meeresfrüchte
  { category: 'fish', match: ['lachs', 'thunfisch', 'kabeljau', 'forelle', 'hering', 'makrele', 'seelachs', 'sardelle', 'fisch', 'garnele', 'shrimp', 'krabbe', 'scampi', 'muschel', 'tintenfisch', 'calamari'], to: { name: 'Räuchertofu (Fisch-Alternative)', productKey: 'tofu', aisle: 'kühlregal', ratio: 1 } },
  // Milchprodukte
  { category: 'dairy', match: ['butter'], except: ['erdnuss', 'nuss'], to: { name: 'Vegane Butter', productKey: 'vegane-butter', aisle: 'kühlregal', unit: 'g', ratio: 1 } },
  { category: 'dairy', match: ['feta'], to: { name: 'Vegane Feta-Alternative', productKey: 'veganer-feta', aisle: 'kühlregal', unit: 'g', ratio: 1 } },
  { category: 'dairy', match: ['mozzarella', 'parmesan', 'gouda', 'emmentaler', 'cheddar', 'käse', 'kaese', 'frischkäse'], to: { name: 'Veganer Reibekäse', productKey: 'veganer-kaese', aisle: 'kühlregal', unit: 'g', ratio: 1 } },
  { category: 'dairy', match: ['joghurt', 'quark'], to: { name: 'Pflanzenjoghurt', productKey: 'sojajoghurt', aisle: 'kühlregal', unit: 'g', ratio: 1 } },
  { category: 'dairy', match: ['sahne', 'schmand', 'crème', 'creme fraiche', 'crème fraîche', 'mascarpone'], to: { name: 'Kokos-Kochcreme', productKey: 'kokosmilch', aisle: 'konserven', unit: 'ml', ratio: 1 } },
  { category: 'dairy', match: ['milch'], to: { name: 'Haferdrink', productKey: 'haferdrink', aisle: 'kühlregal', unit: 'ml', ratio: 1 } },
  // Ei
  { category: 'egg', match: ['eier', ' ei ', 'eigelb', 'eiweiß', 'eiweiss', 'vollei'], to: { name: 'Ei-Ersatz', productKey: 'ei-ersatz', aisle: 'backwaren', unit: 'stück', ratio: 1 } },
  // Honig
  { category: 'honey', match: ['honig'], to: { name: 'Ahornsirup', productKey: 'ahornsirup', aisle: 'trockenwaren', unit: 'g', ratio: 1 } },
];

/** Kategorien, die je Diät ersetzt werden müssen. */
const REPLACE_FOR: Record<TargetDiet, Category[]> = {
  vegetarisch: ['meat', 'fish'],
  vegan: ['meat', 'fish', 'dairy', 'egg', 'honey'],
};

const pad = (name: string) => ` ${name.toLowerCase()} `;
const isPlant = (padded: string) => PLANT_MARKERS.some((m) => padded.includes(m));

/** Findet die passende Ersatz-Regel für einen Zutatnamen (oder null). */
function matchRule(name: string): SubRule | null {
  const n = pad(name);
  if (isPlant(n)) return null;
  for (const rule of RULES) {
    if (rule.except?.some((e) => n.includes(e))) continue;
    if (rule.match.some((kw) => n.includes(kw))) return rule;
  }
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Substitution {
  from: string;
  to: string;
}

export interface AdaptResult {
  recipe: Recipe;
  substitutions: Substitution[];
  /** Tierische Zutaten, die (für die Ziel-Diät) NICHT ersetzt werden konnten. */
  unresolved: string[];
}

/** Schreibt dietTags auf die Ziel-Diät um (vegan impliziert vegetarisch). */
function rewriteDietTags(tags: Recipe['dietTags'], diet: TargetDiet): Recipe['dietTags'] {
  const set = new Set(tags.filter((t) => t !== 'omnivor' && t !== 'pescetarisch'));
  set.add('vegetarisch');
  if (diet === 'vegan') set.add('vegan');
  return [...set];
}

/** Ersetzt Zutatnamen wörtlich in einem Schritt-Text (deterministischer Offline-Fallback). */
function replaceInStep(step: string, subs: Substitution[]): string {
  let out = step;
  for (const { from, to } of subs) {
    if (!from) continue;
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(esc, 'gi'), to);
  }
  return out;
}

/**
 * Findet tierische Zutaten, die der Ziel-Diät widersprechen (Konformitätsprüfung).
 * Bereits pflanzliche Namen (PLANT_MARKERS) werden ignoriert.
 */
export function findAnimalIngredients(recipe: Recipe, diet: TargetDiet): string[] {
  const cats = new Set(REPLACE_FOR[diet]);
  const offenders: string[] = [];
  for (const ing of recipe.ingredients) {
    const n = pad(ing.name);
    if (isPlant(n)) continue;
    const rule = RULES.find((r) => !r.except?.some((e) => n.includes(e)) && r.match.some((kw) => n.includes(kw)));
    if (rule && cats.has(rule.category)) offenders.push(ing.name);
  }
  return offenders;
}

/**
 * Stellt ein Rezept deterministisch auf die Ziel-Diät um. Ersetzt nur Zutaten der
 * betroffenen Kategorien, behält Mengen dimensionsrichtig (Ratio) und markiert Ersetzungen.
 */
export function adaptRecipeToDiet(recipe: Recipe, diet: TargetDiet): AdaptResult {
  const cats = new Set(REPLACE_FOR[diet]);
  const substitutions: Substitution[] = [];

  const ingredients: Ingredient[] = recipe.ingredients.map((ing) => {
    const rule = matchRule(ing.name);
    if (!rule || !cats.has(rule.category)) return ing;
    const ratio = rule.to.ratio ?? 1;
    const amount = Math.max(0.01, round2(ing.amount * ratio));
    substitutions.push({ from: ing.name, to: rule.to.name });
    return {
      name: rule.to.name,
      amount,
      unit: rule.to.unit ?? ing.unit,
      aisle: rule.to.aisle,
      productMatchId: rule.to.productKey,
    };
  });

  const adapted: Recipe = {
    ...recipe,
    ingredients,
    dietTags: rewriteDietTags(recipe.dietTags, diet),
    steps: recipe.steps.map((s) => replaceInStep(s, substitutions)),
  };

  return { recipe: adapted, substitutions, unresolved: findAnimalIngredients(adapted, diet) };
}
