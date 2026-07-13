/**
 * Baut die Express-App zusammen (exportierbar für Tests, ohne Server zu starten).
 *
 * Sicherheit:
 *  - helmet (sichere Default-Header)
 *  - CORS nur für die App-Origin(s) aus APP_ORIGIN / CORS_ORIGIN
 *  - express-rate-limit auf alle Routen außer /health
 *  - JSON-Body-Limit (Input-Sanitizing gegen große Payloads)
 *  - keine Secrets in Logs (redigierender Logger)
 */

import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './lib/errorHandler.js';
import { createLlmClient, type LlmClient } from './llm/llmClient.js';

import { healthRouter } from './routes/health.js';
import { createGeneratePlanRouter } from './routes/generatePlan.js';
import { createImportRecipesRouter } from './routes/importRecipes.js';
import { createNutritionRouter } from './routes/nutrition.js';
import { createPricesRouter } from './routes/prices.js';
import { createEstimatePricesRouter } from './routes/estimatePrices.js';
import { createRecipeImagesRouter } from './routes/recipeImages.js';
import type { PriceProvider } from './prices/providers/types.js';

export interface AppOptions {
  /** Erlaubte CORS-Origins. Default aus APP_ORIGIN/CORS_ORIGIN, sonst localhost:5173. */
  allowedOrigins?: string[];
  /** Austauschbarer LLM-Client (Default: Factory-Auswahl via Umgebung). */
  llmClient?: LlmClient;
  /** Rate-Limit-Fenster in ms (Default 60_000). */
  rateLimitWindowMs?: number;
  /** Max. Requests pro Fenster/IP (Default 60). */
  rateLimitMax?: number;
  /** Online-Preise aktiv (Default: process.env.PRICES_ONLINE === '1'). Für Tests injizierbar. */
  pricesOnline?: boolean;
  /** Preis-Provider in Prioritätsreihenfolge (Default: [Open Prices], wenn online). */
  priceProviders?: readonly PriceProvider[];
}

/** Liest erlaubte Origins aus der Umgebung (kommagetrennt). */
export function resolveAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.APP_ORIGIN ?? env.CORS_ORIGIN ?? 'http://localhost:5173';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

export function createApp(options: AppOptions = {}): Express {
  const allowedOrigins = options.allowedOrigins ?? resolveAllowedOrigins();
  const llm = options.llmClient ?? createLlmClient();

  const app = express();

  // Hinter Proxy (Railway o.ä.) korrekte Client-IP für Rate-Limit.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        // Kein Origin (z.B. curl, Server-zu-Server, Health-Probe) zulassen.
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS: Origin ${origin} nicht erlaubt`));
      },
    }),
  );

  app.use(express.json({ limit: '256kb' }));

  // Health ist bewusst vor dem Rate-Limiter (Liveness-Probes dürfen nie gedrosselt werden).
  app.use(healthRouter);

  const limiter = rateLimit({
    windowMs: options.rateLimitWindowMs ?? 60_000,
    max: options.rateLimitMax ?? 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'TooManyRequests' },
  });
  app.use(limiter);

  app.use(createGeneratePlanRouter(llm));
  app.use(createImportRecipesRouter(llm));
  app.use(createNutritionRouter());
  app.use(createEstimatePricesRouter(llm));
  app.use(createRecipeImagesRouter());
  app.use(
    createPricesRouter({ online: options.pricesOnline, providers: options.priceProviders }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info('App initialisiert', {
    allowedOrigins,
    llmClient: llm.kind,
  });

  return app;
}
