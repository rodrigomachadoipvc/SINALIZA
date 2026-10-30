import 'reflect-metadata';

import type { INestApplication, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from '@sinaliza/service-kit';
import type { OpenAPIObject } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import type { IdentityConfig } from './config.js';

export const DOCS = {
  title: 'Sinaliza · identity-service',
  description: 'Contas, autenticação (JWT RS256), recuperação de palavra-passe e gestores.',
};

/** Builds the HTTP app (used by main.ts, the OpenAPI export and the e2e tests). */
export async function createApp(
  config: IdentityConfig,
  logger?: LogLevel[],
): Promise<{ app: INestApplication; document: OpenAPIObject }> {
  const app = await NestFactory.create<NestExpressApplication>(
    await AppModule.forRoot(config),
    logger ? { logger } : {},
  );
  // Trust X-Forwarded-For only from the gateway on the private Docker network, so the
  // login rate limit counts real client IPs.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  const document = configureApp(app, DOCS);
  return { app, document };
}
