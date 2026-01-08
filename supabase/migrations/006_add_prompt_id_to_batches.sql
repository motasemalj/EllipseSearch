-- ===========================================
-- Migration: Add prompt_id to analysis_batches
-- ===========================================
-- Adds prompt_id column to track individual prompt analyses
-- This enables proper tracking when running analysis on a single prompt

-- Add prompt_id column to analysis_batches
ALTER TABLE analysis_batches 
ADD COLUMN IF NOT EXISTS prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE;

COMMENT ON COLUMN analysis_batches.prompt_id IS 'Direct reference to prompt when running single prompt analysis';

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_analysis_batches_prompt ON analysis_batches(prompt_id);

