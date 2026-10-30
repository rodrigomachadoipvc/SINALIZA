/** Error body returned by every service and by the gateway. Messages are in PT-PT. */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  requestId: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const OCCURRENCE_DESCRIPTION_MIN = 10;
export const OCCURRENCE_DESCRIPTION_MAX = 500;

export const PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const PHOTO_MAX_STORED_BYTES = 2 * 1024 * 1024;
export const PHOTO_MAX_DIMENSION = 1600;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Headers the gateway forwards to the services after verifying the JWT. */
export const UserHeaders = {
  ID: 'x-user-id',
  ROLE: 'x-user-role',
  EMAIL: 'x-user-email',
  NAME: 'x-user-name',
} as const;

export const REQUEST_ID_HEADER = 'x-request-id';
