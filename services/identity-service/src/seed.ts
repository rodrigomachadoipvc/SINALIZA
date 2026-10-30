// Idempotent demo accounts (README → "Contas de teste"). Run after the migrations.
// The other citizens only exist so the demo occurrences (occurrence-service seed) have authors;
// they use reserved example.com addresses so no real mailbox ever receives their emails.
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

/** Password of every demo citizen other than Maria (not documented as a test account). */
export const DEMO_CITIZEN_PASSWORD = 'Cidada12345';

export const DEMO_CITIZENS = [
  { name: 'João Martins', email: 'joao.martins@example.com' },
  { name: 'Ana Rodrigues', email: 'ana.rodrigues@example.com' },
  { name: 'Pedro Costa', email: 'pedro.costa@example.com' },
  { name: 'Sofia Pereira', email: 'sofia.pereira@example.com' },
  { name: 'Rui Almeida', email: 'rui.almeida@example.com' },
  { name: 'Carla Sousa', email: 'carla.sousa@example.com' },
  { name: 'Tiago Gonçalves', email: 'tiago.goncalves@example.com' },
  { name: 'Inês Carvalho', email: 'ines.carvalho@example.com' },
  { name: 'Miguel Ribeiro', email: 'miguel.ribeiro@example.com' },
  { name: 'Beatriz Lopes', email: 'beatriz.lopes@example.com' },
] as const;

interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
}

export async function seedUsers(
  prisma: PrismaClient,
  options: { citizens?: boolean } = {},
): Promise<void> {
  const users: SeedUser[] = [...DEMO_USERS];
  if (options.citizens ?? true) {
    users.push(
      ...DEMO_CITIZENS.map((c) => ({
        ...c,
        password: DEMO_CITIZEN_PASSWORD,
        role: UserRole.CIDADAO,
      })),
    );
  }
  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        role: u.role,
        phone: u.phone ?? null,
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
