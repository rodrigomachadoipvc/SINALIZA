import { Injectable } from '@nestjs/common';
import type { OccurrenceStatus } from '@sinaliza/shared';

import { PrismaService } from '../prisma.service.js';
import type { DashboardDto, Period } from './stats.dto.js';
import type { StatsProvider } from './stats.provider.js';
import { round } from './stats.util.js';

const HOTSPOT_LIMIT = 50;

/**
 * Dashboard metrics computed in the operational database (ANALYTICS_SOURCE=postgres), over the
 * `occurrence_facts` view created by the migration (cancelled occurrences are excluded there).
 * Dates are compared as calendar days in Europe/Lisbon.
 */
@Injectable()
export class PostgresStatsProvider implements StatsProvider {
  readonly source = 'postgres' as const;

  constructor(private readonly prisma: PrismaService) {}

  async dashboard(period: Period): Promise<DashboardDto> {
    const { from, to } = period;
    // Rows created in the period; `created_day` is the local calendar day.
    const inPeriod = this.prisma.$queryRaw<
      Array<{
        total: number;
        open: number;
        rejected: number;
        duplicated: number;
      }>
    >`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE is_open)::int AS open,
             count(*) FILTER (WHERE status = 'REJEITADA')::int AS rejected,
             count(*) FILTER (WHERE status = 'DUPLICADA')::int AS duplicated
      FROM occurrence_facts
      WHERE (created_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN ${from}::date AND ${to}::date
    `;
    const resolved = this.prisma.$queryRaw<Array<{ resolved: number; avg_days: number | null }>>`
      SELECT count(*)::int AS resolved, avg(resolution_days)::float8 AS avg_days
      FROM occurrence_facts
      WHERE (resolved_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN ${from}::date AND ${to}::date
    `;
    const byStatus = this.prisma.$queryRaw<Array<{ status: OccurrenceStatus; count: number }>>`
      SELECT status::text AS status, count(*)::int AS count
      FROM occurrence_facts
      WHERE (created_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN ${from}::date AND ${to}::date
      GROUP BY status ORDER BY count DESC
    `;
    const byCategory = this.prisma.$queryRaw<Array<{ slug: string; name: string; count: number }>>`
      SELECT category_slug AS slug, max(category_name) AS name, count(*)::int AS count
      FROM occurrence_facts
      WHERE (created_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN ${from}::date AND ${to}::date
      GROUP BY category_slug ORDER BY count DESC, slug
    `;
    const monthly = this.prisma.$queryRaw<
      Array<{ month: string; created: number; resolved: number }>
    >`
      WITH months AS (
        SELECT generate_series(date_trunc('month', ${from}::date), date_trunc('month', ${to}::date),
                               interval '1 month')::date AS month
      )
      SELECT to_char(m.month, 'YYYY-MM') AS month,
             (SELECT count(*) FROM occurrence_facts f
               WHERE f.created_month = m.month
                 AND (f.created_at AT TIME ZONE 'Europe/Lisbon')::date
                     BETWEEN ${from}::date AND ${to}::date)::int AS created,
             (SELECT count(*) FROM occurrence_facts f
               WHERE date_trunc('month', f.resolved_at AT TIME ZONE 'Europe/Lisbon')::date = m.month
                 AND (f.resolved_at AT TIME ZONE 'Europe/Lisbon')::date
                     BETWEEN ${from}::date AND ${to}::date)::int AS resolved
      FROM months m ORDER BY m.month
    `;
    const resolution = this.prisma.$queryRaw<
      Array<{ slug: string; name: string; resolved: number; avg_days: number }>
    >`
      SELECT category_slug AS slug, max(category_name) AS name, count(*)::int AS resolved,
             avg(resolution_days)::float8 AS avg_days
      FROM occurrence_facts
      WHERE (resolved_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN ${from}::date AND ${to}::date
      GROUP BY category_slug ORDER BY avg_days DESC, slug
    `;
    const hotspots = this.prisma.$queryRaw<Array<{ lat: number; lng: number; count: number }>>`
      SELECT cell_lat AS lat, cell_lng AS lng, count(*)::int AS count
      FROM occurrence_facts
      WHERE (created_at AT TIME ZONE 'Europe/Lisbon')::date BETWEEN ${from}::date AND ${to}::date
      GROUP BY cell_lat, cell_lng ORDER BY count DESC, lat, lng
      LIMIT ${HOTSPOT_LIMIT}
    `;

    const [[totals], [res], statusRows, categoryRows, monthRows, resolutionRows, hotspotRows] =
      await Promise.all([inPeriod, resolved, byStatus, byCategory, monthly, resolution, hotspots]);

    const total = totals?.total ?? 0;
    const rate = (n: number): number => (total === 0 ? 0 : round(n / total, 4));
    return {
      source: this.source,
      updatedAt: new Date().toISOString(),
      period,
      totals: {
        total,
        open: totals?.open ?? 0,
        resolvedInPeriod: res?.resolved ?? 0,
        avgResolutionDays: typeof res?.avg_days === 'number' ? round(res.avg_days, 1) : null,
        rejectionRate: rate(totals?.rejected ?? 0),
        duplicateRate: rate(totals?.duplicated ?? 0),
      },
      byStatus: statusRows,
      byCategory: categoryRows,
      monthlyTrend: monthRows,
      resolutionByCategory: resolutionRows.map((r) => ({
        slug: r.slug,
        name: r.name,
        resolved: r.resolved,
        avgDays: round(r.avg_days, 1),
      })),
      hotspots: hotspotRows,
    };
  }
}
