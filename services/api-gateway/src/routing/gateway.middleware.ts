import type { IncomingMessage, ServerResponse } from 'node:http';

import { HttpStatus, Logger } from '@nestjs/common';
import {
  INTERNAL_TOKEN_HEADER,
  type JwtVerifier,
  LocalizedHttpException,
  toApiError,
} from '@sinaliza/service-kit';
import { hasRole, REQUEST_ID_HEADER, UserHeaders } from '@sinaliza/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { type GatewayConfig, SERVICE_NAMES, type ServiceName } from '../config.js';
import { matchRoute } from './routes.js';

/**
 * Headers a client must never set: identity headers are written by the gateway from the verified
 * token, the internal token is for service-to-service calls, and forwarding headers are rebuilt
 * from what the gateway itself saw.
 */
export const STRIPPED_HEADERS = [
  UserHeaders.ID,
  UserHeaders.ROLE,
  UserHeaders.EMAIL,
  UserHeaders.NAME,
  INTERNAL_TOKEN_HEADER,
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
  'forwarded',
] as const;

const UNAVAILABLE = 'O serviço está temporariamente indisponível. Tente novamente mais tarde.';
const TIMEOUT = 'O serviço demorou demasiado a responder. Tente novamente.';

/** Writes an error in the common `{ statusCode, error, message, requestId }` format. */
export function sendError(
  req: IncomingMessage & { requestId?: string },
  res: ServerResponse,
  status: number,
  message: string,
): void {
  const body = toApiError(new LocalizedHttpException(status, message), req.requestId ?? 'unknown');
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function isTimeout(error: Error & { code?: string }): boolean {
  return (
    error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || /timeout/i.test(error.message)
  );
}

function createProxies(config: GatewayConfig, logger: Logger): Record<ServiceName, RequestHandler> {
  const proxies = {} as Record<ServiceName, RequestHandler>;
  for (const name of SERVICE_NAMES) {
    proxies[name] = createProxyMiddleware<Request, Response>({
      target: config.services[name],
      changeOrigin: true,
      // X-Forwarded-* are set by the gateway itself (see below), never appended to the client's.
      xfwd: false,
      proxyTimeout: config.proxyTimeoutMs,
      pathRewrite: (path) => path.replace(/^\/api(?=\/|$)/, '') || '/',
      on: {
        error: (error, req, res) => {
          const err = error as Error & { code?: string };
          const timeout = isTimeout(err);
          logger.error(
            `${req.method} ${req.url} → ${name}-service failed: ${err.code ?? ''} ${err.message}`,
          );
          if (!('setHeader' in res)) {
            res.destroy();
            return;
          }
          if (res.headersSent) {
            res.destroy();
            return;
          }
          sendError(
            req,
            res,
            timeout ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.SERVICE_UNAVAILABLE,
            timeout ? TIMEOUT : UNAVAILABLE,
          );
        },
      },
    });
  }
  return proxies;
}

/**
 * The single entry point for `/api/*`: finds the route in the allowlist, checks the token and the
 * role, replaces the identity headers and forwards the request to the right service. Bodies are
 * streamed untouched (the gateway does not parse them), so photo uploads pass straight through.
 */
export function createGatewayMiddleware(
  config: GatewayConfig,
  verifier: JwtVerifier,
): RequestHandler {
  const logger = new Logger('Gateway');
  const proxies = createProxies(config, logger);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path !== '/api' && !req.path.startsWith('/api/')) {
      next();
      return;
    }
    void route(req, res, next).catch(next);
  };

  async function route(req: Request, res: Response, next: NextFunction): Promise<void> {
    const match = matchRoute(req.method, req.path.slice('/api'.length) || '/');
    if (match.kind === 'not-found') {
      sendError(req, res, HttpStatus.NOT_FOUND, 'O endereço pedido não existe.');
      return;
    }
    if (match.kind === 'method-not-allowed') {
      res.setHeader('allow', match.allowed.join(', '));
      sendError(
        req,
        res,
        HttpStatus.METHOD_NOT_ALLOWED,
        'Este método não é suportado neste endereço.',
      );
      return;
    }

    for (const header of STRIPPED_HEADERS) delete req.headers[header];

    const { rule } = match;
    if (rule.access !== 'public') {
      const [scheme, token] = (req.header('authorization') ?? '').split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token) {
        sendError(req, res, HttpStatus.UNAUTHORIZED, 'Precisa de iniciar sessão para continuar.');
        return;
      }
      const user = await verifier.verify(token);
      if (!user) {
        sendError(
          req,
          res,
          HttpStatus.UNAUTHORIZED,
          'Sessão inválida ou expirada. Inicie sessão novamente.',
        );
        return;
      }
      if (rule.access !== 'authenticated' && !hasRole(user.role, rule.access)) {
        sendError(req, res, HttpStatus.FORBIDDEN, 'Não tem permissão para realizar esta ação.');
        return;
      }
      req.headers[UserHeaders.ID] = user.id;
      req.headers[UserHeaders.ROLE] = user.role;
      req.headers[UserHeaders.EMAIL] = user.email;
      // HTTP headers are Latin-1: names such as «Łukasz» are sent percent-encoded.
      req.headers[UserHeaders.NAME] = encodeURIComponent(user.name);
    }

    req.headers['x-forwarded-for'] = req.ip ?? req.socket.remoteAddress ?? '';
    req.headers['x-forwarded-proto'] = req.protocol;
    const host = req.header('host');
    if (host) req.headers['x-forwarded-host'] = host;
    if (req.requestId) req.headers[REQUEST_ID_HEADER] = req.requestId;

    // After a proxy error http-proxy-middleware also calls next(err); our error handler has
    // already answered, so only unexpected errors reach Express.
    await proxies[rule.service](req, res, (err?: unknown) => {
      if (!res.headersSent) next(err);
    });
  }
}
