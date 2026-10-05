import { DbExecutor, globalExecutor } from '../db/client';
import { InsertOutcome, InsertPostInput, PostRow, RawPostRow, ServiceResult } from './types';

function mapPostRow(raw: RawPostRow): PostRow {
  return {
    id: Number.parseInt(raw.id, 10),
    channel_id: Number.parseInt(raw.channel_id, 10),
    message_id: raw.message_id,
    message_text: raw.message_text,
    posted_at: raw.posted_at,
    detected_at: raw.detected_at,
    raw_html_hash: raw.raw_html_hash,
  };
}

function validateInsertInput(input: InsertPostInput): string | null {
  if (!Number.isInteger(input.channel_id) || input.channel_id <= 0) return 'channel_id must be a positive integer.';
  if (typeof input.message_id !== 'string' || input.message_id.trim() === '') return 'message_id must be non-empty.';
  if (!/^\d+$/.test(input.message_id)) return 'message_id must be numeric.';
  return null;
}

const POST_COLUMNS = `id, channel_id, message_id, message_text, posted_at, detected_at, raw_html_hash`;

export async function insertPost(input: InsertPostInput, executor?: DbExecutor): Promise<ServiceResult<InsertOutcome<PostRow>>> {
  const validationError = validateInsertInput(input);
  if (validationError !== null) return { ok: false, error: { kind: 'invalid_input', message: validationError } };
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawPostRow>(
      `INSERT INTO posts (channel_id, message_id, message_text, posted_at, raw_html_hash) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (channel_id, message_id) DO NOTHING RETURNING ${POST_COLUMNS}`,
      [input.channel_id, input.message_id, input.message_text, input.posted_at, input.raw_html_hash]
    );
    const inserted = res.rows[0];
    if (inserted !== undefined) return { ok: true, value: { outcome: 'inserted', row: mapPostRow(inserted) } };
    const existingRes = await db.query<RawPostRow>(`SELECT ${POST_COLUMNS} FROM posts WHERE channel_id = $1 AND message_id = $2`, [input.channel_id, input.message_id]);
    const existing = existingRes.rows[0];
    if (existing === undefined) return { ok: false, error: { kind: 'db_error', message: 'ON CONFLICT fallback SELECT empty.' } };
    return { ok: true, value: { outcome: 'duplicate', existing: mapPostRow(existing) } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}

export async function getPostByMessageId(channelId: number, messageId: string, executor?: DbExecutor): Promise<ServiceResult<PostRow>> {
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawPostRow>(`SELECT ${POST_COLUMNS} FROM posts WHERE channel_id = $1 AND message_id = $2`, [channelId, messageId]);
    const row = res.rows[0];
    if (row === undefined) return { ok: false, error: { kind: 'not_found', message: `Post not found.` } };
    return { ok: true, value: mapPostRow(row) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}

export async function listRecentPosts(limit: number, executor?: DbExecutor): Promise<ServiceResult<PostRow[]>> {
  if (!Number.isInteger(limit) || limit <= 0 || limit > 500) return { ok: false, error: { kind: 'invalid_input', message: 'limit must be 1-500.' } };
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawPostRow>(`SELECT ${POST_COLUMNS} FROM posts ORDER BY detected_at DESC, id DESC LIMIT $1`, [limit]);
    return { ok: true, value: res.rows.map(mapPostRow) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}
