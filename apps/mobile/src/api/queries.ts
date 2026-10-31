import type { CitizenStatusGroup } from '@sinaliza/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Platform } from 'react-native';

import { useSession } from '../auth/session';
import type { Draft } from '../store/draft';
import { get, http, patch, post } from './client';
import type {
  Category,
  CreatedOccurrence,
  LocationCheck,
  MapDetail,
  MapPin,
  Municipality,
  OccurrenceCard,
  OccurrenceDetail,
  Page,
  User,
} from './types';

export const keys = {
  categories: ['categories'] as const,
  municipality: ['municipality'] as const,
  map: ['map'] as const,
  mine: ['mine'] as const,
  occurrence: (id: string) => ['occurrence', id] as const,
  me: ['me'] as const,
};

export const MINE_PAGE_SIZE = 20;

// ------------------------------------------------------------------ reference data

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: () => get<Category[]>('/categories'),
    staleTime: 10 * 60_000,
  });
}

export function useMunicipality() {
  return useQuery({
    queryKey: keys.municipality,
    queryFn: () => get<Municipality>('/municipality'),
    staleTime: Infinity,
  });
}

// ------------------------------------------------------------------ public map

export function useMapPins(category: string | null) {
  return useQuery({
    queryKey: [...keys.map, category],
    queryFn: () =>
      get<{ items: MapPin[]; truncated: boolean }>(
        '/map/occurrences',
        category ? { category } : undefined,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useMapDetail(id: string | null) {
  return useQuery({
    queryKey: [...keys.map, 'detail', id],
    queryFn: () => get<MapDetail>(`/map/occurrences/${id ?? ''}`),
    enabled: id !== null,
  });
}

// ------------------------------------------------------------------ my occurrences

export function useMyOccurrences(group: CitizenStatusGroup) {
  return useInfiniteQuery({
    queryKey: [...keys.mine, group],
    queryFn: ({ pageParam }) =>
      get<Page<OccurrenceCard>>('/occurrences/mine', {
        status: group,
        page: pageParam,
        pageSize: MINE_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
}

export function useOccurrence(id: string) {
  return useQuery({
    queryKey: keys.occurrence(id),
    queryFn: () => get<OccurrenceDetail>(`/occurrences/${id}`),
  });
}

export function useCancelOccurrence(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => post<OccurrenceDetail>(`/occurrences/${id}/cancel`),
    onSuccess: (detail) => {
      client.setQueryData(keys.occurrence(id), detail);
      void client.invalidateQueries({ queryKey: keys.mine });
      void client.invalidateQueries({ queryKey: keys.map });
    },
  });
}

// ------------------------------------------------------------------ reporting

export function validateLocation(lat: number, lng: number): Promise<LocationCheck> {
  return post<LocationCheck>('/locations/validate', { lat, lng });
}

/** Multipart upload of the compressed photo; returns the key to attach to the occurrence. */
async function uploadPhoto(uri: string): Promise<string> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, 'fotografia.jpg');
  } else {
    // React Native's FormData takes a file descriptor object instead of a Blob.
    form.append('file', { uri, name: 'fotografia.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  const { data } = await http.post<{ photoKey: string }>('/photos', form);
  return data.photoKey;
}

/** Sends the photo first (if any), then creates the occurrence (RF03). */
export function useSubmitOccurrence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (draft: Draft) => {
      if (!draft.categoryId || !draft.location) throw new Error('incomplete draft');
      const photoKey = draft.photo ? await uploadPhoto(draft.photo.uri) : undefined;
      return post<CreatedOccurrence>('/occurrences', {
        categoryId: draft.categoryId,
        description: draft.description.trim(),
        lat: draft.location.lat,
        lng: draft.location.lng,
        ...(photoKey ? { photoKey } : {}),
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.mine });
      void client.invalidateQueries({ queryKey: keys.map });
    },
  });
}

// ------------------------------------------------------------------ profile

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => get<User>('/users/me') });
}

export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; phone: string | null }) => patch<User>('/users/me', body),
    onSuccess: async (user) => {
      client.setQueryData(keys.me, user);
      await useSession.getState().updateUser(user);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      post<void>('/users/me/password', body),
  });
}
