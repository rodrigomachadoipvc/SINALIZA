import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { type DatabricksConfig, loadAnalyticsConfig } from '../config.js';
import {
  BY_CATEGORY_SQL,
  BY_STATUS_SQL,
  HOTSPOTS_SQL,
  MONTHLY_SQL,
  RESOLUTION_SQL,
  TOTALS_SQL,
} from '../stats/databricks-queries.js';
import { DatabricksQueryError, DatabricksSqlClient } from '../stats/databricks-sql.client.js';
import { DatabricksStatsProvider } from '../stats/databricks-stats.provider.js';
import { monthsBetween } from '../stats/stats.util.js';

const CONFIG: DatabricksConfig = {
  host: 'https://dbc-test.cloud.databricks.com',
  token: 'dapi-test-token',
  warehouseId: 'wh-123',
  catalog: 'sinaliza',
  cacheTtlMs: 600_000,
  timeoutMs: 5000,
};

/** A successful Statement Execution API response with the given columns and rows. */
function statement(columns: string[], rows: Array<Array<string | null>>, extra = {}): unknown {
  return {
    statement_id: 'st-1',
    status: { state: 'SUCCEEDED' },
    manifest: {
      schema: { columns: columns.map((name, position) => ({ name, position })) },
      total_chunk_count: 1,
    },
    result: { data_array: rows, ...extra },
  };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const GOLD: Record<string, unknown> = {
  [TOTALS_SQL]: statement(
    ['total', 'abertas', 'rejeitadas', 'duplicadas', 'resolvidas', 'media_dias', 'atualizado_em'],
    [['200', '15', '16', '10', '150', '9.87654', '2026-10-31T05:31:02.123Z']],
  ),
  [BY_STATUS_SQL]: statement(
    ['estado', 'n'],
    [
      ['RESOLVIDA', '150'],
      ['REJEITADA', '16'],
    ],
  ),
  [BY_CATEGORY_SQL]: statement(
    ['categoria_slug', 'categoria_nome', 'n'],
    [['vias', 'Vias e pavimento', '120']],
  ),
  [MONTHLY_SQL]: statement(['mes', 'criadas', 'resolvidas'], [['2026-09', '80', '70']]),
  [RESOLUTION_SQL]: statement(
    ['categoria_slug', 'categoria_nome', 'resolvidas', 'media_dias'],
    [['vias', 'Vias e pavimento', '90', '14.26']],
  ),
  [HOTSPOTS_SQL]: statement(['lat', 'lng', 'n'], [['41.53184', '-8.61953', '42']]),
};

function goldFetch() {
  return vi.fn<typeof fetch>((_url, init) => {
    const body = JSON.parse(init?.body as string) as { statement: string };
    return Promise.resolve(json(GOLD[body.statement]));
  });
}

const PERIOD = { from: '2026-08-15', to: '2026-10-31' };

describe('DatabricksSqlClient', () => {
  it('sends the statement with named DATE parameters to the warehouse', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(json(statement(['b', 'a'], [['2', '1']]))),
    );
    const client = new DatabricksSqlClient(CONFIG, fetchFn);

    const rows = await client.query('SELECT 1 AS b, 2 AS a', [
      { name: 'date_from', value: '2026-01-01', type: 'DATE' },
    ]);

    expect(rows).toEqual([{ b: '2', a: '1' }]);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://dbc-test.cloud.databricks.com/api/2.0/sql/statements');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer dapi-test-token');
    expect(JSON.parse(init?.body as string)).toEqual({
      statement: 'SELECT 1 AS b, 2 AS a',
      warehouse_id: 'wh-123',
      catalog: 'sinaliza',
      schema: 'gold',
      parameters: [{ name: 'date_from', value: '2026-01-01', type: 'DATE' }],
      disposition: 'INLINE',
      format: 'JSON_ARRAY',
      wait_timeout: '50s',
      on_wait_timeout: 'CANCEL',
    });
  });

  it('follows result chunks', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(statement(['n'], [['1']], { next_chunk_index: 1 })))
      .mockResolvedValueOnce(json({ data_array: [['2']] }));
    const rows = await new DatabricksSqlClient(CONFIG, fetchFn).query('SELECT n', []);

    expect(rows).toEqual([{ n: '1' }, { n: '2' }]);
    expect(fetchFn.mock.calls[1]?.[0]).toBe(
      'https://dbc-test.cloud.databricks.com/api/2.0/sql/statements/st-1/result/chunks/1',
    );
  });

  it('turns failed statements and HTTP errors into errors without the token', async () => {
    const failed = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        json({
          status: {
            state: 'FAILED',
            error: { error_code: 'BAD_REQUEST', message: 'Table not found: kpi_diario' },
          },
        }),
      ),
    );
    await expect(new DatabricksSqlClient(CONFIG, failed).query('SELECT', [])).rejects.toThrow(
      'Statement FAILED: Table not found: kpi_diario',
    );

    const forbidden = vi.fn<typeof fetch>(() =>
      Promise.resolve(json({ error_code: 'PERMISSION_DENIED', message: 'no' }, 403)),
    );
    const error = await new DatabricksSqlClient(CONFIG, forbidden)
      .query('SELECT', [])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabricksQueryError);
    expect(error).toMatchObject({ message: 'HTTP 403', code: 'PERMISSION_DENIED' });
    expect(String((error as Error).message)).not.toContain(CONFIG.token);
  });
});

describe('DatabricksStatsProvider', () => {
  it('maps the gold rows to the dashboard and fills empty months', async () => {
    const provider = new DatabricksStatsProvider(
      new DatabricksSqlClient(CONFIG, goldFetch()),
      1000,
    );

    const dashboard = await provider.dashboard(PERIOD);

    expect(dashboard).toEqual({
      source: 'databricks',
      updatedAt: '2026-10-31T05:31:02.123Z',
      period: PERIOD,
      totals: {
        total: 200,
        open: 15,
        resolvedInPeriod: 150,
        avgResolutionDays: 9.9,
        rejectionRate: 0.08,
        duplicateRate: 0.05,
      },
      byStatus: [
        { status: 'RESOLVIDA', count: 150 },
        { status: 'REJEITADA', count: 16 },
      ],
      byCategory: [{ slug: 'vias', name: 'Vias e pavimento', count: 120 }],
      monthlyTrend: [
        { month: '2026-08', created: 0, resolved: 0 },
        { month: '2026-09', created: 80, resolved: 70 },
        { month: '2026-10', created: 0, resolved: 0 },
      ],
      resolutionByCategory: [
        { slug: 'vias', name: 'Vias e pavimento', resolved: 90, avgDays: 14.3 },
      ],
      hotspots: [{ lat: 41.53184, lng: -8.61953, count: 42 }],
    });
  });

  it('reuses a period for the cache time, then asks again', async () => {
    let now = 0;
    const fetchFn = goldFetch();
    const provider = new DatabricksStatsProvider(
      new DatabricksSqlClient(CONFIG, fetchFn),
      600_000,
      () => now,
    );

    await Promise.all([provider.dashboard(PERIOD), provider.dashboard(PERIOD)]);
    now = 599_999;
    await provider.dashboard(PERIOD);
    expect(fetchFn).toHaveBeenCalledTimes(6); // one round of six statements

    await provider.dashboard({ from: '2026-01-01', to: '2026-10-31' });
    expect(fetchFn).toHaveBeenCalledTimes(12); // another period

    now = 600_000;
    await provider.dashboard(PERIOD);
    expect(fetchFn).toHaveBeenCalledTimes(18); // expired
  });

  it('answers 502 when Databricks fails and does not cache the failure', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    const provider = new DatabricksStatsProvider(new DatabricksSqlClient(CONFIG, fetchFn), 600_000);

    const error = await provider.dashboard(PERIOD).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: HttpStatus.BAD_GATEWAY });
    expect((error as Error).message).toContain('Databricks');

    fetchFn.mockImplementation(goldFetch());
    await expect(provider.dashboard(PERIOD)).resolves.toMatchObject({ source: 'databricks' });
  });
});

describe('analytics configuration', () => {
  it('uses Postgres unless Databricks is asked for', () => {
    expect(loadAnalyticsConfig({})).toEqual({ source: 'postgres' });
    expect(loadAnalyticsConfig({ ANALYTICS_SOURCE: 'postgres', DATABRICKS_HOST: 'x' })).toEqual({
      source: 'postgres',
    });
    expect(() => loadAnalyticsConfig({ ANALYTICS_SOURCE: 'bigquery' })).toThrow('ANALYTICS_SOURCE');
  });

  it('requires the Databricks settings and normalises the host', () => {
    expect(() => loadAnalyticsConfig({ ANALYTICS_SOURCE: 'databricks' })).toThrow(
      'DATABRICKS_HOST',
    );
    const config = loadAnalyticsConfig({
      ANALYTICS_SOURCE: 'databricks',
      DATABRICKS_HOST: 'dbc-test.cloud.databricks.com/',
      DATABRICKS_TOKEN: 't',
      DATABRICKS_WAREHOUSE_ID: 'w',
    });
    expect(config).toEqual({
      source: 'databricks',
      databricks: {
        host: 'https://dbc-test.cloud.databricks.com',
        token: 't',
        warehouseId: 'w',
        catalog: 'sinaliza',
        cacheTtlMs: 600_000,
        timeoutMs: 60_000,
      },
    });
    expect(() =>
      loadAnalyticsConfig({
        ANALYTICS_SOURCE: 'databricks',
        DATABRICKS_HOST: 'http://insecure.example',
        DATABRICKS_TOKEN: 't',
        DATABRICKS_WAREHOUSE_ID: 'w',
      }),
    ).toThrow('https');
  });
});

describe('monthsBetween', () => {
  it('lists every month of the period, across years', () => {
    expect(monthsBetween('2025-11-30', '2026-02-01')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(monthsBetween('2026-10-01', '2026-10-31')).toEqual(['2026-10']);
  });
});
