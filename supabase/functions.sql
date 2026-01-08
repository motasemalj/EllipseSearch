-- ===========================================
-- Database Functions for AEO Dashboard
-- ===========================================
-- Run this after schema.sql

-- ===========================================
-- MIGRATION: Make keyword_set_id optional in analysis_batches
-- ===========================================
-- Run this on existing databases to allow analysis on individual prompts
-- ALTER TABLE analysis_batches ALTER COLUMN keyword_set_id DROP NOT NULL;

-- ===========================================
-- 1. Deduct Credit Function
-- ===========================================
-- Atomically deducts 1 credit from an organization

CREATE OR REPLACE FUNCTION deduct_credit(org_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE organizations
  SET credits_balance = GREATEST(credits_balance - 1, 0),
      updated_at = NOW()
  WHERE id = org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 2. Increment Batch Completed Function
-- ===========================================
-- Atomically increments the completed_simulations count

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
  IF current_completed >= total THEN
    UPDATE analysis_batches
    SET status = 'completed',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = batch_id AND status = 'processing';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 3. Add Credits Function
-- ===========================================
-- Used by billing to add credits to an organization

CREATE OR REPLACE FUNCTION add_credits(org_id UUID, amount INT)
RETURNS void AS $$
BEGIN
  UPDATE organizations
  SET credits_balance = credits_balance + amount,
      updated_at = NOW()
  WHERE id = org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 4. Reset Monthly Credits Function
-- ===========================================
-- Called on subscription renewal to reset credits

CREATE OR REPLACE FUNCTION reset_monthly_credits(org_id UUID, new_balance INT)
RETURNS void AS $$
BEGIN
  UPDATE organizations
  SET credits_balance = new_balance,
      updated_at = NOW()
  WHERE id = org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 5. Get Organization Stats Function
-- ===========================================
-- Returns aggregate stats for an organization

CREATE OR REPLACE FUNCTION get_organization_stats(org_id UUID)
RETURNS TABLE (
  total_brands BIGINT,
  total_keywords BIGINT,
  total_simulations BIGINT,
  visible_simulations BIGINT,
  visibility_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM brands WHERE organization_id = org_id) as total_brands,
    (SELECT COUNT(*) FROM keywords k 
     JOIN brands b ON k.brand_id = b.id 
     WHERE b.organization_id = org_id) as total_keywords,
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

-- ===========================================
-- 6. Get Brand Visibility by Engine Function
-- ===========================================

CREATE OR REPLACE FUNCTION get_brand_visibility_by_engine(p_brand_id UUID)
RETURNS TABLE (
  engine TEXT,
  total_simulations BIGINT,
  visible_count BIGINT,
  visibility_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.engine,
    COUNT(*) as total_simulations,
    SUM(CASE WHEN s.is_visible THEN 1 ELSE 0 END) as visible_count,
    ROUND(AVG(CASE WHEN s.is_visible THEN 1.0 ELSE 0.0 END) * 100, 1) as visibility_rate
  FROM simulations s
  WHERE s.brand_id = p_brand_id
  GROUP BY s.engine;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

