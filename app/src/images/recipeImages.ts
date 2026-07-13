import { fetchRecipeImages } from '../api/client';
import { db } from '../db/db';
import type { Recipe } from '../domain/schema';

/**
 * Stellt sicher, dass Rezepte ohne Foto ein echtes Bild bekommen (Openverse, CC).
 * - Nur Rezepte mit `imageUrl === undefined` (noch nie versucht) werden angefragt.
 * - Kein Treffer -> `imageUrl` wird auf '' gesetzt (Marker "versucht"), damit nicht erneut gefragt wird.
 * - Fehler/offline werden geschluckt (Bilder sind optional; Emoji-Platzhalter bleibt).
 */
export async function ensureRecipeImages(recipes: Recipe[], online: boolean): Promise<void> {
  if (!online || recipes.length === 0) return;
  try {
    const missing = recipes.filter((r) => r.imageUrl === undefined).slice(0, 30);
    if (missing.length === 0) return;
    const results = await fetchRecipeImages(missing.map((r) => ({ key: r.id, query: r.title })));
    const byId = new Map(results.map((r) => [r.key, r]));
    await Promise.all(
      missing.map((r) => {
        const res = byId.get(r.id);
        return db.recipes.update(r.id, {
          imageUrl: res?.imageUrl ?? '', // '' = versucht, kein Treffer -> kein erneutes Fragen
          ...(res?.attribution ? { imageAttribution: res.attribution } : {}),
          ...(res?.sourceUrl ? { imageSourceUrl: res.sourceUrl } : {}),
        });
      }),
    );
  } catch {
    /* Bilder optional; Fehler (Netz/DB) ignorieren. */
  }
}
