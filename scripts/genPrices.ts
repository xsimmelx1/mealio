/**
 * Generiert app/src/assets/prices.seed.json aus ECHTEN Quellen (unabhängig von Wettbewerbern).
 * Adapter-Framework: aktuell REWE (offener Datensatz). Zutaten↔Produkt über kuratierte Specs
 * (scripts/ingredients.catalog.json), gegen echte Daten gematcht. Märkte/Zutaten ohne echten
 * Treffer werden aus dem REWE-Anker abgeleitet und als 'estimate' gekennzeichnet.
 *
 * Nutzung:  npm run gen:prices        (neuestes verfügbares REWE-Datum)
 *           REWE_START_DATE=2025-09-09 npm run gen:prices
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { STORE_IDS, type StoreId } from '../app/src/domain/enums';
import { SeedPriceSchema, type SeedPrice } from '../app/src/domain/schema';
import { deriveRow, type Anchor } from './lib/derive';
import { matchProduct } from './lib/match';
import { createReweSource } from './sources/rewe';
import type { IngredientSpec } from './lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, '../app/src/assets/prices.seed.json');
const CATALOG_PATH = resolve(__dirname, 'ingredients.catalog.json');
const round2 = (n: number) => Math.round(n * 100) / 100;

interface OldMeta {
  label: string;
  aisle: SeedPrice['aisle'];
  packageSize: number;
  packageUnit: SeedPrice['packageUnit'];
  pricePerPackage: number; // alter REWE-Preis als Fallback-Anker
}

function loadOldSeed(): Map<string, OldMeta> {
  const map = new Map<string, OldMeta>();
  try {
    const raw = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as SeedPrice[];
    for (const r of raw) {
      // Bevorzugt die rewe-Zeile als Anker; sonst irgendeine.
      if (!map.has(r.productKey) || r.storeId === 'rewe') {
        map.set(r.productKey, {
          label: r.label,
          aisle: r.aisle,
          packageSize: r.packageSize,
          packageUnit: r.packageUnit,
          pricePerPackage: r.pricePerPackage,
        });
      }
    }
  } catch {
    /* erste Ausführung ohne Bestand ist ok */
  }
  return map;
}

function loadCatalog(): IngredientSpec[] {
  try {
    return JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as IngredientSpec[];
  } catch {
    return [];
  }
}

async function main() {
  const oldSeed = loadOldSeed();
  const catalog = loadCatalog();
  const specByKey = new Map(catalog.map((s) => [s.productKey, s]));

  const rewe = await createReweSource();
  const products = await rewe.fetchProducts();
  console.log(`REWE: ${products.length} Produkte (Stand ${rewe.priceDate}, ${rewe.sourceName})`);

  const allKeys = [...new Set([...specByKey.keys(), ...oldSeed.keys()])].sort();
  const rows: SeedPrice[] = [];
  const report: Record<string, { real: number; estimate: number }> = {};
  for (const id of STORE_IDS) report[id] = { real: 0, estimate: 0 };
  let realKeys = 0;

  for (const key of allKeys) {
    const spec = specByKey.get(key);
    const old = oldSeed.get(key);
    const label = spec?.label ?? old?.label ?? key;
    const aisle = (spec?.aisle ?? old?.aisle ?? 'sonstiges') as SeedPrice['aisle'];

    // Echter REWE-Treffer über die kuratierte Spec?
    const match = spec ? matchProduct(spec, products) : null;

    // Anker (REWE-Referenz) für alle abgeleiteten Preise.
    const anchor: Anchor = {
      productKey: key,
      label,
      aisle,
      packageSize: match?.product.size ?? old?.packageSize ?? 1,
      packageUnit: (match?.product.unit ?? old?.packageUnit ?? 'stück') as SeedPrice['packageUnit'],
      pricePerPackage: match?.product.price ?? old?.pricePerPackage ?? 1,
    };
    if (match) realKeys++;

    for (const id of STORE_IDS) {
      let row: SeedPrice;
      if (id === 'rewe' && match) {
        row = {
          productKey: key,
          label,
          brand: match.product.brand ?? 'REWE',
          storeId: 'rewe',
          storeType: 'vollsortimenter',
          aisle,
          packageSize: match.product.size,
          packageUnit: match.product.unit,
          pricePerPackage: round2(match.product.price),
          dataSource: 'real',
          priceDate: rewe.priceDate,
          productName: match.product.name,
          ...(match.product.ean ? { ean: match.product.ean } : {}),
        };
      } else {
        row = deriveRow(anchor, id as StoreId);
      }
      // Validierung: nie ungültige Daten schreiben.
      const parsed = SeedPriceSchema.safeParse(row);
      if (!parsed.success) {
        console.warn(`  ⚠ übersprungen ${key}/${id}: ${parsed.error.issues[0]?.message}`);
        continue;
      }
      rows.push(parsed.data);
      report[id][parsed.data.dataSource === 'real' ? 'real' : 'estimate']++;
    }
  }

  // Stabile Sortierung: productKey, dann Markt-Reihenfolge.
  const order = new Map(STORE_IDS.map((id, i) => [id, i]));
  rows.sort((a, b) => a.productKey.localeCompare(b.productKey) || (order.get(a.storeId)! - order.get(b.storeId)!));

  writeFileSync(SEED_PATH, JSON.stringify(rows, null, 2) + '\n', 'utf8');

  console.log(`\n${allKeys.length} Zutaten, ${rows.length} Zeilen -> ${SEED_PATH}`);
  console.log(`Echte REWE-Treffer: ${realKeys}/${allKeys.length}`);
  console.log('Pro Markt (real/estimate):');
  for (const id of STORE_IDS) console.log(`  ${id.padEnd(9)} real=${report[id].real}  estimate=${report[id].estimate}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
