// Writes the OpenAPI spec to docs/api/notification-service.json (no database connection needed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '@sinaliza/service-kit';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const { app, document } = await createApp(loadConfig());
const dir = join(repoRoot(), 'docs', 'api');
mkdirSync(dir, { recursive: true });
const file = join(dir, 'notification-service.json');
writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
await app.close();
console.warn(`OpenAPI written to ${file}`);
