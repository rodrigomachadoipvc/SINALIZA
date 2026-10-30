import { MAX_PAGE_SIZE, type Paginated } from '@sinaliza/shared';

import type { DirectoryCategory, DirectoryUser, SeedDirectory } from './seed-occurrences.js';

export interface SeedApiOptions {
  /** Gateway base URL, e.g. http://localhost:8080/api. */
  apiUrl: string;
  adminEmail: string;
  adminPassword: string;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    });
    // The login is rate limited per IP: wait as asked and try once more.
    if (res.status === 429 && attempt === 1) {
      const wait = Number(res.headers.get('retry-after') ?? '60');
      console.warn(`seed: limite de pedidos atingido; a aguardar ${wait} s`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 120) * 1000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`seed: ${init.method ?? 'GET'} ${url} → ${res.status} ${body}`);
    }
    return (await res.json()) as T;
  }
}

/**
 * Reads the users and categories through the API gateway, as the administrator, so the seed does
 * not need access to the identity and municipal databases (RNF07).
 */
export async function loadDirectory(options: SeedApiOptions): Promise<SeedDirectory> {
  const base = options.apiUrl.replace(/\/+$/, '');
  const { accessToken } = await call<{ accessToken: string }>(`${base}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: options.adminEmail, password: options.adminPassword }),
  });
  const auth = { authorization: `Bearer ${accessToken}` };

  const users = new Map<string, DirectoryUser>();
  for (let page = 1; ; page++) {
    const result = await call<Paginated<DirectoryUser>>(
      `${base}/users?page=${page}&pageSize=${MAX_PAGE_SIZE}`,
      { headers: auth },
    );
    for (const u of result.items) users.set(u.email, { id: u.id, name: u.name, email: u.email });
    if (page * result.pageSize >= result.total) break;
  }

  const categories = new Map<string, DirectoryCategory>();
  for (const c of await call<DirectoryCategory[]>(`${base}/categories?all=true`, {
    headers: auth,
  })) {
    categories.set(c.slug, { id: c.id, name: c.name, slug: c.slug });
  }
  return { users, categories };
}
