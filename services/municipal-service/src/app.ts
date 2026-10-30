import 'reflect-metadata';

import type { INestApplication, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from '@sinaliza/service-kit';
import type { OpenAPIObject } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import type { MunicipalConfig } from './config.js';

export const DOCS = {
  title: 'Sinaliza · municipal-service',
  description: 'Categorias de ocorrências e limite do concelho de Barcelos.',
};

/** Builds the HTTP app (used by main.ts, the OpenAPI export and the e2e tests). */
export async function createApp(
  config: MunicipalConfig,
  logger?: LogLevel[],
): Promise<{ app: INestApplication; document: OpenAPIObject }> {
  const app = await NestFactory.create<NestExpressApplication>(
    await AppModule.forRoot(config),
    logger ? { logger } : {},
  );
  const document = configureApp(app, DOCS);
  return { app, document };
}
