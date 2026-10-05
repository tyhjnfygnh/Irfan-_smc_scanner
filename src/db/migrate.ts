import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../config/env';
import { getPool, closePool, query } from './client';

interface MigrationFile {
  readonly name: string;
  readonly fullPath: string;
}

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

function listMigrationFiles(): MigrationFile[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`[migrate] Migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  const entries = fs.readdirSync(MIGRATIONS_DIR);
  const sqlFiles = entries.filter((f) => f.endsWith('.sql'));
  sqlFiles.sort();
  return sqlFiles.map((name) => ({ name, fullPath: path.join(MIGRATIONS_DIR, name) }));
}

async function ensureMigrationsTable(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);
}

async function alreadyApplied(name: string): Promise<boolean> {
  const res = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM schema_migrations WHERE name = $1',
    [name]
  );
  const row = res.rows[0];
  return row !== undefined && row.count !== '0';
}

async function applyMigration(file: MigrationFile): Promise<void> {
  const sql = fs.readFileSync(file.fullPath, 'utf8');
  if (sql.trim() === '') {
    console.log(`[migrate] Skipping empty file: ${file.name}`);
    return;
  }
  console.log(`[migrate] Applying: ${file.name}`);
  const started = Date.now();
  await query(sql);
  const ms = Date.now() - started;
  console.log(`[migrate] Applied: ${file.name} (${ms}ms)`);
}

async function main(): Promise<void> {
  const cfg = getConfig();
  console.log(`[migrate] NODE_ENV=${cfg.nodeEnv}`);
  const pool = getPool();
  await pool.query('SELECT 1');
  console.log('[migrate] Database connection: OK');
  await ensureMigrationsTable();
  const files = listMigrationFiles();
  let appliedCount = 0;
  let skippedCount = 0;
  for (const file of files) {
    if (await alreadyApplied(file.name)) {
      console.log(`[migrate] Already applied: ${file.name}`);
      skippedCount += 1;
      continue;
    }
    await applyMigration(file);
    appliedCount += 1;
  }
  console.log(`[migrate] Done. Applied=${appliedCount} Skipped=${skippedCount} Total=${files.length}`);
}

main()
  .then(async () => { await closePool(); process.exit(0); })
  .catch(async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[migrate] FAILED: ${message}`);
    try { await closePool(); } catch { /* ignore */ }
    process.exit(1);
  });
