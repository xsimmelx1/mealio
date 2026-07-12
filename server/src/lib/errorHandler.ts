/**
 * Zentrale Fehler-Behandlung.
 *  - zod-Fehler  -> 400 { error: 'ValidationError', issues }
 *  - alles andere -> 500 { error: 'InternalServerError' } (KEIN Stacktrace-Leak)
 */

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

/** 404-Handler für unbekannte Routen. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'NotFound', path: req.path });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'ValidationError',
      issues: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
    return;
  }

  // JSON-Parse-Fehler von express.json() (SyntaxError mit body-Marker).
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'InvalidJson', message: 'Malformed JSON body' });
    return;
  }

  // Unerwartete Fehler: intern loggen (redigiert), aber nach außen generisch.
  logger.error('Unhandled error', {
    message: err instanceof Error ? err.message : String(err),
  });
  res.status(500).json({ error: 'InternalServerError' });
};
