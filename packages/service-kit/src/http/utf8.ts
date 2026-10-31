import { isUtf8 } from 'node:buffer';
import type { IncomingMessage } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import express, { type NextFunction, type Request, type Response } from 'express';

import { badRequest } from './errors.js';

export const INVALID_UTF8_MESSAGE =
  'O pedido tem caracteres inválidos. Envie o texto codificado em UTF-8.';

type MaybeInvalid = IncomingMessage & { invalidUtf8?: boolean };

/**
 * Replaces Nest's default JSON parser with one that rejects bodies that are not valid UTF-8 (e.g.
 * Latin-1 «ç» sent by a Windows tool). Without this, the parser silently turns each invalid byte
 * into «�» and the text is stored like that.
 *
 * Registered with `app.use` because Nest's `useBodyParser` reserves `verify`; Nest then skips its
 * own JSON parser, since one is already applied. The parser only marks the request: an error
 * thrown inside `verify` would be rewrapped with an English message, so the 400 comes from the
 * middleware right after it.
 */
export function useStrictJsonParser(app: INestApplication): void {
  app.use(
    express.json({
      verify: (req: MaybeInvalid, _res, bytes) => {
        if (!isUtf8(bytes)) req.invalidUtf8 = true;
      },
    }),
  );
  app.use((req: Request & MaybeInvalid, _res: Response, next: NextFunction) => {
    next(req.invalidUtf8 ? badRequest(INVALID_UTF8_MESSAGE) : undefined);
  });
}
