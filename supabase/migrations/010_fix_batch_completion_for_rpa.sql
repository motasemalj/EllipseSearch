-- ===========================================
-- Fix increment_batch_completed to support RPA batches
-- ===========================================
-- Run this migration to allow RPA batches to be marked as completed

CREATE OR REPLACE FUNCTION increment_batch_completed(batch_id UUID)
RETURNS void AS $$
DECLARE
  current_completed INT;
  total INT;
BEGIN
  -- Increment and get new values
  UPDATE analysis_batches
  SET completed_simulations = completed_simulations + 1,
      updated_at = NOW()
  WHERE id = batch_id
  RETURNING completed_simulations, total_simulations INTO current_completed, total;
  
  -- Auto-complete batch if all simulations are done
  -- Support both 'processing' and 'awaiting_rpa' statuses for RPA mode
  IF current_completed >= total THEN
    UPDATE analysis_batches
    SET status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = batch_id AND status IN ('processing', 'awaiting_rpa');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

