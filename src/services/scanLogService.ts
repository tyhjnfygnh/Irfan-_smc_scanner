import { DbExecutor, globalExecutor } from '../db/client';
import { ServiceResult } from './types';

export interface InsertScanLogInput {
  readonly channel_id: number | null;
  readonly scan_type: 'auto' | 'custom' | 'manual';
  readonly status: 'success' | 'error';
  readonly posts_found: number;
  readonly new_signals: number;
  readonly error_message: string | null;
  readonly duration_ms: number | null;
}

export async function insertScanLog(
  input: InsertScanLogInput,
  executor?: DbExecutor
): Promise<ServiceResult<{ id: number }>> {
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<{ id: string }>(
      `INSERT INTO scan_logs
         (channel_id, scan_type, status, posts_found, new_signals, error_message, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.channel_id,
        input.scan_type,
        input.status,
        input.posts_found,
        input.new_signals,
        input.error_message,
        input.duration_ms,
      ]
    );
    const row = res.rows[0];
    if (row === undefined) {
      return { ok: false, error: { kind: 'db_error', message: 'INSERT returned no row.' } };
    }
    return { ok: true, value: { id: Number.parseInt(row.id, 10) } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}
