import { getConfig } from '../src/config/env';
import { closePool, query } from '../src/db/client';
import { createChannel, deleteChannel, getChannelByUsername } from '../src/services/channelService';
import { listSignals } from '../src/services/signalService';
import { listRecentPosts } from '../src/services/postService';
import { runScanCycle } from '../src/scanner/scanCycle';
import { scheduler } from '../src/scheduler/cron';

async function main(): Promise<number> {
  const cfg = getConfig();
  console.log('IRFAN XAU LAB • INTELLIGENCE - RUNTIME TEST');
  console.log(`MIN_RR=${cfg.minRrThreshold} INTERVAL=${cfg.scanner.intervalSeconds}s`);
  try {
    await query('SELECT 1');
    console.log('[DB] OK');
  } catch (e) {
    console.error('[DB] FAIL', e);
    return 1;
  }
  const TEST_USERNAME = 'tradewithmahak';
  let channelId: number | null = null;
  const existing = await getChannelByUsername(TEST_USERNAME);
  if (existing.ok) channelId = existing.value.id;
  else {
    const created = await createChannel({ username: TEST_USERNAME, display_name: 'Runtime Test Channel', is_enabled: true });
    if (created.ok) channelId = created.value.id;
  }
  console.log(`[Channel] ${TEST_USERNAME} id=${channelId}`);
  const cycle1 = await runScanCycle();
  console.log(`[Cycle1] attempted=${cycle1.channelsAttempted} succeeded=${cycle1.channelsSucceeded} newPosts=${cycle1.totalNewPosts} newSignals=${cycle1.totalNewSignals}`);
  for (const cr of cycle1.channelResults) {
    console.log(`  ${cr.username}: ${cr.fetchOutcome} posts=${cr.postsSeen} new=${cr.postsNew} signals=${cr.signalsNew}`);
  }
  const posts = await listRecentPosts(20);
  if (posts.ok) console.log(`[Posts] ${posts.value.length} rows`);
  const signals = await listSignals({ limit: 20 });
  if (signals.ok) {
    console.log(`[Signals] ${signals.value.length} rows`);
    for (const s of signals.value) console.log(`  ${s.symbol} ${s.direction} RR=${s.rr} status=${s.status}`);
  }
  scheduler.start();
  console.log('[Scheduler] started, state:', scheduler.getState().running);
  scheduler.pause();
  console.log('[Scheduler] paused');
  return 0;
}

main().then(async (code) => { try { await closePool(); } catch {} process.exit(code); }).catch(async (err) => { console.error(err); try { await closePool(); } catch {} process.exit(1); });
