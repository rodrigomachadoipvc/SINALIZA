// Idempotent demo accounts (README → "Contas de teste"). Run after the migrations.
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from '@sinaliza/service-kit';
import { UserRole } from '@sinaliza/shared';

import { hashPassword } from './auth/secrets.js';
import { PrismaClient } from './generated/prisma/client.js';

export const DEMO_USERS = [
  {
    name: 'Administrador Sinaliza',
    email: 'admin@sinaliza.pt',
    password: 'Admin12345',
    role: UserRole.ADMIN,
  },
  {
    name: 'Gestor Municipal',
    email: 'gestor@sinaliza.pt',
    password: 'Gestor12345',
    role: UserRole.GESTOR,
  },
  {
    name: 'Maria Fernandes',
    email: 'maria.fernandes@email.pt',
    password: 'Cidada12345',
    role: UserRole.CIDADAO,
    phone: '+351 912 345 678',
  },
] as const;

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  for (const u of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        role: u.role,
        phone: 'phone' in u ? u.phone : null,
        passwordHash: await hashPassword(u.password),
      },
    });
    console.warn(`seed: created ${u.role} ${u.email}`);
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl(process.env, 'IDENTITY', 'identity_db'),
    }),
  });
  try {
    await seedUsers(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
