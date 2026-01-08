-- Migration: Make keyword_set_id optional in analysis_batches and keywords
-- This allows running analysis on individual prompts without requiring a prompt set

-- Make keyword_set_id nullable in analysis_batches
ALTER TABLE analysis_batches ALTER COLUMN keyword_set_id DROP NOT NULL;
COMMENT ON COLUMN analysis_batches.keyword_set_id IS 'Optional: Can be null when running analysis on individual prompts';

-- Make keyword_set_id nullable in keywords (allows prompts without a set)
ALTER TABLE keywords ALTER COLUMN keyword_set_id DROP NOT NULL;
COMMENT ON COLUMN keywords.keyword_set_id IS 'Optional: Can be null for ungrouped prompts';

