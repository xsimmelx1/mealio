import { Router } from 'express';

/** GET /health — Liveness-Check ohne Rate-Limit. */
export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
