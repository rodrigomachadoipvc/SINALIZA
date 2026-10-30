// Idempotent demo occurrences (spec section 10). Needs the whole stack running: the users and
// categories are read through the API gateway, and the boundary must already be cached.
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from '@sinaliza/service-kit';

import { PrismaClient } from './generated/prisma/client.js';
import { loadDirectory } from './seed/api-directory.js';
import { DEMO_OCCURRENCES } from './seed/demo-data.js';
import { seedOccurrences } from './seed/seed-occurrences.js';

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const env = process.env;
  const directory = await loadDirectory({
    apiUrl: env.SEED_API_URL ?? 'http://localhost:8080/api',
    adminEmail: env.SEED_ADMIN_EMAIL ?? 'admin@sinaliza.pt',
    adminPassword: env.SEED_ADMIN_PASSWORD ?? 'Admin12345',
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl(env, 'OCCURRENCE', 'occurrence_db'),
    }),
  });
  try {
    const result = await seedOccurrences(prisma, directory);
    console.warn(
      `seed: ${DEMO_OCCURRENCES.length} ocorrências de demonstração ` +
        `(${result.created} novas, ${result.existing} já existiam)`,
    );
    if (result.conflicts.length > 0) {
      console.warn(
        `seed: referências já usadas por outras ocorrências, ignoradas: ${result.conflicts.join(', ')}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
