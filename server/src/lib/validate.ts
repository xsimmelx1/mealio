/**
 * Express-Middleware, die den Request-Body gegen ein zod-Schema validiert.
 * Bei Erfolg wird der geparste (getrimmte/defaultete) Wert in res.locals.body abgelegt.
 * Bei Fehler wird an die zentrale Error-Middleware delegiert (-> 400).
 */

import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    res.locals.body = result.data;
    next();
  };
}
