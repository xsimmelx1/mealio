import { db } from './db';

/** Favoriten-Status eines Rezepts umschalten (in Dexie persistiert). */
export async function toggleFavorite(id: string): Promise<boolean> {
  const r = await db.recipes.get(id);
  if (!r) return false;
  const next = !r.isFavorite;
  await db.recipes.update(id, { isFavorite: next });
  return next;
}
