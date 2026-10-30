import { existsSync } from 'node:fs';

import { databaseUrl } from '@sinaliza/service-kit';
import { defineConfig } from 'prisma/config';

// Locally, the CLI reads the shared .env at the repository root; Docker passes real env vars.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const hasDbEnv = Boolean(process.env.DATABASE_URL || process.env.IDENTITY_DB_USER);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` never connects, so a placeholder is enough when no env is set.
    url: hasDbEnv
      ? databaseUrl(process.env, 'IDENTITY', 'identity_db')
      : 'postgresql://localhost:5432/identity_db',
  },
});
