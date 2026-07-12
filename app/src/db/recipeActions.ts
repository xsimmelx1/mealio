import type { Recipe } from '../domain/schema';
import { db } from './db';

/**
 * Importiert Rezepte in den Katalog (Dexie). Dedupliziert nach id (bulkPut
 * überschreibt vorhandene). Gibt zurück, wie viele davon NEU waren.
 */
export async function importCatalogRecipes(recipes: Recipe[]): Promise<number> {
  if (recipes.length === 0) return 0;
  const existing = new Set<string>(
    (await db.recipes.where('id').anyOf(recipes.map((r) => r.id)).primaryKeys()) as string[],
  );
  await db.recipes.bulkPut(recipes);
  return recipes.filter((r) => !existing.has(r.id)).length;
}

/** Favoriten-Status eines Rezepts umschalten (in Dexie persistiert). */
export async function toggleFavorite(id: string): Promise<boolean> {
  const r = await db.recipes.get(id);
  if (!r) return false;
  const next = !r.isFavorite;
  await db.recipes.update(id, { isFavorite: next });
  return next;
}
