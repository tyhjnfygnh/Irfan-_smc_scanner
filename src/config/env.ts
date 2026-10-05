import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export type NodeEnv = 'development' | 'production' | 'test';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly logLevel: LogLevel;
  readonly database: {
    readonly url: string;
    readonly poolMax: number;
    readonly idleTimeoutMs: number;
    readonly connectionTimeoutMs: number;
  };
  readonly scanner: {
    readonly intervalSeconds: number;
    readonly fetchTimeoutMs: number;
    readonly fetchMaxRetries: number;
    readonly fetchBackoffBaseMs: number;
  };
  readonly api: {
    readonly port: number;
    readonly host: string;
  };
  readonly minRrThreshold: number;
  readonly email: {
    readonly gmailUser: string | null;
    readonly gmailAppPassword: string | null;
    readonly alertRecipient: string | null;
  };
}

function readRaw(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function required(name: string): string {
  const value = readRaw(name);
  if (value === undefined) {
    throw new Error(`[env] Missing required environment variable: ${name}.`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return readRaw(name) ?? fallback;
}

function parseStrictInt(
  name: string,
  raw: string,
  opts: { min?: number; max?: number } = {}
): number {
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`[env] ${name} must be a base-10 integer, got: "${raw}"`);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) {
    throw new Error(`[env] ${name} is not a safe integer: "${raw}"`);
  }
  if (opts.min !== undefined && n < opts.min) {
    throw new Error(`[env] ${name} must be >= ${opts.min}, got: ${n}`);
  }
  if (opts.max !== undefined && n > opts.max) {
    throw new Error(`[env] ${name} must be <= ${opts.max}, got: ${n}`);
  }
  return n;
}

function parseStrictFloat(
  name: string,
  raw: string,
  opts: { min?: number; max?: number; exclusiveMin?: boolean } = {}
): number {
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`[env] ${name} must be a decimal number, got: "${raw}"`);
  }
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`[env] ${name} is not finite: "${raw}"`);
  }
  if (opts.exclusiveMin !== undefined && n <= opts.exclusiveMin) {
    throw new Error(`[env] ${name} must be > ${opts.exclusiveMin}, got: ${n}`);
  }
  if (opts.min !== undefined && n < opts.min) {
    throw new Error(`[env] ${name} must be >= ${opts.min}, got: ${n}`);
  }
  if (opts.max !== undefined && n > opts.max) {
    throw new Error(`[env] ${name} must be <= ${opts.max}, got: ${n}`);
  }
  return n;
}

function parseNodeEnv(raw: string): NodeEnv {
  if (raw === 'production' || raw === 'development' || raw === 'test') {
    return raw;
  }
  throw new Error(`[env] NODE_ENV invalid: "${raw}"`);
}

function parseLogLevel(raw: string): LogLevel {
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  throw new Error(`[env] LOG_LEVEL invalid: "${raw}"`);
}

function parseDatabaseUrl(name: string, raw: string): string {
  if (!raw.startsWith('postgres://') && !raw.startsWith('postgresql://')) {
    throw new Error(`[env] ${name} must start with postgres:// or postgresql://`);
  }
  try {
    new URL(raw);
  } catch {
    throw new Error(`[env] ${name} is not a valid URL.`);
  }
  return raw;
}

function buildConfig(): AppConfig {
  const nodeEnv = parseNodeEnv(optional('NODE_ENV', 'development'));
  const logLevel = parseLogLevel(optional('LOG_LEVEL', 'info'));

  return {
    nodeEnv,
    logLevel,
    database: {
      url: parseDatabaseUrl('DATABASE_URL', required('DATABASE_URL')),
      poolMax: parseStrictInt('PG_POOL_MAX', optional('PG_POOL_MAX', '10'), { min: 1, max: 1000 }),
      idleTimeoutMs: parseStrictInt('PG_IDLE_TIMEOUT_MS', optional('PG_IDLE_TIMEOUT_MS', '30000'), { min: 0, max: 3600000 }),
      connectionTimeoutMs: parseStrictInt('PG_CONNECTION_TIMEOUT_MS', optional('PG_CONNECTION_TIMEOUT_MS', '5000'), { min: 0, max: 600000 }),
    },
    scanner: {
      intervalSeconds: parseStrictInt('SCAN_INTERVAL_SECONDS', optional('SCAN_INTERVAL_SECONDS', '60'), { min: 10, max: 86400 }),
      fetchTimeoutMs: parseStrictInt('FETCH_TIMEOUT_MS', optional('FETCH_TIMEOUT_MS', '10000'), { min: 100, max: 120000 }),
      fetchMaxRetries: parseStrictInt('FETCH_MAX_RETRIES', optional('FETCH_MAX_RETRIES', '3'), { min: 0, max: 20 }),
      fetchBackoffBaseMs: parseStrictInt('FETCH_BACKOFF_BASE_MS', optional('FETCH_BACKOFF_BASE_MS', '2000'), { min: 100, max: 600000 }),
    },
    api: {
      port: parseStrictInt('API_PORT', optional('API_PORT', '3000'), { min: 1, max: 65535 }),
      host: optional('API_HOST', '0.0.0.0'),
    },
    minRrThreshold: parseStrictFloat('MIN_RR_THRESHOLD', optional('MIN_RR_THRESHOLD', '2.0'), { exclusiveMin: 0, max: 1000 }),
    email: {
      gmailUser: readRaw('GMAIL_USER') ?? null,
      gmailAppPassword: readRaw('GMAIL_APP_PASSWORD') ?? null,
      alertRecipient: readRaw('ALERT_RECIPIENT') ?? null,
    },
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached === null) {
    cached = buildConfig();
  }
  return cached;
}

export function resetConfigCacheForTests(): void {
  cached = null;
}
