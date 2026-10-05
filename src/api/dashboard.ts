import { getPool } from '../db/client';
import { listEnabledChannels } from '../services/channelService';

export interface DashboardStats {
  readonly channels: {
    readonly total: number;
    readonly connected: number;
    readonly failed: number;
    readonly details: Array<{ username: string; status: string; last_error: string | null; last_success: string | null }>;
  };
  readonly posts: {
    readonly live_posts_last_24h: number;
    readonly total_posts: number;
  };
  readonly signals: {
    readonly parsed_signals: number;
    readonly rr_gte_2_signals: number;
    readonly ready_signals: number;
    readonly new_detections_last_hour: number;
    readonly invalid_rejected: number;
  };
  readonly last_scan: {
    readonly last_cycle_at: string | null;
    readonly next_cycle_at: string | null;
    readonly running: boolean;
  };
  readonly is_fake_data: boolean; // Always false - real Telegram only
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const pool = getPool();
  
  // Channels status - REAL, not fake
  const channelsResult = await listEnabledChannels();
  const channels = channelsResult.ok ? channelsResult.value : [];
  
  const connected = channels.filter(c => c.status === 'ACTIVE').length;
  const failed = channels.filter(c => c.status === 'ERROR' || c.status === 'STALE').length;
  
  const channelDetails = channels.map(c => ({
    username: c.username,
    status: c.status,
    last_error: c.last_error,
    last_success: c.last_success?.toISOString() ?? null,
  }));

  // Real posts count (last 24h = live)
  const postsRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM posts WHERE detected_at > NOW() - INTERVAL '24 hours'`
  );
  const totalPostsRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM posts`
  );

  // Signals stats - REAL
  const parsedRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM signals WHERE lifecycle_status IN ('PARSED','RR_VERIFIED','READY')`
  );
  const rrGte2Res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM signals WHERE rr >= 2.0 AND lifecycle_status IN ('RR_VERIFIED','READY')`
  );
  const readyRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM signals WHERE lifecycle_status = 'READY' AND status = 'READY'`
  );
  const newDetectionsRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM signals WHERE detected_at > NOW() - INTERVAL '1 hour'`
  );
  const invalidRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM signals WHERE lifecycle_status IN ('INVALID','REJECTED')`
  );

  return {
    channels: {
      total: channels.length,
      connected,
      failed,
      details: channelDetails,
    },
    posts: {
      live_posts_last_24h: parseInt(postsRes.rows[0]?.count ?? '0', 10),
      total_posts: parseInt(totalPostsRes.rows[0]?.count ?? '0', 10),
    },
    signals: {
      parsed_signals: parseInt(parsedRes.rows[0]?.count ?? '0', 10),
      rr_gte_2_signals: parseInt(rrGte2Res.rows[0]?.count ?? '0', 10),
      ready_signals: parseInt(readyRes.rows[0]?.count ?? '0', 10),
      new_detections_last_hour: parseInt(newDetectionsRes.rows[0]?.count ?? '0', 10),
      invalid_rejected: parseInt(invalidRes.rows[0]?.count ?? '0', 10),
    },
    last_scan: {
      last_cycle_at: null, // Filled by scheduler state
      next_cycle_at: null,
      running: false,
    },
    is_fake_data: false, // CRITICAL: Never fake LIVE status
  };
}
