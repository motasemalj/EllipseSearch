-- Migration: Rename keywords -> prompts throughout the database
-- Safe version that handles missing objects gracefully

-- ================================================================
-- 1. Rename the keywords table to prompts
-- ================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'keywords') THEN
    ALTER TABLE keywords RENAME TO prompts;
  END IF;
END $$;

-- ================================================================
-- 2. Rename keyword_sets table to prompt_sets
-- ================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'keyword_sets') THEN
    ALTER TABLE keyword_sets RENAME TO prompt_sets;
  END IF;
END $$;

-- ================================================================
-- 3. Rename columns in prompts table
-- ================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prompts' AND column_name = 'keyword_set_id') THEN
    ALTER TABLE prompts RENAME COLUMN keyword_set_id TO prompt_set_id;
  END IF;
END $$;

-- ================================================================
-- 4. Rename columns in simulations table
-- ================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'simulations' AND column_name = 'keyword_id') THEN
    ALTER TABLE simulations RENAME COLUMN keyword_id TO prompt_id;
  END IF;
END $$;

-- ================================================================
-- 5. Rename columns in analysis_batches table
-- ================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_batches' AND column_name = 'keyword_set_id') THEN
    ALTER TABLE analysis_batches RENAME COLUMN keyword_set_id TO prompt_set_id;
  END IF;
END $$;

-- ================================================================
-- 6. Update foreign key constraint names (safe - ignore errors)
-- ================================================================
DO $$ 
BEGIN
  ALTER TABLE prompts RENAME CONSTRAINT keywords_keyword_set_id_fkey TO prompts_prompt_set_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER TABLE prompts RENAME CONSTRAINT keywords_brand_id_fkey TO prompts_brand_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER TABLE prompts RENAME CONSTRAINT keywords_pkey TO prompts_pkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER TABLE prompt_sets RENAME CONSTRAINT keyword_sets_pkey TO prompt_sets_pkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER TABLE prompt_sets RENAME CONSTRAINT keyword_sets_brand_id_fkey TO prompt_sets_brand_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER TABLE prompt_sets RENAME CONSTRAINT keyword_sets_created_by_fkey TO prompt_sets_created_by_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER TABLE simulations RENAME CONSTRAINT simulations_keyword_id_fkey TO simulations_prompt_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER TABLE analysis_batches RENAME CONSTRAINT analysis_batches_keyword_set_id_fkey TO analysis_batches_prompt_set_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ================================================================
-- 7. Update index names (safe - ignore errors if they don't exist)
-- ================================================================
DO $$ 
BEGIN
  ALTER INDEX idx_keywords_keyword_set RENAME TO idx_prompts_prompt_set;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER INDEX idx_keywords_brand RENAME TO idx_prompts_brand;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER INDEX idx_keyword_sets_brand RENAME TO idx_prompt_sets_brand;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER INDEX idx_simulations_keyword RENAME TO idx_simulations_prompt;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER INDEX idx_analysis_batches_keyword_set RENAME TO idx_analysis_batches_prompt_set;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ================================================================
-- 8. Update trigger names
-- ================================================================
DROP TRIGGER IF EXISTS update_keywords_updated_at ON prompts;
DROP TRIGGER IF EXISTS update_prompts_updated_at ON prompts;
CREATE TRIGGER update_prompts_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_keyword_sets_updated_at ON prompt_sets;
DROP TRIGGER IF EXISTS update_prompt_sets_updated_at ON prompt_sets;
CREATE TRIGGER update_prompt_sets_updated_at
  BEFORE UPDATE ON prompt_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- 9. Update RLS policies
-- ================================================================
DROP POLICY IF EXISTS "Users can view keywords" ON prompts;
DROP POLICY IF EXISTS "Users can create keywords" ON prompts;
DROP POLICY IF EXISTS "Users can update keywords" ON prompts;
DROP POLICY IF EXISTS "Users can delete keywords" ON prompts;
DROP POLICY IF EXISTS "Users can view prompts" ON prompts;
DROP POLICY IF EXISTS "Users can create prompts" ON prompts;
DROP POLICY IF EXISTS "Users can update prompts" ON prompts;
DROP POLICY IF EXISTS "Users can delete prompts" ON prompts;

DROP POLICY IF EXISTS "Users can view keyword sets" ON prompt_sets;
DROP POLICY IF EXISTS "Users can create keyword sets" ON prompt_sets;
DROP POLICY IF EXISTS "Users can update keyword sets" ON prompt_sets;
DROP POLICY IF EXISTS "Users can delete keyword sets" ON prompt_sets;
DROP POLICY IF EXISTS "Users can view prompt sets" ON prompt_sets;
DROP POLICY IF EXISTS "Users can create prompt sets" ON prompt_sets;
DROP POLICY IF EXISTS "Users can update prompt sets" ON prompt_sets;
DROP POLICY IF EXISTS "Users can delete prompt sets" ON prompt_sets;

-- Create new policies for prompts
CREATE POLICY "Users can view prompts" ON prompts
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can create prompts" ON prompts
  FOR INSERT WITH CHECK (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can update prompts" ON prompts
  FOR UPDATE USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can delete prompts" ON prompts
  FOR DELETE USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- Create new policies for prompt_sets
CREATE POLICY "Users can view prompt sets" ON prompt_sets
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can create prompt sets" ON prompt_sets
  FOR INSERT WITH CHECK (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can update prompt sets" ON prompt_sets
  FOR UPDATE USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can delete prompt sets" ON prompt_sets
  FOR DELETE USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- ================================================================
-- 10. Update views
-- ================================================================
DROP VIEW IF EXISTS brand_stats;
CREATE OR REPLACE VIEW brand_stats AS
SELECT 
  b.id,
  b.name,
  b.domain,
  b.organization_id,
  COUNT(DISTINCT ps.id) as prompt_set_count,
  COUNT(DISTINCT p.id) as prompt_count,
  COUNT(DISTINCT s.id) as simulation_count,
  ROUND(AVG(CASE WHEN s.is_visible THEN 1.0 ELSE 0.0 END) * 100, 1) as visibility_rate,
  MAX(s.created_at) as last_simulation_at
FROM brands b
LEFT JOIN prompt_sets ps ON ps.brand_id = b.id
LEFT JOIN prompts p ON p.brand_id = b.id
LEFT JOIN simulations s ON s.brand_id = b.id
GROUP BY b.id, b.name, b.domain, b.organization_id;

-- ================================================================
-- 11. Update functions that reference keywords
-- ================================================================
CREATE OR REPLACE FUNCTION get_organization_stats(org_id UUID)
RETURNS TABLE (
  total_brands BIGINT,
  total_prompts BIGINT,
  total_simulations BIGINT,
  visible_simulations BIGINT,
  visibility_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM brands WHERE organization_id = org_id) as total_brands,
    (SELECT COUNT(*) FROM prompts p 
     JOIN brands b ON p.brand_id = b.id 
     WHERE b.organization_id = org_id) as total_prompts,
    (SELECT COUNT(*) FROM simulations s
     JOIN brands b ON s.brand_id = b.id
     WHERE b.organization_id = org_id) as total_simulations,
    (SELECT COUNT(*) FROM simulations s
     JOIN brands b ON s.brand_id = b.id
     WHERE b.organization_id = org_id AND s.is_visible = true) as visible_simulations,
    (SELECT ROUND(
      COALESCE(
        AVG(CASE WHEN s.is_visible THEN 1.0 ELSE 0.0 END) * 100,
        0
      ), 1
    ) FROM simulations s
     JOIN brands b ON s.brand_id = b.id
     WHERE b.organization_id = org_id) as visibility_rate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for clarity
COMMENT ON TABLE prompts IS 'Search prompts/queries to analyze across AI engines';
COMMENT ON TABLE prompt_sets IS 'Groups of related prompts for organized analysis';
COMMENT ON COLUMN prompts.prompt_set_id IS 'Optional: Can be null for ungrouped prompts';
COMMENT ON COLUMN analysis_batches.prompt_set_id IS 'Optional: Can be null when running analysis on individual prompts';


