/**
 * POST /prices — Online-Preise (M11), opt-in via Open Food Facts "Open Prices".
 *
 * Rolle/Priorität: Online-Preise sind die NIEDRIGSTE Quelle
 * (Manual > LocalSeed > Online). Das Frontend entscheidet über die Priorität —
 * dieser Endpunkt liefert nur den Online-Adapter hinter einem Feature-Flag.
 *
 * Verhalten: NUR wenn PRICES_ONLINE=1 wird Online abgefragt (Open Prices, ODbL —
 * Attribution + Share-Alike; siehe server/README.md). Sonst liefert jedes Item
 * sofort "unknown". Ergebnisse werden mit TTL gecacht (inkl. Negativ-Cache).
 * Fehler/Timeout blockieren den App-Flow nie -> Fallback auf "unknown".
 *
 * Antwort-Vertrag:
 *   { items: [{ key, pricePerPackage: number|null, packageSize: number|null,
 *               packageUnit: "g"|"ml"|"stück"|null, currency, source, updatedAt }] }
 *   Genau ein Ergebnis pro Request-Item, gleiche Reihenfolge/keys.
 */

import { Router } from 'express';
import { validateBody } from '../lib/validate.js';
import { pricesSchema, type PricesInput } from '../schemas/index.js';
import { TtlCache } from '../cache/ttlCache.js';
import { logger } from '../lib/logger.js';
import { resolvePrices } from '../prices/pricesService.js';
import type { OnlinePrice, PriceProvider } from '../prices/providers/types.js';
import { createOpenPricesProvider } from '../prices/providers/openPrices.js';

export interface PricesRouterOptions {
  /** Online-Lookups aktiv (Default: process.env.PRICES_ONLINE === '1'). */
  online?: boolean;
  /** Provider in Prioritätsreihenfolge (Default: [Open Prices]). */
  providers?: readonly PriceProvider[];
}

export function createPricesRouter(options: PricesRouterOptions = {}): Router {
  const router = Router();

  // TTL 6h: Preise ändern sich häufiger als Nährwerte, aber selten minütlich.
  // undefined=Miss, null=bekannt-negativ (Negativ-Cache gegen wiederholte Abfragen).
  const cache = new TtlCache<OnlinePrice | null>(6 * 60 * 60 * 1000);

  const online = options.online ?? process.env.PRICES_ONLINE === '1';
  const providers = options.providers ?? (online ? [createOpenPricesProvider()] : []);

  if (online) {
    logger.info('prices: Online-Lookups aktiv (opt-in)', {
      providers: providers.map((p) => p.name),
    });
  }

  router.post('/prices', validateBody(pricesSchema), (_req, res, next) => {
    const { items } = res.locals.body as PricesInput;

    resolvePrices(items, { online, providers, cache })
      .then((result) => {
        res.status(200).json({ items: result });
      })
      .catch(next);
  });

  return router;
}
