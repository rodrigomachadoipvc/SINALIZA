import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN, GESTOR, type Harness, MARIA, startHarness } from './harness.js';

describe('users (e2e)', () => {
  let h: Harness;
  let admin: string;
  let gestor: string;

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    h = await startHarness();
    admin = (await h.login(ADMIN.email, ADMIN.password)).accessToken;
    gestor = (await h.login(GESTOR.email, GESTOR.password)).accessToken;
  });

  afterAll(async () => {
    await h?.stop();
  });

  describe('profile (RF18)', () => {
    it('updates name and phone, and clears the phone with an empty string', async () => {
      const email = 'perfil@email.pt';
      await h.http().post('/auth/register').send({ name: 'Perfil', email, password: 'Perfil123' });
      const { accessToken } = await h.login(email, 'Perfil123');

      const updated = await h
        .http()
        .patch('/users/me')
        .set(as(accessToken))
        .send({ name: 'Perfil Atualizado', phone: '+351 912 000 000' })
        .expect(200);
      expect(updated.body).toMatchObject({ name: 'Perfil Atualizado', phone: '+351 912 000 000' });

      const cleared = await h
        .http()
        .patch('/users/me')
        .set(as(accessToken))
        .send({ phone: '' })
        .expect(200);
      expect(cleared.body.phone).toBeNull();
    });

    it('does not allow changing the email', async () => {
      const { accessToken } = await h.login(MARIA.email, MARIA.password);
      const res = await h
        .http()
        .patch('/users/me')
        .set(as(accessToken))
        .send({ email: 'outro@email.pt' })
        .expect(400);
      expect(res.body.details[0].field).toBe('email');
    });

    it('changes the password only with the current one', async () => {
      const email = 'mudar@email.pt';
      await h.http().post('/auth/register').send({ name: 'Mudar', email, password: 'Mudar1234' });
      const { accessToken } = await h.login(email, 'Mudar1234');

      const wrong = await h
        .http()
        .post('/users/me/password')
        .set(as(accessToken))
        .send({ currentPassword: 'Errada123', newPassword: 'Nova12345' })
        .expect(400);
      expect(wrong.body.message).toBe('A palavra-passe atual está incorreta.');

      await h
        .http()
        .post('/users/me/password')
        .set(as(accessToken))
        .send({ currentPassword: 'Mudar1234', newPassword: 'Nova12345' })
        .expect(204);
      await h.login(email, 'Nova12345');
    });
  });

  describe('RBAC', () => {
    it('forbids a gestor from /users (403)', async () => {
      const res = await h.http().get('/users').set(as(gestor)).expect(403);
      expect(res.body.message).toBe('Não tem permissão para realizar esta ação.');
    });

    it('forbids a citizen from creating gestores (403)', async () => {
      const { accessToken } = await h.login(MARIA.email, MARIA.password);
      await h
        .http()
        .post('/users/gestores')
        .set(as(accessToken))
        .send({ name: 'Falso', email: 'falso@cm.pt' })
        .expect(403);
    });

    it('requires a token (401)', async () => {
      await h.http().get('/users').expect(401);
    });
  });

  describe('gestor management (RF10)', () => {
    it('lists users filtered by role and search', async () => {
      const res = await h.http().get('/users').query({ role: 'GESTOR' }).set(as(admin)).expect(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 20 });
      expect(res.body.items.every((u: { role: string }) => u.role === 'GESTOR')).toBe(true);
      expect(res.body.total).toBe(res.body.items.length);

      const search = await h.http().get('/users').query({ q: 'MARIA' }).set(as(admin)).expect(200);
      expect(search.body.items.map((u: { email: string }) => u.email)).toContain(MARIA.email);
    });

    it('validates pagination', async () => {
      await h.http().get('/users').query({ page: 0 }).set(as(admin)).expect(400);
    });

    it('creates a gestor with a generated temporary password that works once', async () => {
      const res = await h
        .http()
        .post('/users/gestores')
        .set(as(admin))
        .send({ name: 'Joana Lopes', email: 'Joana.Lopes@cm-barcelos.pt' })
        .expect(201);
      expect(res.body.user).toMatchObject({ role: 'GESTOR', email: 'joana.lopes@cm-barcelos.pt' });
      expect(res.body.temporaryPassword).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{12}$/);

      const login = await h.login('joana.lopes@cm-barcelos.pt', res.body.temporaryPassword);
      expect(login.accessToken).toBeTruthy();

      await h
        .http()
        .post('/users/gestores')
        .set(as(admin))
        .send({ name: 'Duplicado', email: 'joana.lopes@cm-barcelos.pt' })
        .expect(409);
    });

    it('deactivates an account, ending its sessions, and reactivates it', async () => {
      const created = await h
        .http()
        .post('/users/gestores')
        .set(as(admin))
        .send({ name: 'Temporario', email: 'temp@cm-barcelos.pt', temporaryPassword: 'Temp12345' })
        .expect(201);
      const id = created.body.user.id as string;
      const session = await h.login('temp@cm-barcelos.pt', 'Temp12345');

      const off = await h.http().post(`/users/${id}/deactivate`).set(as(admin)).expect(200);
      expect(off.body.active).toBe(false);

      const blocked = await h
        .http()
        .post('/auth/login')
        .send({ email: 'temp@cm-barcelos.pt', password: 'Temp12345' })
        .expect(403);
      expect(blocked.body.message).toMatch(/desativada/);
      await h.http().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);

      await h.http().post(`/users/${id}/activate`).set(as(admin)).expect(200);
      await h.login('temp@cm-barcelos.pt', 'Temp12345');
    });

    it('edits another user', async () => {
      const list = await h.http().get('/users').query({ q: 'gestor@' }).set(as(admin)).expect(200);
      const id = list.body.items[0].id as string;
      const res = await h
        .http()
        .patch(`/users/${id}`)
        .set(as(admin))
        .send({ name: 'Gestor Principal' })
        .expect(200);
      expect(res.body.name).toBe('Gestor Principal');
    });

    it('does not let the admin deactivate their own account', async () => {
      const me = await h.http().get('/users/me').set(as(admin)).expect(200);
      await h.http().post(`/users/${me.body.id}/deactivate`).set(as(admin)).expect(409);
    });

    it('returns 404 for unknown or malformed ids', async () => {
      await h
        .http()
        .post('/users/00000000-0000-4000-8000-000000000000/deactivate')
        .set(as(admin))
        .expect(404);
      await h.http().patch('/users/not-a-uuid').set(as(admin)).send({ name: 'X Y' }).expect(404);
    });
  });
});
