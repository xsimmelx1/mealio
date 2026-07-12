import recipesSeedRaw from '../assets/recipes.seed.json';
import pricesSeedRaw from '../assets/prices.seed.json';
import { SeedPriceSchema, SeedRecipeSchema, type Recipe, type SeedPrice } from '../domain/schema';
import { db } from './db';

/**
 * Validiert die Seed-Rezepte gegen das Schema und wandelt sie in vollständige
 * Recipe-Objekte um (source='seed', isFavorite=false, createdAt gesetzt).
 * Ungültige Einträge werden mit Warnung übersprungen (App bleibt lauffähig).
 */
export function loadSeedRecipes(now: number = Date.now()): Recipe[] {
  const raw = recipesSeedRaw as unknown[];
  const recipes: Recipe[] = [];
  for (const entry of raw) {
    const parsed = SeedRecipeSchema.safeParse(entry);
    if (!parsed.success) {
      console.warn('[seed] Rezept übersprungen (Schema-Fehler):', parsed.error.issues[0]?.message);
      continue;
    }
    recipes.push({
      ...parsed.data,
      source: 'seed',
      isFavorite: false,
      createdAt: now,
    });
  }
  return recipes;
}

/** Validiert die Seed-Preise. Ungültige Einträge werden übersprungen. */
export function loadSeedPrices(): SeedPrice[] {
  const raw = pricesSeedRaw as unknown[];
  const prices: SeedPrice[] = [];
  for (const entry of raw) {
    const parsed = SeedPriceSchema.safeParse(entry);
    if (!parsed.success) {
      console.warn('[seed] Preis übersprungen (Schema-Fehler):', parsed.error.issues[0]?.message);
      continue;
    }
    prices.push(parsed.data);
  }
  return prices;
}

/**
 * Idempotenter Seed-Import in Dexie:
 * - Rezepte werden per bulkPut eingespielt (nur Seed-Quellen überschrieben,
 *   nutzergenerierte/llm-Rezepte und Favoriten-Flags bleiben unberührt).
 * - Preise landen NICHT in Dexie (bleiben als reine JSON-Fallback-Quelle in der
 *   Preis-Engine, M5); hier nur zur frühen Validierung geladen.
 * Läuft nur einmal pro Seed-Version (Flag in preferences? -> einfacher: nur wenn leer
 * oder wenn Seed-Rezepte fehlen).
 */
export async function seedDatabase(now: number = Date.now()): Promise<void> {
  const seedRecipes = loadSeedRecipes(now);

  await db.transaction('rw', db.recipes, async () => {
    // Vorhandene Seed-Rezepte einsammeln, um Favoriten-Flags zu erhalten.
    const existing = await db.recipes.where('source').equals('seed').toArray();
    const favById = new Map(existing.map((r) => [r.id, r.isFavorite]));
    const merged = seedRecipes.map((r) => ({
      ...r,
      isFavorite: favById.get(r.id) ?? r.isFavorite,
    }));
    await db.recipes.bulkPut(merged);
  });

  // Frühe Validierung der Preise (Ergebnis in M5 genutzt).
  loadSeedPrices();
}
