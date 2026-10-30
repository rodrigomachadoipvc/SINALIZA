import { type INestApplication, Logger, type Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { AuthGuard, INTERNAL_TOKEN, JWT_VERIFIER } from './auth/auth.guard.js';
import { JwtVerifier } from './auth/jwt.js';
import { AllExceptionsFilter } from './http/all-exceptions.filter.js';
import { requestIdMiddleware } from './http/request-id.middleware.js';
import { createValidationPipe } from './http/validation.js';

/**
 * Providers every service registers in its root module: global auth guard and error filter.
 * `internalToken` enables `@Internal()` routes (service-to-service calls).
 */
export function coreProviders(verifier: JwtVerifier, internalToken?: string): Provider[] {
  return [
    { provide: JWT_VERIFIER, useValue: verifier },
    { provide: INTERNAL_TOKEN, useValue: internalToken ?? null },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ];
}

export interface DocsOptions {
  title: string;
  description: string;
  version?: string;
}

export function buildOpenApi(app: INestApplication, options: DocsOptions): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(options.title)
    .setDescription(options.description)
    .setVersion(options.version ?? '1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Applies the cross-cutting HTTP setup shared by every service (also used by e2e tests). */
export function configureApp(app: INestApplication, docs: DocsOptions): OpenAPIObject {
  app.use(requestIdMiddleware);
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
  const document = buildOpenApi(app, docs);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/openapi.json' });
  return document;
}

export async function listen(app: INestApplication, port: number, name: string): Promise<void> {
  await app.listen(port, '0.0.0.0');
  new Logger(name).log(`listening on :${port} (docs at /docs)`);
}
