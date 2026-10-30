// Functional requirements RF01–RF20, checked end to end through the API gateway against the
// running stack (docker compose) after the demo seed. Each test name starts with the requirement
// it covers; `summary.ts` groups the results into the ✅/❌ table printed by scripts/verificar.sh.
// What the apps add on top (screens, the review step of RF19) is tested in their own packages.
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { api, login, type Session, waitForEmail } from './api.ts';
import { cleanup } from './cleanup.ts';
import { DEMO, TEST_CATEGORY_PREFIX, TEST_EMAIL_DOMAIN } from './env.ts';

const run = randomBytes(3).toString('hex');
const emailOf = (who: string): string => `${who}-${run}@${TEST_EMAIL_DOMAIN}`;

const INSIDE = { lat: 41.5317, lng: -8.6194 }; // Câmara Municipal de Barcelos
const OUTSIDE = { lat: 41.5454, lng: -8.4265 }; // Braga
const REFERENCE = /^SIN-\d{4}-\d{5}$/;
// 64×48 JPEG, the kind of photo the apps upload.
const JPEG = Buffer.from(
  '/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAwAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAME/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AigGtEAAAAAAAAAAAAAAAAAAAAAB//9k=',
  'base64',
);

interface Category {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

interface Created {
  id: string;
  reference: string;
  status: string;
}

interface Detail extends Created {
  category: { id: string; slug: string; name: string };
  description: string;
  address: string;
  photoUrl: string | null;
  rejectionReason: string | null;
  original: { id: string; reference: string } | null;
  resolvedAt: string | null;
  history: Array<{ from: string | null; to: string; note: string | null; reason: string | null }>;
  allowedTransitions: string[];
  citizen?: { id: string; name: string; email: string };
}

interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const S = {
  RECEBIDA: 'RECEBIDA',
  EM_ANALISE: 'EM_ANALISE',
  EM_RESOLUCAO: 'EM_RESOLUCAO',
  RESOLVIDA: 'RESOLVIDA',
  REJEITADA: 'REJEITADA',
  DUPLICADA: 'DUPLICADA',
  ANULADA: 'ANULADA',
} as const;

describe('Requisitos funcionais (RF01–RF20)', () => {
  let admin: Session;
  let gestor: Session;
  let citizen: Session;
  let other: Session;
  let citizenPassword = 'Verificar123';
  let categories: Category[] = [];
  /** The main occurrence, taken through the whole life cycle. */
  let main: Created;
  let photoKey: string;

  const category = (slug: string): Category => {
    const found = categories.find((c) => c.slug === slug);
    if (!found) throw new Error(`categoria ${slug} não existe`);
    return found;
  };

  const report = async (who: Session, overrides: Record<string, unknown> = {}) =>
    api<Created>('POST', '/occurrences', {
      token: who.accessToken,
      json: {
        categoryId: category('vias').id,
        description: `Verificação automática ${run}: buraco na via junto à passadeira.`,
        ...INSIDE,
        ...overrides,
      },
    });

  const setStatus = (id: string, json: Record<string, unknown>, who: Session = gestor) =>
    api<Detail>('POST', `/occurrences/${id}/status`, { token: who.accessToken, json });

  beforeAll(async () => {
    admin = await login(DEMO.admin.email, DEMO.admin.password);
    gestor = await login(DEMO.gestor.email, DEMO.gestor.password);
  });

  afterAll(async () => {
    if (process.env.SINALIZA_KEEP_TEST_DATA) return;
    await cleanup();
  });

  // ---------------------------------------------------------------- demo data

  it('SEED · dados de demonstração: contas, ocorrências da Maria e mapa preenchido', async () => {
    const maria = await login(DEMO.maria.email, DEMO.maria.password);
    expect(maria.user.role).toBe('CIDADAO');
    const mine = await api<Page<Created>>('GET', '/occurrences/mine?pageSize=50', {
      token: maria.accessToken,
    });
    expect(mine.body.items.map((o) => [o.reference, o.status])).toEqual(
      expect.arrayContaining([
        ['SIN-2026-00482', S.RECEBIDA],
        ['SIN-2026-00451', S.EM_RESOLUCAO],
        ['SIN-2026-00397', S.RESOLVIDA],
        ['SIN-2026-00310', S.DUPLICADA],
      ]),
    );
    const map = await api<{ items: unknown[] }>('GET', '/map/occurrences', {
      token: maria.accessToken,
    });
    expect(map.body.items.length).toBeGreaterThanOrEqual(40);
  });

  // ---------------------------------------------------------------- RF01

  it('RF01 · registo cria uma conta de cidadão e envia o email de boas-vindas', async () => {
    const res = await api<Session['user']>('POST', '/auth/register', {
      json: { name: 'Cidadão Verificação', email: emailOf('cidadao'), password: citizenPassword },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: emailOf('cidadao'), role: 'CIDADAO' });

    const again = await api('POST', '/auth/register', {
      json: { name: 'Outra', email: emailOf('cidadao'), password: citizenPassword },
    });
    expect(again.status).toBe(409);

    const weak = await api('POST', '/auth/register', {
      json: { name: 'Fraca', email: emailOf('fraca'), password: 'curta' },
    });
    expect(weak.status).toBe(400);

    await waitForEmail(emailOf('cidadao'), /Bem-vindo/);
  });

  it('RF01 · login, renovação rotativa da sessão e logout', async () => {
    const wrong = await api('POST', '/auth/login', {
      json: { email: emailOf('cidadao'), password: 'Errada12345' },
    });
    expect(wrong.status).toBe(401);

    citizen = await login(emailOf('cidadao'), citizenPassword);
    expect(citizen.accessToken.split('.')).toHaveLength(3);

    const refreshed = await api<Session>('POST', '/auth/refresh', {
      json: { refreshToken: citizen.refreshToken },
    });
    expect(refreshed.status).toBe(200);
    const reused = await api('POST', '/auth/refresh', {
      json: { refreshToken: citizen.refreshToken },
    });
    expect(reused.status).toBe(401);

    // Reusing a rotated token revokes the session; start a fresh one and close it properly.
    citizen = await login(emailOf('cidadao'), citizenPassword);
    const spare = await api<Session>('POST', '/auth/refresh', {
      json: { refreshToken: citizen.refreshToken },
    });
    citizen = { ...citizen, ...spare.body };
    const logout = await api('POST', '/auth/logout', {
      token: citizen.accessToken,
      json: { refreshToken: citizen.refreshToken },
    });
    expect(logout.status).toBe(204);
    const afterLogout = await api('POST', '/auth/refresh', {
      json: { refreshToken: citizen.refreshToken },
    });
    expect(afterLogout.status).toBe(401);

    await api('POST', '/auth/register', {
      json: { name: 'Vizinho Verificação', email: emailOf('outro'), password: citizenPassword },
    });
    other = await login(emailOf('outro'), citizenPassword);
  });

  // ---------------------------------------------------------------- RF02

  it('RF02 · controlo de acesso por perfil no gateway e nos serviços', async () => {
    expect((await api('GET', '/occurrences/mine')).status).toBe(401);
    expect((await api('GET', '/occurrences/mine', { token: 'invalido.token.jwt' })).status).toBe(
      401,
    );
    expect((await api('GET', '/occurrences', { token: citizen.accessToken })).status).toBe(403);
    expect((await api('GET', '/stats/dashboard', { token: citizen.accessToken })).status).toBe(403);
    expect((await api('GET', '/users', { token: gestor.accessToken })).status).toBe(403);
    expect(
      (
        await api('POST', '/categories', {
          token: gestor.accessToken,
          json: { name: 'Proibida', icon: 'wrench' },
        })
      ).status,
    ).toBe(403);
    expect((await api('GET', '/occurrences', { token: gestor.accessToken })).status).toBe(200);
    expect((await api('GET', '/occurrences', { token: admin.accessToken })).status).toBe(200);
    expect((await api('GET', '/users', { token: admin.accessToken })).status).toBe(200);
    // Internal service-to-service routes are never reachable from outside.
    expect((await api('GET', '/internal/municipality', { token: admin.accessToken })).status).toBe(
      404,
    );
  });

  // ---------------------------------------------------------------- RF03 / RF19

  it('RF03 · registar ocorrência com categoria, fotografia, descrição e localização', async () => {
    const list = await api<Category[]>('GET', '/categories', { token: citizen.accessToken });
    expect(list.status).toBe(200);
    categories = list.body;
    expect(categories.map((c) => c.slug)).toEqual(
      expect.arrayContaining([
        'vias',
        'iluminacao',
        'residuos',
        'sinalizacao',
        'passeios',
        'outro',
      ]),
    );

    const form = new FormData();
    form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'foto.jpg');
    const photo = await api<{ photoKey: string; previewUrl: string }>('POST', '/photos', {
      token: citizen.accessToken,
      form,
    });
    expect(photo.status).toBe(201);
    photoKey = photo.body.photoKey;
    expect((await fetch(photo.body.previewUrl)).status).toBe(200);

    const short = await report(citizen, { description: 'curta' });
    expect(short.status).toBe(400);

    const res = await report(citizen, { photoKey });
    expect(res.status).toBe(201);
    main = res.body;
    expect(main.status).toBe(S.RECEBIDA);
    await waitForEmail(emailOf('cidadao'), new RegExp(`${main.reference} recebida`));
  });

  it('RF19 · a submissão devolve a referência SIN-AAAA-NNNNN e os dados revistos', async () => {
    expect(main.reference).toMatch(REFERENCE);
    const detail = await api<Detail>('GET', `/occurrences/${main.id}`, {
      token: citizen.accessToken,
    });
    expect(detail.body).toMatchObject({
      reference: main.reference,
      category: { slug: 'vias' },
      description: `Verificação automática ${run}: buraco na via junto à passadeira.`,
    });
    expect(detail.body.photoUrl).toMatch(/^https?:\/\//);
    expect(detail.body.address.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------- RF04 / RF14

  it('RF04 · as minhas ocorrências mostram só as do próprio cidadão', async () => {
    const mine = await api<Page<Created>>('GET', '/occurrences/mine', {
      token: citizen.accessToken,
    });
    expect(mine.status).toBe(200);
    expect(mine.body.items.map((o) => o.reference)).toEqual([main.reference]);
    const open = await api<Page<Created>>('GET', '/occurrences/mine?status=em_curso', {
      token: citizen.accessToken,
    });
    expect(open.body.total).toBe(1);
    const others = await api<Page<Created>>('GET', '/occurrences/mine', {
      token: other.accessToken,
    });
    expect(others.body.items.map((o) => o.id)).not.toContain(main.id);
  });

  it('RF14 · detalhe com histórico; outro cidadão não lhe acede', async () => {
    const detail = await api<Detail>('GET', `/occurrences/${main.id}`, {
      token: citizen.accessToken,
    });
    expect(detail.body.history.map((e) => e.to)).toEqual([S.RECEBIDA]);
    expect(detail.body.allowedTransitions).toEqual([S.ANULADA]);
    expect((await api('GET', `/occurrences/${main.id}`, { token: other.accessToken })).status).toBe(
      404,
    );
    const staff = await api<Detail>('GET', `/occurrences/${main.id}`, {
      token: gestor.accessToken,
    });
    expect(staff.body.citizen?.email).toBe(emailOf('cidadao'));
    expect(staff.body.allowedTransitions).toEqual(
      expect.arrayContaining([S.EM_ANALISE, S.REJEITADA, S.DUPLICADA]),
    );
  });

  // ---------------------------------------------------------------- RF11 / RF12 / RF15

  it('RF11 · geolocalização: morada aproximada, limite do concelho e mapa', async () => {
    const check = await api<{ inside: boolean; address: string }>('POST', '/locations/validate', {
      token: citizen.accessToken,
      json: INSIDE,
    });
    expect(check.status).toBe(200);
    expect(check.body.inside).toBe(true);
    expect(check.body.address.length).toBeGreaterThan(0);

    const municipality = await api<{ name: string; boundary: { type: string } }>(
      'GET',
      '/municipality',
      { token: citizen.accessToken },
    );
    expect(municipality.body.name).toBe('Barcelos');
    expect(municipality.body.boundary.type).toBe('MultiPolygon');

    const bbox = '-8.63,41.52,-8.61,41.54';
    const map = await api<{ items: Array<{ id: string; lat: number; lng: number }> }>(
      'GET',
      `/map/occurrences?bbox=${bbox}`,
      { token: other.accessToken },
    );
    const pin = map.body.items.find((p) => p.id === main.id);
    expect(pin?.lat).toBeCloseTo(INSIDE.lat, 4);
    expect(pin?.lng).toBeCloseTo(INSIDE.lng, 4);
  });

  it('RF12 · localizações fora do concelho de Barcelos são recusadas', async () => {
    const check = await api<{ inside: boolean }>('POST', '/locations/validate', {
      token: citizen.accessToken,
      json: OUTSIDE,
    });
    expect(check.body.inside).toBe(false);
    const res = await report(citizen, OUTSIDE);
    expect(res.status).toBe(422);
    expect((res.body as unknown as { message: string }).message).toMatch(
      /fora do concelho de Barcelos/,
    );
  });

  it('RF15 · o mapa público não identifica o autor', async () => {
    const allowed = ['id', 'reference', 'status', 'category', 'lat', 'lng', 'createdAt'];
    const map = await api<{ items: Array<Record<string, unknown>> }>('GET', '/map/occurrences', {
      token: other.accessToken,
    });
    for (const pin of map.body.items) {
      expect(Object.keys(pin).filter((k) => !allowed.includes(k))).toEqual([]);
    }
    const detail = await api<Record<string, unknown>>('GET', `/map/occurrences/${main.id}`, {
      token: other.accessToken,
    });
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toMatch(/citizen|cidadao-|Cidadão Verificação/);
  });

  // ---------------------------------------------------------------- RF16

  it('RF16 · o gestor pesquisa, filtra e pagina as ocorrências', async () => {
    const byReference = await api<Page<Created>>(
      'GET',
      `/occurrences?q=${encodeURIComponent(main.reference)}`,
      { token: gestor.accessToken },
    );
    expect(byReference.body.items.map((o) => o.id)).toEqual([main.id]);

    const filtered = await api<Page<Created & { category: { slug: string } }>>(
      'GET',
      '/occurrences?status=RECEBIDA&category=vias&pageSize=100',
      { token: gestor.accessToken },
    );
    expect(filtered.body.items.map((o) => o.id)).toContain(main.id);
    expect(
      filtered.body.items.every((o) => o.status === S.RECEBIDA && o.category.slug === 'vias'),
    ).toBe(true);

    const page = await api<Page<Created>>('GET', '/occurrences?page=2&pageSize=5', {
      token: gestor.accessToken,
    });
    expect(page.body).toMatchObject({ page: 2, pageSize: 5 });
    expect(page.body.items).toHaveLength(5);
    expect(page.body.total).toBeGreaterThanOrEqual(40);
  });

  // ---------------------------------------------------------------- RF06 / RF07 / RF08 / RF05

  it('RF06 · validar e rejeitar (a rejeição exige fundamentação)', async () => {
    const rejectable = await report(citizen);
    expect(rejectable.status).toBe(201);
    const id = rejectable.body.id;

    expect((await setStatus(id, { status: S.REJEITADA })).status).toBe(400);
    expect((await setStatus(id, { status: S.REJEITADA, reason: 'curta' })).status).toBe(400);
    const reason = 'O local é propriedade privada; a reparação cabe ao proprietário.';
    const rejected = await setStatus(id, { status: S.REJEITADA, reason });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ status: S.REJEITADA, rejectionReason: reason });
    const email = await waitForEmail(
      emailOf('cidadao'),
      new RegExp(`${rejectable.body.reference}: Rejeitada`),
    );
    expect(email.text).toContain(reason);

    const validated = await setStatus(main.id, { status: S.EM_ANALISE });
    expect(validated.status).toBe(200);
    expect(validated.body.status).toBe(S.EM_ANALISE);
  });

  it('RF07 · o gestor altera a categoria; o cidadão não pode', async () => {
    const target = category('iluminacao');
    const denied = await api('PATCH', `/occurrences/${main.id}/category`, {
      token: citizen.accessToken,
      json: { categoryId: target.id },
    });
    expect(denied.status).toBe(403);
    const res = await api<Detail>('PATCH', `/occurrences/${main.id}/category`, {
      token: gestor.accessToken,
      json: { categoryId: target.id },
    });
    expect(res.status).toBe(200);
    expect(res.body.category).toMatchObject({ id: target.id, slug: 'iluminacao' });
  });

  it('RF08 · ciclo de vida Em Análise → Em Resolução → Resolvida; transições inválidas dão 409', async () => {
    expect((await setStatus(main.id, { status: S.RESOLVIDA })).status).toBe(409);
    const inProgress = await setStatus(main.id, {
      status: S.EM_RESOLUCAO,
      note: 'Reparação agendada para esta semana.',
    });
    expect(inProgress.status).toBe(200);
    const resolved = await setStatus(main.id, { status: S.RESOLVIDA, note: 'Reparado.' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.resolvedAt).not.toBeNull();
    expect(resolved.body.history.map((e) => e.to)).toEqual([
      S.RECEBIDA,
      S.EM_ANALISE,
      S.EM_RESOLUCAO,
      S.RESOLVIDA,
    ]);
    expect((await setStatus(main.id, { status: S.EM_ANALISE })).status).toBe(409);
  });

  it('RF05 · o cidadão recebe um email a cada mudança de estado', async () => {
    for (const label of ['Em Análise', 'Em Resolução', 'Resolvida']) {
      const email = await waitForEmail(
        emailOf('cidadao'),
        new RegExp(`${main.reference}: ${label}`),
      );
      expect(email.html).toContain(main.reference);
      expect(email.text.length).toBeGreaterThan(0);
    }
  });

  // ---------------------------------------------------------------- RF09 / RF20

  it('RF09 · marcar como duplicada associa à ocorrência original', async () => {
    const copy = await report(citizen);
    const id = copy.body.id;
    const self = await api('POST', `/occurrences/${id}/duplicate`, {
      token: gestor.accessToken,
      json: { originalId: id },
    });
    expect(self.status).toBe(422);
    const res = await api<Detail>('POST', `/occurrences/${id}/duplicate`, {
      token: gestor.accessToken,
      json: { originalId: main.id },
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(S.DUPLICADA);
    expect(res.body.original).toEqual({ id: main.id, reference: main.reference });
    const email = await waitForEmail(
      emailOf('cidadao'),
      new RegExp(`${copy.body.reference}: Duplicada`),
    );
    expect(email.text).toContain(main.reference);
  });

  it('RF20 · o cidadão anula a sua ocorrência só enquanto está Recebida', async () => {
    const fresh = await report(citizen);
    const id = fresh.body.id;
    expect(
      (await api('POST', `/occurrences/${id}/cancel`, { token: other.accessToken })).status,
    ).toBe(404);
    const cancelled = await api<Detail>('POST', `/occurrences/${id}/cancel`, {
      token: citizen.accessToken,
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe(S.ANULADA);
    expect(
      (await api('POST', `/occurrences/${id}/cancel`, { token: citizen.accessToken })).status,
    ).toBe(409);
    expect(
      (await api('POST', `/occurrences/${main.id}/cancel`, { token: citizen.accessToken })).status,
    ).toBe(409);

    const mine = await api<Page<Created>>('GET', '/occurrences/mine?pageSize=50', {
      token: citizen.accessToken,
    });
    expect(mine.body.items.map((o) => o.id)).not.toContain(id);
    const map = await api<{ items: Array<{ id: string }> }>('GET', '/map/occurrences', {
      token: other.accessToken,
    });
    expect(map.body.items.map((p) => p.id)).not.toContain(id);
    const staff = await api<Page<Created>>('GET', '/occurrences?status=ANULADA&pageSize=100', {
      token: gestor.accessToken,
    });
    expect(staff.body.items.map((o) => o.id)).toContain(id);
  });

  // ---------------------------------------------------------------- RF10 / RF17

  it('RF10 · o administrador gere categorias e contas de gestor', async () => {
    const name = `${TEST_CATEGORY_PREFIX}${run}`;
    const created = await api<Category>('POST', '/categories', {
      token: admin.accessToken,
      json: { name, icon: 'wrench' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name, active: true });
    const deactivated = await api<Category>('POST', `/categories/${created.body.id}/deactivate`, {
      token: admin.accessToken,
    });
    expect(deactivated.body.active).toBe(false);
    const visible = await api<Category[]>('GET', '/categories', { token: citizen.accessToken });
    expect(visible.body.map((c) => c.id)).not.toContain(created.body.id);

    const account = await api<{ user: Session['user']; temporaryPassword: string }>(
      'POST',
      '/users/gestores',
      { token: admin.accessToken, json: { name: 'Gestor Verificação', email: emailOf('gestor') } },
    );
    expect(account.status).toBe(201);
    expect(account.body.user.role).toBe('GESTOR');
    const newGestor = await login(emailOf('gestor'), account.body.temporaryPassword);
    expect((await api('GET', '/occurrences', { token: newGestor.accessToken })).status).toBe(200);
    const listed = await api<Page<Session['user']>>(
      'GET',
      `/users?role=GESTOR&q=${encodeURIComponent(emailOf('gestor'))}`,
      { token: admin.accessToken },
    );
    expect(listed.body.total).toBe(1);
  });

  it('RF17 · dashboard de indicadores', async () => {
    const res = await api<{
      source: string;
      updatedAt: string;
      totals: { total: number; open: number; avgResolutionDays: number | null };
      byStatus: unknown[];
      byCategory: unknown[];
      monthlyTrend: unknown[];
      hotspots: unknown[];
    }>('GET', '/stats/dashboard?from=2026-01-01', { token: gestor.accessToken });
    expect(res.status).toBe(200);
    expect(['postgres', 'databricks']).toContain(res.body.source);
    expect(Date.parse(res.body.updatedAt)).not.toBeNaN();
    expect(res.body.totals.total).toBeGreaterThanOrEqual(40);
    expect(res.body.byStatus.length).toBeGreaterThan(0);
    expect(res.body.byCategory.length).toBeGreaterThan(0);
    expect(res.body.monthlyTrend.length).toBeGreaterThan(0);
    expect(res.body.hotspots.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------- RF18 / RF13

  it('RF18 · perfil: consultar, alterar dados e mudar a palavra-passe', async () => {
    const me = await api<Session['user']>('GET', '/users/me', { token: citizen.accessToken });
    expect(me.body.email).toBe(emailOf('cidadao'));
    const updated = await api<Session['user'] & { phone: string }>('PATCH', '/users/me', {
      token: citizen.accessToken,
      json: { name: 'Cidadã Verificação', phone: '+351 912 000 000' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: 'Cidadã Verificação', phone: '+351 912 000 000' });

    const wrong = await api('POST', '/users/me/password', {
      token: citizen.accessToken,
      json: { currentPassword: 'Errada12345', newPassword: 'Mudada12345' },
    });
    expect(wrong.status).toBe(400);
    const changed = await api('POST', '/users/me/password', {
      token: citizen.accessToken,
      json: { currentPassword: citizenPassword, newPassword: 'Mudada12345' },
    });
    expect(changed.status).toBe(204);
    citizenPassword = 'Mudada12345';
  });

  it('RF13 · recuperar a palavra-passe por email', async () => {
    const unknown = await api('POST', '/auth/forgot-password', {
      json: { email: emailOf('ninguem') },
    });
    expect(unknown.status).toBe(202);
    const asked = await api('POST', '/auth/forgot-password', {
      json: { email: emailOf('cidadao') },
    });
    expect(asked.status).toBe(202);

    const email = await waitForEmail(emailOf('cidadao'), /Redefinir a palavra-passe/);
    const token = /[?&]token=([\w-]+)/.exec(email.text)?.[1];
    expect(token).toBeDefined();
    const reset = await api('POST', '/auth/reset-password', {
      json: { token, newPassword: 'Recuperada123' },
    });
    expect(reset.status).toBe(204);
    const reused = await api('POST', '/auth/reset-password', {
      json: { token, newPassword: 'OutraVez123' },
    });
    expect(reused.status).toBe(400);
    const session = await login(emailOf('cidadao'), 'Recuperada123');
    expect(session.user.email).toBe(emailOf('cidadao'));
  });
});
