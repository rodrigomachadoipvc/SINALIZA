import { Logger } from '@nestjs/common';
import { badGateway } from '@sinaliza/service-kit';
import type { OccurrenceStatus } from '@sinaliza/shared';

import type { DatabricksSqlClient, SqlParameter, SqlRow } from './databricks-sql.client.js';
import {
  BY_CATEGORY_SQL,
  BY_STATUS_SQL,
  HOTSPOTS_SQL,
  MONTHLY_SQL,
  RESOLUTION_SQL,
  TOTALS_SQL,
} from './databricks-queries.js';
import type { DashboardDto, Period } from './stats.dto.js';
import type { StatsProvider } from './stats.provider.js';
import { monthsBetween, round } from './stats.util.js';

// Bounded so that many different periods cannot grow the cache without limit.
const MAX_CACHED_PERIODS = 100;

const num = (value: string | null | undefined): number => (value ? Number(value) : 0);
const text = (value: string | null | undefined): string => value ?? '';

interface CacheEntry {
  expiresAt: number;
  value: Promise<DashboardDto>;
}

/**
 * Dashboard metrics read from the Databricks gold tables (ANALYTICS_SOURCE=databricks) through
 * the SQL Statement Execution API. The gold tables are rebuilt once a day, so each period's
 * result is cached (10 minutes by default); concurrent requests for a period share one query.
 */
export class DatabricksStatsProvider implements StatsProvider {
  readonly source = 'databricks' as const;
  private readonly logger = new Logger(DatabricksStatsProvider.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly client: DatabricksSqlClient,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  dashboard(period: Period): Promise<DashboardDto> {
    const key = `${period.from}|${period.to}`;
    const at = this.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > at) return cached.value;

    this.evict(at);
    const entry: CacheEntry = {
      expiresAt: at + this.ttlMs,
      value: this.compute(period).catch((error: unknown) => {
        // Failures are not cached: the next request tries again.
        if (this.cache.get(key) === entry) this.cache.delete(key);
        this.logger.error(`Databricks query failed: ${(error as Error).message}`);
        throw badGateway(
          'Não foi possível obter os indicadores do Databricks. Tente novamente mais tarde.',
        );
      }),
    };
    this.cache.set(key, entry);
    return entry.value;
  }

  private evict(at: number): void {
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= at) this.cache.delete(key);
    }
    while (this.cache.size >= MAX_CACHED_PERIODS) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private async compute(period: Period): Promise<DashboardDto> {
    const params: SqlParameter[] = [
      { name: 'date_from', value: period.from, type: 'DATE' },
      { name: 'date_to', value: period.to, type: 'DATE' },
    ];
    const run = (sql: string): Promise<SqlRow[]> => this.client.query(sql, params);
    const [[totals], statusRows, categoryRows, monthRows, resolutionRows, hotspotRows] =
      await Promise.all([
        run(TOTALS_SQL),
        run(BY_STATUS_SQL),
        run(BY_CATEGORY_SQL),
        run(MONTHLY_SQL),
        run(RESOLUTION_SQL),
        run(HOTSPOTS_SQL),
      ]);

    const total = num(totals?.total);
    const rate = (n: number): number => (total === 0 ? 0 : round(n / total, 4));
    const avgDays = totals?.media_dias;
    const updatedAt = totals?.atualizado_em ? new Date(totals.atualizado_em) : null;
    const byMonth = new Map(monthRows.map((r) => [text(r.mes), r]));

    return {
      source: this.source,
      updatedAt: (updatedAt && !Number.isNaN(updatedAt.getTime())
        ? updatedAt
        : new Date(this.now())
      ).toISOString(),
      period,
      totals: {
        total,
        open: num(totals?.abertas),
        resolvedInPeriod: num(totals?.resolvidas),
        avgResolutionDays: avgDays ? round(Number(avgDays), 1) : null,
        rejectionRate: rate(num(totals?.rejeitadas)),
        duplicateRate: rate(num(totals?.duplicadas)),
      },
      byStatus: statusRows.map((r) => ({
        status: text(r.estado) as OccurrenceStatus,
        count: num(r.n),
      })),
      byCategory: categoryRows.map((r) => ({
        slug: text(r.categoria_slug),
        name: text(r.categoria_nome),
        count: num(r.n),
      })),
      // Months without occurrences come back as zeros, like the Postgres provider.
      monthlyTrend: monthsBetween(period.from, period.to).map((month) => ({
        month,
        created: num(byMonth.get(month)?.criadas),
        resolved: num(byMonth.get(month)?.resolvidas),
      })),
      resolutionByCategory: resolutionRows.map((r) => ({
        slug: text(r.categoria_slug),
        name: text(r.categoria_nome),
        resolved: num(r.resolvidas),
        avgDays: round(num(r.media_dias), 1),
      })),
      hotspots: hotspotRows.map((r) => ({ lat: num(r.lat), lng: num(r.lng), count: num(r.n) })),
    };
  }
}
