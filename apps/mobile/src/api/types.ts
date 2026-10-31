import type { OccurrenceStatus, UserRole } from '@sinaliza/shared';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
  active: boolean;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface MapPin {
  id: string;
  reference: string;
  status: OccurrenceStatus;
  category: CategoryRef;
  lat: number;
  lng: number;
  createdAt: string;
}

export interface MapDetail extends MapPin {
  address: string;
  description: string;
  photoUrl: string | null;
}

export interface OccurrenceCard {
  id: string;
  reference: string;
  status: OccurrenceStatus;
  category: CategoryRef;
  description: string;
  address: string;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  from: OccurrenceStatus | null;
  to: OccurrenceStatus;
  note: string | null;
  reason: string | null;
  changedByRole: UserRole;
  changedAt: string;
}

export interface OccurrenceDetail extends OccurrenceCard {
  lat: number;
  lng: number;
  rejectionReason: string | null;
  original: { id: string; reference: string } | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  history: HistoryEntry[];
  allowedTransitions: OccurrenceStatus[];
}

/** Answer to `POST /occurrences`: just enough for the confirmation screen. */
export interface CreatedOccurrence {
  id: string;
  reference: string;
  status: OccurrenceStatus;
}

export interface Municipality {
  name: string;
  boundary: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface LocationCheck {
  inside: boolean;
  address: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
