import type { OccurrenceStatus, Paginated } from '@sinaliza/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import type {
  Category,
  Dashboard,
  MapPin,
  Municipality,
  OccurrenceDetail,
  StaffRow,
  User,
} from './types';

export const keys = {
  categories: ['categories'] as const,
  municipality: ['municipality'] as const,
  occurrences: ['occurrences'] as const,
  occurrence: (id: string) => ['occurrences', id] as const,
  map: ['map'] as const,
  dashboard: ['dashboard'] as const,
  managers: ['managers'] as const,
  me: ['me'] as const,
};

// ------------------------------------------------------------------ reference data

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: () => api<Category[]>('GET', '/categories', { query: { all: 'true' } }),
    staleTime: 5 * 60_000,
  });
}

export function useMunicipality() {
  return useQuery({
    queryKey: keys.municipality,
    queryFn: () => api<Municipality>('GET', '/municipality'),
    staleTime: Infinity,
  });
}

// ------------------------------------------------------------------ occurrences

export interface OccurrenceFilters {
  q?: string;
  status?: string;
  category?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function useOccurrences(filters: OccurrenceFilters) {
  return useQuery({
    queryKey: [...keys.occurrences, 'list', filters],
    queryFn: () =>
      api<Paginated<StaffRow>>('GET', '/occurrences', {
        query: { ...filters },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useOccurrence(id: string) {
  return useQuery({
    queryKey: keys.occurrence(id),
    queryFn: () => api<OccurrenceDetail>('GET', `/occurrences/${id}`),
  });
}

/** After any change to an occurrence: refresh its detail, the lists, the map and the dashboard. */
function useOccurrenceMutation<V>(fn: (vars: V) => Promise<OccurrenceDetail>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      client.setQueryData(keys.occurrence(detail.id), detail);
      void client.invalidateQueries({ queryKey: [...keys.occurrences, 'list'] });
      void client.invalidateQueries({ queryKey: keys.map });
      void client.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useChangeStatus(id: string) {
  return useOccurrenceMutation(
    (body: { status: OccurrenceStatus; note?: string; reason?: string }) =>
      api<OccurrenceDetail>('POST', `/occurrences/${id}/status`, { json: body }),
  );
}

export function useMarkDuplicate(id: string) {
  return useOccurrenceMutation((body: { originalId: string; note?: string }) =>
    api<OccurrenceDetail>('POST', `/occurrences/${id}/duplicate`, { json: body }),
  );
}

export function useChangeCategory(id: string) {
  return useOccurrenceMutation((categoryId: string) =>
    api<OccurrenceDetail>('PATCH', `/occurrences/${id}/category`, { json: { categoryId } }),
  );
}

// ------------------------------------------------------------------ map and dashboard

export function useMapPins(filters: { status?: string; category?: string }) {
  return useQuery({
    queryKey: [...keys.map, filters],
    queryFn: () =>
      api<{ items: MapPin[]; truncated: boolean }>('GET', '/map/occurrences', { query: filters }),
    placeholderData: keepPreviousData,
  });
}

export function useDashboard(period: { from?: string; to?: string }) {
  return useQuery({
    queryKey: [...keys.dashboard, period],
    queryFn: () => api<Dashboard>('GET', '/stats/dashboard', { query: period }),
    placeholderData: keepPreviousData,
  });
}

// ------------------------------------------------------------------ categories (ADMIN)

function useCategoryMutation<V>(fn: (vars: V) => Promise<Category>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.categories }),
  });
}

export function useSaveCategory() {
  return useCategoryMutation((body: { id?: string; name: string; icon: string }) =>
    body.id
      ? api<Category>('PATCH', `/categories/${body.id}`, {
          json: { name: body.name, icon: body.icon },
        })
      : api<Category>('POST', '/categories', { json: { name: body.name, icon: body.icon } }),
  );
}

export function useSetCategoryActive() {
  return useCategoryMutation(({ id, active }: { id: string; active: boolean }) =>
    api<Category>('POST', `/categories/${id}/${active ? 'activate' : 'deactivate'}`),
  );
}

// ------------------------------------------------------------------ managers (ADMIN)

export function useManagers(filters: { q?: string; page?: number }) {
  return useQuery({
    queryKey: [...keys.managers, filters],
    queryFn: () => api<Paginated<User>>('GET', '/users', { query: { role: 'GESTOR', ...filters } }),
    placeholderData: keepPreviousData,
  });
}

function useManagerMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.managers }),
  });
}

export function useCreateManager() {
  return useManagerMutation((body: { name: string; email: string }) =>
    api<{ user: User; temporaryPassword: string }>('POST', '/users/gestores', { json: body }),
  );
}

export function useUpdateManager() {
  return useManagerMutation(({ id, ...body }: { id: string; name: string; phone: string | null }) =>
    api<User>('PATCH', `/users/${id}`, { json: body }),
  );
}

export function useSetManagerActive() {
  return useManagerMutation(({ id, active }: { id: string; active: boolean }) =>
    api<User>('POST', `/users/${id}/${active ? 'activate' : 'deactivate'}`),
  );
}

// ------------------------------------------------------------------ profile

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api<User>('GET', '/users/me') });
}

export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; phone: string | null }) =>
      api<User>('PATCH', '/users/me', { json: body }),
    onSuccess: (user) => client.setQueryData(keys.me, user),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api<void>('POST', '/users/me/password', { json: body }),
  });
}
