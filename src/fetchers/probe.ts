import { getPool } from '../db/client';
import { fetcherRegistry } from './registry';
import { FetchOutcome, FetchResult } from './types';

export interface ProbeResult extends FetchResult {
  readonly channelId: number;
  readonly username: string;
}

export async function probeChannel(channelId: number, username: string): Promise<ProbeResult> {
  const fetcher = fetcherRegistry.getDefault();
  const result = await fetcher.fetch(username);
  const status = mapOutcomeToStatus(result.outcome);
  const pool = getPool();

  if (result.outcome === 'ok') {
    await pool.query(
      `UPDATE channels SET status = $1, last_checked = NOW(), last_success = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $2`,
      [status, channelId]
    );
  } else {
    await pool.query(
      `UPDATE channels SET status = $1, last_checked = NOW(), last_error = $2, updated_at = NOW() WHERE id = $3`,
      [status, result.error, channelId]
    );
  }

  return { ...result, channelId, username };
}

function mapOutcomeToStatus(outcome: FetchOutcome): string {
  switch (outcome) {
    case 'ok': return 'ACTIVE';
    case 'empty': return 'PARTIAL';
    case 'not_found': return 'ERROR';
    case 'rate_limited':
    case 'forbidden':
    case 'server_error':
    case 'network_error':
      return 'ERROR';
    case 'parse_error': return 'ERROR';
    default: return 'UNKNOWN';
  }
}
