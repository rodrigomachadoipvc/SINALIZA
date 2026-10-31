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
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface StaffRow {
  id: string;
  reference: string;
  status: OccurrenceStatus;
  category: CategoryRef;
  address: string;
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
  daysOpen: number;
}

export interface HistoryEntry {
  from: OccurrenceStatus | null;
  to: OccurrenceStatus;
  note: string | null;
  reason: string | null;
  changedByRole: UserRole;
  changedAt: string;
}

export interface OccurrenceDetail {
  id: string;
  reference: string;
  status: OccurrenceStatus;
  category: CategoryRef;
  description: string;
  address: string;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lat: number;
  lng: number;
  rejectionReason: string | null;
  original: { id: string; reference: string } | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  history: HistoryEntry[];
  allowedTransitions: OccurrenceStatus[];
  citizen?: { id: string; name: string; email: string };
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

export interface Municipality {
  name: string;
  boundary: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface Dashboard {
  source: 'postgres' | 'databricks';
  updatedAt: string;
  period: { from: string; to: string };
  totals: {
    total: number;
    open: number;
    resolvedInPeriod: number;
    avgResolutionDays: number | null;
    rejectionRate: number;
    duplicateRate: number;
  };
  byStatus: Array<{ status: OccurrenceStatus; count: number }>;
  byCategory: Array<{ slug: string; name: string; count: number }>;
  monthlyTrend: Array<{ month: string; created: number; resolved: number }>;
  resolutionByCategory: Array<{ slug: string; name: string; resolved: number; avgDays: number }>;
  hotspots: Array<{ lat: number; lng: number; count: number }>;
}
