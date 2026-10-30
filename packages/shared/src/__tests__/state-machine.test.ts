import { describe, expect, it } from 'vitest';

import { OCCURRENCE_STATUSES, OccurrenceStatus as S } from '../occurrence-status.js';
import { UserRole } from '../roles.js';
import {
  allowedTransitions,
  checkDuplicateTarget,
  checkTransition,
  type TransitionRequest,
} from '../state-machine.js';

const staff = { role: UserRole.GESTOR, isAuthor: false } as const;
const admin = { role: UserRole.ADMIN, isAuthor: false } as const;
const author = { role: UserRole.CIDADAO, isAuthor: true } as const;
const otherCitizen = { role: UserRole.CIDADAO, isAuthor: false } as const;

const REASON = 'Fora do âmbito municipal';

const VALID: ReadonlyArray<[S, S, Partial<TransitionRequest>]> = [
  [S.RECEBIDA, S.EM_ANALISE, staff],
  [S.RECEBIDA, S.REJEITADA, { ...staff, reason: REASON }],
  [S.EM_ANALISE, S.REJEITADA, { ...staff, reason: REASON }],
  [S.RECEBIDA, S.DUPLICADA, { ...staff, originalId: 'orig' }],
  [S.EM_ANALISE, S.DUPLICADA, { ...staff, originalId: 'orig' }],
  [S.EM_ANALISE, S.EM_RESOLUCAO, staff],
  [S.EM_RESOLUCAO, S.RESOLVIDA, staff],
  [S.RECEBIDA, S.ANULADA, author],
];

function req(from: S, to: S, extra: Partial<TransitionRequest>): TransitionRequest {
  return { from, to, role: UserRole.GESTOR, isAuthor: false, ...extra };
}

describe('checkTransition', () => {
  it.each(VALID)('allows %s → %s', (from, to, extra) => {
    expect(checkTransition(req(from, to, extra))).toEqual({ ok: true });
  });

  it('lets ADMIN do everything GESTOR can', () => {
    expect(checkTransition(req(S.RECEBIDA, S.EM_ANALISE, admin))).toEqual({ ok: true });
    expect(checkTransition(req(S.EM_RESOLUCAO, S.RESOLVIDA, admin))).toEqual({ ok: true });
  });

  const validPairs = new Set(VALID.map(([f, t]) => `${f}>${t}`));
  const invalid = OCCURRENCE_STATUSES.flatMap((from) =>
    OCCURRENCE_STATUSES.filter((to) => !validPairs.has(`${from}>${to}`)).map(
      (to) => [from, to] as const,
    ),
  );

  it.each(invalid)('rejects %s → %s with INVALID_TRANSITION', (from, to) => {
    for (const actor of [staff, author]) {
      expect(
        checkTransition(req(from, to, { ...actor, reason: REASON, originalId: 'orig' })),
      ).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
    }
  });

  it('forbids citizens from staff transitions', () => {
    expect(checkTransition(req(S.RECEBIDA, S.EM_ANALISE, author))).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('forbids staff and other citizens from cancelling', () => {
    expect(checkTransition(req(S.RECEBIDA, S.ANULADA, staff)).ok).toBe(false);
    expect(checkTransition(req(S.RECEBIDA, S.ANULADA, otherCitizen))).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('requires a reason of at least 10 characters to reject', () => {
    expect(checkTransition(req(S.RECEBIDA, S.REJEITADA, staff))).toEqual({
      ok: false,
      code: 'REASON_REQUIRED',
    });
    expect(
      checkTransition(req(S.RECEBIDA, S.REJEITADA, { ...staff, reason: '  curta    ' })),
    ).toEqual({ ok: false, code: 'REASON_REQUIRED' });
    expect(
      checkTransition(req(S.RECEBIDA, S.REJEITADA, { ...staff, reason: '1234567890' })),
    ).toEqual({ ok: true });
  });

  it('requires an original to mark as duplicate', () => {
    expect(checkTransition(req(S.RECEBIDA, S.DUPLICADA, staff))).toEqual({
      ok: false,
      code: 'ORIGINAL_REQUIRED',
    });
  });
});

describe('allowedTransitions', () => {
  it('lists staff actions per status', () => {
    expect(allowedTransitions(S.RECEBIDA, UserRole.GESTOR, false)).toEqual([
      S.EM_ANALISE,
      S.REJEITADA,
      S.DUPLICADA,
    ]);
    expect(allowedTransitions(S.EM_ANALISE, UserRole.ADMIN, false)).toEqual([
      S.REJEITADA,
      S.DUPLICADA,
      S.EM_RESOLUCAO,
    ]);
    expect(allowedTransitions(S.EM_RESOLUCAO, UserRole.GESTOR, false)).toEqual([S.RESOLVIDA]);
    expect(allowedTransitions(S.RESOLVIDA, UserRole.GESTOR, false)).toEqual([]);
  });

  it('only lets the author cancel while RECEBIDA', () => {
    expect(allowedTransitions(S.RECEBIDA, UserRole.CIDADAO, true)).toEqual([S.ANULADA]);
    expect(allowedTransitions(S.EM_ANALISE, UserRole.CIDADAO, true)).toEqual([]);
    expect(allowedTransitions(S.RECEBIDA, UserRole.CIDADAO, false)).toEqual([]);
  });
});

describe('checkDuplicateTarget', () => {
  it('accepts a different, active original', () => {
    expect(checkDuplicateTarget('a', { id: 'b', status: S.EM_RESOLUCAO })).toEqual({ ok: true });
  });

  it('rejects a missing original', () => {
    expect(checkDuplicateTarget('a', null)).toEqual({ ok: false, code: 'ORIGINAL_NOT_FOUND' });
  });

  it('rejects itself', () => {
    expect(checkDuplicateTarget('a', { id: 'a', status: S.RECEBIDA })).toEqual({
      ok: false,
      code: 'ORIGINAL_IS_SELF',
    });
  });

  it.each([S.DUPLICADA, S.ANULADA])('rejects an original that is %s', (status) => {
    expect(checkDuplicateTarget('a', { id: 'b', status })).toEqual({
      ok: false,
      code: 'ORIGINAL_INVALID_STATUS',
    });
  });
});
