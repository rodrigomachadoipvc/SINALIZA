import { createEvent, EventType, OCCURRENCE_STATUSES, OccurrenceStatus } from '@sinaliza/shared';
import { describe, expect, it } from 'vitest';

import {
  emailFor,
  escapeHtml,
  formatDateTime,
  STATUS_EXPLANATIONS,
  statusChangedEmail,
} from '../email/templates.js';

const citizen = { id: 'c1', name: 'Maria Fernandes', email: 'maria.fernandes@email.pt' };

const statusChange = (overrides: Partial<Parameters<typeof statusChangedEmail>[0]> = {}) =>
  statusChangedEmail({
    id: 'o1',
    reference: 'SIN-2026-00482',
    citizen,
    from: OccurrenceStatus.EM_ANALISE,
    to: OccurrenceStatus.EM_RESOLUCAO,
    changedAt: '2026-10-30T17:45:00Z',
    ...overrides,
  });

describe('escapeHtml', () => {
  it('escapes the HTML special characters', () => {
    expect(escapeHtml(`<b>"O'Neil" & co</b>`)).toBe(
      '&lt;b&gt;&quot;O&#39;Neil&quot; &amp; co&lt;/b&gt;',
    );
  });
});

describe('formatDateTime', () => {
  it('uses Portuguese format and time zone', () => {
    expect(formatDateTime('2026-10-30T17:45:00Z')).toBe('30/10/2026, 17:45');
    // Summer time: UTC+1.
    expect(formatDateTime('2026-07-01T08:05:00Z')).toBe('01/07/2026, 09:05');
  });
});

describe('emailFor', () => {
  it('welcomes new citizens by first name', () => {
    const email = emailFor(
      createEvent(EventType.USER_REGISTERED, { userId: 'u1', ...citizen }, 'e1'),
    );
    expect(email.to).toBe(citizen.email);
    expect(email.subject).toBe('Bem-vindo ao Sinaliza');
    expect(email.html).toContain('Olá, Maria!');
    expect(email.html).toContain('#1A2B4C');
    expect(email.html).toContain('lang="pt-PT"');
    expect(email.text).toContain('Olá, Maria!');
  });

  it('sends the password reset link with its expiry', () => {
    const email = emailFor(
      createEvent(
        EventType.USER_PASSWORD_RESET_REQUESTED,
        {
          userId: 'u1',
          ...citizen,
          resetUrl: 'http://localhost:5173/redefinir-palavra-passe?token=abc&x=1',
          expiresAt: '2026-10-30T18:15:00Z',
        },
        'e2',
      ),
    );
    expect(email.html).toContain(
      'href="http://localhost:5173/redefinir-palavra-passe?token=abc&amp;x=1"',
    );
    expect(email.text).toContain(
      'Redefinir a palavra-passe: http://localhost:5173/redefinir-palavra-passe?token=abc&x=1',
    );
    expect(email.text).toContain('válida até 30/10/2026, 18:15');
  });

  it('confirms a new occurrence with its details', () => {
    const email = emailFor(
      createEvent(
        EventType.OCCURRENCE_CREATED,
        {
          id: 'o1',
          reference: 'SIN-2026-00482',
          citizen,
          category: { id: 'k', name: 'Iluminação pública', slug: 'iluminacao' },
          address: 'Largo da Porta Nova, Barcelos',
          createdAt: '2026-10-30T17:45:00Z',
        },
        'e3',
      ),
    );
    expect(email.subject).toBe('Ocorrência SIN-2026-00482 recebida');
    expect(email.text).toContain('Referência: SIN-2026-00482');
    expect(email.text).toContain('Categoria: Iluminação pública');
    expect(email.text).toContain('Localização: Largo da Porta Nova, Barcelos');
  });
});

describe('statusChangedEmail', () => {
  it('explains every status in plain language', () => {
    for (const status of OCCURRENCE_STATUSES) {
      expect(STATUS_EXPLANATIONS[status].length).toBeGreaterThan(20);
    }
    const email = statusChange({ note: 'Equipa no local amanhã.' });
    expect(email.subject).toBe('Ocorrência SIN-2026-00482: Em Resolução');
    expect(email.text).toContain(STATUS_EXPLANATIONS.EM_RESOLUCAO);
    expect(email.text).toContain('Estado anterior: Em Análise');
    expect(email.text).toContain('Nota da equipa municipal:\nEquipa no local amanhã.');
  });

  it('includes the reason of a rejection', () => {
    const email = statusChange({
      to: OccurrenceStatus.REJEITADA,
      reason: 'Situação em propriedade privada.',
    });
    expect(email.text).toContain('Fundamentação:\nSituação em propriedade privada.');
    expect(email.html).toContain('Situação em propriedade privada.');
  });

  it('includes the original reference of a duplicate', () => {
    const email = statusChange({
      from: OccurrenceStatus.RECEBIDA,
      to: OccurrenceStatus.DUPLICADA,
      originalReference: 'SIN-2026-00410',
    });
    expect(email.text).toContain('A ocorrência original é a SIN-2026-00410.');
  });

  it('escapes user-written text', () => {
    const email = statusChange({
      citizen: { ...citizen, name: '<script>alert(1)</script>' },
      note: '<img src=x onerror=alert(1)>',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
