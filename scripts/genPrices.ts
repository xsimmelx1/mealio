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
import { STORE_IDS, storeTypeOf, type StoreId } from '../app/src/domain/enums';
import { SeedPriceSchema, type SeedPrice } from '../app/src/domain/schema';
import { deriveRow, type Anchor } from './lib/derive';
import { mergeFlags } from './lib/flags';
import { matchProduct } from './lib/match';
import { createReweSource } from './sources/rewe';
import { enrichByEan } from './sources/off';
import { createDiscountoOffers } from './sources/offers/discounto';
import type { IngredientSpec, OfferSource } from './lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, '../app/src/assets/prices.seed.json');
const CATALOG_PATH = resolve(__dirname, 'ingredients.catalog.json');
const FALLBACK_PATH = resolve(__dirname, '../app/src/assets/fallbackPrices.json');
const OVERLAY_PATHS = [
  resolve(__dirname, 'labeledProducts.overlay.json'),
  resolve(__dirname, 'veganProducts.overlay.json'),
];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Signatur einer Zeile für Idempotenz beim Overlay-Merge. */
const rowSig = (r: SeedPrice) =>
  `${r.productKey}|${r.storeId}|${r.brand ?? ''}|${(r.flags ?? []).slice().sort().join(',')}|${r.isOffer ? 1 : 0}`;

/** Lädt die kuratierten Overlays (Fairtrade/Regional/Bio-Varianten + vegane Ersatzprodukte). */
function loadOverlay(): SeedPrice[] {
  const rows: SeedPrice[] = [];
  for (const path of OVERLAY_PATHS) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown[];
      for (const r of raw) {
        const p = SeedPriceSchema.safeParse(r);
        if (p.success) rows.push(p.data);
      }
    } catch {
      /* Overlay optional */
    }
  }
  return rows;
}

/** Lädt die einmalig gezogene SC-Fallback-Grundlage (key|store -> Zeile). Fehlt sie -> leer. */
function loadFallback(): Map<string, SeedPrice> {
  const map = new Map<string, SeedPrice>();
  try {
    const raw = JSON.parse(readFileSync(FALLBACK_PATH, 'utf8')) as SeedPrice[];
    for (const r of raw) {
      const p = SeedPriceSchema.safeParse(r);
      if (p.success && !p.data.isOffer) map.set(`${p.data.productKey}|${p.data.storeId}`, p.data);
    }
  } catch {
    /* optional */
  }
  return map;
}

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
  // Anker-Grundpreis je Zutat (REWE-Referenz) — Angebote nur akzeptieren, wenn günstiger.
  const anchorBaseByKey = new Map<string, number>();

  for (const key of allKeys) {
    const spec = specByKey.get(key);
    const old = oldSeed.get(key);
    const label = spec?.label ?? old?.label ?? key;
    const aisle = (spec?.aisle ?? old?.aisle ?? 'sonstiges') as SeedPrice['aisle'];

    // Echter REWE-Normaltreffer + ggf. Angebotstreffer über die kuratierte Spec.
    const match = spec ? matchProduct(spec, products) : null;
    const offer = spec ? matchProduct(spec, products, { offers: true }) : null;

    // Anker-Priorität: echter Treffer > kuratierter Fallback der Spec > alter Bestand > Default.
    // (Kuratierter Fallback schlägt bewusst `old`, damit stale/fehlmatchte Alt-Preise nicht kleben.)
    const hasFallback = spec?.fallbackPrice != null;
    const anchor: Anchor = {
      productKey: key,
      label,
      aisle,
      packageSize: match?.product.size ?? (hasFallback ? spec!.fallbackSize ?? 1 : old?.packageSize ?? 1),
      packageUnit: (match?.product.unit ??
        (hasFallback ? spec!.fallbackUnit ?? 'stück' : old?.packageUnit ?? 'stück')) as SeedPrice['packageUnit'],
      pricePerPackage: match?.product.price ?? (hasFallback ? (spec!.fallbackPrice as number) : old?.pricePerPackage ?? 1),
    };
    if (anchor.packageSize > 0) anchorBaseByKey.set(key, anchor.pricePerPackage / anchor.packageSize);
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

  // Discounter-/Markt-Angebote aus Angebotsquellen (Prospekt-Aggregator) einspeisen: eigene
  // isOffer-Zeilen je Markt. Die Engine nutzt sie als effektiven Bestpreis gegen den (geschätzten)
  // Normalpreis. Fehler/leer → keine zusätzlichen Zeilen (nie Abbruch).
  const offerSources: OfferSource[] = [createDiscountoOffers()];
  for (const src of offerSources) {
    let groups;
    try {
      groups = await src.fetchOffers();
    } catch {
      groups = [];
    }
    for (const { storeId, products } of groups) {
      if (!(STORE_IDS as readonly string[]).includes(storeId)) continue;
      for (const spec of catalog) {
        const m = matchProduct(spec, products, { offers: true });
        if (!m) continue;
        // Nur echte Deals: Angebot muss pro Grundeinheit günstiger als der Anker sein
        // (filtert „Angebote" die teurer sind + grobe Fehlzuordnungen wie Fertiggerichte).
        const anchorBase = anchorBaseByKey.get(spec.productKey);
        if (anchorBase != null && m.product.price / m.product.size >= anchorBase) continue;
        offerRows++;
        raw.push({
          productKey: spec.productKey,
          label: spec.label,
          brand: m.product.brand ?? src.sourceName,
          storeId,
          storeType: storeTypeOf(storeId as StoreId),
          aisle: spec.aisle as SeedPrice['aisle'],
          packageSize: m.product.size,
          packageUnit: m.product.unit,
          pricePerPackage: round2(m.product.price),
          dataSource: 'real',
          productName: m.product.name,
          flags: m.product.flags,
          isOffer: true,
          ...(src.validUntil ? { offerValidUntil: src.validUntil } : {}),
          ...(m.product.ean ? { ean: m.product.ean } : {}),
        });
      }
    }
  }

  // SC-Fallback: abgeleitete Schätzungen durch echte supermarktcompare-Preise ersetzen, wo vorhanden
  // (v. a. Frischware + Discounter-Normalpreise). REWE-Real und Angebote bleiben unangetastet.
  const fallback = loadFallback();
  const base = (r: SeedPrice) => r.pricePerPackage / r.packageSize;
  const scOrig = new Map<number, SeedPrice>(); // index -> ursprüngliche Schätzzeile (für Rücknahme)
  if (fallback.size) {
    // 1) Merge mit losem Band gegen GROBE Fehlzuordnungen (0,25×–4× des Ankers).
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      if (r.dataSource !== 'estimate' || r.isOffer) continue;
      const fb = fallback.get(`${r.productKey}|${r.storeId}`);
      if (!fb) continue;
      const ref = anchorBaseByKey.get(r.productKey) ?? base(r);
      const b = base(fb);
      if (b >= ref * 0.25 && b <= ref * 4) {
        scOrig.set(i, r);
        raw[i] = fb;
      }
    }
    // 2) Post-Pass: pro Zutat SC-Zeilen zurücknehmen, bis Grundpreis-Spreizung ≤5 (Ausreißer zuerst).
    const idxByKey = new Map<string, number[]>();
    raw.forEach((r, i) => idxByKey.set(r.productKey, [...(idxByKey.get(r.productKey) ?? []), i]));
    for (const idxs of idxByKey.values()) {
      const bases = () => idxs.map((i) => base(raw[i]));
      let guard = 0;
      while (Math.max(...bases()) / Math.min(...bases()) > 5 && guard++ < 20) {
        const med = [...bases()].sort((a, b2) => a - b2)[Math.floor(idxs.length / 2)];
        // entfernbare (SC-ersetzte) Zeile mit größtem Abstand zum Median finden
        const cand = idxs
          .filter((i) => scOrig.has(i))
          .sort((a, b2) => Math.abs(Math.log(base(raw[b2]) / med)) - Math.abs(Math.log(base(raw[a]) / med)));
        if (cand.length === 0) break;
        const revert = cand[0];
        raw[revert] = scOrig.get(revert)!;
        scOrig.delete(revert);
      }
    }
  }
  const scReplaced = scOrig.size;

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

  // Kuratierter Label-Overlay: Fairtrade/Regional/Bio-Varianten als zusätzliche Zeilen anhängen
  // (Regional/Fairtrade sind aus offenen Quellen kaum ableitbar). Idempotent über die Signatur.
  const overlay = loadOverlay();
  const seen = new Set(raw.map(rowSig));
  let overlayRows = 0;
  for (const row of overlay) {
    if (seen.has(rowSig(row))) continue;
    raw.push(row);
    seen.add(rowSig(row));
    overlayRows++;
  }
  if (overlayRows) console.log(`Label-Overlay: ${overlayRows} Zeilen angehängt (Fairtrade/Regional/Bio).`);

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
  console.log(
    `Echte REWE-Treffer: ${realKeys}/${allKeys.length} · Angebotszeilen: ${offerRows} · SC-Fallback ersetzt: ${scReplaced} · Zeilen mit Label: ${flagged}`,
  );
  console.log('Pro Markt (real/estimate/offer):');
  for (const id of STORE_IDS)
    console.log(`  ${id.padEnd(9)} real=${report[id].real}  estimate=${report[id].estimate}  offer=${report[id].offer}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
