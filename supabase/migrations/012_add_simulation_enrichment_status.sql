-- Add enrichment/progress fields to simulations for async enrichment + realtime UI.

DO $$
BEGIN
  -- analysis_stage: human-readable stage for UI ("simulating", "enriching", etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'simulations' AND column_name = 'analysis_stage'
  ) THEN
    ALTER TABLE simulations ADD COLUMN analysis_stage TEXT;
  END IF;

  -- enrichment_status: tracks async enrichment lifecycle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'simulations' AND column_name = 'enrichment_status'
  ) THEN
    ALTER TABLE simulations ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (enrichment_status IN ('pending', 'queued', 'processing', 'completed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'simulations' AND column_name = 'enrichment_started_at'
  ) THEN
    ALTER TABLE simulations ADD COLUMN enrichment_started_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'simulations' AND column_name = 'enrichment_completed_at'
  ) THEN
    ALTER TABLE simulations ADD COLUMN enrichment_completed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'simulations' AND column_name = 'enrichment_error'
  ) THEN
    ALTER TABLE simulations ADD COLUMN enrichment_error TEXT;
  END IF;
END $$;


