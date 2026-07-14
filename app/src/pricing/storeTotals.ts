import { STORE_IDS, STORE_LABELS, type StoreId } from '../domain/enums';
import type { PriceOverride, SeedPrice, ShoppingItem } from '../domain/schema';
import { PriceEngine, type StoreLineCost } from './priceEngine';
import { toBase } from './units';

/**
 * Summiert die Einkaufskosten (ganze Packungen) für ein bestimmtes Preisniveau
 * (Discounter vs. Vollsortimenter) — für den Supermarkt-Vergleich. Vorrats-Positionen
 * und Positionen ohne productKey werden übersprungen.
 */
export function totalForStoreType(
  items: ShoppingItem[],
  seedPrices: SeedPrice[],
  overrides: PriceOverride[],
  storeType: 'discounter' | 'vollsortimenter',
): { total: number; pricedCount: number } {
  const engine = new PriceEngine(seedPrices, overrides, { preferredStoreType: storeType });
  let total = 0;
  let pricedCount = 0;
  for (const it of items) {
    if (it.isPantry || !it.productKey) continue;
    const dim = toBase(it.totalAmount || 1, it.unit).dim;
    const w = engine.wholePackageCost(it.productKey, it.totalAmount, dim);
    if (w.cost != null) {
      total += w.cost;
      pricedCount++;
    }
  }
  return { total: Math.round(total * 100) / 100, pricedCount };
}

/** Gesamtkosten des Warenkorbs bei EINEM konkreten Markt. */
export interface StoreTotal {
  storeId: StoreId;
  label: string;
  /** Summe der bepreisbaren Positionen (ganze Packungen). */
  total: number;
  /** Anzahl bepreister Positionen. */
  pricedCount: number;
  /** davon per KI geschätzt (Rest: kuratierter Katalog). */
  aiCount: number;
  /** davon aus echter Quelle (dataSource='real'). */
  realCount: number;
  /** davon aktuell im Angebot. */
  offerCount: number;
  /** Positionen, die bei diesem Markt NICHT bepreisbar waren. */
  unpricedCount: number;
  /** Stand der echten Preisdaten (YYYY-MM), falls vorhanden. */
  priceDate?: string;
}

/** Kosten je Position aufgeschlüsselt nach allen Märkten (für die Produkt-Tabelle). */
export interface StoreItemRow {
  item: ShoppingItem;
  byStore: Record<StoreId, StoreLineCost>;
}

export interface StoreComparison {
  /** Alle Märkte, sortiert (günstigster zuerst); nur wenn ≥1 Position bepreisbar. */
  stores: StoreTotal[];
  cheapest: StoreTotal | null;
  mostExpensive: StoreTotal | null;
  /** Höchste Gesamtsumme (für Balken-Skalierung). */
  maxTotal: number;
  /** Ersparnis günstigster vs. teuerster Markt. */
  savings: number;
  /** Positions-Aufschlüsselung je Markt (bereits nach Gang/Name sortiert wie items). */
  rows: StoreItemRow[];
  /** Wie viele Positionen überhaupt (irgendwo) bepreisbar waren. */
  pricedItemCount: number;
}

const relevant = (items: ShoppingItem[]): ShoppingItem[] =>
  items.filter((it) => !it.isPantry);

/**
 * Wie weit reicht das Budget bei einem Markt? Grobe, konsistente Näherung aus der
 * Gesamtsumme: passt die ganze Woche, oder nur ~N von M geplanten Tagen.
 * budget<=0 (kein Budget gesetzt) -> ganzer Plan gilt als abgedeckt.
 */
export function budgetReach(
  total: number,
  budget: number,
  plannedDays: number,
): { fits: boolean; coveredDays: number } {
  const days = Math.max(1, plannedDays);
  if (budget <= 0 || total <= 0 || total <= budget) return { fits: true, coveredDays: days };
  return { fits: false, coveredDays: Math.max(0, Math.floor((budget / total) * days)) };
}

/** Gesamtkosten des Warenkorbs bei einem Markt (nutzt die per-Markt-Kette der Engine). */
export function totalForStore(
  items: ShoppingItem[],
  engine: PriceEngine,
  storeId: StoreId,
): StoreTotal {
  let total = 0;
  let pricedCount = 0;
  let aiCount = 0;
  let realCount = 0;
  let offerCount = 0;
  let unpricedCount = 0;
  let priceDate: string | undefined;
  for (const it of relevant(items)) {
    const dim = toBase(it.totalAmount || 1, it.unit).dim;
    const line = engine.wholePackageCostForStore(it.productKey, it.name, it.totalAmount, dim, storeId);
    if (line.cost != null) {
      total += line.cost;
      pricedCount++;
      if (line.source === 'ai') aiCount++;
      if (line.onOffer) offerCount++;
      if (line.dataSource === 'real') {
        realCount++;
        if (line.priceDate && (!priceDate || line.priceDate > priceDate)) priceDate = line.priceDate;
      }
    } else {
      unpricedCount++;
    }
  }
  return {
    storeId,
    label: STORE_LABELS[storeId],
    total: Math.round(total * 100) / 100,
    pricedCount,
    aiCount,
    realCount,
    offerCount,
    unpricedCount,
    priceDate,
  };
}

/**
 * Vergleicht den kompletten Warenkorb über ALLE 7 Märkte und liefert Ranking (günstigster
 * zuerst), Ersparnis, Balken-Maximum sowie eine Positions-Aufschlüsselung je Markt.
 * Erwartet eine Engine mit KI-Preisen (z. B. aus usePriceEngine).
 */
export function compareAllStores(
  items: ShoppingItem[],
  engine: PriceEngine,
  storeIds: readonly StoreId[] = STORE_IDS,
): StoreComparison {
  const ids = storeIds.length ? storeIds : STORE_IDS;
  const list = relevant(items);
  const stores = ids.map((id) => totalForStore(items, engine, id)).sort((a, b) => a.total - b.total);

  const rows: StoreItemRow[] = list.map((it) => {
    const dim = toBase(it.totalAmount || 1, it.unit).dim;
    const byStore = {} as Record<StoreId, StoreLineCost>;
    for (const id of ids) {
      byStore[id] = engine.wholePackageCostForStore(it.productKey, it.name, it.totalAmount, dim, id);
    }
    return { item: it, byStore };
  });

  const priced = stores.filter((s) => s.pricedCount > 0);
  if (priced.length === 0) {
    return {
      stores: [],
      cheapest: null,
      mostExpensive: null,
      maxTotal: 0,
      savings: 0,
      rows,
      pricedItemCount: 0,
    };
  }
  const cheapest = stores[0];
  const mostExpensive = stores[stores.length - 1];
  const pricedItemCount = rows.filter((r) => ids.some((id) => r.byStore[id].cost != null)).length;
  return {
    stores,
    cheapest,
    mostExpensive,
    maxTotal: mostExpensive.total,
    savings: Math.round((mostExpensive.total - cheapest.total) * 100) / 100,
    rows,
    pricedItemCount,
  };
}
