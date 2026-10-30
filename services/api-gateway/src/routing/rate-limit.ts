import { HttpStatus } from '@nestjs/common';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

import { sendError } from './gateway.middleware.js';

/**
 * Requests per minute per client IP on `/api` (in memory: one gateway instance). Login,
 * registration and password recovery also have a stricter limit in the identity-service.
 */
export function createRateLimiter(limitPerMinute: number): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // CORS preflights do not count.
    skip: (req) => req.method === 'OPTIONS',
    handler: (req, res) => {
      sendError(
        req,
        res,
        HttpStatus.TOO_MANY_REQUESTS,
        'Demasiados pedidos. Aguarde um momento e tente novamente.',
      );
    },
  });
}
