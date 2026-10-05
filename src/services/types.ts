import type { QueryResultRow } from 'pg';

export type ChannelStatus = 'ACTIVE' | 'PARTIAL' | 'STALE' | 'UNKNOWN' | 'DISABLED' | 'ERROR';

export interface ChannelRow {
  readonly id: number;
  readonly username: string;
  readonly display_name: string | null;
  readonly is_enabled: boolean;
  readonly scan_interval: number;
  readonly status: ChannelStatus;
  readonly last_checked: Date | null;
  readonly last_success: Date | null;
  readonly last_error: string | null;
  readonly added_at: Date;
  readonly updated_at: Date;
}

export interface CreateChannelInput {
  readonly username: string;
  readonly display_name?: string | null;
  readonly is_enabled?: boolean;
  readonly scan_interval?: number;
}

export interface UpdateChannelInput {
  readonly display_name?: string | null;
  readonly is_enabled?: boolean;
  readonly scan_interval?: number;
}

export interface PostRow {
  readonly id: number;
  readonly channel_id: number;
  readonly message_id: string;
  readonly message_text: string | null;
  readonly posted_at: Date | null;
  readonly detected_at: Date;
  readonly raw_html_hash: string | null;
}

export interface InsertPostInput {
  readonly channel_id: number;
  readonly message_id: string;
  readonly message_text: string | null;
  readonly posted_at: Date | null;
  readonly raw_html_hash: string | null;
}

export type SignalDirection = 'BUY' | 'SELL';
export type SignalStatus = 'READY' | 'BELOW_2R' | 'INVALID' | 'DUPLICATE';

export interface SignalRow {
  readonly id: number;
  readonly channel_id: number;
  readonly message_id: string;
  readonly symbol: string | null;
  readonly direction: SignalDirection | null;
  readonly entry: string | null;
  readonly sl: string | null;
  readonly tp: string | null;
  readonly tp_levels: unknown | null;
  readonly risk: string | null;
  readonly reward: string | null;
  readonly rr: string | null;
  readonly status: SignalStatus;
  readonly original_text: string | null;
  readonly posted_at: Date | null;
  readonly detected_at: Date;
  readonly emailed: boolean;
}

export interface InsertSignalInput {
  readonly channel_id: number;
  readonly message_id: string;
  readonly symbol: string | null;
  readonly direction: SignalDirection | null;
  readonly entry: number | null;
  readonly sl: number | null;
  readonly tp: number | null;
  readonly tp_levels: unknown | null;
  readonly risk: number | null;
  readonly reward: number | null;
  readonly rr: number | null;
  readonly status: SignalStatus;
  readonly original_text: string | null;
  readonly posted_at: Date | null;
}

export type InsertOutcome<T> =
  | { readonly outcome: 'inserted'; readonly row: T }
  | { readonly outcome: 'duplicate'; readonly existing: T };

export type ServiceError =
  | { readonly kind: 'not_found'; readonly message: string }
  | { readonly kind: 'invalid_input'; readonly message: string }
  | { readonly kind: 'db_error'; readonly message: string };

export type ServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ServiceError };

export interface RawChannelRow extends QueryResultRow {
  id: string;
  username: string;
  display_name: string | null;
  is_enabled: boolean;
  scan_interval: number;
  status: string;
  last_checked: Date | null;
  last_success: Date | null;
  last_error: string | null;
  added_at: Date;
  updated_at: Date;
}

export interface RawPostRow extends QueryResultRow {
  id: string;
  channel_id: string;
  message_id: string;
  message_text: string | null;
  posted_at: Date | null;
  detected_at: Date;
  raw_html_hash: string | null;
}

export interface RawSignalRow extends QueryResultRow {
  id: string;
  channel_id: string;
  message_id: string;
  symbol: string | null;
  direction: string | null;
  entry: string | null;
  sl: string | null;
  tp: string | null;
  tp_levels: unknown | null;
  risk: string | null;
  reward: string | null;
  rr: string | null;
  status: string;
  original_text: string | null;
  posted_at: Date | null;
  detected_at: Date;
  emailed: boolean;
}
