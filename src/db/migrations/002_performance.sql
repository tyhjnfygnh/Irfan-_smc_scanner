BEGIN;

-- Performance tracking for future expansion
ALTER TABLE signals ADD COLUMN IF NOT EXISTS performance_status TEXT CHECK (performance_status IN ('OPEN','TP1_HIT','TP2_HIT','TP_HIT','SL_HIT','BREAKEVEN','MANUAL_CLOSE')) DEFAULT NULL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS actual_rr NUMERIC(10,4) DEFAULT NULL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS close_price NUMERIC(18,6) DEFAULT NULL;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- Lifecycle status tracking (DETECTED, PARSED, RR_VERIFIED, READY, INVALID, REJECTED)
ALTER TABLE signals ADD COLUMN IF NOT EXISTS lifecycle_status TEXT CHECK (lifecycle_status IN ('DETECTED','PARSED','RR_VERIFIED','READY','INVALID','REJECTED')) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_signals_lifecycle ON signals (lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_signals_performance ON signals (performance_status);

-- Dashboard stats materialized view for real-time stats
CREATE TABLE IF NOT EXISTS scanner_stats (
  id BIGSERIAL PRIMARY KEY,
  channels_connected INTEGER NOT NULL DEFAULT 0,
  channels_failed INTEGER NOT NULL DEFAULT 0,
  live_posts INTEGER NOT NULL DEFAULT 0,
  parsed_signals INTEGER NOT NULL DEFAULT 0,
  rr_gte_2_signals INTEGER NOT NULL DEFAULT 0,
  ready_signals INTEGER NOT NULL DEFAULT 0,
  new_detections INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (name) VALUES ('002_performance') ON CONFLICT (name) DO NOTHING;

COMMIT;
