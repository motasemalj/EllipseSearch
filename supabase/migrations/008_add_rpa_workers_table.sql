-- ===========================================
-- Migration: Add RPA Workers Table
-- ===========================================
-- Tracks RPA worker heartbeats so the platform knows when RPA is available.
-- Used to automatically switch between RPA mode and API fallback.

CREATE TABLE IF NOT EXISTS rpa_workers (
  id TEXT PRIMARY KEY,  -- Worker ID (e.g., worker_abc123)
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chrome_connected BOOLEAN NOT NULL DEFAULT FALSE,
  engines_ready TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rpa_workers_heartbeat ON rpa_workers(last_heartbeat);

-- Function to clean up stale workers (older than 30 seconds)
CREATE OR REPLACE FUNCTION cleanup_stale_rpa_workers()
RETURNS void AS $$
BEGIN
  DELETE FROM rpa_workers 
  WHERE last_heartbeat < NOW() - INTERVAL '30 seconds';
END;
$$ LANGUAGE plpgsql;

-- No RLS needed - this is internal platform data
-- Service role will be used for all access

COMMENT ON TABLE rpa_workers IS 'Tracks RPA worker heartbeats for automatic mode selection';

