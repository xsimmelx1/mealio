/**
 * POST /prices — STUB (M4).
 *
 * Kontrakt steht; echte Preis-Engine folgt in M5/M11.
 * Cache ist verdrahtet (kurze TTL, Preise ändern sich häufiger als Nährwerte).
 * Aktuell: jedes Item -> price null, source "unknown".
 */

import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { pricesSchema, type PricesInput } from '../schemas/index.js';
import { TtlCache } from '../cache/ttlCache.js';

interface PriceItem {
  productKey: string;
  price: number | null;
  source: 'unknown';
}

export function createPricesRouter(): Router {
  const router = Router();
  // Vorbereitet für M5/M11: TTL 1h für Preise.
  const cache = new TtlCache<PriceItem>(60 * 60 * 1000);

  router.post('/prices', validateBody(pricesSchema), (_req, res) => {
    const { items } = res.locals.body as PricesInput;

    const result: PriceItem[] = items.map((it) => {
      const key = `${it.productKey}|${it.storeId ?? ''}|${it.region ?? ''}`.toLowerCase();
      const cached = cache.get(key);
      if (cached) return cached;
      const item: PriceItem = { productKey: it.productKey, price: null, source: 'unknown' };
      cache.set(key, item);
      return item;
    });

    res.status(200).json({ items: result });
  });

  return router;
}
