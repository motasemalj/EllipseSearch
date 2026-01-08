-- ===========================================
-- AEO Dashboard Database Schema
-- ===========================================
-- Run this in your Supabase SQL editor to create all tables
-- Note: Uses "prompts" terminology throughout

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===========================================
-- 1. Organizations (Agencies)
-- ===========================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'trial', 'starter', 'pro', 'agency')),
  credits_balance INTEGER NOT NULL DEFAULT 50,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_subscription_status TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for Stripe lookups
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON organizations(stripe_customer_id);

-- ===========================================
-- 2. Profiles (Users)
-- ===========================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for organization lookups
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON profiles(organization_id);

-- ===========================================
-- 3. Brands (Clients)
-- ===========================================
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  primary_location TEXT NOT NULL DEFAULT 'Dubai',
  languages TEXT[] NOT NULL DEFAULT '{en}'::text[],
  brand_aliases TEXT[] NOT NULL DEFAULT '{}'::text[],
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN brands.settings IS 'JSON with product_description, category, and other brand context';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_brands_organization ON brands(organization_id);
CREATE INDEX IF NOT EXISTS idx_brands_domain ON brands(domain);

-- ===========================================
-- 4. Prompt Sets (Groups of related prompts)
-- ===========================================
CREATE TABLE IF NOT EXISTS prompt_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE prompt_sets IS 'Groups of related prompts for organized analysis';

-- Index
CREATE INDEX IF NOT EXISTS idx_prompt_sets_brand ON prompt_sets(brand_id);

-- ===========================================
-- 5. Prompts (Search queries to analyze)
-- ===========================================
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_set_id UUID REFERENCES prompt_sets(id) ON DELETE CASCADE, -- Optional: can be null for ungrouped prompts
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE prompts IS 'Search prompts/queries to analyze across AI engines';
COMMENT ON COLUMN prompts.prompt_set_id IS 'Optional: Can be null for ungrouped prompts';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prompts_prompt_set ON prompts(prompt_set_id);
CREATE INDEX IF NOT EXISTS idx_prompts_brand ON prompts(brand_id);

-- ===========================================
-- 6. Analysis Batches
-- ===========================================
CREATE TABLE IF NOT EXISTS analysis_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt_set_id UUID REFERENCES prompt_sets(id) ON DELETE CASCADE, -- Optional: can be null for individual prompt analysis
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  engines TEXT[] NOT NULL DEFAULT '{}'::text[],
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar')),
  total_simulations INTEGER NOT NULL DEFAULT 0,
  completed_simulations INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN analysis_batches.prompt_set_id IS 'Optional: Can be null when running analysis on individual prompts';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analysis_batches_brand ON analysis_batches(brand_id);
CREATE INDEX IF NOT EXISTS idx_analysis_batches_prompt_set ON analysis_batches(prompt_set_id);
CREATE INDEX IF NOT EXISTS idx_analysis_batches_status ON analysis_batches(status);

-- ===========================================
-- 7. Simulations
-- ===========================================
CREATE TABLE IF NOT EXISTS simulations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  analysis_batch_id UUID NOT NULL REFERENCES analysis_batches(id) ON DELETE CASCADE,
  engine TEXT NOT NULL CHECK (engine IN ('chatgpt', 'gemini', 'grok', 'perplexity')),
  language TEXT NOT NULL CHECK (language IN ('en', 'ar')),
  prompt_text TEXT NOT NULL,
  ai_response_html TEXT,
  search_context JSONB,
  is_visible BOOLEAN NOT NULL DEFAULT FALSE,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  selection_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_simulations_brand ON simulations(brand_id);
CREATE INDEX IF NOT EXISTS idx_simulations_prompt ON simulations(prompt_id);
CREATE INDEX IF NOT EXISTS idx_simulations_batch ON simulations(analysis_batch_id);
CREATE INDEX IF NOT EXISTS idx_simulations_engine ON simulations(engine);
CREATE INDEX IF NOT EXISTS idx_simulations_created ON simulations(created_at DESC);

-- ===========================================
-- 8. Updated At Trigger Function
-- ===========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE OR REPLACE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_prompt_sets_updated_at
  BEFORE UPDATE ON prompt_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_prompts_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_analysis_batches_updated_at
  BEFORE UPDATE ON analysis_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- 9. Row Level Security Policies
-- ===========================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's organization
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- Organizations: Users can only see their own organization
CREATE POLICY "Users can view own organization" ON organizations
  FOR SELECT USING (
    id = get_user_organization_id()
  );

CREATE POLICY "Users can update own organization" ON organizations
  FOR UPDATE USING (
    id = get_user_organization_id()
  );

-- Profiles: Users can view/update their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Brands: Users can access brands in their organization
CREATE POLICY "Users can view organization brands" ON brands
  FOR SELECT USING (
    organization_id = get_user_organization_id()
  );

CREATE POLICY "Users can create organization brands" ON brands
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id()
  );

CREATE POLICY "Users can update organization brands" ON brands
  FOR UPDATE USING (
    organization_id = get_user_organization_id()
  );

CREATE POLICY "Users can delete organization brands" ON brands
  FOR DELETE USING (
    organization_id = get_user_organization_id()
  );

-- Prompt Sets: Access through brand's organization
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

-- Prompts: Access through brand's organization
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

-- Analysis Batches: Access through brand's organization
CREATE POLICY "Users can view analysis batches" ON analysis_batches
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can create analysis batches" ON analysis_batches
  FOR INSERT WITH CHECK (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can update analysis batches" ON analysis_batches
  FOR UPDATE USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- Simulations: Access through brand's organization
CREATE POLICY "Users can view simulations" ON simulations
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can create simulations" ON simulations
  FOR INSERT WITH CHECK (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- ===========================================
-- 10. Function: Handle New User Signup
-- ===========================================
-- This function creates an organization and profile when a new user signs up

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  org_name TEXT;
BEGIN
  -- Get organization name from user metadata or use email domain
  org_name := COALESCE(
    NEW.raw_user_meta_data->>'organization_name',
    split_part(NEW.email, '@', 1) || ' Organization'
  );

  -- Create new organization
  INSERT INTO organizations (name, tier, credits_balance)
  VALUES (org_name, 'trial', 200)
  RETURNING id INTO org_id;

  -- Create profile for the new user as owner
  INSERT INTO profiles (id, organization_id, role, full_name)
  VALUES (
    NEW.id,
    org_id,
    'owner',
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ===========================================
-- 11. Service Role Policies (for Trigger.dev jobs)
-- ===========================================
-- These allow the service role to bypass RLS for background jobs

-- Note: Service role automatically bypasses RLS, but we add explicit policies
-- for documentation purposes and in case of future changes

-- ===========================================
-- 12. Useful Views
-- ===========================================

-- Brand with stats view
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

-- Engine visibility breakdown
CREATE OR REPLACE VIEW engine_visibility AS
SELECT
  b.id as brand_id,
  s.engine,
  COUNT(*) as total_simulations,
  SUM(CASE WHEN s.is_visible THEN 1 ELSE 0 END) as visible_count,
  ROUND(AVG(CASE WHEN s.is_visible THEN 1.0 ELSE 0.0 END) * 100, 1) as visibility_rate
FROM brands b
LEFT JOIN simulations s ON s.brand_id = b.id
WHERE s.id IS NOT NULL
GROUP BY b.id, s.engine;
