/**
 * POST /estimate-prices — KI-geschätzte Preise für Zutaten OHNE gefundenen Preis.
 * Ein Gemini-Batch-Aufruf; Ergebnis-Shape identisch zu /prices (source "ai" | "unknown").
 * Ohne echten LLM-Key (Mock) -> alle "unknown" (nie geraten). Cache je Item-Menge.
 */
import { Router } from 'express';
import { TtlCache } from '../cache/ttlCache.js';
import { validateBody } from '../lib/validate.js';
import type { LlmClient } from '../llm/llmClient.js';
import { estimatePrices, type EstimatedPrice } from '../prices/estimatePrices.js';
import { estimatePricesSchema, type EstimatePricesInput } from '../schemas/index.js';

export function createEstimatePricesRouter(llm: LlmClient): Router {
  const router = Router();
  const cache = new TtlCache<EstimatedPrice>(24 * 60 * 60 * 1000); // 24 h je productKey

  router.post('/estimate-prices', validateBody(estimatePricesSchema), (_req, res, next) => {
    const { items } = res.locals.body as EstimatePricesInput;

    // Bereits gecachte Keys direkt bedienen, nur den Rest an das LLM geben.
    const cached = new Map<string, EstimatedPrice>();
    const missing = items.filter((it) => {
      const hit = cache.get(it.key);
      if (hit) {
        cached.set(it.key, hit);
        return false;
      }
      return true;
    });

    estimatePrices(missing, llm)
      .then((fresh) => {
        for (const e of fresh) if (e.source === 'ai') cache.set(e.key, e);
        const byKey = new Map(fresh.map((e) => [e.key, e]));
        const result = items.map(
          (it) =>
            cached.get(it.key) ??
            byKey.get(it.key) ?? {
              key: it.key,
              pricePerPackage: null,
              packageSize: null,
              packageUnit: null,
              currency: 'EUR',
              source: 'unknown' as const,
              updatedAt: null,
            },
        );
        res.status(200).json({ items: result });
      })
      .catch(next);
  });

  return router;
}
