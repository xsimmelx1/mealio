import { parse } from 'csv-parse/sync';
import { parseGrammage } from '../lib/grammage';
import type { PriceSource, RawProduct } from '../lib/types';

/**
 * REWE-Preisquelle über den offenen Community-Datensatz (rewe.nicoo.org, Apache-2.0).
 * Enthält das reguläre REWE-Onlinesortiment mit name/brand/ean/price/grammage/category/sale.
 * Findet die neueste verfügbare Tages-CSV ab Startdatum rückwärts; fällt auf ein bekanntes
 * Datum zurück, falls der Feed pausiert. Unabhängig von Wettbewerber-APIs.
 */
const BASE = 'https://rewe.nicoo.org';
const REGION = process.env.REWE_REGION || 'bavaria';
const LOOKBACK_DAYS = 21;
/** Bekanntes zuletzt verfügbares Datum (Feed pausierte danach) — robuster Fallback. */
const PINNED_DATE = '2025-09-09';

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Neueste verfügbare CSV ab Startdatum rückwärts; sonst gepinntes Datum. */
async function findLatest(): Promise<{ url: string; date: string }> {
  const start = process.env.REWE_START_DATE ? new Date(process.env.REWE_START_DATE) : new Date();
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const d = new Date(start.getTime() - i * 86_400_000);
    const date = fmt(d);
    const url = `${BASE}/${date}_${REGION}.csv`;
    if (await exists(url)) return { url, date };
  }
  return { url: `${BASE}/${PINNED_DATE}_${REGION}.csv`, date: PINNED_DATE };
}

export async function createReweSource(): Promise<PriceSource> {
  const { url, date } = await findLatest();
  return {
    storeId: 'rewe',
    sourceName: `REWE (rewe.nicoo.org, ${REGION})`,
    priceDate: date.slice(0, 7),
    async fetchProducts(): Promise<RawProduct[]> {
      try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const text = await res.text();
        const rows = parse(text, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
        const out: RawProduct[] = [];
        for (const r of rows) {
          const price = parseFloat(r.price);
          const pkg = parseGrammage(r.grammage || '');
          if (!Number.isFinite(price) || price <= 0 || !pkg) continue;
          const brand = r.brand && r.brand !== 'NA' ? r.brand.trim() : null;
          out.push({
            name: (r.name || '').trim(),
            brand,
            ean: r.ean && /^\d{6,14}$/.test(r.ean) ? r.ean : null,
            price: Math.round(price * 100) / 100,
            size: pkg.size,
            unit: pkg.unit,
            category: (r.category || '').trim(),
            sale: (r.sale || '').toLowerCase() === 'true',
          });
        }
        return out;
      } catch {
        return [];
      }
    },
  };
}
