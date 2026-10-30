import { Inject, Injectable, Logger } from '@nestjs/common';

import { OCCURRENCE_CONFIG, type OccurrenceConfig } from '../config.js';

interface NominatimReverse {
  display_name?: string;
  address?: Record<string, string | undefined>;
}

const CACHE_SIZE = 5000;
const MIN_INTERVAL_MS = 1000;

/** `41.53170, -8.61940`: the address used when reverse geocoding is unavailable. */
export function coordinatesLabel(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** ~11 m precision: nearby taps share a cache entry. */
export function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** "Rua Dr. Manuel Pais 12, Arcozelo" from Nominatim address parts (PT addresses). */
export function formatAddress(result: NominatimReverse): string | null {
  const a = result.address ?? {};
  const street = a.road ?? a.pedestrian ?? a.footway ?? a.square ?? a.path ?? a.residential;
  const streetLine = street ? [street, a.house_number].filter(Boolean).join(' ') : undefined;
  const place =
    a.suburb ?? a.village ?? a.hamlet ?? a.neighbourhood ?? a.town ?? a.city_district ?? a.city;
  const parts = [streetLine, place].filter((p): p is string => Boolean(p));
  if (parts.length > 0) return parts.join(', ').slice(0, 300);
  return result.display_name ? result.display_name.split(',').slice(0, 2).join(',').trim() : null;
}

/**
 * Reverse geocoding with Nominatim, following its usage policy: own User-Agent, at most one
 * request per second, and results cached by rounded coordinate. Any failure falls back to the
 * coordinates, so reporting never depends on an external service.
 */
@Injectable()
export class GeocoderService {
  private readonly logger = new Logger(GeocoderService.name);
  private readonly cache = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(@Inject(OCCURRENCE_CONFIG) private readonly config: OccurrenceConfig) {}

  async reverse(lat: number, lng: number): Promise<string> {
    const key = cacheKey(lat, lng);
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (!this.config.nominatim.url) return coordinatesLabel(lat, lng);

    const address = (await this.throttled(() => this.fetchAddress(lat, lng))) ?? null;
    if (!address) return coordinatesLabel(lat, lng);

    if (this.cache.size >= CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, address);
    return address;
  }

  /** Runs `task` after the previous one, at least MIN_INTERVAL_MS after the last request. */
  private throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRequestAt = Date.now();
      return task();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async fetchAddress(lat: number, lng: number): Promise<string | null> {
    const url = new URL('/reverse', this.config.nominatim.url);
    url.search = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'jsonv2',
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'pt-PT',
    }).toString();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': this.config.nominatim.userAgent },
        signal: AbortSignal.timeout(this.config.nominatim.timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return formatAddress((await res.json()) as NominatimReverse);
    } catch (error) {
      this.logger.warn(
        `reverse geocoding failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
