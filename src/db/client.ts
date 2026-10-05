import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getConfig } from '../config/env';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool === null) {
    const cfg = getConfig();
    pool = new Pool({
      connectionString: cfg.database.url,
      max: cfg.database.poolMax,
      idleTimeoutMillis: cfg.database.idleTimeoutMs,
      connectionTimeoutMillis: cfg.database.connectionTimeoutMs,
      application_name: 'irfan-telegram-signal-scanner',
    });
    pool.on('error', (err) => {
      console.error('[db] idle client error:', err.message);
    });
  }
  return pool;
}

export interface DbExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<QueryResult<T>>;
}

export function globalExecutor(): DbExecutor {
  return getPool();
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[] | undefined);
}

export async function queryWith<T extends QueryResultRow = QueryResultRow>(
  executor: DbExecutor,
  text: string,
  params?: ReadonlyArray<unknown>
): Promise<QueryResult<T>> {
  return executor.query<T>(text, params as unknown[] | undefined);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck(): Promise<{ ok: boolean; latencyMs: number; error: string | null }> {
  const start = Date.now();
  try {
    await query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs: Date.now() - start, error: message };
  }
}

export async function closePool(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}

export function getPgErrorCode(err: unknown): string | null {
  if (err !== null && typeof err === 'object' && 'code' in err &&
      typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code;
  }
  return null;
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_CHECK_VIOLATION = '23514';
