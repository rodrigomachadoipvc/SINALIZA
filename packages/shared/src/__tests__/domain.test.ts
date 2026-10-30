import { describe, expect, it } from 'vitest';

import { CATEGORY_ICONS, DEFAULT_CATEGORIES, slugify } from '../categories.js';
import { createEvent, EventType, isEventEnvelope } from '../events.js';
import { CITIZEN_STATUS_GROUPS, OccurrenceStatus as S } from '../occurrence-status.js';
import { isValidPassword } from '../password.js';
import { formatReference, parseReference } from '../reference.js';
import { hasRole, UserRole } from '../roles.js';

describe('formatReference', () => {
  it('pads the sequence to five digits', () => {
    expect(formatReference(2026, 482)).toBe('SIN-2026-00482');
    expect(formatReference(2026, 1)).toBe('SIN-2026-00001');
  });

  it('keeps sequences above 99999', () => {
    expect(formatReference(2026, 123456)).toBe('SIN-2026-123456');
  });

  it('rejects invalid input', () => {
    expect(() => formatReference(2026, 0)).toThrow(RangeError);
    expect(() => formatReference(26, 1)).toThrow(RangeError);
  });

  it('round-trips through parseReference', () => {
    expect(parseReference('SIN-2026-00482')).toEqual({ year: 2026, sequence: 482 });
    expect(parseReference('SIN-26-1')).toBeNull();
  });
});

describe('isValidPassword', () => {
  it.each(['Cidada12345', 'abcdefg1', 'Pássaro9'])('accepts %s', (p) => {
    expect(isValidPassword(p)).toBe(true);
  });

  it.each(['abc123', 'abcdefgh', '12345678', ''])('rejects %s', (p) => {
    expect(isValidPassword(p)).toBe(false);
  });
});

describe('hasRole', () => {
  it('lets ADMIN satisfy GESTOR routes', () => {
    expect(hasRole(UserRole.ADMIN, [UserRole.GESTOR])).toBe(true);
  });

  it('does not let GESTOR satisfy ADMIN routes', () => {
    expect(hasRole(UserRole.GESTOR, [UserRole.ADMIN])).toBe(false);
  });

  it('does not let CIDADAO satisfy staff routes', () => {
    expect(hasRole(UserRole.CIDADAO, [UserRole.GESTOR, UserRole.ADMIN])).toBe(false);
  });
});

describe('CITIZEN_STATUS_GROUPS', () => {
  it('never includes ANULADA', () => {
    for (const statuses of Object.values(CITIZEN_STATUS_GROUPS)) {
      expect(statuses).not.toContain(S.ANULADA);
    }
  });

  it('groups open statuses under em_curso', () => {
    expect(CITIZEN_STATUS_GROUPS.em_curso).toEqual([S.RECEBIDA, S.EM_ANALISE, S.EM_RESOLUCAO]);
  });
});

describe('events', () => {
  it('builds a valid envelope', () => {
    const event = createEvent(
      EventType.USER_REGISTERED,
      { userId: 'u1', name: 'Maria', email: 'maria@example.pt' },
      'e1',
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(event).toEqual({
      eventId: 'e1',
      type: 'user.registered',
      occurredAt: '2026-01-01T00:00:00.000Z',
      version: 1,
      payload: { userId: 'u1', name: 'Maria', email: 'maria@example.pt' },
    });
    expect(isEventEnvelope(event)).toBe(true);
  });

  it('rejects malformed messages', () => {
    expect(isEventEnvelope(null)).toBe(false);
    expect(
      isEventEnvelope({ eventId: 'e', type: 'unknown', occurredAt: 'x', version: 1, payload: {} }),
    ).toBe(false);
  });
});

describe('slugify', () => {
  it.each([
    ['Iluminação pública', 'iluminacao-publica'],
    ['  Vias & Pavimento!  ', 'vias-pavimento'],
    ['Árvores caídas', 'arvores-caidas'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe('DEFAULT_CATEGORIES', () => {
  it('only uses icons from CATEGORY_ICONS', () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(CATEGORY_ICONS).toContain(c.icon);
    }
  });
});
