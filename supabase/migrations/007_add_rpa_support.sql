-- ===========================================
-- Migration: Add RPA Support
-- ===========================================
-- Adds "awaiting_rpa" status to simulations and analysis_batches
-- Also adds region column to simulations if not exists

-- 1. Update analysis_batches status constraint
ALTER TABLE analysis_batches 
DROP CONSTRAINT IF EXISTS analysis_batches_status_check;

ALTER TABLE analysis_batches 
ADD CONSTRAINT analysis_batches_status_check 
CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'awaiting_rpa'));

-- 2. Update simulations status constraint
ALTER TABLE simulations 
DROP CONSTRAINT IF EXISTS simulations_status_check;

ALTER TABLE simulations 
ADD CONSTRAINT simulations_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'awaiting_rpa'));

-- 3. Add region column to simulations if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'simulations' AND column_name = 'region'
  ) THEN
    ALTER TABLE simulations ADD COLUMN region TEXT NOT NULL DEFAULT 'global';
  END IF;
END $$;

-- 4. Create index on simulations status for RPA worker polling
CREATE INDEX IF NOT EXISTS idx_simulations_status ON simulations(status);

-- 5. Add prompt_text to simulations if not exists (for RPA pending endpoint)
-- Already exists per schema, but verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'simulations' AND column_name = 'prompt_text'
  ) THEN
    ALTER TABLE simulations ADD COLUMN prompt_text TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

COMMENT ON COLUMN analysis_batches.status IS 'queued = waiting for Trigger job, processing = running, completed = done, failed = error, awaiting_rpa = waiting for RPA worker';
COMMENT ON COLUMN simulations.status IS 'pending = not started, processing = running, completed = done, failed = error, awaiting_rpa = waiting for RPA worker';

