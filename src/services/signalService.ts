import { DbExecutor, globalExecutor } from '../db/client';
import { InsertOutcome, InsertSignalInput, RawSignalRow, ServiceResult, SignalRow, SignalStatus } from './types';

function mapSignalRow(raw: RawSignalRow): SignalRow {
  return {
    id: Number.parseInt(raw.id, 10),
    channel_id: Number.parseInt(raw.channel_id, 10),
    message_id: raw.message_id,
    symbol: raw.symbol,
    direction: raw.direction === 'BUY' || raw.direction === 'SELL' ? raw.direction : null,
    entry: raw.entry,
    sl: raw.sl,
    tp: raw.tp,
    tp_levels: raw.tp_levels,
    risk: raw.risk,
    reward: raw.reward,
    rr: raw.rr,
    status: raw.status as SignalStatus,
    original_text: raw.original_text,
    posted_at: raw.posted_at,
    detected_at: raw.detected_at,
    emailed: raw.emailed,
  };
}

const VALID_STATUSES: ReadonlyArray<SignalStatus> = ['READY', 'BELOW_2R', 'INVALID', 'DUPLICATE'];

function validateInsertInput(input: InsertSignalInput): string | null {
  if (!Number.isInteger(input.channel_id) || input.channel_id <= 0) return 'channel_id must be positive integer.';
  if (typeof input.message_id !== 'string' || input.message_id.trim() === '') return 'message_id must be non-empty.';
  if (!/^\d+$/.test(input.message_id)) return 'message_id must be numeric.';
  if (input.direction !== null && input.direction !== 'BUY' && input.direction !== 'SELL') return 'direction must be null/BUY/SELL.';
  if (!VALID_STATUSES.includes(input.status)) return `status must be one of: ${VALID_STATUSES.join(', ')}.`;
  return null;
}

const SIGNAL_COLUMNS = `id, channel_id, message_id, symbol, direction, entry, sl, tp, tp_levels, risk, reward, rr, status, original_text, posted_at, detected_at, emailed`;

export async function insertSignal(input: InsertSignalInput, executor?: DbExecutor): Promise<ServiceResult<InsertOutcome<SignalRow>>> {
  const validationError = validateInsertInput(input);
  if (validationError !== null) return { ok: false, error: { kind: 'invalid_input', message: validationError } };
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawSignalRow>(
      `INSERT INTO signals (channel_id, message_id, symbol, direction, entry, sl, tp, tp_levels, risk, reward, rr, status, original_text, posted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (channel_id, message_id) DO NOTHING RETURNING ${SIGNAL_COLUMNS}`,
      [input.channel_id, input.message_id, input.symbol, input.direction, input.entry, input.sl, input.tp, input.tp_levels, input.risk, input.reward, input.rr, input.status, input.original_text, input.posted_at]
    );
    const inserted = res.rows[0];
    if (inserted !== undefined) return { ok: true, value: { outcome: 'inserted', row: mapSignalRow(inserted) } };
    const existingRes = await db.query<RawSignalRow>(`SELECT ${SIGNAL_COLUMNS} FROM signals WHERE channel_id = $1 AND message_id = $2`, [input.channel_id, input.message_id]);
    const existing = existingRes.rows[0];
    if (existing === undefined) return { ok: false, error: { kind: 'db_error', message: 'ON CONFLICT fallback SELECT empty.' } };
    return { ok: true, value: { outcome: 'duplicate', existing: mapSignalRow(existing) } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}

export async function getSignalByMessageId(channelId: number, messageId: string, executor?: DbExecutor): Promise<ServiceResult<SignalRow>> {
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawSignalRow>(`SELECT ${SIGNAL_COLUMNS} FROM signals WHERE channel_id = $1 AND message_id = $2`, [channelId, messageId]);
    const row = res.rows[0];
    if (row === undefined) return { ok: false, error: { kind: 'not_found', message: `Signal not found.` } };
    return { ok: true, value: mapSignalRow(row) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}

export interface ListSignalsOptions {
  readonly minRr?: number;
  readonly status?: SignalStatus;
  readonly limit?: number;
}

export async function listSignals(options: ListSignalsOptions = {}, executor?: DbExecutor): Promise<ServiceResult<SignalRow[]>> {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit <= 0 || limit > 500) return { ok: false, error: { kind: 'invalid_input', message: 'limit must be 1-500.' } };
  const where: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;
  if (options.status !== undefined) { where.push(`status = $${paramIndex}`); values.push(options.status); paramIndex += 1; }
  if (options.minRr !== undefined) {
    if (!Number.isFinite(options.minRr) || options.minRr <= 0) return { ok: false, error: { kind: 'invalid_input', message: 'minRr must be positive.' } };
    where.push(`rr IS NOT NULL AND rr >= $${paramIndex}`); values.push(options.minRr); paramIndex += 1;
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  values.push(limit);
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawSignalRow>(`SELECT ${SIGNAL_COLUMNS} FROM signals ${whereClause} ORDER BY detected_at DESC, id DESC LIMIT $${paramIndex}`, values);
    return { ok: true, value: res.rows.map(mapSignalRow) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}
