// AMQP event contracts, published to the `sinaliza.events` topic exchange with the type as routing key.
import type { OccurrenceStatus } from './occurrence-status.js';

export const EVENTS_EXCHANGE = 'sinaliza.events';
export const EVENTS_DLX = 'sinaliza.events.dlx';

export const EventType = {
  USER_REGISTERED: 'user.registered',
  USER_PASSWORD_RESET_REQUESTED: 'user.password_reset_requested',
  OCCURRENCE_CREATED: 'occurrence.created',
  OCCURRENCE_STATUS_CHANGED: 'occurrence.status_changed',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export interface CitizenRef {
  id: string;
  name: string;
  email: string;
}

export interface UserRegisteredPayload {
  userId: string;
  name: string;
  email: string;
}

export interface PasswordResetRequestedPayload {
  userId: string;
  name: string;
  email: string;
  resetUrl: string;
  expiresAt: string;
}

export interface OccurrenceCreatedPayload {
  id: string;
  reference: string;
  citizen: CitizenRef;
  category: { id: string; name: string; slug: string };
  address: string;
  createdAt: string;
}

export interface OccurrenceStatusChangedPayload {
  id: string;
  reference: string;
  citizen: CitizenRef;
  from: OccurrenceStatus;
  to: OccurrenceStatus;
  note?: string;
  reason?: string;
  originalReference?: string;
  changedAt: string;
}

export interface EventPayloads {
  'user.registered': UserRegisteredPayload;
  'user.password_reset_requested': PasswordResetRequestedPayload;
  'occurrence.created': OccurrenceCreatedPayload;
  'occurrence.status_changed': OccurrenceStatusChangedPayload;
}

export interface EventEnvelope<T extends EventType = EventType> {
  eventId: string;
  type: T;
  occurredAt: string;
  version: 1;
  payload: EventPayloads[T];
}

export type AnyEvent = { [K in EventType]: EventEnvelope<K> }[EventType];

export function createEvent<T extends EventType>(
  type: T,
  payload: EventPayloads[T],
  eventId: string,
  occurredAt: Date = new Date(),
): EventEnvelope<T> {
  return { eventId, type, occurredAt: occurredAt.toISOString(), version: 1, payload };
}

export function isEventEnvelope(value: unknown): value is AnyEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.eventId === 'string' &&
    typeof v.type === 'string' &&
    (Object.values(EventType) as string[]).includes(v.type) &&
    typeof v.occurredAt === 'string' &&
    v.version === 1 &&
    typeof v.payload === 'object' &&
    v.payload !== null
  );
}
