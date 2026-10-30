import 'reflect-metadata';

import type { INestApplication, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from '@sinaliza/service-kit';
import type { OpenAPIObject } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import type { OccurrenceConfig } from './config.js';

export const DOCS = {
  title: 'Sinaliza · occurrence-service',
  description: 'Ocorrências: registo, ciclo de vida, fotografias, mapa público e indicadores.',
};

/** Builds the HTTP app (used by main.ts, the OpenAPI export and the e2e tests). */
export async function createApp(
  config: OccurrenceConfig,
  logger?: LogLevel[],
): Promise<{ app: INestApplication; document: OpenAPIObject }> {
  const app = await NestFactory.create<NestExpressApplication>(
    await AppModule.forRoot(config),
    logger ? { logger } : {},
  );
  const document = configureApp(app, DOCS);
  return { app, document };
}
