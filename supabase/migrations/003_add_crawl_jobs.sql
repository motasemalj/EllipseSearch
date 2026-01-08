-- ===========================================
-- Crawl Jobs & Crawled Content Storage
-- ===========================================
-- Stores website crawl jobs and their results for "Ground Truth" analysis

-- ===========================================
-- 1. Crawl Jobs Table
-- ===========================================
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  
  -- Job tracking
  firecrawl_job_id TEXT, -- External job ID from Firecrawl
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'crawling', 'completed', 'failed')),
  
  -- Configuration
  start_url TEXT NOT NULL,
  max_pages INTEGER NOT NULL DEFAULT 50,
  max_depth INTEGER NOT NULL DEFAULT 3,
  include_paths TEXT[] DEFAULT '{}',
  exclude_paths TEXT[] DEFAULT '{}',
  
  -- Results summary
  total_pages_crawled INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Errors
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE crawl_jobs IS 'Tracks async website crawl jobs for gathering ground truth content';
COMMENT ON COLUMN crawl_jobs.firecrawl_job_id IS 'External job ID from Firecrawl API for status polling';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_brand ON crawl_jobs(brand_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_firecrawl ON crawl_jobs(firecrawl_job_id);

-- ===========================================
-- 2. Crawled Pages Table
-- ===========================================
CREATE TABLE IF NOT EXISTS crawled_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crawl_job_id UUID NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  
  -- Page data
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  
  -- Content (stored as markdown for efficiency)
  content_markdown TEXT,
  content_excerpt TEXT, -- First 500 chars for quick preview
  
  -- Metadata
  word_count INTEGER DEFAULT 0,
  links_count INTEGER DEFAULT 0,
  
  -- Timestamps
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE crawled_pages IS 'Stores crawled page content for ground truth analysis';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crawled_pages_crawl_job ON crawled_pages(crawl_job_id);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_brand ON crawled_pages(brand_id);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_url ON crawled_pages(url);

-- ===========================================
-- 3. Brand Ground Truth Summary
-- ===========================================
-- Add column to brands for quick access to latest crawl data
ALTER TABLE brands ADD COLUMN IF NOT EXISTS ground_truth_summary JSONB DEFAULT NULL;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS last_crawled_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN brands.ground_truth_summary IS 'Summarized ground truth from latest successful crawl';
COMMENT ON COLUMN brands.last_crawled_at IS 'Timestamp of last successful website crawl';

-- ===========================================
-- 4. Update Triggers
-- ===========================================
CREATE OR REPLACE TRIGGER update_crawl_jobs_updated_at
  BEFORE UPDATE ON crawl_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- 5. Row Level Security
-- ===========================================
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawled_pages ENABLE ROW LEVEL SECURITY;

-- Crawl Jobs: Access through brand's organization
CREATE POLICY "Users can view crawl jobs" ON crawl_jobs
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can create crawl jobs" ON crawl_jobs
  FOR INSERT WITH CHECK (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can update crawl jobs" ON crawl_jobs
  FOR UPDATE USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- Crawled Pages: Access through brand's organization
CREATE POLICY "Users can view crawled pages" ON crawled_pages
  FOR SELECT USING (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

CREATE POLICY "Users can create crawled pages" ON crawled_pages
  FOR INSERT WITH CHECK (
    brand_id IN (SELECT id FROM brands WHERE organization_id = get_user_organization_id())
  );

-- ===========================================
-- 6. Helper View for Latest Crawl per Brand
-- ===========================================
CREATE OR REPLACE VIEW brand_latest_crawl AS
SELECT DISTINCT ON (brand_id)
  brand_id,
  id as crawl_job_id,
  status,
  total_pages_crawled,
  started_at,
  completed_at,
  error_message
FROM crawl_jobs
ORDER BY brand_id, created_at DESC;


