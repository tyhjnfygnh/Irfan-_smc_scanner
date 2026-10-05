import { DbExecutor, globalExecutor, getPgErrorCode, PG_UNIQUE_VIOLATION } from '../db/client';
import { ChannelRow, ChannelStatus, CreateChannelInput, RawChannelRow, ServiceResult, UpdateChannelInput } from './types';

export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, '').toLowerCase();
}

function validateUsername(username: string): string | null {
  if (username.length === 0) return 'Username is empty after normalization.';
  if (username.length > 64) return 'Username exceeds 64 characters.';
  if (username.includes('@')) return 'Username must not contain "@".';
  if (/\s/.test(username)) return 'Username must not contain whitespace.';
  if (!/^[a-z0-9_]+$/.test(username)) return 'Username must contain only a-z, 0-9, and underscore.';
  return null;
}

function validateScanInterval(seconds: number): string | null {
  if (!Number.isInteger(seconds)) return 'scan_interval must be an integer.';
  if (seconds < 10) return 'scan_interval must be >= 10.';
  if (seconds > 86400) return 'scan_interval must be <= 86400.';
  return null;
}

function mapChannelRow(raw: RawChannelRow): ChannelRow {
  return {
    id: Number.parseInt(raw.id, 10),
    username: raw.username,
    display_name: raw.display_name,
    is_enabled: raw.is_enabled,
    scan_interval: raw.scan_interval,
    status: raw.status as ChannelStatus,
    last_checked: raw.last_checked,
    last_success: raw.last_success,
    last_error: raw.last_error,
    added_at: raw.added_at,
    updated_at: raw.updated_at,
  };
}

const CHANNEL_COLUMNS = `id, username, display_name, is_enabled, scan_interval, status, last_checked, last_success, last_error, added_at, updated_at`;

export async function listChannels(executor?: DbExecutor): Promise<ServiceResult<ChannelRow[]>> {
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawChannelRow>(`SELECT ${CHANNEL_COLUMNS} FROM channels ORDER BY id ASC`);
    return { ok: true, value: res.rows.map(mapChannelRow) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}

export async function listEnabledChannels(executor?: DbExecutor): Promise<ServiceResult<ChannelRow[]>> {
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawChannelRow>(`SELECT ${CHANNEL_COLUMNS} FROM channels WHERE is_enabled = TRUE ORDER BY id ASC`);
    return { ok: true, value: res.rows.map(mapChannelRow) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}

export async function getChannelById(id: number, executor?: DbExecutor): Promise<ServiceResult<ChannelRow>> {
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawChannelRow>(`SELECT ${CHANNEL_COLUMNS} FROM channels WHERE id = $1`, [id]);
    const row = res.rows[0];
    if (row === undefined) return { ok: false, error: { kind: 'not_found', message: `Channel id=${id} not found.` } };
    return { ok: true, value: mapChannelRow(row) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}

export async function getChannelByUsername(rawUsername: string, executor?: DbExecutor): Promise<ServiceResult<ChannelRow>> {
  const username = normalizeUsername(rawUsername);
  const usernameError = validateUsername(username);
  if (usernameError !== null) return { ok: false, error: { kind: 'invalid_input', message: usernameError } };
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawChannelRow>(`SELECT ${CHANNEL_COLUMNS} FROM channels WHERE username = $1`, [username]);
    const row = res.rows[0];
    if (row === undefined) return { ok: false, error: { kind: 'not_found', message: `Channel username="${username}" not found.` } };
    return { ok: true, value: mapChannelRow(row) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}

export async function createChannel(input: CreateChannelInput, executor?: DbExecutor): Promise<ServiceResult<ChannelRow>> {
  const username = normalizeUsername(input.username);
  const usernameError = validateUsername(username);
  if (usernameError !== null) return { ok: false, error: { kind: 'invalid_input', message: usernameError } };
  const scanInterval = input.scan_interval ?? 60;
  const intervalError = validateScanInterval(scanInterval);
  if (intervalError !== null) return { ok: false, error: { kind: 'invalid_input', message: intervalError } };
  const isEnabled = input.is_enabled ?? true;
  const displayName = input.display_name ?? null;
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawChannelRow>(
      `INSERT INTO channels (username, display_name, is_enabled, scan_interval, status) VALUES ($1, $2, $3, $4, 'UNKNOWN') RETURNING ${CHANNEL_COLUMNS}`,
      [username, displayName, isEnabled, scanInterval]
    );
    const row = res.rows[0];
    if (row === undefined) return { ok: false, error: { kind: 'db_error', message: 'INSERT returned no row.' } };
    return { ok: true, value: mapChannelRow(row) };
  } catch (err) {
    const code = getPgErrorCode(err);
    if (code === PG_UNIQUE_VIOLATION) return { ok: false, error: { kind: 'invalid_input', message: `Channel "${username}" already exists.` } };
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}

export async function updateChannel(id: number, input: UpdateChannelInput, executor?: DbExecutor): Promise<ServiceResult<ChannelRow>> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;
  if (input.display_name !== undefined) { setClauses.push(`display_name = $${paramIndex}`); values.push(input.display_name); paramIndex += 1; }
  if (input.is_enabled !== undefined) { setClauses.push(`is_enabled = $${paramIndex}`); values.push(input.is_enabled); paramIndex += 1; }
  if (input.scan_interval !== undefined) {
    const intervalError = validateScanInterval(input.scan_interval);
    if (intervalError !== null) return { ok: false, error: { kind: 'invalid_input', message: intervalError } };
    setClauses.push(`scan_interval = $${paramIndex}`); values.push(input.scan_interval); paramIndex += 1;
  }
  if (setClauses.length === 0) return { ok: false, error: { kind: 'invalid_input', message: 'No fields to update.' } };
  values.push(id);
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query<RawChannelRow>(`UPDATE channels SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING ${CHANNEL_COLUMNS}`, values);
    const row = res.rows[0];
    if (row === undefined) return { ok: false, error: { kind: 'not_found', message: `Channel id=${id} not found.` } };
    return { ok: true, value: mapChannelRow(row) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}

export async function deleteChannel(id: number, executor?: DbExecutor): Promise<ServiceResult<{ deleted: boolean }>> {
  const db = executor ?? globalExecutor();
  try {
    const res = await db.query(`DELETE FROM channels WHERE id = $1`, [id]);
    return { ok: true, value: { deleted: (res.rowCount ?? 0) > 0 } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'db_error', message } };
  }
}
