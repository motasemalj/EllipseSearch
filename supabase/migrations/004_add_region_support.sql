-- ===========================================
-- Migration: Add Regional Search Support
-- ===========================================
-- This migration adds region support for AI search analysis
-- to improve accuracy by localizing search results

-- 1. Add region column to analysis_batches
ALTER TABLE analysis_batches 
ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global' 
CHECK (region IN (
  'global', 'us', 'uk', 'ae', 'sa', 'de', 'fr', 'in', 'au', 'ca', 
  'jp', 'sg', 'br', 'mx', 'nl', 'es', 'it', 'eg', 'kw', 'qa', 'bh'
));

COMMENT ON COLUMN analysis_batches.region IS 'Regional location for search results (e.g., us, uk, ae, global)';

-- 2. Add region column to simulations
ALTER TABLE simulations 
ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global'
CHECK (region IN (
  'global', 'us', 'uk', 'ae', 'sa', 'de', 'fr', 'in', 'au', 'ca', 
  'jp', 'sg', 'br', 'mx', 'nl', 'es', 'it', 'eg', 'kw', 'qa', 'bh'
));

COMMENT ON COLUMN simulations.region IS 'Regional location used for this simulation search';

-- 3. Create index for faster region-based queries
CREATE INDEX IF NOT EXISTS idx_simulations_region ON simulations(region);
CREATE INDEX IF NOT EXISTS idx_analysis_batches_region ON analysis_batches(region);

-- 4. Update the engine_visibility view to include region breakdowns
DROP VIEW IF EXISTS engine_visibility;

CREATE OR REPLACE VIEW engine_visibility AS
SELECT
  b.id as brand_id,
  s.engine,
  s.region,
  COUNT(*) as total_simulations,
  SUM(CASE WHEN s.is_visible THEN 1 ELSE 0 END) as visible_count,
  ROUND(AVG(CASE WHEN s.is_visible THEN 1.0 ELSE 0.0 END) * 100, 1) as visibility_rate
FROM brands b
LEFT JOIN simulations s ON s.brand_id = b.id
WHERE s.id IS NOT NULL
GROUP BY b.id, s.engine, s.region;

-- 5. Create a helper view for regional visibility analysis
CREATE OR REPLACE VIEW regional_visibility AS
SELECT
  b.id as brand_id,
  b.name as brand_name,
  s.region,
  COUNT(*) as total_simulations,
  SUM(CASE WHEN s.is_visible THEN 1 ELSE 0 END) as visible_count,
  ROUND(AVG(CASE WHEN s.is_visible THEN 1.0 ELSE 0.0 END) * 100, 1) as visibility_rate,
  MAX(s.created_at) as last_simulation_at
FROM brands b
LEFT JOIN simulations s ON s.brand_id = b.id
WHERE s.id IS NOT NULL
GROUP BY b.id, b.name, s.region
ORDER BY b.name, s.region;

