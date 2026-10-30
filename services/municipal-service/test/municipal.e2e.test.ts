import { DEFAULT_CATEGORIES, UserRole } from '@sinaliza/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Harness, INTERNAL_TOKEN, startHarness } from './harness.js';

interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
  active: boolean;
}

describe('municipal-service (e2e)', () => {
  let h: Harness;
  const as = (role: UserRole) => ({ Authorization: `Bearer ${h.tokens[role]}` });

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h?.stop();
  });

  describe('seed', () => {
    it('loads the six default categories', async () => {
      const res = await h.http().get('/categories').set(as(UserRole.CIDADAO)).expect(200);
      expect((res.body as Category[]).map((c) => c.slug).sort()).toEqual(
        DEFAULT_CATEGORIES.map((c) => c.slug).sort(),
      );
      expect(res.body[0]).toEqual(
        expect.objectContaining({ id: expect.any(String), active: true, icon: expect.any(String) }),
      );
    });

    it('is idempotent across restarts', async () => {
      await h.restart();
      const { rows } = await h.db.query<{ categories: string; municipalities: string }>(
        'SELECT (SELECT count(*) FROM categories) AS categories, (SELECT count(*) FROM municipality) AS municipalities',
      );
      expect(rows[0]).toEqual({ categories: '6', municipalities: '1' });
    });
  });

  describe('municipality boundary (RF12)', () => {
    it('returns Barcelos as a GeoJSON MultiPolygon', async () => {
      const res = await h.http().get('/municipality').set(as(UserRole.CIDADAO)).expect(200);
      expect(res.body.name).toBe('Barcelos');
      expect(res.body.boundary.type).toBe('MultiPolygon');
    });

    it.each([
      ['Câmara Municipal de Barcelos', 41.5317, -8.6194, true],
      ['Barcelinhos', 41.5292, -8.6232, true],
      ['Braga (concelho vizinho)', 41.5454, -8.4265, false],
      ['Esposende (litoral, fora do concelho)', 41.5327, -8.7813, false],
      ['Viana do Castelo', 41.6932, -8.8329, false],
    ])('%s → inside=%s', async (_, lat, lng, inside) => {
      const { rows } = await h.db.query<{ inside: boolean }>(
        'SELECT ST_Contains(boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326)) AS inside FROM municipality',
        [lng, lat],
      );
      expect(rows[0]?.inside).toBe(inside);
    });

    it('requires authentication', async () => {
      await h.http().get('/municipality').expect(401);
    });
  });

  describe('categories (RF10)', () => {
    it('lets only ADMIN create categories', async () => {
      await h
        .http()
        .post('/categories')
        .set(as(UserRole.GESTOR))
        .send({ name: 'Espaços verdes', icon: 'tree-pine' })
        .expect(403);
      await h
        .http()
        .post('/categories')
        .set(as(UserRole.CIDADAO))
        .send({ name: 'Espaços verdes', icon: 'tree-pine' })
        .expect(403);
    });

    it('creates a category with a generated slug', async () => {
      const res = await h
        .http()
        .post('/categories')
        .set(as(UserRole.ADMIN))
        .send({ name: '  Espaços verdes ', icon: 'tree-pine' })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'Espaços verdes',
        slug: 'espacos-verdes',
        icon: 'tree-pine',
        active: true,
      });
    });

    it('rejects duplicate names ignoring case', async () => {
      const res = await h
        .http()
        .post('/categories')
        .set(as(UserRole.ADMIN))
        .send({ name: 'ESPAÇOS VERDES', icon: 'leaf' })
        .expect(409);
      expect(res.body.message).toBe('Já existe uma categoria com este nome.');
    });

    it('rejects icons outside the Lucide list', async () => {
      const res = await h
        .http()
        .post('/categories')
        .set(as(UserRole.ADMIN))
        .send({ name: 'Animais', icon: 'not-an-icon' })
        .expect(400);
      expect(res.body.details).toEqual([
        { field: 'icon', messages: ['Escolha um ícone da lista disponível.'] },
      ]);
    });

    it('edits name and icon but keeps the slug', async () => {
      const list = await h.http().get('/categories').set(as(UserRole.ADMIN)).expect(200);
      const outro = (list.body as Category[]).find((c) => c.slug === 'outro');
      const res = await h
        .http()
        .patch(`/categories/${outro?.id}`)
        .set(as(UserRole.ADMIN))
        .send({ name: 'Outros problemas', icon: 'triangle-alert' })
        .expect(200);
      expect(res.body).toMatchObject({
        slug: 'outro',
        name: 'Outros problemas',
        icon: 'triangle-alert',
      });
    });

    it('hides deactivated categories from citizens and shows them to staff with all=true', async () => {
      const list = await h.http().get('/categories').set(as(UserRole.ADMIN)).expect(200);
      const vias = (list.body as Category[]).find((c) => c.slug === 'vias');

      await h.http().post(`/categories/${vias?.id}/deactivate`).set(as(UserRole.ADMIN)).expect(200);

      const citizen = await h
        .http()
        .get('/categories?all=true')
        .set(as(UserRole.CIDADAO))
        .expect(200);
      expect((citizen.body as Category[]).map((c) => c.slug)).not.toContain('vias');

      const gestor = await h
        .http()
        .get('/categories?all=true')
        .set(as(UserRole.GESTOR))
        .expect(200);
      expect((gestor.body as Category[]).find((c) => c.slug === 'vias')?.active).toBe(false);

      const gestorDefault = await h.http().get('/categories').set(as(UserRole.GESTOR)).expect(200);
      expect((gestorDefault.body as Category[]).map((c) => c.slug)).not.toContain('vias');

      await h.http().post(`/categories/${vias?.id}/activate`).set(as(UserRole.ADMIN)).expect(200);
      const after = await h.http().get('/categories').set(as(UserRole.CIDADAO)).expect(200);
      expect((after.body as Category[]).map((c) => c.slug)).toContain('vias');
    });

    it('returns 404 for unknown ids', async () => {
      await h
        .http()
        .post('/categories/00000000-0000-4000-8000-000000000000/deactivate')
        .set(as(UserRole.ADMIN))
        .expect(404);
      await h.http().patch('/categories/abc').set(as(UserRole.ADMIN)).send({}).expect(404);
    });
  });

  describe('internal API (used by the occurrence-service)', () => {
    it('returns a category, active or not, with the shared secret', async () => {
      const list = await h.http().get('/categories').set(as(UserRole.ADMIN)).expect(200);
      const id = (list.body as Category[])[0]?.id;
      const res = await h
        .http()
        .get(`/internal/categories/${id}`)
        .set('x-internal-token', INTERNAL_TOKEN)
        .expect(200);
      expect(res.body.id).toBe(id);
    });

    it('returns the boundary with the shared secret', async () => {
      const res = await h
        .http()
        .get('/internal/municipality')
        .set('x-internal-token', INTERNAL_TOKEN)
        .expect(200);
      expect(res.body.boundary.type).toBe('MultiPolygon');
    });

    it('rejects calls without the secret, even with an admin token', async () => {
      await h.http().get('/internal/municipality').expect(401);
      await h.http().get('/internal/municipality').set(as(UserRole.ADMIN)).expect(401);
    });

    it('is not part of the public OpenAPI document', async () => {
      const res = await h.http().get('/docs/openapi.json').expect(200);
      expect(Object.keys(res.body.paths).some((p) => p.startsWith('/internal'))).toBe(false);
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining(['/categories', '/categories/{id}', '/municipality']),
      );
    });
  });
});
