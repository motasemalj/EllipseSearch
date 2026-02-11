-- Migration: Add analysis configuration to prompts
-- This allows individual prompts to be enabled/disabled from scheduled analyses
-- and to have their own region settings

-- Add analysis configuration columns to prompts table
ALTER TABLE prompts 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS analysis_regions TEXT[] DEFAULT '{ae}';

-- Create index for finding active prompts
CREATE INDEX IF NOT EXISTS idx_prompts_active 
ON prompts(brand_id, is_active) 
WHERE is_active = true;

-- Add comments for clarity
COMMENT ON COLUMN prompts.is_active IS 'Whether this prompt is included in scheduled analysis runs';
COMMENT ON COLUMN prompts.analysis_regions IS 'Regions to analyze this prompt for (e.g., global, us, uk, ae)';

