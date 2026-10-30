import 'reflect-metadata';

import type { INestApplication, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { JwtVerifier, requestIdMiddleware } from '@sinaliza/service-kit';
import { REQUEST_ID_HEADER } from '@sinaliza/shared';
import helmet from 'helmet';
import swaggerUiDist from 'swagger-ui-dist';

import { AppModule } from './app.module.js';
import type { GatewayConfig } from './config.js';
import { DOCS_ASSETS_PREFIX } from './docs/docs.controller.js';
import { createGatewayMiddleware } from './routing/gateway.middleware.js';
import { createRateLimiter } from './routing/rate-limit.js';

/** Builds the gateway (used by main.ts and the e2e tests). */
export async function createApp(
  config: GatewayConfig,
  logger?: LogLevel[],
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    // Bodies are streamed to the services untouched (multipart photo uploads included).
    bodyParser: false,
    ...(logger ? { logger } : {}),
  });
  app.set('trust proxy', config.trustProxy);
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type', REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER, 'ratelimit', 'ratelimit-policy', 'retry-after'],
    maxAge: 600,
  });
  app.use('/api', createRateLimiter(config.rateLimitPerMinute));
  app.use(createGatewayMiddleware(config, await JwtVerifier.fromPem(config.jwtPublicKeyPem)));
  app.useStaticAssets(swaggerUiDist.getAbsoluteFSPath(), {
    prefix: DOCS_ASSETS_PREFIX,
    index: false,
  });
  app.enableShutdownHooks();
  return app;
}
