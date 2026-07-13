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
import { mergeFlags } from './lib/flags';
import { matchProduct } from './lib/match';
import { createReweSource } from './sources/rewe';
import { enrichByEan } from './sources/off';
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
  const raw: SeedPrice[] = [];
  let realKeys = 0;
  let offerRows = 0;

  for (const key of allKeys) {
    const spec = specByKey.get(key);
    const old = oldSeed.get(key);
    const label = spec?.label ?? old?.label ?? key;
    const aisle = (spec?.aisle ?? old?.aisle ?? 'sonstiges') as SeedPrice['aisle'];

    // Echter REWE-Normaltreffer + ggf. Angebotstreffer über die kuratierte Spec.
    const match = spec ? matchProduct(spec, products) : null;
    const offer = spec ? matchProduct(spec, products, { offers: true }) : null;

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
      if (id === 'rewe' && match) {
        raw.push({
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
          flags: match.product.flags,
          ...(match.product.ean ? { ean: match.product.ean } : {}),
        });
        // Angebotszeile nur, wenn echtes Angebot günstiger als Normalprodukt (Grundpreis).
        const normalBase = match.product.price / match.product.size;
        if (offer && offer.product.price / offer.product.size < normalBase) {
          offerRows++;
          raw.push({
            productKey: key,
            label,
            brand: offer.product.brand ?? 'REWE',
            storeId: 'rewe',
            storeType: 'vollsortimenter',
            aisle,
            packageSize: offer.product.size,
            packageUnit: offer.product.unit,
            pricePerPackage: round2(offer.product.price),
            dataSource: 'real',
            priceDate: rewe.priceDate,
            productName: offer.product.name,
            flags: offer.product.flags,
            isOffer: true,
            ...(offer.product.ean ? { ean: offer.product.ean } : {}),
          });
        }
      } else {
        raw.push(deriveRow(anchor, id as StoreId));
      }
    }
  }

  // Open-Food-Facts-Anreicherung: echte Zeilen mit EAN → Fairtrade/Bio/Vegan + Nutri-/Eco-Score.
  const eans = raw.filter((r) => r.dataSource === 'real' && r.ean).map((r) => r.ean as string);
  console.log(`Open Food Facts: reichere ${new Set(eans).size} EANs an …`);
  const off = await enrichByEan(eans);
  for (const r of raw) {
    if (r.dataSource !== 'real' || !r.ean) continue;
    const o = off.get(r.ean);
    if (!o) continue;
    r.flags = mergeFlags(r.flags, o.flags);
    if (o.nutriScore) r.nutriScore = o.nutriScore as SeedPrice['nutriScore'];
    if (o.ecoScore) r.ecoScore = o.ecoScore as SeedPrice['ecoScore'];
  }

  // Validierung + Report.
  const rows: SeedPrice[] = [];
  const report: Record<string, { real: number; estimate: number; offer: number }> = {};
  for (const id of STORE_IDS) report[id] = { real: 0, estimate: 0, offer: 0 };
  let flagged = 0;
  for (const row of raw) {
    if (row.flags && row.flags.length === 0) delete (row as { flags?: unknown }).flags;
    const parsed = SeedPriceSchema.safeParse(row);
    if (!parsed.success) {
      console.warn(`  ⚠ übersprungen ${row.productKey}/${row.storeId}: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    rows.push(parsed.data);
    const bucket = report[parsed.data.storeId];
    if (bucket) {
      bucket[parsed.data.dataSource === 'real' ? 'real' : 'estimate']++;
      if (parsed.data.isOffer) bucket.offer++;
    }
    if (parsed.data.flags?.length) flagged++;
  }

  // Stabile Sortierung: productKey, Markt-Reihenfolge, Normal vor Angebot.
  const order = new Map(STORE_IDS.map((id, i) => [id, i]));
  rows.sort(
    (a, b) =>
      a.productKey.localeCompare(b.productKey) ||
      (order.get(a.storeId as StoreId)! - order.get(b.storeId as StoreId)!) ||
      Number(a.isOffer ?? false) - Number(b.isOffer ?? false),
  );

  writeFileSync(SEED_PATH, JSON.stringify(rows, null, 2) + '\n', 'utf8');

  console.log(`\n${allKeys.length} Zutaten, ${rows.length} Zeilen -> ${SEED_PATH}`);
  console.log(`Echte REWE-Treffer: ${realKeys}/${allKeys.length} · Angebotszeilen: ${offerRows} · Zeilen mit Label: ${flagged}`);
  console.log('Pro Markt (real/estimate/offer):');
  for (const id of STORE_IDS)
    console.log(`  ${id.padEnd(9)} real=${report[id].real}  estimate=${report[id].estimate}  offer=${report[id].offer}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
