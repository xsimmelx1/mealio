/**
 * Mergt den kuratierten Label-Overlay (scripts/labeledProducts.overlay.json) in
 * app/src/assets/prices.seed.json — REIN OFFLINE, ohne Netzwerk. Nutze dies, um die
 * Fairtrade-/Regional-/Bio-Varianten sofort verfügbar zu machen, ohne die volle
 * Preis-Pipeline (gen:prices) mit REWE/OFF/Discounto laufen zu lassen.
 *
 * Jede Overlay-Zeile ist eine eigenständige, i. d. R. etwas teurere Label-Variante und wird
 * als ZUSÄTZLICHE Zeile je Markt angehängt. Die Preis-Engine wählt sie nur, wenn das Label
 * bevorzugt wird (chooseStoreRow) — sonst bleibt das günstigere Normalprodukt aktiv.
 *
 * Idempotent: identische Zeilen (key|store|brand|flags|offer) werden nicht dupliziert.
 *
 * Nutzung:  npm run gen:labels
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { STORE_IDS, type StoreId } from '../app/src/domain/enums';
import { SeedPriceSchema, type SeedPrice } from '../app/src/domain/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, '../app/src/assets/prices.seed.json');
const OVERLAY_PATHS = [
  resolve(__dirname, 'labeledProducts.overlay.json'),
  resolve(__dirname, 'veganProducts.overlay.json'),
];

/** Eindeutige Signatur einer Zeile (für Idempotenz). */
const sig = (r: SeedPrice) =>
  `${r.productKey}|${r.storeId}|${r.brand ?? ''}|${(r.flags ?? []).slice().sort().join(',')}|${r.isOffer ? 1 : 0}`;

function load(path: string): SeedPrice[] {
  let raw: unknown[];
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as unknown[];
  } catch {
    return []; // Overlay-Datei optional.
  }
  const rows: SeedPrice[] = [];
  for (const r of raw) {
    const p = SeedPriceSchema.safeParse(r);
    if (p.success) rows.push(p.data);
    else console.warn(`  ⚠ übersprungen: ${JSON.stringify(r).slice(0, 80)} — ${p.error.issues[0]?.message}`);
  }
  return rows;
}

function main() {
  const seed = load(SEED_PATH);
  const overlay = OVERLAY_PATHS.flatMap((p) => load(p));
  const existing = new Set(seed.map(sig));

  let added = 0;
  for (const row of overlay) {
    if (existing.has(sig(row))) continue;
    if (!(STORE_IDS as readonly string[]).includes(row.storeId)) continue;
    seed.push(row);
    existing.add(sig(row));
    added++;
  }

  // Stabile Sortierung wie in genPrices.ts: productKey → Markt-Reihenfolge → Normal vor Angebot.
  const order = new Map(STORE_IDS.map((id, i) => [id, i]));
  seed.sort(
    (a, b) =>
      a.productKey.localeCompare(b.productKey) ||
      (order.get(a.storeId as StoreId) ?? 99) - (order.get(b.storeId as StoreId) ?? 99) ||
      Number(a.isOffer ?? false) - Number(b.isOffer ?? false),
  );

  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf8');

  const flagged = seed.filter((r) => r.flags?.length).length;
  const count = { fairtrade: 0, regional: 0, bio: 0, vegan: 0 } as Record<string, number>;
  for (const r of seed) for (const f of r.flags ?? []) count[f]++;
  console.log(`Overlay: ${overlay.length} Zeilen, ${added} neu angehängt → ${seed.length} Zeilen gesamt.`);
  console.log(`Zeilen mit Label: ${flagged} · Vorkommen:`, count);
}

main();
