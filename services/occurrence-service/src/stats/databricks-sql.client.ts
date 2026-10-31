import type { DatabricksConfig } from '../config.js';

/** A row keyed by column name; Databricks sends every non-null value as a string. */
export type SqlRow = Record<string, string | null>;

export interface SqlParameter {
  name: string;
  value: string;
  type: 'DATE' | 'STRING' | 'INT';
}

export class DatabricksQueryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'DatabricksQueryError';
  }
}

interface StatementResponse {
  statement_id?: string;
  status?: { state?: string; error?: { error_code?: string; message?: string } };
  manifest?: {
    schema?: { columns?: Array<{ name: string; position: number }> };
    total_chunk_count?: number;
  };
  result?: ResultChunk;
}

interface ResultChunk {
  data_array?: Array<Array<string | null>>;
  next_chunk_index?: number;
}

const SCHEMA = 'gold';
// The API waits at most 50 s; past that the statement is cancelled rather than left running.
const WAIT_TIMEOUT = '50s';

/**
 * Minimal client for the Databricks SQL Statement Execution API
 * (POST /api/2.0/sql/statements, JSON_ARRAY results inline).
 */
export class DatabricksSqlClient {
  constructor(
    private readonly config: DatabricksConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async query(statement: string, parameters: SqlParameter[]): Promise<SqlRow[]> {
    const body = await this.request<StatementResponse>('/api/2.0/sql/statements', {
      method: 'POST',
      body: JSON.stringify({
        statement,
        warehouse_id: this.config.warehouseId,
        catalog: this.config.catalog,
        schema: SCHEMA,
        parameters,
        disposition: 'INLINE',
        format: 'JSON_ARRAY',
        wait_timeout: WAIT_TIMEOUT,
        on_wait_timeout: 'CANCEL',
      }),
    });

    const state = body.status?.state;
    if (state !== 'SUCCEEDED') {
      const error = body.status?.error;
      throw new DatabricksQueryError(
        `Statement ${state ?? 'UNKNOWN'}: ${error?.message ?? 'no details'}`,
        error?.error_code,
      );
    }

    const columns = [...(body.manifest?.schema?.columns ?? [])].sort(
      (a, b) => a.position - b.position,
    );
    const rows = [...(body.result?.data_array ?? [])];
    // Results above one chunk (not expected for these aggregates) are fetched chunk by chunk.
    let next = body.result?.next_chunk_index;
    while (next !== undefined && body.statement_id) {
      const chunk = await this.request<ResultChunk>(
        `/api/2.0/sql/statements/${encodeURIComponent(body.statement_id)}/result/chunks/${next}`,
        { method: 'GET' },
      );
      rows.push(...(chunk.data_array ?? []));
      next = chunk.next_chunk_index;
    }

    return rows.map((values) =>
      Object.fromEntries(columns.map((column, i) => [column.name, values[i] ?? null])),
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.host}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      throw new DatabricksQueryError(`Request failed: ${(error as Error).message}`);
    }
    if (!response.ok) {
      // The body may echo the request; keep only the status and the API's own error code.
      const text = await response.text().catch(() => '');
      const code = /"error_code"\s*:\s*"([A-Z_]+)"/.exec(text)?.[1];
      throw new DatabricksQueryError(`HTTP ${response.status}`, code);
    }
    return (await response.json()) as T;
  }
}
