// ===========================================
// Core Domain Types for AEO Dashboard
// ===========================================

export type SupportedEngine = 'chatgpt' | 'gemini' | 'grok' | 'perplexity';
export type SupportedLanguage = 'en' | 'ar';
export type UserRole = 'owner' | 'admin' | 'member';
export type BillingTier = 'free' | 'trial' | 'starter' | 'pro' | 'agency';
export type BatchStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type CrawlStatus = 'pending' | 'crawling' | 'completed' | 'failed';
export type Sentiment = 'positive' | 'neutral' | 'negative';

// ===========================================
// Standardized Result Interface (Normalization Layer)
// Each engine returns different data structures - this normalizes them
// ===========================================

export interface StandardizedSource {
  url: string;
  domain: string;
  snippet: string; // The text inside the AI answer that references this source
  is_brand_match: boolean; // Did this source come from the client's domain?
  authority_score?: number; // Citation authority (0-100)
  authority_tier?: 'authoritative' | 'high' | 'medium' | 'low';
  source_type?: 'editorial' | 'directory' | 'social' | 'blog' | 'official' | 'forum' | 'news';
}

export interface StandardizedResult {
  engine: SupportedEngine;
  answer_text: string;
  answer_html: string;
  sources: StandardizedSource[];
  grounding_metadata?: GroundingMetadata;
  sentiment_score: number; // -1 to 1 scale
  sentiment_label: Sentiment;
  entity_confidence?: EntityConfidence;
  raw_response?: unknown;
}

export interface GroundingMetadata {
  // For Gemini: actual search queries the AI ran
  web_search_queries?: string[];
  // For Gemini: grounding chunks with attribution
  grounding_chunks?: GroundingChunk[];
  // For Grok: X/Twitter posts used
  x_posts?: XPost[];
  // For all: percentage of answer that's grounded
  grounding_coverage?: number;
}

export interface GroundingChunk {
  text: string;
  source_url: string;
  confidence: number;
}

export interface XPost {
  post_id: string;
  author: string;
  text: string;
  timestamp?: string;
  engagement_score?: number;
}

// ===========================================
// Entity Confidence (Knowledge Graph Integration)
// ===========================================

export interface EntityConfidence {
  is_recognized_entity: boolean;
  entity_id?: string; // Google Knowledge Graph ID (e.g., "/m/0wrt1k")
  entity_type?: string; // Organization, LocalBusiness, Product, etc.
  entity_description?: string;
  confidence_score: number; // 0-100
  same_as_links?: string[]; // Linked profiles (Wikipedia, Crunchbase, LinkedIn)
  missing_links?: string[]; // Recommended platforms to add
  recommendation?: string;
}

// ===========================================
// Citation Authority (Source Quality Scoring)
// ===========================================

export interface CitationAuthority {
  domain: string;
  authority_score: number; // 0-100
  tier: 'authoritative' | 'high' | 'medium' | 'low';
  source_type: 'editorial' | 'directory' | 'social' | 'blog' | 'official' | 'forum' | 'news';
  is_brand_domain: boolean;
  profile_completeness?: number; // For directories like Clutch, G2
  recommendation?: string;
}

// ===========================================
// Net Sentiment Score (Beyond positive/neutral/negative)
// ===========================================

export interface SentimentAnalysis {
  polarity: number; // -1 (very negative) to 1 (very positive)
  label: Sentiment;
  confidence: number; // 0-1
  key_phrases: SentimentPhrase[];
  concerns: string[]; // Negative aspects mentioned
  praises: string[]; // Positive aspects mentioned
  net_sentiment_score: number; // Normalized 0-100 for UI
}

export interface SentimentPhrase {
  text: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  intensity: number; // 0-1
}

// ===========================================
// Conversational Journey Tracking
// ===========================================

export interface ConversationalJourney {
  journey_id: string;
  brand_id: string;
  turns: ConversationalTurn[];
  total_turns: number;
  final_outcome: 'recommended' | 'filtered_out' | 'not_mentioned';
  stickiness_score: number; // 0-100, how well brand persists through turns
  drop_off_turn?: number; // Which turn the brand was filtered out
}

export interface ConversationalTurn {
  turn_number: number;
  prompt: string;
  brand_mentioned: boolean;
  brand_position?: number; // Position in list if mentioned
  competitors_mentioned: string[];
  outcome: 'mentioned' | 'filtered' | 'not_applicable';
}

// ===========================================
// Regional Search Support
// ===========================================

export type SupportedRegion = 
  | 'global'        // No specific region (default)
  | 'us'            // United States
  | 'uk'            // United Kingdom
  | 'ae'            // United Arab Emirates
  | 'sa'            // Saudi Arabia
  | 'de'            // Germany
  | 'fr'            // France
  | 'in'            // India
  | 'au'            // Australia
  | 'ca'            // Canada
  | 'jp'            // Japan
  | 'sg'            // Singapore
  | 'br'            // Brazil
  | 'mx'            // Mexico
  | 'nl'            // Netherlands
  | 'es'            // Spain
  | 'it'            // Italy
  | 'eg'            // Egypt
  | 'kw'            // Kuwait
  | 'qa'            // Qatar
  | 'bh';           // Bahrain

export interface RegionInfo {
  id: SupportedRegion;
  name: string;
  flag: string;
  timezone: string;
  locale: string;
  searchHint: string; // Hint to add to search queries for better regional results
}

export const REGIONS: RegionInfo[] = [
  { id: 'global', name: 'Global', flag: '🌍', timezone: 'UTC', locale: 'en', searchHint: '' },
  { id: 'us', name: 'United States', flag: '🇺🇸', timezone: 'America/New_York', locale: 'en-US', searchHint: 'in the United States' },
  { id: 'uk', name: 'United Kingdom', flag: '🇬🇧', timezone: 'Europe/London', locale: 'en-GB', searchHint: 'in the United Kingdom' },
  { id: 'ae', name: 'UAE', flag: '🇦🇪', timezone: 'Asia/Dubai', locale: 'ar-AE', searchHint: 'in UAE Dubai' },
  { id: 'sa', name: 'Saudi Arabia', flag: '🇸🇦', timezone: 'Asia/Riyadh', locale: 'ar-SA', searchHint: 'in Saudi Arabia' },
  { id: 'de', name: 'Germany', flag: '🇩🇪', timezone: 'Europe/Berlin', locale: 'de-DE', searchHint: 'in Germany' },
  { id: 'fr', name: 'France', flag: '🇫🇷', timezone: 'Europe/Paris', locale: 'fr-FR', searchHint: 'in France' },
  { id: 'in', name: 'India', flag: '🇮🇳', timezone: 'Asia/Kolkata', locale: 'en-IN', searchHint: 'in India' },
  { id: 'au', name: 'Australia', flag: '🇦🇺', timezone: 'Australia/Sydney', locale: 'en-AU', searchHint: 'in Australia' },
  { id: 'ca', name: 'Canada', flag: '🇨🇦', timezone: 'America/Toronto', locale: 'en-CA', searchHint: 'in Canada' },
  { id: 'jp', name: 'Japan', flag: '🇯🇵', timezone: 'Asia/Tokyo', locale: 'ja-JP', searchHint: 'in Japan' },
  { id: 'sg', name: 'Singapore', flag: '🇸🇬', timezone: 'Asia/Singapore', locale: 'en-SG', searchHint: 'in Singapore' },
  { id: 'br', name: 'Brazil', flag: '🇧🇷', timezone: 'America/Sao_Paulo', locale: 'pt-BR', searchHint: 'in Brazil' },
  { id: 'mx', name: 'Mexico', flag: '🇲🇽', timezone: 'America/Mexico_City', locale: 'es-MX', searchHint: 'in Mexico' },
  { id: 'nl', name: 'Netherlands', flag: '🇳🇱', timezone: 'Europe/Amsterdam', locale: 'nl-NL', searchHint: 'in Netherlands' },
  { id: 'es', name: 'Spain', flag: '🇪🇸', timezone: 'Europe/Madrid', locale: 'es-ES', searchHint: 'in Spain' },
  { id: 'it', name: 'Italy', flag: '🇮🇹', timezone: 'Europe/Rome', locale: 'it-IT', searchHint: 'in Italy' },
  { id: 'eg', name: 'Egypt', flag: '🇪🇬', timezone: 'Africa/Cairo', locale: 'ar-EG', searchHint: 'in Egypt' },
  { id: 'kw', name: 'Kuwait', flag: '🇰🇼', timezone: 'Asia/Kuwait', locale: 'ar-KW', searchHint: 'in Kuwait' },
  { id: 'qa', name: 'Qatar', flag: '🇶🇦', timezone: 'Asia/Qatar', locale: 'ar-QA', searchHint: 'in Qatar' },
  { id: 'bh', name: 'Bahrain', flag: '🇧🇭', timezone: 'Asia/Bahrain', locale: 'ar-BH', searchHint: 'in Bahrain' },
];

export function getRegionInfo(region: SupportedRegion): RegionInfo {
  return REGIONS.find((r) => r.id === region) || REGIONS[0];
}

// ===========================================
// Database Entities
// ===========================================

export interface Organization {
  id: string;
  name: string;
  tier: BillingTier;
  credits_balance: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  settings: OrganizationSettings;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSettings {
  logo_url?: string;
  primary_color?: string;
  company_name?: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  role: UserRole;
  email?: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  organization_id: string;
  name: string;
  domain: string;
  primary_location: string;
  languages: SupportedLanguage[];
  brand_aliases: string[];
  settings: BrandSettings;
  ground_truth_summary?: GroundTruthSummary | null;
  last_crawled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroundTruthSummary {
  total_pages: number;
  key_pages: { url: string; title: string; excerpt: string }[];
  crawl_job_id: string;
  crawled_at: string;
}

export interface BrandSettings {
  logo_url?: string;
  description?: string;
}

export interface PromptSet {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Virtual fields
  prompt_count?: number;
  last_run_at?: string | null;
  last_visibility_score?: number | null;
}

// Alias for backwards compatibility with DB schema
export type KeywordSet = PromptSet;

export interface Prompt {
  id: string;
  prompt_set_id: string | null; // Optional - prompts can exist without a set
  brand_id: string;
  text: string;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

// Alias for backwards compatibility with DB schema (keywords table)
export type Keyword = Prompt & { keyword_set_id: string | null };

export interface AnalysisBatch {
  id: string;
  brand_id: string;
  prompt_set_id: string | null; // Optional - can run analysis on individual prompts
  status: BatchStatus;
  engines: SupportedEngine[];
  language: SupportedLanguage;
  region: SupportedRegion; // Regional location for search results
  total_simulations: number;
  completed_simulations: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // Alias for backwards compatibility
  keyword_set_id?: string | null;
}

export interface Simulation {
  id: string;
  brand_id: string;
  prompt_id: string;
  analysis_batch_id: string;
  engine: SupportedEngine;
  language: SupportedLanguage;
  region: SupportedRegion; // Regional location for search results
  prompt_text: string;
  ai_response_html: string;
  search_context: SearchContext | null;
  is_visible: boolean;
  sentiment: Sentiment | null;
  selection_signals: SelectionSignals;
  created_at: string;
  // Alias for backwards compatibility with DB schema
  keyword_id?: string;
}

// ===========================================
// Selection Signal Analysis Types
// ===========================================

export interface SelectionSignals {
  is_visible: boolean;
  sentiment: Sentiment;
  winning_sources: string[];
  gap_analysis: GapAnalysis;
  recommendation: string;
  action_items?: ActionItem[];
  competitor_insights?: string;
  quick_wins?: string[];
  brand_mentions?: BrandMention[];
  // Enhanced AEO scoring
  aeo_score?: AEOScore;
  // Hallucination detection results
  hallucination_analysis?: HallucinationAnalysis;
  // NEW: Enhanced sentiment analysis
  sentiment_analysis?: SentimentAnalysis;
  // NEW: Citation authority breakdown
  citation_authorities?: CitationAuthority[];
  // NEW: Entity confidence
  entity_confidence?: EntityConfidence;
  // NEW: Grounding metadata (engine-specific)
  grounding_metadata?: GroundingMetadata;
  // NEW: Tiered recommendations with platform-specific strategies
  tiered_recommendations?: TieredRecommendation[];
  // RPA-specific fields
  analysis_partial?: boolean; // True if analysis was limited due to short response
  response_length?: number; // Length of extracted response for debugging
  rpa_extraction_stats?: {
    original_html_length: number;
    original_text_length: number;
    processed_html_length: number;
    processed_text_length: number;
  };
}

// ===========================================
// Hallucination Detection Types
// ===========================================

export interface HallucinationAnalysis {
  has_hallucinations: boolean;
  hallucinations: DetectedHallucination[];
  accuracy_score: number; // 0-100
  confidence: "high" | "medium" | "low";
  analysis_notes: string[];
}

export interface DetectedHallucination {
  type: "positive" | "negative" | "misattribution" | "outdated";
  severity: "critical" | "major" | "minor";
  claim: string; // What the AI said
  reality: string; // What the ground truth shows
  recommendation: HallucinationFix;
}

export interface HallucinationFix {
  title: string;
  description: string;
  specific_fix: string;
  affected_element?: string;
  priority: "critical" | "high" | "medium" | "low";
  schema_fix?: SchemaFix; // Auto-generated JSON-LD code
}

// ===========================================
// Schema Fix Generation (The "Fix It" Button)
// ===========================================

export interface SchemaFix {
  schema_type: 'Organization' | 'LocalBusiness' | 'Product' | 'Service' | 'FAQPage' | 'Article' | 'Offer';
  json_ld: string; // Ready-to-copy JSON-LD code
  placement_hint: string; // Where to add it (e.g., "Add to <head> of homepage")
  fixes_issue: string; // What hallucination this fixes
}

// ===========================================
// Enhanced AEO Scoring System
// ===========================================

export interface AEOScore {
  total_score: number; // 0-59 max (before penalties), can go negative with penalties
  normalized_score: number; // 0-100 scale for UI display
  breakdown: AEOScoreBreakdown;
  penalties: AEOPenalties;
  analysis_notes: string[];
}

export interface AEOScoreBreakdown {
  // A1: Brand Mention Likelihood (max 22 pts)
  brand_mention: {
    score: number;
    max: 22;
    match_type: 'exact' | 'partial' | 'fuzzy' | 'none';
    matched_term?: string;
    context?: string;
  };
  
  // A2: Accuracy & Context Quality (max 15 pts)
  accuracy_context: {
    score: number;
    max: 15;
    quality: 'accurate' | 'vague' | 'none';
    reasoning?: string;
  };
  
  // A3: Attribution/Citation Presence (max 12 pts)
  attribution: {
    score: number;
    max: 12;
    found_in_citations: boolean;
    found_in_text: boolean;
    citation_url?: string;
  };
  
  // A4: Comparative Positioning (max 10 pts)
  comparative_position: {
    score: number;
    max: 10;
    position: 'first' | 'after_competitors' | 'exclusive' | 'not_mentioned';
    competitors_found: string[];
    brand_position_index?: number;
  };
}

export interface AEOPenalties {
  // B: Misattribution Risk (-15 pts max)
  misattribution_risk: {
    penalty: number; // 0 or -15
    risk_detected: boolean;
    hallucination_details?: string;
  };
}

export const AEO_SCORE_WEIGHTS = {
  brand_mention: { max: 22, exact: 22, partial: 10, fuzzy: 10, none: 0 },
  accuracy_context: { max: 15, accurate: 15, vague: 5, none: 0 },
  attribution: { max: 12, present: 12, missing: 0 },
  comparative_position: { max: 10, first: 10, exclusive: 10, after: 5, not_mentioned: 0 },
  penalties: { misattribution: -15 },
} as const;

export const AEO_MAX_SCORE = 59; // 22 + 15 + 12 + 10

export interface ActionItem {
  priority: 'high' | 'medium' | 'foundational' | 'nice-to-have';
  category: 'technical' | 'content' | 'third-party' | 'entity' | 'measurement' | 'local' | 'ymyl';
  title: string;
  description: string;
  steps: string[];
  /** true = verified from crawl data, false = generic suggestion */
  isActionable?: boolean;
}

// ===========================================
// Tiered Recommendation System (Enhanced AEO)
// ===========================================

export type RecommendationTier = 'foundational' | 'high' | 'medium' | 'nice-to-have';

/**
 * Recommendation Section Types:
 * - 'actionable': From crawl data - specific, verified issues found on the website
 * - 'suggestion': Generic AI best practices - not verified against actual website
 */
export type RecommendationSection = 'actionable' | 'suggestion';

export type RecommendationCategory = 
  | 'crawler-access'      // Robots.txt, AI crawler blocks
  | 'brand-entity'        // H1, meta, entity definition
  | 'schema-markup'       // JSON-LD structured data
  | 'third-party-lists'   // Best-of lists, reviews, directories
  | 'community-consensus' // Reddit, Quora, X discussions
  | 'knowledge-graph'     // Wikipedia, Wikidata
  | 'long-tail-qa'        // FAQ, help center, Q&A content
  | 'direct-answer'       // Content structure, TL;DR, bullets
  | 'freshness'           // Last updated, content staleness
  | 'multimedia'          // YouTube, video content
  | 'proprietary-data'    // Industry reports, original stats
  | 'platform-specific';  // Engine-specific strategies

export interface TieredRecommendation {
  tier: RecommendationTier;
  section: RecommendationSection;  // 'actionable' = from crawl, 'suggestion' = generic
  category: RecommendationCategory;
  title: string;
  description: string;
  action: string;           // The specific, actionable instruction
  impact: string;           // Expected outcome
  priority_score: number;   // 1-100, for sorting within tier
  engine: SupportedEngine;  // Which AI engine this applies to
  evidence?: string;        // What crawl data triggered this (only for actionable)
  urls_to_target?: string[]; // Specific URLs mentioned as opportunities
}

/**
 * Grouped recommendations for UI display - TWO SEPARATE SECTIONS
 */
export interface GroupedRecommendations {
  /** 
   * ACTIONABLE RECOMMENDATIONS
   * - From crawl data ONLY - 100% verified issues
   * - EMPTY if website hasn't been crawled
   * - Each has `evidence` field with exact proof
   */
  actionable: TieredRecommendation[];
  
  /** 
   * SUGGESTED RECOMMENDATIONS
   * - Generic AI optimization best practices  
   * - Always populated regardless of crawl
   * - Engine-specific strategies
   */
  suggested: TieredRecommendation[];
}

export const TIER_LABELS: Record<RecommendationTier, string> = {
  'foundational': '🔴 Foundational (Must-Have)',
  'high': '🟠 High Priority (Growth Driver)',
  'medium': '🟡 Medium Priority (Optimization)',
  'nice-to-have': '🟢 Nice to Have (Edge)',
};

export const TIER_DESCRIPTIONS: Record<RecommendationTier, string> = {
  'foundational': 'If these are missing, the brand is invisible. Fix these first.',
  'high': 'Third-party authority and citations. "What others say about you" outweighs "What you say about yourself."',
  'medium': 'Content optimization to help AI understand your specific value proposition.',
  'nice-to-have': 'Tactics that separate the top 1% from the top 10%.',
};

export const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  'crawler-access': '🤖 Crawler Access',
  'brand-entity': '🏷️ Brand Entity',
  'schema-markup': '📋 Schema Markup',
  'third-party-lists': '📰 Third-Party Lists',
  'community-consensus': '💬 Community Consensus',
  'knowledge-graph': '🌐 Knowledge Graph',
  'long-tail-qa': '❓ Q&A Content',
  'direct-answer': '📝 Answer Formatting',
  'freshness': '🔄 Freshness Signal',
  'multimedia': '🎥 Multimedia',
  'proprietary-data': '📊 Proprietary Data',
  'platform-specific': '🎯 Platform Strategy',
};

export const PLATFORM_STRATEGY_LABELS: Record<SupportedEngine, string> = {
  'chatgpt': 'ChatGPT: Big Media PR + Bing SEO + Wikipedia',
  'perplexity': 'Perplexity: Information Density + Niche Authority + Top 5 Rankings',
  'gemini': 'Gemini: YouTube + Google Business Profile + Schema',
  'grok': 'Grok: X Presence + KOL Engagement + Real-Time News',
};

export interface GapAnalysis {
  structure_score: number;      // 1-5: Clear headers, lists, tables, FAQ schema
  data_density_score: number;   // 1-5: Specific numbers, stats, dates, proof points
  directness_score: number;     // 1-5: Answers query in first 50 words
  authority_score?: number;     // 1-5: Third-party mentions, awards, citations
  crawlability_score?: number;  // 1-5: Content accessible to AI crawlers
  overall_score?: number;       // Computed average
}

export interface BrandMention {
  url: string;
  context: string;
  position: 'primary' | 'secondary' | 'footnote';
}

export const ACTION_CATEGORY_LABELS: Record<ActionItem['category'], string> = {
  'technical': '🔧 Technical / Schema',
  'content': '📝 Content / Q&A',
  'third-party': '🔗 Third-Party Authority',
  'entity': '🏢 Entity / Brand',
  'measurement': '📊 Measurement',
  'local': '📍 Local SEO',
  'ymyl': '🛡️ YMYL / Trust',
};

export const ACTION_CATEGORY_DESCRIPTIONS: Record<ActionItem['category'], string> = {
  'technical': 'Crawlability, indexation, schema markup',
  'content': 'Q&A pages, proof content, case studies',
  'third-party': 'External lists, comparisons, mentions',
  'local': 'Local listings, maps, NAP consistency',
  'ymyl': 'Credentialing, authorship, editorial policies',
  'entity': 'Facts pages, brand consistency, profiles',
  'measurement': 'Tracking, alerts, monitoring',
};

export const PRIORITY_LABELS: Record<ActionItem['priority'], string> = {
  'high': '🔴 High Priority',
  'medium': '🟡 Medium Priority', 
  'foundational': '🔵 Foundational',
  'nice-to-have': '⚪ Nice to Have',
};

export const PRIORITY_COLORS: Record<ActionItem['priority'], string> = {
  'high': 'bg-red-500/20 text-red-400 border-red-500/30',
  'medium': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'foundational': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'nice-to-have': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

// GEO Priority Framework Reference
export const GEO_PRIORITY_FRAMEWORK = {
  high: {
    label: 'High Priority (Critical)',
    description: 'Third-party authority, comparisons, entity/facts pages',
    categories: ['third-party', 'entity'],
  },
  medium: {
    label: 'Medium Priority (Important)', 
    description: 'Brand consistency, Q&A content, proof-heavy case studies',
    categories: ['content', 'entity'],
  },
  low: {
    label: 'Foundational (Table Stakes)',
    description: 'Technical SEO, schema markup, measurement',
    categories: ['technical', 'measurement'],
  },
} as const;

// ===========================================
// Search & Simulation Types
// ===========================================

export interface SearchContext {
  query: string;
  results: SearchResult[];
  raw_response?: unknown;
  // NEW: Engine-specific grounding data
  grounding_metadata?: GroundingMetadata;
  // NEW: For Gemini - the actual queries it ran
  derived_queries?: string[];
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  body?: string;
  score?: number;
  // NEW: For attribution tracking
  is_grounded?: boolean;
  grounding_text?: string;
}

export interface SimulationRawResult {
  answer_html: string;
  sources: SourceReference[];
  search_context?: SearchContext;
  // NEW: Standardized result for cross-engine comparison
  standardized?: StandardizedResult;
}

export interface SourceReference {
  url: string;
  title?: string;
  snippet?: string;
  // NEW: Grounding attribution
  grounding_confidence?: number;
  is_x_post?: boolean;
  x_post_data?: XPost;
}

export interface RunSimulationInput {
  engine: SupportedEngine;
  keyword: string;
  language: SupportedLanguage;
  brand_domain: string;
  /** Regional location for search results */
  region?: SupportedRegion;
}

// ===========================================
// API & Job Types
// ===========================================

export interface RunAnalysisInput {
  brand_id: string;
  prompt_set_id?: string; // Optional - can run on individual prompts
  prompt_ids?: string[]; // For running on specific prompts
  engines: SupportedEngine[];
  language: SupportedLanguage;
  /** Regional location for search results */
  region?: SupportedRegion;
  /** Enable Hallucination Watchdog (Pro+ feature) */
  enable_hallucination_watchdog?: boolean;
  /** Simulation mode: 'api' (fast), 'browser' (real-world), or 'hybrid' (both) */
  simulation_mode?: SimulationMode;
  /** Use authenticated sessions for browser mode */
  use_authenticated_sessions?: boolean;
}

// ===========================================
// Simulation Mode Types (API vs Browser)
// ===========================================

/**
 * Simulation mode determines how AI responses are captured:
 * - 'api': Uses official APIs (fast, stable, cost-effective)
 * - 'browser': Uses headless browser automation (real-world parity)
 * - 'hybrid': Uses both and merges results (highest fidelity)
 * - 'rpa': Uses external RPA (headed browser with your real Chrome session)
 *          Creates simulation record in "awaiting_rpa" status and waits for
 *          results via /api/analysis/rpa-ingest webhook
 */
export type SimulationMode = 'api' | 'browser' | 'hybrid' | 'rpa';

/**
 * Browser capture data - UI elements not available via API
 */
export interface BrowserCaptureData {
  // Citation details
  citation_count: number;
  citations: Array<{
    index: number;
    url: string;
    title: string;
    is_inline: boolean;
    citation_style: 'numbered' | 'linked' | 'footnote' | 'superscript';
  }>;
  
  // Source cards (larger featured sources)
  source_card_count: number;
  source_cards: Array<{
    title: string;
    url: string;
    domain: string;
    card_type: 'featured' | 'news' | 'video' | 'social' | 'review';
  }>;
  
  // Search chips and follow-ups
  search_chip_count: number;
  search_chips: Array<{
    text: string;
    type: 'related_query' | 'people_also_ask' | 'follow_up' | 'filter';
  }>;
  
  // Knowledge panel (if present)
  has_knowledge_panel: boolean;
  knowledge_panel?: {
    entity_name: string;
    entity_type: string;
    description: string;
  };
  
  // Product tiles (for shopping queries)
  product_tile_count: number;
  
  // Suggested follow-up questions
  suggested_followups: string[];
  
  // Timing
  response_time_ms: number;
  was_logged_in: boolean;
}

export interface CheckVisibilityInput {
  brand_id: string;
  prompt_id: string;
  analysis_batch_id: string;
  engine: SupportedEngine;
  language: SupportedLanguage;
  /** Regional location for search results */
  region?: SupportedRegion;
  /** Enable Hallucination Watchdog (Pro+ feature) */
  enable_hallucination_watchdog?: boolean;
  /** Simulation mode: 'api' (fast), 'browser' (real-world), or 'hybrid' (both) */
  simulation_mode?: SimulationMode;
  /** Use authenticated sessions for browser mode */
  use_authenticated_sessions?: boolean;
  // Alias for backwards compatibility
  keyword_id?: string;
}

// ===========================================
// Crawl Job Types
// ===========================================

export interface CrawlJob {
  id: string;
  brand_id: string;
  firecrawl_job_id: string | null;
  status: CrawlStatus;
  start_url: string;
  max_pages: number;
  max_depth: number;
  include_paths: string[];
  exclude_paths: string[];
  total_pages_crawled: number;
  credits_used: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrawledPage {
  id: string;
  crawl_job_id: string;
  brand_id: string;
  url: string;
  title: string | null;
  description: string | null;
  content_markdown: string | null;
  content_excerpt: string | null;
  word_count: number;
  links_count: number;
  crawled_at: string;
  created_at: string;
}

export interface CrawlBrandInput {
  brand_id: string;
  crawl_job_id: string;
  start_url: string;
  max_pages?: number;
  max_depth?: number;
  include_paths?: string[];
  exclude_paths?: string[];
}

// ===========================================
// Billing Types
// ===========================================

export interface TierLimits {
  monthly_credits: number;
  max_brands: number;
  max_prompts_per_brand: number;
  max_concurrent_jobs: number;
  /** Hallucination Watchdog - Pro+ feature */
  hallucination_watchdog: boolean;
  /** Website crawling for Ground Truth */
  website_crawling: boolean;
}

export const TIER_LIMITS: Record<BillingTier, TierLimits> = {
  free: {
    monthly_credits: 50,
    max_brands: 1,
    max_prompts_per_brand: 10,
    max_concurrent_jobs: 2,
    hallucination_watchdog: false,
    website_crawling: false,
  },
  trial: {
    monthly_credits: 200,
    max_brands: 2,
    max_prompts_per_brand: 25,
    max_concurrent_jobs: 3,
    hallucination_watchdog: false,
    website_crawling: false,
  },
  starter: {
    monthly_credits: 2000,
    max_brands: 3,
    max_prompts_per_brand: 50,
    max_concurrent_jobs: 5,
    hallucination_watchdog: false,
    website_crawling: true,
  },
  pro: {
    monthly_credits: 10000,
    max_brands: 10,
    max_prompts_per_brand: 200,
    max_concurrent_jobs: 10,
    hallucination_watchdog: true,
    website_crawling: true,
  },
  agency: {
    monthly_credits: 50000,
    max_brands: 50,
    max_prompts_per_brand: 500,
    max_concurrent_jobs: 20,
    hallucination_watchdog: true,
    website_crawling: true,
  },
};

// ===========================================
// UI & Display Types
// ===========================================

export interface EngineInfo {
  id: SupportedEngine;
  name: string;
  color: string;
  icon: string;
  description: string;
}

export const ENGINES: EngineInfo[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    color: 'hsl(160 84% 39%)',
    icon: '🟢',
    description: 'OpenAI GPT-5.2',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    color: 'hsl(270 76% 55%)',
    icon: '🟣',
    description: 'Perplexity Sonar Pro',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    color: 'hsl(217 91% 60%)',
    icon: '🔵',
    description: 'Google Gemini 1.5 Pro',
  },
  {
    id: 'grok',
    name: 'Grok',
    color: 'hsl(0 0% 20%)',
    icon: '⚫',
    description: 'xAI Grok Beta',
  },
];

export function getEngineInfo(engine: SupportedEngine): EngineInfo {
  return ENGINES.find((e) => e.id === engine) || ENGINES[0];
}

// ===========================================
// Ensemble Simulation Types
// ===========================================

/**
 * Brand presence level based on ensemble frequency analysis
 */
export type BrandPresenceLevel = 
  | "definite_present"   // Brand appears in ≥60% of runs
  | "possible_present"   // Brand appears in 20-59% of runs
  | "inconclusive"       // Brand appears in 1-19% of runs
  | "likely_absent";     // Brand appears in 0% of runs

/**
 * Result for a specific brand across ensemble runs
 */
export interface EnsembleBrandMetrics {
  name: string;
  domain?: string;
  frequency: number;              // 0-1, how often brand appeared
  presence_level: BrandPresenceLevel;
  mention_frequency: number;      // How often in answer text
  source_frequency: number;       // How often in sources
  confidence: "high" | "medium" | "low";
}

/**
 * Target brand visibility result from ensemble
 */
export interface EnsembleVisibilityResult {
  is_visible: boolean;
  visibility_frequency: number;   // 0-1
  presence_level: BrandPresenceLevel;
  confidence: "high" | "medium" | "low";
  mentioned_in_runs: number;
  supported_in_runs: number;
  total_runs: number;
  summary: string;
}

/**
 * Extended simulation data when using ensemble mode
 */
export interface EnsembleSimulationData {
  enabled: boolean;
  run_count: number;
  successful_runs: number;
  
  // Target brand metrics
  target_visibility?: EnsembleVisibilityResult;
  
  // All detected brands with frequencies
  all_brands: EnsembleBrandMetrics[];
  
  // Variance metrics
  brand_variance: number;         // 0-1, how consistent brands are across runs
  
  // Notes and warnings
  notes: string[];
}

/**
 * Enhanced simulation result that includes ensemble data
 */
export interface EnhancedSimulationResult {
  // Standard simulation fields
  answer_html: string;
  sources: SourceReference[];
  search_context?: SearchContext;
  
  // Ensemble-enhanced visibility
  is_visible: boolean;
  visibility_confidence: "high" | "medium" | "low";
  presence_level: BrandPresenceLevel;
  
  // Ensemble data (when enabled)
  ensemble_data?: EnsembleSimulationData;
  
  // Legacy compatibility - semantic for product: don't say "shows X" unless backed
  visibility_statement: string;   // e.g., "Brand X appears with probability 0.8"
}

// ===========================================
// Presence Level Labels & Colors
// ===========================================

export const PRESENCE_LEVEL_LABELS: Record<BrandPresenceLevel, string> = {
  'definite_present': '✓ Definitively Present',
  'possible_present': '? Possibly Present',
  'inconclusive': '⚠ Inconclusive',
  'likely_absent': '✗ Likely Absent',
};

export const PRESENCE_LEVEL_DESCRIPTIONS: Record<BrandPresenceLevel, string> = {
  'definite_present': 'Brand appeared in ≥60% of simulations - high confidence it appears in live ChatGPT',
  'possible_present': 'Brand appeared in 20-59% of simulations - may or may not appear in live ChatGPT',
  'inconclusive': 'Brand appeared in <20% of simulations - results are unreliable',
  'likely_absent': 'Brand did not appear in any simulation - unlikely to appear in live ChatGPT',
};

export const PRESENCE_LEVEL_COLORS: Record<BrandPresenceLevel, string> = {
  'definite_present': 'bg-green-500/20 text-green-400 border-green-500/30',
  'possible_present': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'inconclusive': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'likely_absent': 'bg-red-500/20 text-red-400 border-red-500/30',
};

