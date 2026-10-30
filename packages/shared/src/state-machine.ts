// Pure occurrence state machine. Services map the error codes to HTTP statuses:
// INVALID_TRANSITION → 409, FORBIDDEN → 403, REASON_REQUIRED / ORIGINAL_REQUIRED → 400.
import { OccurrenceStatus } from './occurrence-status.js';
import { isStaff, type UserRole } from './roles.js';

export const MIN_REASON_LENGTH = 10;

type Actor = 'STAFF' | 'AUTHOR';

interface TransitionRule {
  readonly from: readonly OccurrenceStatus[];
  readonly to: OccurrenceStatus;
  readonly actor: Actor;
}

const S = OccurrenceStatus;

export const TRANSITION_RULES: readonly TransitionRule[] = [
  { from: [S.RECEBIDA], to: S.EM_ANALISE, actor: 'STAFF' },
  { from: [S.RECEBIDA, S.EM_ANALISE], to: S.REJEITADA, actor: 'STAFF' },
  { from: [S.RECEBIDA, S.EM_ANALISE], to: S.DUPLICADA, actor: 'STAFF' },
  { from: [S.EM_ANALISE], to: S.EM_RESOLUCAO, actor: 'STAFF' },
  { from: [S.EM_RESOLUCAO], to: S.RESOLVIDA, actor: 'STAFF' },
  { from: [S.RECEBIDA], to: S.ANULADA, actor: 'AUTHOR' },
];

export interface TransitionRequest {
  from: OccurrenceStatus;
  to: OccurrenceStatus;
  role: UserRole;
  /** True when the acting user is the citizen who reported the occurrence. */
  isAuthor: boolean;
  reason?: string | undefined;
  originalId?: string | undefined;
}

export type TransitionErrorCode =
  'INVALID_TRANSITION' | 'FORBIDDEN' | 'REASON_REQUIRED' | 'ORIGINAL_REQUIRED';

export type TransitionResult = { ok: true } | { ok: false; code: TransitionErrorCode };

function findRule(from: OccurrenceStatus, to: OccurrenceStatus): TransitionRule | undefined {
  return TRANSITION_RULES.find((r) => r.to === to && r.from.includes(from));
}

function actorMatches(actor: Actor, role: UserRole, isAuthor: boolean): boolean {
  return actor === 'STAFF' ? isStaff(role) : isAuthor && !isStaff(role);
}

export function checkTransition(req: TransitionRequest): TransitionResult {
  const rule = findRule(req.from, req.to);
  if (!rule) return { ok: false, code: 'INVALID_TRANSITION' };
  if (!actorMatches(rule.actor, req.role, req.isAuthor)) return { ok: false, code: 'FORBIDDEN' };
  if (req.to === S.REJEITADA && (req.reason?.trim().length ?? 0) < MIN_REASON_LENGTH) {
    return { ok: false, code: 'REASON_REQUIRED' };
  }
  if (req.to === S.DUPLICADA && !req.originalId) return { ok: false, code: 'ORIGINAL_REQUIRED' };
  return { ok: true };
}

/** Statuses the given actor may move an occurrence to (the UIs show only these actions). */
export function allowedTransitions(
  from: OccurrenceStatus,
  role: UserRole,
  isAuthor: boolean,
): OccurrenceStatus[] {
  return TRANSITION_RULES.filter(
    (r) => r.from.includes(from) && actorMatches(r.actor, role, isAuthor),
  ).map((r) => r.to);
}

export type DuplicateTargetErrorCode =
  'ORIGINAL_NOT_FOUND' | 'ORIGINAL_IS_SELF' | 'ORIGINAL_INVALID_STATUS';

/** The original must exist, differ from the occurrence and not be DUPLICADA or ANULADA. */
export function checkDuplicateTarget(
  selfId: string,
  original: { id: string; status: OccurrenceStatus } | null,
): { ok: true } | { ok: false; code: DuplicateTargetErrorCode } {
  if (!original) return { ok: false, code: 'ORIGINAL_NOT_FOUND' };
  if (original.id === selfId) return { ok: false, code: 'ORIGINAL_IS_SELF' };
  if (original.status === S.DUPLICADA || original.status === S.ANULADA) {
    return { ok: false, code: 'ORIGINAL_INVALID_STATUS' };
  }
  return { ok: true };
}
