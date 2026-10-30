import { randomUUID } from 'node:crypto';

import { EventType, OccurrenceStatus } from '@sinaliza/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CATEGORIES, type Harness, PLACES, startHarness } from './harness.js';

const S = OccurrenceStatus;
const year = new Date().getFullYear();

describe('occurrence-service (e2e)', () => {
  let h: Harness;

  const report = async (
    user: 'maria' | 'joao',
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; reference: string }> => {
    const res = await h
      .http()
      .post('/occurrences')
      .set(h.auth(user))
      .send({
        categoryId: CATEGORIES.vias.id,
        description: 'Buraco grande na faixa de rodagem junto à passadeira.',
        ...PLACES.camara,
        ...overrides,
      })
      .expect(201);
    return res.body as { id: string; reference: string };
  };

  const setStatus = (
    id: string,
    body: Record<string, unknown>,
    user: 'gestor' | 'admin' = 'gestor',
  ) => h.http().post(`/occurrences/${id}/status`).set(h.auth(user)).send(body);

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h?.stop();
  });

  describe('health', () => {
    it('reports every dependency', async () => {
      const res = await h.http().get('/health').expect(200);
      expect(res.body).toEqual({
        status: 'ok',
        checks: { database: 'up', rabbitmq: 'up', storage: 'up', boundary: 'up' },
      });
    });
  });

  describe('POST /locations/validate', () => {
    it('accepts a point inside Barcelos and returns the address', async () => {
      const res = await h
        .http()
        .post('/locations/validate')
        .set(h.auth('maria'))
        .send(PLACES.barcelinhos)
        .expect(200);
      expect(res.body).toEqual({ inside: true, address: 'Largo do Município 1, Barcelos' });
    });

    it('flags a point in a neighbouring municipality', async () => {
      const res = await h
        .http()
        .post('/locations/validate')
        .set(h.auth('maria'))
        .send(PLACES.braga)
        .expect(200);
      expect(res.body.inside).toBe(false);
    });

    it('caches by rounded coordinate and falls back to coordinates when Nominatim fails', async () => {
      const before = h.stubs.nominatimRequests;
      await h
        .http()
        .post('/locations/validate')
        .set(h.auth('maria'))
        .send({ lat: 41.529201, lng: -8.623199 })
        .expect(200);
      expect(h.stubs.nominatimRequests).toBe(before);

      h.stubs.nominatimDown = true;
      try {
        const res = await h
          .http()
          .post('/locations/validate')
          .set(h.auth('maria'))
          .send({ lat: 41.54, lng: -8.6 })
          .expect(200);
        expect(res.body.address).toBe('41.54000, -8.60000');
      } finally {
        h.stubs.nominatimDown = false;
      }
    });

    it('validates the coordinates and the role', async () => {
      const bad = await h
        .http()
        .post('/locations/validate')
        .set(h.auth('maria'))
        .send({ lat: 123, lng: 'x' })
        .expect(400);
      expect(bad.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'lat',
        'lng',
      ]);
      await h
        .http()
        .post('/locations/validate')
        .set(h.auth('gestor'))
        .send(PLACES.camara)
        .expect(403);
      await h.http().post('/locations/validate').send(PLACES.camara).expect(401);
    });
  });

  describe('POST /photos', () => {
    it('stores a compressed JPEG and returns a working pre-signed URL', async () => {
      const png = await sharp({
        create: { width: 2400, height: 1200, channels: 3, background: '#1a6' },
      })
        .png()
        .toBuffer();
      const res = await h
        .http()
        .post('/photos')
        .set(h.auth('maria'))
        .attach('file', png, { filename: 'buraco.png', contentType: 'image/png' })
        .expect(201);
      expect(res.body.photoKey).toMatch(/^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);

      const download = await fetch(res.body.previewUrl as string);
      expect(download.status).toBe(200);
      expect(download.headers.get('content-type')).toBe('image/jpeg');
      const meta = await sharp(Buffer.from(await download.arrayBuffer())).metadata();
      expect([meta.width, meta.height]).toEqual([1600, 800]);
    });

    it('rejects other formats, missing files and staff', async () => {
      const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
        .gif()
        .toBuffer();
      const res = await h
        .http()
        .post('/photos')
        .set(h.auth('maria'))
        .attach('file', gif, { filename: 'a.gif', contentType: 'image/gif' })
        .expect(415);
      expect(res.body.message).toBe('A fotografia tem de ser uma imagem JPEG, PNG ou WebP.');
      await h.http().post('/photos').set(h.auth('maria')).expect(400);
      await h
        .http()
        .post('/photos')
        .set(h.auth('gestor'))
        .attach('file', gif, { filename: 'a.gif' })
        .expect(403);
    });

    it('rejects files over 5 MB', async () => {
      const res = await h
        .http()
        .post('/photos')
        .set(h.auth('maria'))
        .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'big.jpg' })
        .expect(413);
      expect(res.body.message).toBe('O ficheiro é demasiado grande.');
    });
  });

  describe('POST /occurrences', () => {
    it('creates an occurrence with a sequential reference, history and event', async () => {
      const res = await h
        .http()
        .post('/occurrences')
        .set(h.auth('maria'))
        .send({
          categoryId: CATEGORIES.iluminacao.id,
          description: '  Candeeiro apagado há uma semana.  ',
          ...PLACES.camara,
        })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        reference: expect.stringMatching(new RegExp(`^SIN-${year}-\\d{5}$`)),
        status: S.RECEBIDA,
      });

      const event = await h.waitForEvent(
        EventType.OCCURRENCE_CREATED,
        (e) => e.payload.id === res.body.id,
      );
      expect(event.payload).toMatchObject({
        reference: res.body.reference,
        citizen: { name: 'Maria Fernandes', email: 'maria.fernandes@email.pt' },
        category: { slug: 'iluminacao', name: 'Iluminação pública' },
        address: 'Largo do Município 1, Barcelos',
      });

      const { rows } = await h.db.query(
        'SELECT description, lat, lng, category_slug FROM occurrences WHERE id = $1',
        [res.body.id],
      );
      expect(rows[0]).toEqual({
        description: 'Candeeiro apagado há uma semana.',
        lat: PLACES.camara.lat,
        lng: PLACES.camara.lng,
        category_slug: 'iluminacao',
      });
    });

    it('gives unique references to concurrent reports', async () => {
      const created = await Promise.all(Array.from({ length: 8 }, () => report('joao')));
      const refs = created.map((c) => c.reference);
      expect(new Set(refs).size).toBe(8);
    });

    it('rejects a location outside the municipality with 422', async () => {
      const res = await h
        .http()
        .post('/occurrences')
        .set(h.auth('maria'))
        .send({
          categoryId: CATEGORIES.vias.id,
          description: 'Sinal caído no passeio.',
          ...PLACES.braga,
        })
        .expect(422);
      expect(res.body.message).toBe(
        'Esta localização está fora do concelho de Barcelos. O Sinaliza só aceita ocorrências dentro do concelho.',
      );
    });

    it('validates the category with the municipal-service', async () => {
      const send = (categoryId: string) =>
        h
          .http()
          .post('/occurrences')
          .set(h.auth('maria'))
          .send({ categoryId, description: 'Descrição suficiente.', ...PLACES.camara });

      expect((await send(CATEGORIES.antiga.id).expect(422)).body.message).toMatch(
        /já não está disponível/,
      );
      expect((await send(randomUUID()).expect(422)).body.message).toBe(
        'A categoria escolhida não existe.',
      );

      h.stubs.municipalDown = true;
      try {
        await send(CATEGORIES.vias.id).expect(502);
      } finally {
        h.stubs.municipalDown = false;
      }
    });

    it('only accepts photos uploaded by the same citizen', async () => {
      const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } })
        .png()
        .toBuffer();
      const upload = await h
        .http()
        .post('/photos')
        .set(h.auth('joao'))
        .attach('file', png, { filename: 'a.png' })
        .expect(201);
      const photoKey = upload.body.photoKey as string;

      await h
        .http()
        .post('/occurrences')
        .set(h.auth('maria'))
        .send({
          categoryId: CATEGORIES.vias.id,
          description: 'Com a fotografia de outra pessoa.',
          photoKey,
          ...PLACES.camara,
        })
        .expect(422);

      const own = await report('joao', { photoKey });
      const detail = await h.http().get(`/occurrences/${own.id}`).set(h.auth('joao')).expect(200);
      expect(detail.body.photoUrl).toMatch(/^http/);
    });

    it('validates the body and the role', async () => {
      const res = await h
        .http()
        .post('/occurrences')
        .set(h.auth('maria'))
        .send({ categoryId: 'x', description: 'curta', lat: 41.5, extra: 1 })
        .expect(400);
      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'categoryId',
        'description',
        'extra',
        'lng',
      ]);
      await h
        .http()
        .post('/occurrences')
        .set(h.auth('gestor'))
        .send({
          categoryId: CATEGORIES.vias.id,
          description: 'Gestores não reportam.',
          ...PLACES.camara,
        })
        .expect(403);
    });
  });

  describe('citizen views', () => {
    it('lists only the citizen’s own occurrences, by status group', async () => {
      const mine = await report('maria');
      await setStatus(mine.id, { status: S.EM_ANALISE }).expect(200);
      await setStatus(mine.id, { status: S.EM_RESOLUCAO }).expect(200);
      await setStatus(mine.id, { status: S.RESOLVIDA }).expect(200);

      const all = await h.http().get('/occurrences/mine').set(h.auth('maria')).expect(200);
      expect(all.body.items.length).toBeGreaterThanOrEqual(2);
      const resolved = await h
        .http()
        .get('/occurrences/mine?status=resolvidas')
        .set(h.auth('maria'))
        .expect(200);
      expect(resolved.body.items.map((i: { id: string }) => i.id)).toEqual([mine.id]);
      expect(resolved.body.total).toBe(1);

      const joao = await h.http().get('/occurrences/mine').set(h.auth('joao')).expect(200);
      expect(joao.body.items.some((i: { id: string }) => i.id === mine.id)).toBe(false);

      await h.http().get('/occurrences/mine?status=abertas').set(h.auth('maria')).expect(400);
    });

    it('shows the detail to the author and staff only', async () => {
      const { id } = await report('maria');
      const author = await h.http().get(`/occurrences/${id}`).set(h.auth('maria')).expect(200);
      expect(author.body).toMatchObject({
        id,
        status: S.RECEBIDA,
        photoUrl: null,
        original: null,
        allowedTransitions: [S.ANULADA],
        history: [{ from: null, to: S.RECEBIDA, changedByRole: 'CIDADAO' }],
      });
      expect(author.body.citizen).toBeUndefined();

      await h.http().get(`/occurrences/${id}`).set(h.auth('joao')).expect(404);
      await h.http().get('/occurrences/not-a-uuid').set(h.auth('maria')).expect(404);

      const staff = await h.http().get(`/occurrences/${id}`).set(h.auth('gestor')).expect(200);
      expect(staff.body.citizen).toEqual({
        id: expect.any(String),
        name: 'Maria Fernandes',
        email: 'maria.fernandes@email.pt',
      });
      expect(staff.body.allowedTransitions.sort()).toEqual(
        [S.DUPLICADA, S.EM_ANALISE, S.REJEITADA].sort(),
      );
    });

    it('lets the author cancel only while RECEBIDA', async () => {
      const { id } = await report('maria');
      await h.http().post(`/occurrences/${id}/cancel`).set(h.auth('joao')).expect(404);
      await h.http().post(`/occurrences/${id}/cancel`).set(h.auth('gestor')).expect(403);

      const res = await h.http().post(`/occurrences/${id}/cancel`).set(h.auth('maria')).expect(200);
      expect(res.body.status).toBe(S.ANULADA);
      expect(res.body.cancelledAt).not.toBeNull();
      const event = await h.waitForEvent(
        EventType.OCCURRENCE_STATUS_CHANGED,
        (e) => e.payload.id === id,
      );
      expect(event.payload).toMatchObject({ from: S.RECEBIDA, to: S.ANULADA });

      await h.http().post(`/occurrences/${id}/cancel`).set(h.auth('maria')).expect(409);
      const list = await h.http().get('/occurrences/mine').set(h.auth('maria')).expect(200);
      expect(list.body.items.some((i: { id: string }) => i.id === id)).toBe(false);

      const other = await report('maria');
      await setStatus(other.id, { status: S.EM_ANALISE }).expect(200);
      const late = await h
        .http()
        .post(`/occurrences/${other.id}/cancel`)
        .set(h.auth('maria'))
        .expect(409);
      expect(late.body.message).toBe(
        'Não é possível passar uma ocorrência de «Em Análise» para «Anulada».',
      );
    });
  });

  describe('staff actions', () => {
    it('follows the life cycle, recording history and events', async () => {
      const { id, reference } = await report('maria');
      await setStatus(id, { status: S.EM_ANALISE }).expect(200);
      await setStatus(id, { status: S.EM_RESOLUCAO, note: 'Equipa enviada.' }).expect(200);
      const done = await setStatus(id, { status: S.RESOLVIDA, note: 'Reparado.' }, 'admin').expect(
        200,
      );

      expect(done.body.status).toBe(S.RESOLVIDA);
      expect(done.body.resolvedAt).not.toBeNull();
      expect(done.body.allowedTransitions).toEqual([]);
      expect(
        done.body.history.map((e: { from: string | null; to: string; note: string | null }) => [
          e.from,
          e.to,
          e.note,
        ]),
      ).toEqual([
        [null, S.RECEBIDA, null],
        [S.RECEBIDA, S.EM_ANALISE, null],
        [S.EM_ANALISE, S.EM_RESOLUCAO, 'Equipa enviada.'],
        [S.EM_RESOLUCAO, S.RESOLVIDA, 'Reparado.'],
      ]);

      const event = await h.waitForEvent(
        EventType.OCCURRENCE_STATUS_CHANGED,
        (e) => e.payload.id === id && e.payload.to === S.RESOLVIDA,
      );
      expect(event.payload).toMatchObject({
        reference,
        from: S.EM_RESOLUCAO,
        note: 'Reparado.',
        citizen: { email: 'maria.fernandes@email.pt' },
      });

      await setStatus(id, { status: S.EM_ANALISE }).expect(409);
    });

    it('requires a reason of at least 10 characters to reject', async () => {
      const { id } = await report('maria');
      const res = await setStatus(id, { status: S.REJEITADA, reason: ' curta ' }).expect(400);
      expect(res.body.details).toEqual([
        { field: 'reason', messages: ['A fundamentação é obrigatória para rejeitar.'] },
      ]);
      await setStatus(id, { status: S.EM_ANALISE, reason: 'Não se aplica aqui.' }).expect(400);

      const ok = await setStatus(id, {
        status: S.REJEITADA,
        reason: 'Situação em propriedade privada.',
      }).expect(200);
      expect(ok.body.rejectionReason).toBe('Situação em propriedade privada.');
      const event = await h.waitForEvent(
        EventType.OCCURRENCE_STATUS_CHANGED,
        (e) => e.payload.id === id,
      );
      expect(event.payload.reason).toBe('Situação em propriedade privada.');
    });

    it('rejects statuses that need another route and citizens', async () => {
      const { id } = await report('maria');
      await setStatus(id, { status: S.DUPLICADA }).expect(400);
      await setStatus(id, { status: S.ANULADA }).expect(400);
      await h
        .http()
        .post(`/occurrences/${id}/status`)
        .set(h.auth('maria'))
        .send({ status: S.EM_ANALISE })
        .expect(403);
      await setStatus(randomUUID(), { status: S.EM_ANALISE }).expect(404);
    });

    it('marks duplicates, checking the original', async () => {
      const original = await report('joao');
      const copy = await report('maria');
      const dup = (id: string, originalId: string) =>
        h.http().post(`/occurrences/${id}/duplicate`).set(h.auth('gestor')).send({ originalId });

      expect((await dup(copy.id, copy.id).expect(422)).body.message).toBe(
        'Uma ocorrência não pode ser duplicada de si própria.',
      );
      expect((await dup(copy.id, randomUUID()).expect(422)).body.message).toBe(
        'A ocorrência original não existe.',
      );
      const cancelled = await report('joao');
      await h.http().post(`/occurrences/${cancelled.id}/cancel`).set(h.auth('joao')).expect(200);
      expect((await dup(copy.id, cancelled.id).expect(422)).body.message).toBe(
        'A ocorrência original não pode estar duplicada nem anulada.',
      );

      const res = await dup(copy.id, original.id).expect(200);
      expect(res.body.status).toBe(S.DUPLICADA);
      expect(res.body.original).toEqual({ id: original.id, reference: original.reference });
      const event = await h.waitForEvent(
        EventType.OCCURRENCE_STATUS_CHANGED,
        (e) => e.payload.id === copy.id,
      );
      expect(event.payload.originalReference).toBe(original.reference);

      // The citizen sees the original's reference on their own occurrence.
      const seen = await h.http().get(`/occurrences/${copy.id}`).set(h.auth('maria')).expect(200);
      expect(seen.body.original.reference).toBe(original.reference);

      // A duplicate cannot be an original.
      const third = await report('maria');
      await dup(third.id, copy.id).expect(422);
    });

    it('changes the category snapshot', async () => {
      const { id } = await report('maria');
      const change = (categoryId: string) =>
        h.http().patch(`/occurrences/${id}/category`).set(h.auth('gestor')).send({ categoryId });

      await change(CATEGORIES.antiga.id).expect(422);
      const res = await change(CATEGORIES.iluminacao.id).expect(200);
      expect(res.body.category).toEqual({
        id: CATEGORIES.iluminacao.id,
        name: 'Iluminação pública',
        slug: 'iluminacao',
      });

      await h.http().post(`/occurrences/${id}/cancel`).set(h.auth('maria')).expect(200);
      await change(CATEGORIES.vias.id).expect(409);
      await h
        .http()
        .patch(`/occurrences/${id}/category`)
        .set(h.auth('maria'))
        .send({ categoryId: CATEGORIES.vias.id })
        .expect(403);
    });
  });

  describe('GET /occurrences (staff search)', () => {
    it('searches, filters, sorts and paginates', async () => {
      const a = await report('maria', {
        description: 'Contentor do lixo partido em Barcelinhos.',
        ...PLACES.barcelinhos,
      });
      await report('maria', { categoryId: CATEGORIES.iluminacao.id });
      const list = (query: string) =>
        h.http().get(`/occurrences${query}`).set(h.auth('gestor')).expect(200);

      const byText = await list('?q=contentor do LIXO');
      expect(byText.body.items.map((i: { id: string }) => i.id)).toEqual([a.id]);
      expect(byText.body.items[0]).toMatchObject({
        reference: a.reference,
        status: S.RECEBIDA,
        daysOpen: 0,
        category: { slug: 'vias' },
      });

      const byRef = await list(`?q=${a.reference}`);
      expect(byRef.body.total).toBe(1);

      const byCategory = await list('?category=iluminacao&pageSize=100');
      expect(
        byCategory.body.items.every(
          (i: { category: { slug: string } }) => i.category.slug === 'iluminacao',
        ),
      ).toBe(true);

      const box = `${PLACES.barcelinhos.lng - 0.001},${PLACES.barcelinhos.lat - 0.001},${PLACES.barcelinhos.lng + 0.001},${PLACES.barcelinhos.lat + 0.001}`;
      const inBox = await list(`?bbox=${box}&pageSize=100`);
      expect(inBox.body.items.map((i: { id: string }) => i.id)).toContain(a.id);
      expect(
        inBox.body.items.every(
          (i: { lat: number }) => Math.abs(i.lat - PLACES.barcelinhos.lat) <= 0.001,
        ),
      ).toBe(true);

      const page = await list('?pageSize=2&page=2&sort=reference');
      expect(page.body.items).toHaveLength(2);
      expect(page.body.page).toBe(2);
      expect(page.body.items[0].reference < page.body.items[1].reference).toBe(true);

      const today = new Date().toISOString().slice(0, 10);
      expect((await list(`?from=${today}&to=${today}`)).body.total).toBeGreaterThan(0);
      expect((await list('?to=2000-01-01')).body.total).toBe(0);
    });

    it('hides cancelled occurrences unless asked for', async () => {
      const { id } = await report('maria');
      await h.http().post(`/occurrences/${id}/cancel`).set(h.auth('maria')).expect(200);
      const ids = async (query: string) =>
        (
          await h.http().get(`/occurrences${query}`).set(h.auth('gestor')).expect(200)
        ).body.items.map((i: { id: string }) => i.id) as string[];

      expect(await ids('?pageSize=100')).not.toContain(id);
      expect(await ids('?status=ANULADA&pageSize=100')).toContain(id);
    });

    it('validates the filters and the role', async () => {
      await h.http().get('/occurrences?status=ABERTA').set(h.auth('gestor')).expect(400);
      await h.http().get('/occurrences?bbox=1,2,3').set(h.auth('gestor')).expect(400);
      await h.http().get('/occurrences?sort=random').set(h.auth('gestor')).expect(400);
      await h.http().get('/occurrences?from=31-12-2026').set(h.auth('gestor')).expect(400);
      await h.http().get('/occurrences').set(h.auth('maria')).expect(403);
    });
  });

  describe('public map', () => {
    it('returns pins without author data and never cancelled ones', async () => {
      const visible = await report('maria', { ...PLACES.barcelinhos });
      const cancelled = await report('maria');
      await h.http().post(`/occurrences/${cancelled.id}/cancel`).set(h.auth('maria')).expect(200);

      const res = await h.http().get('/map/occurrences').set(h.auth('joao')).expect(200);
      expect(res.body.truncated).toBe(false);
      const ids = res.body.items.map((i: { id: string }) => i.id);
      expect(ids).toContain(visible.id);
      expect(ids).not.toContain(cancelled.id);
      const pin = res.body.items.find((i: { id: string }) => i.id === visible.id);
      expect(Object.keys(pin).sort()).toEqual(
        ['category', 'createdAt', 'id', 'lat', 'lng', 'reference', 'status'].sort(),
      );
      expect(JSON.stringify(res.body)).not.toMatch(/maria|citizen/i);

      const detail = await h
        .http()
        .get(`/map/occurrences/${visible.id}`)
        .set(h.auth('joao'))
        .expect(200);
      expect(detail.body).toMatchObject({ id: visible.id, address: expect.any(String) });
      expect(JSON.stringify(detail.body)).not.toMatch(/maria|citizen/i);
      await h.http().get(`/map/occurrences/${cancelled.id}`).set(h.auth('joao')).expect(404);
    });

    it('filters by bbox, category and status', async () => {
      const box = `${PLACES.barcelinhos.lng - 0.0005},${PLACES.barcelinhos.lat - 0.0005},${PLACES.barcelinhos.lng + 0.0005},${PLACES.barcelinhos.lat + 0.0005}`;
      const res = await h
        .http()
        .get(`/map/occurrences?bbox=${box}&category=vias&status=RECEBIDA`)
        .set(h.auth('gestor'))
        .expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      for (const pin of res.body.items as Array<{ status: string; category: { slug: string } }>) {
        expect(pin.status).toBe(S.RECEBIDA);
        expect(pin.category.slug).toBe('vias');
      }
      await h.http().get('/map/occurrences?status=ANULADA').set(h.auth('joao')).expect(400);
      await h.http().get('/map/occurrences').expect(401);
    });
  });

  describe('GET /stats/dashboard', () => {
    it('computes the indicators from the operational database', async () => {
      const res = await h.http().get('/stats/dashboard').set(h.auth('gestor')).expect(200);
      const body = res.body;
      expect(body.source).toBe('postgres');
      expect(body.totals.total).toBeGreaterThan(10);
      expect(body.totals.resolvedInPeriod).toBeGreaterThanOrEqual(2);
      expect(body.totals.avgResolutionDays).toBe(0);
      expect(body.totals.rejectionRate).toBeGreaterThan(0);
      expect(body.totals.duplicateRate).toBeGreaterThan(0);
      expect(body.byStatus.find((s: { status: string }) => s.status === S.ANULADA)).toBeUndefined();
      expect(body.byCategory.map((c: { slug: string }) => c.slug)).toContain('vias');
      expect(body.monthlyTrend).toHaveLength(12);
      expect(body.monthlyTrend.at(-1).created).toBe(body.totals.total);
      expect(body.hotspots[0].count).toBeGreaterThan(1);

      const { rows } = await h.db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM occurrences WHERE status <> 'ANULADA'",
      );
      expect(body.totals.total).toBe(rows[0]?.n);
    });

    it('validates the period and the role', async () => {
      const empty = await h
        .http()
        .get('/stats/dashboard?from=2020-01-01&to=2020-02-15')
        .set(h.auth('admin'))
        .expect(200);
      expect(empty.body.totals).toMatchObject({
        total: 0,
        rejectionRate: 0,
        avgResolutionDays: null,
      });
      expect(empty.body.monthlyTrend.map((m: { month: string }) => m.month)).toEqual([
        '2020-01',
        '2020-02',
      ]);
      await h
        .http()
        .get('/stats/dashboard?from=2026-02-01&to=2026-01-01')
        .set(h.auth('gestor'))
        .expect(400);
      await h.http().get('/stats/dashboard').set(h.auth('maria')).expect(403);
    });
  });
});
