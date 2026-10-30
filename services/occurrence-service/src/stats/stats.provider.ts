import type { DashboardDto, Period } from './stats.dto.js';

/** Where the dashboard metrics come from (ANALYTICS_SOURCE). Both sources return the same shape. */
export interface StatsProvider {
  readonly source: DashboardDto['source'];
  dashboard(period: Period): Promise<DashboardDto>;
}

export const STATS_PROVIDER = Symbol('STATS_PROVIDER');
