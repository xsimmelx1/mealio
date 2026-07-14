/**
 * EINMALIGE Fallback-Grundlage: zieht echte per-Markt-Preise (inkl. Discounter + Frischware)
 * von supermarktcompare.de für alle Katalog-Zutaten und schreibt app/src/assets/fallbackPrices.json.
 * gen:prices nutzt diese Datei, um abgeleitete Schätzungen durch echte SC-Preise zu ersetzen,
 * wo weder REWE- noch Discounter-Angebotsdaten vorliegen. Bewusst getrennt vom Live-Lauf.
 *
 * Nutzung:  npm run gen:fallback
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { STORE_IDS, storeTypeOf, type StoreId } from '../app/src/domain/enums';
import { SeedPriceSchema, type SeedPrice } from '../app/src/domain/schema';
import { matchProduct } from './lib/match';
import { fetchScProducts } from './sources/supermarktcompare';
import type { IngredientSpec, RawProduct } from './lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, 'ingredients.catalog.json');
const OUT_PATH = resolve(__dirname, '../app/src/assets/fallbackPrices.json');
const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as IngredientSpec[];
  const priceDate = (process.env.SC_DATE || new Date().toISOString().slice(0, 7)); // YYYY-MM
  const rows: SeedPrice[] = [];
  const report: Record<string, number> = {};
  for (const id of STORE_IDS) report[id] = 0;

  for (const spec of catalog) {
    const tagged = await fetchScProducts(spec.label);
    for (const id of STORE_IDS) {
      const products: RawProduct[] = tagged.filter((t) => t.storeId === id).map((t) => t.product);
      if (products.length === 0) continue;
      // Günstigstes passendes Produkt (Normal ODER Angebot), Kategorie ignoriert (SC-Taxonomie).
      const m = matchProduct(spec, products, { ignoreCategory: true, anySale: true });
      if (!m) continue;
      const p = m.product;
      const row: SeedPrice = {
        productKey: spec.productKey,
        label: spec.label,
        brand: p.brand ?? 'supermarktcompare',
        storeId: id,
        storeType: storeTypeOf(id as StoreId),
        aisle: spec.aisle as SeedPrice['aisle'],
        packageSize: p.size,
        packageUnit: p.unit,
        pricePerPackage: round2(p.price),
        dataSource: 'real',
        priceDate,
        productName: p.name,
        ...(p.flags.length ? { flags: p.flags } : {}),
        ...(p.sale ? { isOffer: true, offerValidUntil: priceDate } : {}),
        ...(p.ean ? { ean: p.ean } : {}),
      };
      const parsed = SeedPriceSchema.safeParse(row);
      if (!parsed.success) continue;
      rows.push(parsed.data);
      report[id]++;
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(rows, null, 2) + '\n', 'utf8');
  console.log(`\nSC-Fallback: ${rows.length} Zeilen (Stand ${priceDate}) -> ${OUT_PATH}`);
  console.log('Pro Markt:', STORE_IDS.map((id) => `${id}=${report[id]}`).join('  '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
