import { getConfig } from './config/env';
import { healthCheck, closePool } from './db/client';

async function main(): Promise<void> {
  const cfg = getConfig();
  console.log('==============================================');
  console.log('IRFAN XAU LAB • INTELLIGENCE');
  console.log('Telegram Signal Scanner');
  console.log('==============================================');
  console.log(`NODE_ENV       : ${cfg.nodeEnv}`);
  console.log(`SCAN_INTERVAL  : ${cfg.scanner.intervalSeconds}s`);
  console.log(`MIN_RR         : ${cfg.minRrThreshold}`);
  console.log('----------------------------------------------');
  const dbHealth = await healthCheck();
  if (!dbHealth.ok) {
    console.error(`[startup] DATABASE: DOWN (${dbHealth.error ?? 'unknown'})`);
    await closePool();
    process.exit(1);
  }
  console.log(`[startup] DATABASE: OK (${dbHealth.latencyMs}ms)`);
  console.log('[startup] Batch 3C scope ready. API/frontend = Batch 3D.');
  await closePool();
}

main().catch(async (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[startup] FATAL: ${message}`);
  try { await closePool(); } catch { /* ignore */ }
  process.exit(1);
});
