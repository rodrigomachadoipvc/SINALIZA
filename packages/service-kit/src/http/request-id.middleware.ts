import { randomUUID } from 'node:crypto';

import { REQUEST_ID_HEADER } from '@sinaliza/shared';
import type { NextFunction, Request, Response } from 'express';

import './request-context.js';

const VALID_REQUEST_ID = /^[\w.-]{1,128}$/;

/** Reuses the caller's `x-request-id` (set by the gateway) or creates one, and echoes it back. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = requestId;
  req.headers[REQUEST_ID_HEADER] = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
