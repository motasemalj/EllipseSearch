-- Ensure simulations are unique per batch/prompt/engine.
-- This prevents duplicate rows when Trigger retries or concurrent runs occur.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'simulations_unique_batch_prompt_engine'
  ) THEN
    ALTER TABLE simulations
      ADD CONSTRAINT simulations_unique_batch_prompt_engine
      UNIQUE (analysis_batch_id, prompt_id, engine);
  END IF;
END $$;


