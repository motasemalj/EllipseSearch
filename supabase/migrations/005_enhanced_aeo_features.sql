-- ===========================================
-- Migration: Enhanced AEO Features
-- ===========================================
-- Adds support for:
-- 1. Entity Confidence tracking
-- 2. Enhanced sentiment analysis
-- 3. Conversational journey tracking
-- 4. Citation authority mapping
-- 5. Grounding metadata storage

-- ===========================================
-- 1. Add new columns to brands table
-- ===========================================

-- Entity confidence data from Knowledge Graph
ALTER TABLE brands ADD COLUMN IF NOT EXISTS entity_confidence JSONB DEFAULT NULL;
COMMENT ON COLUMN brands.entity_confidence IS 'Entity recognition data from Google Knowledge Graph API';

-- Last entity check timestamp
ALTER TABLE brands ADD COLUMN IF NOT EXISTS entity_checked_at TIMESTAMPTZ DEFAULT NULL;

-- ===========================================
-- 2. Add new columns to simulations table
-- ===========================================

-- Store standardized result for cross-engine comparison
ALTER TABLE simulations ADD COLUMN IF NOT EXISTS standardized_result JSONB DEFAULT NULL;
COMMENT ON COLUMN simulations.standardized_result IS 'Normalized result across engines for comparison';

-- Store enhanced sentiment analysis
ALTER TABLE simulations ADD COLUMN IF NOT EXISTS sentiment_analysis JSONB DEFAULT NULL;
COMMENT ON COLUMN simulations.sentiment_analysis IS 'Detailed sentiment analysis with NSS score';

-- Net Sentiment Score (0-100 scale for easy querying)
ALTER TABLE simulations ADD COLUMN IF NOT EXISTS net_sentiment_score INTEGER DEFAULT NULL;
COMMENT ON COLUMN simulations.net_sentiment_score IS 'Net Sentiment Score 0-100 for quick filtering';

-- Grounding metadata (engine-specific data)
ALTER TABLE simulations ADD COLUMN IF NOT EXISTS grounding_metadata JSONB DEFAULT NULL;
COMMENT ON COLUMN simulations.grounding_metadata IS 'Engine-specific grounding data (Gemini queries, Grok X posts, etc.)';

-- Citation authorities breakdown
ALTER TABLE simulations ADD COLUMN IF NOT EXISTS citation_authorities JSONB DEFAULT NULL;
COMMENT ON COLUMN simulations.citation_authorities IS 'Authority scores for each cited source';

-- ===========================================
-- 3. Conversational Journeys table
-- ===========================================

CREATE TABLE IF NOT EXISTS conversational_journeys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  engine TEXT NOT NULL CHECK (engine IN ('chatgpt', 'gemini', 'grok', 'perplexity')),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ar')),
  region TEXT NOT NULL DEFAULT 'global',
  initial_prompt TEXT NOT NULL,
  total_turns INTEGER NOT NULL DEFAULT 0,
  stickiness_score INTEGER NOT NULL DEFAULT 0,
  final_outcome TEXT NOT NULL DEFAULT 'not_mentioned' CHECK (final_outcome IN ('recommended', 'filtered_out', 'not_mentioned')),
  drop_off_turn INTEGER DEFAULT NULL,
  turns JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE conversational_journeys IS 'Multi-turn conversation tracking to measure brand stickiness';

-- Indexes for journeys
CREATE INDEX IF NOT EXISTS idx_journeys_brand ON conversational_journeys(brand_id);
CREATE INDEX IF NOT EXISTS idx_journeys_engine ON conversational_journeys(engine);
CREATE INDEX IF NOT EXISTS idx_journeys_outcome ON conversational_journeys(final_outcome);
CREATE INDEX IF NOT EXISTS idx_journeys_stickiness ON conversational_journeys(stickiness_score DESC);

-- ===========================================
-- 4. Schema Fixes table (generated fixes)
-- ===========================================

CREATE TABLE IF NOT EXISTS schema_fixes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  simulation_id UUID REFERENCES simulations(id) ON DELETE SET NULL,
  hallucination_type TEXT NOT NULL CHECK (hallucination_type IN ('positive', 'negative', 'misattribution', 'outdated')),
  schema_type TEXT NOT NULL,
  json_ld TEXT NOT NULL,
  placement_hint TEXT NOT NULL,
  fixes_issue TEXT NOT NULL,
  is_applied BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE schema_fixes IS 'Auto-generated Schema.org JSON-LD fixes for hallucinations';

-- Indexes for schema fixes
CREATE INDEX IF NOT EXISTS idx_schema_fixes_brand ON schema_fixes(brand_id);
CREATE INDEX IF NOT EXISTS idx_schema_fixes_applied ON schema_fixes(is_applied);

-- ===========================================
-- 5. Citation Authority reference table
-- ===========================================

CREATE TABLE IF NOT EXISTS citation_authorities (
  domain TEXT PRIMARY KEY,
  authority_score INTEGER NOT NULL DEFAULT 50,
  tier TEXT NOT NULL DEFAULT 'medium' CHECK (tier IN ('authoritative', 'high', 'medium', 'low')),
  source_type TEXT NOT NULL DEFAULT 'editorial' CHECK (source_type IN ('editorial', 'directory', 'social', 'blog', 'official', 'forum', 'news')),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE citation_authorities IS 'Reference table for domain authority scores';

-- Insert some default authoritative domains
INSERT INTO citation_authorities (domain, authority_score, tier, source_type, notes) VALUES
  ('wikipedia.org', 95, 'authoritative', 'editorial', 'Wikipedia - highest authority'),
  ('britannica.com', 95, 'authoritative', 'editorial', 'Encyclopedia Britannica'),
  ('reuters.com', 92, 'authoritative', 'news', 'Reuters news agency'),
  ('bbc.com', 90, 'authoritative', 'news', 'BBC News'),
  ('nytimes.com', 90, 'authoritative', 'news', 'New York Times'),
  ('forbes.com', 88, 'high', 'news', 'Forbes business'),
  ('bloomberg.com', 88, 'high', 'news', 'Bloomberg'),
  ('techcrunch.com', 85, 'high', 'news', 'TechCrunch'),
  ('linkedin.com', 80, 'high', 'social', 'LinkedIn profiles'),
  ('crunchbase.com', 80, 'high', 'directory', 'Crunchbase company data'),
  ('g2.com', 78, 'high', 'directory', 'G2 software reviews'),
  ('clutch.co', 78, 'high', 'directory', 'Clutch B2B reviews'),
  ('capterra.com', 75, 'high', 'directory', 'Capterra software'),
  ('trustpilot.com', 72, 'high', 'directory', 'Trustpilot reviews'),
  ('yelp.com', 70, 'medium', 'directory', 'Yelp local reviews'),
  ('medium.com', 60, 'medium', 'blog', 'Medium blogs'),
  ('reddit.com', 55, 'medium', 'forum', 'Reddit discussions'),
  ('quora.com', 55, 'medium', 'forum', 'Quora Q&A')
ON CONFLICT (domain) DO NOTHING;

-- ===========================================
-- 6. RLS Policies for new tables
-- ===========================================

ALTER TABLE conversational_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_fixes ENABLE ROW LEVEL SECURITY;

-- Journeys: Access through brand's organization
CREATE POLICY "Users can view journeys" ON conversational_journeys
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can create journeys" ON conversational_journeys
  FOR INSERT WITH CHECK (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- Schema Fixes: Access through brand's organization
CREATE POLICY "Users can view schema fixes" ON schema_fixes
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can create schema fixes" ON schema_fixes
  FOR INSERT WITH CHECK (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can update schema fixes" ON schema_fixes
  FOR UPDATE USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- ===========================================
-- 7. Useful views
-- ===========================================

-- Brand journey summary view
CREATE OR REPLACE VIEW brand_journey_summary AS
SELECT
  b.id as brand_id,
  b.name as brand_name,
  COUNT(j.id) as total_journeys,
  ROUND(AVG(j.stickiness_score), 1) as avg_stickiness,
  SUM(CASE WHEN j.final_outcome = 'recommended' THEN 1 ELSE 0 END) as recommended_count,
  SUM(CASE WHEN j.final_outcome = 'filtered_out' THEN 1 ELSE 0 END) as filtered_count,
  ROUND(AVG(j.drop_off_turn), 1) as avg_drop_off_turn
FROM brands b
LEFT JOIN conversational_journeys j ON j.brand_id = b.id
GROUP BY b.id, b.name;

-- Simulation sentiment breakdown view
CREATE OR REPLACE VIEW simulation_sentiment_summary AS
SELECT
  b.id as brand_id,
  s.engine,
  COUNT(*) as total,
  ROUND(AVG(s.net_sentiment_score), 1) as avg_nss,
  SUM(CASE WHEN s.sentiment = 'positive' THEN 1 ELSE 0 END) as positive_count,
  SUM(CASE WHEN s.sentiment = 'negative' THEN 1 ELSE 0 END) as negative_count,
  SUM(CASE WHEN s.is_visible AND s.sentiment = 'negative' THEN 1 ELSE 0 END) as visible_but_negative
FROM brands b
JOIN simulations s ON s.brand_id = b.id
GROUP BY b.id, s.engine;

