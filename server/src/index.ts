/**
 * Mealio Backend — Bootstrap (Milestone 4).
 * Lädt .env, baut die Express-App und startet den HTTP-Server.
 */

import 'dotenv/config';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';

const PORT = Number(process.env.PORT ?? 8787);

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info('Mealio-Server läuft', { port: PORT });
});

// Sauberes Herunterfahren.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`Signal ${signal} empfangen, fahre herunter`);
    server.close(() => process.exit(0));
  });
}
