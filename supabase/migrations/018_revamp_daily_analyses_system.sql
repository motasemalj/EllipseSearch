-- ===========================================
-- Migration: Revamp Daily Analyses System
-- ===========================================
-- Implements a simplified daily analyses system:
-- 1. Users only toggle "Daily Analyses" on/off
-- 2. Analyses run 3x daily at 8-hour intervals from anchor time
-- 3. Intelligent job spacing via RPA job queue
-- 4. New prompts sync to batch cycles with 1-hour window rule

-- ===========================================
-- 1. Update brands table with simplified daily analyses fields
-- ===========================================

-- Add daily analyses toggle and anchor time
ALTER TABLE brands 
ADD COLUMN IF NOT EXISTS daily_analyses_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS daily_schedule_anchor_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_daily_run_at TIMESTAMPTZ;

-- Note: auto_analysis_enabled column may not exist in all databases
-- This migration creates the new simplified daily_analyses_enabled system

-- Create index for finding brands due for daily analysis
CREATE INDEX IF NOT EXISTS idx_brands_next_daily_run 
ON brands(next_daily_run_at) 
WHERE daily_analyses_enabled = true;

-- ===========================================
-- 2. Add prompt analysis tracking
-- ===========================================

-- Track when a prompt was first analyzed (for batch sync logic)
ALTER TABLE prompts 
ADD COLUMN IF NOT EXISTS first_analyzed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Index for finding active prompts
CREATE INDEX IF NOT EXISTS idx_prompts_active 
ON prompts(brand_id, is_active) 
WHERE is_active = true;

-- ===========================================
-- 3. RPA Job Queue for intelligent spacing
-- ===========================================

-- Job priority levels (only create if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rpa_job_priority') THEN
    CREATE TYPE rpa_job_priority AS ENUM ('immediate', 'high', 'normal', 'low');
  END IF;
END $$;

-- Main RPA job queue table
CREATE TABLE IF NOT EXISTS rpa_job_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  analysis_batch_id UUID REFERENCES analysis_batches(id) ON DELETE SET NULL,
  engine TEXT NOT NULL CHECK (engine IN ('chatgpt', 'gemini', 'grok', 'perplexity')),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar')),
  region TEXT NOT NULL DEFAULT 'global',
  
  -- Scheduling
  priority rpa_job_priority NOT NULL DEFAULT 'normal',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  earliest_start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Waiting to be processed
    'scheduled',    -- Assigned a time slot
    'processing',   -- Currently being processed
    'completed',    -- Successfully completed
    'failed',       -- Failed (will retry)
    'cancelled'     -- Manually cancelled
  )),
  
  -- Worker tracking
  claimed_by_worker_id TEXT,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Retry handling
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  
  -- Rate limiting context
  engine_cooldown_until TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queue queries
CREATE INDEX IF NOT EXISTS idx_rpa_queue_pending 
ON rpa_job_queue(status, priority, scheduled_at) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_rpa_queue_engine 
ON rpa_job_queue(engine, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_rpa_queue_brand 
ON rpa_job_queue(brand_id, status);

CREATE INDEX IF NOT EXISTS idx_rpa_queue_batch 
ON rpa_job_queue(analysis_batch_id);

CREATE INDEX IF NOT EXISTS idx_rpa_queue_worker 
ON rpa_job_queue(claimed_by_worker_id, status) 
WHERE status = 'processing';

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_rpa_job_queue_updated_at
  BEFORE UPDATE ON rpa_job_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- 4. Daily Analysis Schedule Slots
-- ===========================================

-- Tracks the 3 daily run slots for each brand (8-hour intervals)
CREATE TABLE IF NOT EXISTS daily_analysis_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL CHECK (slot_number IN (1, 2, 3)),
  
  -- Slot timing (computed from anchor_time + slot_number * 8 hours)
  scheduled_time TIMESTAMPTZ NOT NULL,
  
  -- Execution tracking
  analysis_batch_id UUID REFERENCES analysis_batches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',    -- Waiting for this slot
    'running',      -- Currently executing
    'completed',    -- Finished
    'skipped',      -- Skipped (e.g., no prompts)
    'failed'        -- Failed to execute
  )),
  
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Stats
  prompts_count INTEGER DEFAULT 0,
  simulations_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one slot per brand per slot number per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_slots_unique 
ON daily_analysis_slots(brand_id, slot_number, DATE(scheduled_time));

-- Index for finding due slots
CREATE INDEX IF NOT EXISTS idx_daily_slots_scheduled 
ON daily_analysis_slots(scheduled_time, status) 
WHERE status = 'scheduled';

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_daily_analysis_slots_updated_at
  BEFORE UPDATE ON daily_analysis_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- 5. RPA Engine Rate Limits Table
-- ===========================================

-- Tracks rate limits and cooldowns per engine
CREATE TABLE IF NOT EXISTS rpa_engine_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engine TEXT NOT NULL UNIQUE CHECK (engine IN ('chatgpt', 'gemini', 'grok', 'perplexity')),
  
  -- Rate limiting
  requests_per_minute INTEGER NOT NULL DEFAULT 3,
  requests_per_hour INTEGER NOT NULL DEFAULT 30,
  min_delay_seconds INTEGER NOT NULL DEFAULT 15,
  max_delay_seconds INTEGER NOT NULL DEFAULT 45,
  
  -- Cooldown tracking
  current_cooldown_until TIMESTAMPTZ,
  last_request_at TIMESTAMPTZ,
  requests_in_current_minute INTEGER NOT NULL DEFAULT 0,
  requests_in_current_hour INTEGER NOT NULL DEFAULT 0,
  
  -- Error tracking for adaptive rate limiting
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  last_error_at TIMESTAMPTZ,
  error_backoff_until TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initialize default rate limits for each engine
INSERT INTO rpa_engine_limits (engine, requests_per_minute, requests_per_hour, min_delay_seconds, max_delay_seconds) 
VALUES 
  ('chatgpt', 2, 20, 20, 60),     -- ChatGPT: Conservative limits
  ('perplexity', 3, 30, 15, 45),  -- Perplexity: Moderate limits
  ('gemini', 4, 40, 12, 35),      -- Gemini: More lenient
  ('grok', 4, 40, 12, 35)         -- Grok: More lenient
ON CONFLICT (engine) DO NOTHING;

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER update_rpa_engine_limits_updated_at
  BEFORE UPDATE ON rpa_engine_limits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- 6. Helper Functions
-- ===========================================

-- Function to calculate next 3 daily run slots from anchor time
CREATE OR REPLACE FUNCTION calculate_daily_slots(
  p_anchor_time TIMESTAMPTZ,
  p_for_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  slot_number INTEGER,
  scheduled_time TIMESTAMPTZ
) AS $$
DECLARE
  v_base_time TIMESTAMPTZ;
  v_slot_1 TIMESTAMPTZ;
  v_slot_2 TIMESTAMPTZ;
  v_slot_3 TIMESTAMPTZ;
BEGIN
  -- Extract just the time portion from anchor and apply to requested date
  v_base_time := p_for_date + (p_anchor_time::TIME);
  
  -- Calculate 3 slots at 8-hour intervals
  v_slot_1 := v_base_time;
  v_slot_2 := v_base_time + INTERVAL '8 hours';
  v_slot_3 := v_base_time + INTERVAL '16 hours';
  
  -- If slot wraps to next day, that's okay
  -- Return all three slots
  RETURN QUERY VALUES (1, v_slot_1), (2, v_slot_2), (3, v_slot_3);
END;
$$ LANGUAGE plpgsql;

-- Function to enable daily analyses for a brand
CREATE OR REPLACE FUNCTION enable_daily_analyses(
  p_brand_id UUID,
  p_anchor_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS VOID AS $$
DECLARE
  v_slot RECORD;
  v_today DATE := CURRENT_DATE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Update brand settings
  UPDATE brands SET
    daily_analyses_enabled = true,
    daily_schedule_anchor_time = p_anchor_time,
    next_daily_run_at = (
      SELECT MIN(scheduled_time) 
      FROM calculate_daily_slots(p_anchor_time, v_today)
      WHERE scheduled_time > v_now
    )
  WHERE id = p_brand_id;
  
  -- Create slots for today and tomorrow
  FOR v_slot IN 
    SELECT * FROM calculate_daily_slots(p_anchor_time, v_today)
    UNION ALL
    SELECT * FROM calculate_daily_slots(p_anchor_time, v_today + 1)
  LOOP
    IF v_slot.scheduled_time > v_now THEN
      INSERT INTO daily_analysis_slots (brand_id, slot_number, scheduled_time, status)
      VALUES (p_brand_id, v_slot.slot_number, v_slot.scheduled_time, 'scheduled')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to disable daily analyses for a brand
CREATE OR REPLACE FUNCTION disable_daily_analyses(p_brand_id UUID) 
RETURNS VOID AS $$
BEGIN
  UPDATE brands SET
    daily_analyses_enabled = false,
    next_daily_run_at = NULL
  WHERE id = p_brand_id;
  
  -- Cancel pending slots
  UPDATE daily_analysis_slots SET
    status = 'skipped'
  WHERE brand_id = p_brand_id
    AND status = 'scheduled';
    
  -- Cancel pending queue jobs
  UPDATE rpa_job_queue SET
    status = 'cancelled'
  WHERE brand_id = p_brand_id
    AND status IN ('pending', 'scheduled');
END;
$$ LANGUAGE plpgsql;

-- Function to get next available job from queue (with rate limiting)
CREATE OR REPLACE FUNCTION claim_next_rpa_job(
  p_worker_id TEXT,
  p_engines TEXT[] DEFAULT ARRAY['chatgpt', 'gemini', 'grok', 'perplexity']
) RETURNS TABLE (
  job_id UUID,
  brand_id UUID,
  prompt_id UUID,
  prompt_text TEXT,
  analysis_batch_id UUID,
  engine TEXT,
  language TEXT,
  region TEXT
) AS $$
DECLARE
  v_job RECORD;
  v_limit RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Find the next available job respecting rate limits
  FOR v_job IN
    SELECT q.*
    FROM rpa_job_queue q
    WHERE q.status = 'pending'
      AND q.engine = ANY(p_engines)
      AND q.earliest_start_at <= v_now
      AND (q.next_retry_at IS NULL OR q.next_retry_at <= v_now)
    ORDER BY q.priority DESC, q.scheduled_at ASC
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Check engine rate limits
    SELECT * INTO v_limit FROM rpa_engine_limits WHERE engine = v_job.engine;
    
    IF v_limit IS NOT NULL THEN
      -- Skip if engine is in cooldown
      IF v_limit.current_cooldown_until IS NOT NULL AND v_limit.current_cooldown_until > v_now THEN
        CONTINUE;
      END IF;
      
      -- Skip if in error backoff
      IF v_limit.error_backoff_until IS NOT NULL AND v_limit.error_backoff_until > v_now THEN
        CONTINUE;
      END IF;
    END IF;
    
    -- Claim this job
    UPDATE rpa_job_queue SET
      status = 'processing',
      claimed_by_worker_id = p_worker_id,
      claimed_at = v_now,
      started_at = v_now,
      attempt_count = attempt_count + 1
    WHERE id = v_job.id;
    
    -- Update engine last request time
    UPDATE rpa_engine_limits SET
      last_request_at = v_now,
      requests_in_current_minute = requests_in_current_minute + 1,
      requests_in_current_hour = requests_in_current_hour + 1
    WHERE engine = v_job.engine;
    
    -- Get prompt text
    RETURN QUERY
    SELECT 
      v_job.id,
      v_job.brand_id,
      v_job.prompt_id,
      p.text,
      v_job.analysis_batch_id,
      v_job.engine,
      v_job.language,
      v_job.region
    FROM prompts p WHERE p.id = v_job.prompt_id;
    
    RETURN;
  END LOOP;
  
  -- No job found
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to complete an RPA job
CREATE OR REPLACE FUNCTION complete_rpa_job(
  p_job_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_job RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_job FROM rpa_job_queue WHERE id = p_job_id;
  
  IF v_job IS NULL THEN
    RETURN;
  END IF;
  
  IF p_success THEN
    -- Mark as completed
    UPDATE rpa_job_queue SET
      status = 'completed',
      completed_at = v_now,
      last_error = NULL
    WHERE id = p_job_id;
    
    -- Reset engine error count on success
    UPDATE rpa_engine_limits SET
      consecutive_errors = 0,
      error_backoff_until = NULL
    WHERE engine = v_job.engine;
  ELSE
    -- Check if we should retry
    IF v_job.attempt_count < v_job.max_attempts THEN
      -- Schedule retry with exponential backoff
      UPDATE rpa_job_queue SET
        status = 'pending',
        claimed_by_worker_id = NULL,
        claimed_at = NULL,
        started_at = NULL,
        last_error = p_error_message,
        next_retry_at = v_now + (INTERVAL '1 minute' * POWER(2, v_job.attempt_count))
      WHERE id = p_job_id;
    ELSE
      -- Max retries reached, mark as failed
      UPDATE rpa_job_queue SET
        status = 'failed',
        completed_at = v_now,
        last_error = p_error_message
      WHERE id = p_job_id;
    END IF;
    
    -- Update engine error tracking
    UPDATE rpa_engine_limits SET
      consecutive_errors = consecutive_errors + 1,
      last_error_at = v_now,
      error_backoff_until = CASE 
        WHEN consecutive_errors >= 3 THEN v_now + INTERVAL '5 minutes'
        WHEN consecutive_errors >= 5 THEN v_now + INTERVAL '15 minutes'
        ELSE NULL
      END
    WHERE engine = v_job.engine;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to queue prompts for daily analysis
CREATE OR REPLACE FUNCTION queue_daily_analysis_jobs(
  p_brand_id UUID,
  p_analysis_batch_id UUID,
  p_engines TEXT[],
  p_language TEXT DEFAULT 'en',
  p_region TEXT DEFAULT 'global',
  p_priority rpa_job_priority DEFAULT 'normal'
) RETURNS INTEGER AS $$
DECLARE
  v_prompt RECORD;
  v_engine TEXT;
  v_job_count INTEGER := 0;
  v_delay_seconds INTEGER;
  v_scheduled_at TIMESTAMPTZ := NOW();
BEGIN
  -- Get all active prompts for this brand
  FOR v_prompt IN
    SELECT id, text FROM prompts 
    WHERE brand_id = p_brand_id AND is_active = true
  LOOP
    -- Queue job for each engine
    FOREACH v_engine IN ARRAY p_engines
    LOOP
      -- Get engine-specific delay
      SELECT min_delay_seconds INTO v_delay_seconds 
      FROM rpa_engine_limits WHERE engine = v_engine;
      
      v_delay_seconds := COALESCE(v_delay_seconds, 20);
      
      -- Insert job with staggered scheduling
      INSERT INTO rpa_job_queue (
        brand_id,
        prompt_id,
        analysis_batch_id,
        engine,
        language,
        region,
        priority,
        scheduled_at,
        earliest_start_at
      ) VALUES (
        p_brand_id,
        v_prompt.id,
        p_analysis_batch_id,
        v_engine,
        p_language,
        p_region,
        p_priority,
        v_scheduled_at,
        v_scheduled_at + (v_job_count * v_delay_seconds * INTERVAL '1 second')
      );
      
      v_job_count := v_job_count + 1;
    END LOOP;
  END LOOP;
  
  RETURN v_job_count;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- 7. RLS Policies
-- ===========================================

-- Enable RLS
ALTER TABLE rpa_job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_analysis_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpa_engine_limits ENABLE ROW LEVEL SECURITY;

-- RPA Job Queue - users can view their org's jobs
CREATE POLICY "Users can view org rpa jobs" ON rpa_job_queue
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- Daily Analysis Slots - users can view their org's slots
CREATE POLICY "Users can view org daily slots" ON daily_analysis_slots
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- Engine Limits - readable by all (public config)
CREATE POLICY "Engine limits are public" ON rpa_engine_limits
  FOR SELECT USING (true);

-- ===========================================
-- 8. Comments for documentation
-- ===========================================

COMMENT ON TABLE rpa_job_queue IS 
'Central queue for all RPA jobs with intelligent scheduling and rate limiting.
Jobs are claimed by workers and processed with engine-specific delays.';

COMMENT ON TABLE daily_analysis_slots IS 
'Tracks the 3 daily analysis slots per brand (8-hour intervals from anchor time).
Each slot creates a batch and queues jobs for all active prompts.';

COMMENT ON TABLE rpa_engine_limits IS 
'Per-engine rate limiting configuration. Tracks current cooldowns and errors
for adaptive rate limiting to prevent detection.';

COMMENT ON COLUMN brands.daily_analyses_enabled IS 
'Simple toggle for daily analyses (3x/day at 8-hour intervals). Users only see this on/off toggle.';

COMMENT ON COLUMN brands.daily_schedule_anchor_time IS 
'When daily analyses started. The 3 daily slots are calculated as: anchor, anchor+8h, anchor+16h';

COMMENT ON COLUMN prompts.first_analyzed_at IS 
'When this prompt was first analyzed. Used for batch sync logic (1-hour window rule).';

