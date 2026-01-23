-- ===========================================
-- Migration: Add Scheduled Analyses Table
-- ===========================================
-- Stores recurring analysis schedules for prompts and prompt sets

-- Enum for schedule frequency
CREATE TYPE schedule_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly');

-- Table for scheduled analyses
CREATE TABLE IF NOT EXISTS scheduled_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
  prompt_set_id UUID REFERENCES prompt_sets(id) ON DELETE CASCADE,
  engines TEXT[] NOT NULL DEFAULT '{chatgpt}'::text[],
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar')),
  region TEXT NOT NULL DEFAULT 'global',
  enable_hallucination_watchdog BOOLEAN NOT NULL DEFAULT FALSE,
  frequency schedule_frequency NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- At least one of prompt_id or prompt_set_id must be set
  CONSTRAINT scheduled_analyses_target_check CHECK (
    prompt_id IS NOT NULL OR prompt_set_id IS NOT NULL
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_analyses_brand ON scheduled_analyses(brand_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_analyses_prompt ON scheduled_analyses(prompt_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_analyses_prompt_set ON scheduled_analyses(prompt_set_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_analyses_next_run ON scheduled_analyses(next_run_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_scheduled_analyses_active ON scheduled_analyses(is_active) WHERE is_active = TRUE;

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_scheduled_analyses_updated_at
  BEFORE UPDATE ON scheduled_analyses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE scheduled_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view scheduled analyses" ON scheduled_analyses
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can create scheduled analyses" ON scheduled_analyses
  FOR INSERT WITH CHECK (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can update scheduled analyses" ON scheduled_analyses
  FOR UPDATE USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can delete scheduled analyses" ON scheduled_analyses
  FOR DELETE USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- Add schedule_id to analysis_batches to track which schedule triggered the batch
ALTER TABLE analysis_batches 
  ADD COLUMN IF NOT EXISTS scheduled_analysis_id UUID REFERENCES scheduled_analyses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_batches_scheduled ON analysis_batches(scheduled_analysis_id);

