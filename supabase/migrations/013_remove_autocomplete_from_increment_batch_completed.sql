-- ===========================================
-- Migration: Stop auto-completing analysis batches in increment_batch_completed()
-- ===========================================
-- We only want batches to be marked completed when ALL Trigger enrichment work is finished.
-- That is handled by the `finalize-analysis-batch` Trigger task.

CREATE OR REPLACE FUNCTION increment_batch_completed(batch_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE analysis_batches
  SET completed_simulations = completed_simulations + 1,
      updated_at = NOW()
  WHERE id = batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


