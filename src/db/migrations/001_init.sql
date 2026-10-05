BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS channels (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  scan_interval INTEGER NOT NULL DEFAULT 60 CHECK (scan_interval >= 10),
  status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('ACTIVE','PARTIAL','STALE','UNKNOWN','DISABLED','ERROR')),
  last_checked TIMESTAMPTZ,
  last_success TIMESTAMPTZ,
  last_error TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT channels_username_no_at CHECK (username NOT LIKE '@%'),
  CONSTRAINT channels_username_lowercase CHECK (username = LOWER(username)),
  CONSTRAINT channels_username_no_spaces CHECK (username !~ '\s')
);

CREATE INDEX IF NOT EXISTS idx_channels_enabled ON channels (is_enabled) WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels (status);

CREATE TABLE IF NOT EXISTS scan_groups (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  interval_sec INTEGER NOT NULL DEFAULT 60 CHECK (interval_sec >= 10),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_groups_active ON scan_groups (is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS scan_group_channels (
  scan_group_id BIGINT NOT NULL REFERENCES scan_groups(id) ON DELETE CASCADE,
  channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scan_group_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_scan_group_channels_channel ON scan_group_channels (channel_id);

CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL,
  message_text TEXT,
  posted_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_html_hash TEXT,
  CONSTRAINT posts_channel_message_unique UNIQUE (channel_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_posts_channel_posted ON posts (channel_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_detected ON posts (detected_at DESC);

CREATE TABLE IF NOT EXISTS signals (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  message_id BIGINT NOT NULL,
  symbol TEXT,
  direction TEXT CHECK (direction IN ('BUY','SELL')),
  entry NUMERIC(18,6),
  sl NUMERIC(18,6),
  tp NUMERIC(18,6),
  tp_levels JSONB,
  risk NUMERIC(18,6),
  reward NUMERIC(18,6),
  rr NUMERIC(10,4),
  status TEXT NOT NULL DEFAULT 'INVALID' CHECK (status IN ('READY','BELOW_2R','INVALID','DUPLICATE')),
  original_text TEXT,
  posted_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  emailed BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT signals_channel_message_unique UNIQUE (channel_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_signals_status_rr ON signals (status, rr DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_signals_channel_detected ON signals (channel_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_emailed ON signals (emailed) WHERE emailed = FALSE;

CREATE TABLE IF NOT EXISTS scan_logs (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT REFERENCES channels(id) ON DELETE SET NULL,
  scan_type TEXT NOT NULL CHECK (scan_type IN ('auto','custom','manual')),
  status TEXT NOT NULL CHECK (status IN ('success','error')),
  posts_found INTEGER NOT NULL DEFAULT 0,
  new_signals INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_logs_channel_created ON scan_logs (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_status_created ON scan_logs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS email_log (
  id BIGSERIAL PRIMARY KEY,
  signal_id BIGINT REFERENCES signals(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_log_signal ON email_log (signal_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_channels_updated_at ON channels;
CREATE TRIGGER trg_channels_updated_at BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_scan_groups_updated_at ON scan_groups;
CREATE TRIGGER trg_scan_groups_updated_at BEFORE UPDATE ON scan_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO schema_migrations (name) VALUES ('001_init') ON CONFLICT (name) DO NOTHING;

COMMIT;
