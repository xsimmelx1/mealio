import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { ProductFlag } from '../../app/src/domain/enums';
import { parseGrammage } from '../lib/grammage';
import type { RawProduct } from '../lib/types';

/**
 * EINMALIGE Fallback-Grundlage über die offene JSON-API von supermarktcompare.de.
 * Liefert echte Preise je Markt (inkl. Discounter + Frischware) + Bio/Vegan/Fairtrade-Flags.
 * Rohantworten werden in scripts/cache/sc.json gecacht, damit Wiederholungen die API schonen
 * (bewusst als gebackene Grundlage gedacht, nicht als Live-Abhängigkeit). Fehler -> [] (nie werfen).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(__dirname, '../cache/sc.json');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** discounto-/SC-Händlernamen -> unsere storeIds. */
const RETAILER_TO_STORE: Record<string, string> = {
  aldi: 'aldi',
  'aldi süd': 'aldi',
  'aldi nord': 'aldi',
  lidl: 'lidl',
  penny: 'penny',
  'penny markt': 'penny',
  netto: 'netto',
  'netto marken-discount': 'netto',
  rewe: 'rewe',
  edeka: 'edeka',
  kaufland: 'kaufland',
};

interface ScItem {
  name?: string;
  brand?: string | null;
  barcode?: string | null;
  effective_price?: string | number | null;
  price?: string | number | null;
  unit?: string | null;
  is_on_offer?: boolean;
  is_bio?: boolean;
  is_vegan?: boolean;
  is_fairtrade?: boolean;
  retailer?: { name?: string };
}

type Cache = Record<string, ScItem[]>;

function loadCache(): Cache {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache;
  } catch {
    return {};
  }
}
function saveCache(c: Cache): void {
  try {
    if (!existsSync(dirname(CACHE_PATH))) mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(c, null, 0) + '\n', 'utf8');
  } catch {
    /* Cache optional */
  }
}

function flagsOf(it: ScItem): ProductFlag[] {
  const f: ProductFlag[] = [];
  if (it.is_bio) f.push('bio');
  if (it.is_vegan) f.push('vegan');
  if (it.is_fairtrade) f.push('fairtrade');
  return f;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ein SC-Item -> {storeId, RawProduct} oder null (nicht mappbar / keine Grammatur/Preis). */
function toTagged(it: ScItem): { storeId: string; product: RawProduct } | null {
  const storeId = RETAILER_TO_STORE[(it.retailer?.name ?? '').trim().toLowerCase()];
  if (!storeId) return null;
  const price = Number(it.effective_price ?? it.price);
  const name = (it.name ?? '').trim();
  if (!name || !Number.isFinite(price) || price <= 0) return null;
  // Grammatur bevorzugt aus dem Namen (z. B. "… ca. 100g"), sonst aus dem unit-Feld.
  const pkg = parseGrammage(name) ?? parseGrammage(it.unit ?? '');
  if (!pkg) return null;
  return {
    storeId,
    product: {
      name,
      brand: it.brand?.trim() || null,
      ean: it.barcode && /^\d{6,14}$/.test(it.barcode) ? it.barcode : null,
      price: Math.round(price * 100) / 100,
      size: pkg.size,
      unit: pkg.unit,
      category: '',
      sale: it.is_on_offer === true,
      flags: flagsOf(it),
    },
  };
}

/** Fragt SC für einen Suchbegriff (gecacht) und liefert getaggte Produkte je Markt. */
export async function fetchScProducts(query: string): Promise<{ storeId: string; product: RawProduct }[]> {
  const cache = loadCache();
  let items = cache[query];
  if (!items) {
    try {
      const url = `https://supermarktcompare.de/api/products?query=${encodeURIComponent(query)}&limit=80`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://supermarktcompare.de/' },
      });
      items = res.ok ? (((await res.json()) as { items?: ScItem[] }).items ?? []) : [];
      cache[query] = items;
      saveCache(cache);
      await sleep(400); // API schonen
    } catch {
      items = [];
    }
  }
  const out: { storeId: string; product: RawProduct }[] = [];
  for (const it of items) {
    const t = toTagged(it);
    if (t) out.push(t);
  }
  return out;
}
