import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { INTERNAL_TOKEN_HEADER, LocalizedHttpException } from '@sinaliza/service-kit';
import { REQUEST_ID_HEADER } from '@sinaliza/shared';

import { OCCURRENCE_CONFIG, type OccurrenceConfig } from '../config.js';

export interface MunicipalCategory {
  id: string;
  slug: string;
  name: string;
  icon: string;
  active: boolean;
}

export interface MunicipalBoundary {
  name: string;
  boundary: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

const UNAVAILABLE = 'O serviço municipal está temporariamente indisponível. Tente novamente.';

/** Synchronous REST calls to the municipal-service internal API (RNF: service-to-service). */
@Injectable()
export class MunicipalClient {
  constructor(@Inject(OCCURRENCE_CONFIG) private readonly config: OccurrenceConfig) {}

  /** Returns null when the category does not exist. */
  async getCategory(id: string, requestId?: string): Promise<MunicipalCategory | null> {
    const res = await this.request(`/internal/categories/${encodeURIComponent(id)}`, requestId);
    if (res.status === 404) return null;
    return (await this.json(res)) as MunicipalCategory;
  }

  async getBoundary(): Promise<MunicipalBoundary> {
    return (await this.json(await this.request('/internal/municipality'))) as MunicipalBoundary;
  }

  private async request(path: string, requestId?: string): Promise<Response> {
    try {
      return await fetch(new URL(path, this.config.municipalServiceUrl), {
        headers: {
          [INTERNAL_TOKEN_HEADER]: this.config.internalToken,
          ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {}),
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new LocalizedHttpException(HttpStatus.SERVICE_UNAVAILABLE, UNAVAILABLE);
    }
  }

  private async json(res: Response): Promise<unknown> {
    if (!res.ok) throw new LocalizedHttpException(HttpStatus.BAD_GATEWAY, UNAVAILABLE);
    return res.json();
  }
}
