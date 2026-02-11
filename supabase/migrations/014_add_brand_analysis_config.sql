-- Migration: Add brand analysis configuration
-- This supports the new auto-analysis feature where brands are configured
-- to run analysis 3 times daily automatically

-- Add analysis configuration columns to brands table
ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS analysis_engines TEXT[] DEFAULT '{chatgpt,perplexity}',
ADD COLUMN IF NOT EXISTS analysis_regions TEXT[] DEFAULT '{ae}',
ADD COLUMN IF NOT EXISTS auto_analysis_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_auto_analysis_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_auto_analysis_at TIMESTAMPTZ;

-- Create index for finding brands due for analysis
CREATE INDEX IF NOT EXISTS idx_brands_next_auto_analysis 
ON brands(next_auto_analysis_at) 
WHERE auto_analysis_enabled = true;

-- Create table to track auto-analysis runs
CREATE TABLE IF NOT EXISTS auto_analysis_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  analysis_batch_id UUID REFERENCES analysis_batches(id) ON DELETE SET NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'running', 'completed', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for finding pending runs
CREATE INDEX IF NOT EXISTS idx_auto_analysis_runs_status 
ON auto_analysis_runs(status, scheduled_for) 
WHERE status = 'scheduled';

-- Index for brand lookup
CREATE INDEX IF NOT EXISTS idx_auto_analysis_runs_brand 
ON auto_analysis_runs(brand_id);

-- Enable RLS
ALTER TABLE auto_analysis_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies for auto_analysis_runs
CREATE POLICY "Users can view auto analysis runs for their brands" ON auto_analysis_runs
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- Function to schedule next auto-analysis for a brand
CREATE OR REPLACE FUNCTION schedule_next_auto_analysis(p_brand_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_next_time TIMESTAMPTZ;
  v_current_hour INTEGER;
  v_target_hours INTEGER[] := ARRAY[8, 14, 20]; -- 8:00, 14:00, 20:00 UTC
  v_now TIMESTAMPTZ := NOW();
  v_today DATE := v_now::DATE;
  v_target_hour INTEGER;
BEGIN
  v_current_hour := EXTRACT(HOUR FROM v_now AT TIME ZONE 'UTC');
  
  -- Find the next target hour
  SELECT MIN(h) INTO v_target_hour
  FROM unnest(v_target_hours) AS h
  WHERE h > v_current_hour;
  
  IF v_target_hour IS NULL THEN
    -- No more runs today, schedule for tomorrow at 8:00
    v_next_time := (v_today + INTERVAL '1 day')::TIMESTAMPTZ + INTERVAL '8 hours';
  ELSE
    -- Schedule for today at the target hour
    v_next_time := v_today::TIMESTAMPTZ + (v_target_hour || ' hours')::INTERVAL;
  END IF;
  
  -- Update the brand
  UPDATE brands 
  SET next_auto_analysis_at = v_next_time
  WHERE id = p_brand_id;
  
  -- Create the scheduled run record
  INSERT INTO auto_analysis_runs (brand_id, scheduled_for, status)
  VALUES (p_brand_id, v_next_time, 'scheduled')
  ON CONFLICT DO NOTHING;
  
  RETURN v_next_time;
END;
$$ LANGUAGE plpgsql;

-- Function to get brands due for analysis
CREATE OR REPLACE FUNCTION get_brands_due_for_analysis()
RETURNS TABLE (
  brand_id UUID,
  brand_name TEXT,
  brand_domain TEXT,
  organization_id UUID,
  analysis_engines TEXT[],
  analysis_regions TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.domain,
    b.organization_id,
    b.analysis_engines,
    b.analysis_regions
  FROM brands b
  WHERE b.auto_analysis_enabled = true
    AND b.next_auto_analysis_at <= NOW()
    AND NOT EXISTS (
      SELECT 1 FROM auto_analysis_runs ar
      WHERE ar.brand_id = b.id
        AND ar.status = 'running'
    )
  ORDER BY b.next_auto_analysis_at ASC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Trigger to schedule first analysis when brand is created with auto_analysis_enabled
CREATE OR REPLACE FUNCTION schedule_initial_auto_analysis()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.auto_analysis_enabled = true THEN
    PERFORM schedule_next_auto_analysis(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_schedule_initial_analysis
  AFTER INSERT ON brands
  FOR EACH ROW
  EXECUTE FUNCTION schedule_initial_auto_analysis();

-- Add comment explaining the auto-analysis system
COMMENT ON TABLE auto_analysis_runs IS 
'Tracks scheduled and completed automatic analysis runs. 
Brands with auto_analysis_enabled=true will have analyses 
scheduled 3 times daily at 8:00, 14:00, and 20:00 UTC.';

