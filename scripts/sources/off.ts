import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { ProductFlag } from '../../app/src/domain/enums';

/**
 * Open-Food-Facts-Anreicherung per EAN (offen, ODbL, unabhängig): ergänzt Fairtrade/Bio/Vegan
 * (aus `labels_tags`) sowie Nutri-/Eco-Score. Ergebnis wird in scripts/cache/off.json gecacht,
 * damit wiederholte Läufe/CI OFF nicht erneut abfragen. Fehler → leerer Eintrag (nie werfen).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(__dirname, '../cache/off.json');
const UA = 'herbi-meal-app/1.0 (price-catalog generator)';
const SCORE = new Set(['a', 'b', 'c', 'd', 'e']);

export interface OffData {
  flags: ProductFlag[];
  nutriScore?: string;
  ecoScore?: string;
}

type Cache = Record<string, OffData>;

function loadCache(): Cache {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache;
  } catch {
    return {};
  }
}

function saveCache(cache: Cache): void {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  } catch {
    /* Cache ist optional */
  }
}

function mapLabels(tags: string[]): ProductFlag[] {
  const t = tags.map((x) => x.toLowerCase());
  const flags: ProductFlag[] = [];
  // Bio-Siegel: EU-Bio/organic + gängige Verbände (demeter/bioland/naturland) → alle als `bio`.
  if (t.some((x) => /organic|\bbio\b|demeter|bioland|naturland/.test(x))) flags.push('bio');
  if (t.some((x) => x.includes('vegan'))) flags.push('vegan');
  if (t.some((x) => x.includes('fair'))) flags.push('fairtrade');
  // Regional: OFF kennt „regional"/„local" nur schwach — best effort (i. d. R. via Overlay ergänzt).
  if (t.some((x) => /regional|\blocal\b|aus-der-region/.test(x))) flags.push('regional');
  return flags;
}

async function fetchOne(ean: string): Promise<OffData> {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=labels_tags,nutriscore_grade,ecoscore_grade`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { flags: [] };
    const j = (await res.json()) as {
      status?: number;
      product?: { labels_tags?: string[]; nutriscore_grade?: string; ecoscore_grade?: string };
    };
    if (j.status !== 1 || !j.product) return { flags: [] };
    const p = j.product;
    const nutri = (p.nutriscore_grade || '').toLowerCase();
    const eco = (p.ecoscore_grade || '').toLowerCase();
    return {
      flags: mapLabels(p.labels_tags ?? []),
      ...(SCORE.has(nutri) ? { nutriScore: nutri } : {}),
      ...(SCORE.has(eco) ? { ecoScore: eco } : {}),
    };
  } catch {
    return { flags: [] };
  }
}

/** Reichert die gegebenen EANs an (nutzt/aktualisiert den Datei-Cache). */
export async function enrichByEan(eans: string[]): Promise<Map<string, OffData>> {
  const cache = loadCache();
  const out = new Map<string, OffData>();
  let fetched = 0;
  for (const ean of [...new Set(eans)].filter(Boolean)) {
    if (cache[ean]) {
      out.set(ean, cache[ean]);
      continue;
    }
    const data = await fetchOne(ean);
    cache[ean] = data;
    out.set(ean, data);
    fetched++;
    // Höflich zur offenen API: kurze Pause zwischen echten Requests.
    await new Promise((r) => setTimeout(r, 200));
  }
  if (fetched > 0) saveCache(cache);
  return out;
}
