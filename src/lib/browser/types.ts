/**
 * Browser Automation Types
 * 
 * Types for front-end answer capture using headless browser automation.
 * These types represent the REAL DOM elements captured from live AI engines,
 * including UI elements that APIs don't expose (search chips, citations, product tiles).
 */

// Import core types from main types module
import type {
  SupportedEngine as _SupportedEngine,
  SupportedLanguage as _SupportedLanguage,
  SupportedRegion as _SupportedRegion,
} from "@/types";

// Re-export for convenience
export type SupportedEngine = _SupportedEngine;
export type SupportedLanguage = _SupportedLanguage;
export type SupportedRegion = _SupportedRegion;

// ===========================================
// Core Browser Capture Types
// ===========================================

/**
 * Result from browser-based answer capture
 * Represents what a human actually sees on the AI engine's interface
 */
export interface BrowserCaptureResult {
  engine: SupportedEngine;
  mode: 'browser'; // Distinguishes from API mode
  
  // Core response content
  answer_html: string;         // Full HTML content of the response
  answer_text: string;         // Plain text version
  answer_markdown: string;     // Markdown conversion
  
  // UI Elements captured from DOM
  citations: BrowserCitation[];           // Inline citations with position
  search_chips: SearchChip[];             // "People also ask", related queries
  product_tiles: ProductTile[];           // Product recommendations
  source_cards: SourceCard[];             // Featured source cards
  knowledge_panel: KnowledgePanel | null; // Knowledge graph panel if present
  suggested_followups: string[];          // Suggested follow-up questions
  
  // Raw DOM data for analysis
  dom_snapshot: DOMSnapshot;
  
  // Timing and reliability
  response_time_ms: number;
  page_load_time_ms: number;
  capture_timestamp: string;
  
  // Session info
  session_id: string;
  was_logged_in: boolean;
  user_agent: string;
  viewport: { width: number; height: number };
}

/**
 * Citation as captured from the browser DOM
 * More detailed than API citations - includes exact position and rendering
 */
export interface BrowserCitation {
  index: number;                 // Citation number [1], [2], etc.
  url: string;
  title: string;
  snippet: string;
  favicon_url?: string;
  
  // Position in the response
  position_in_text: number;      // Character offset where citation appears
  surrounding_context: string;   // Text around the citation
  
  // Visual properties
  is_inline: boolean;            // Appears inline vs in footer
  is_highlighted: boolean;       // Has special highlighting
  citation_style: 'numbered' | 'linked' | 'footnote' | 'superscript';
  
  // Authority signals from DOM
  domain_badge?: string;         // "Verified" or domain authority badges
  source_type_badge?: string;    // "News", "Academic", etc.
}

/**
 * Search chip / related query captured from UI
 */
export interface SearchChip {
  text: string;
  type: 'related_query' | 'people_also_ask' | 'follow_up' | 'filter' | 'category';
  position: number;
  is_expanded: boolean;
}

/**
 * Product tile for shopping/comparison queries
 */
export interface ProductTile {
  title: string;
  price?: string;
  rating?: number;
  review_count?: number;
  image_url?: string;
  source_url: string;
  merchant?: string;
  is_sponsored: boolean;
  position: number;
}

/**
 * Featured source card (larger citation boxes)
 */
export interface SourceCard {
  title: string;
  url: string;
  snippet: string;
  image_url?: string;
  favicon_url?: string;
  domain: string;
  publish_date?: string;
  author?: string;
  card_type: 'featured' | 'news' | 'video' | 'social' | 'review';
}

/**
 * Knowledge panel from the AI response
 */
export interface KnowledgePanel {
  entity_name: string;
  entity_type: string;
  description: string;
  image_url?: string;
  attributes: Record<string, string>;
  official_website?: string;
  social_links: Array<{ platform: string; url: string }>;
}

/**
 * DOM snapshot for debugging and analysis
 */
export interface DOMSnapshot {
  html: string;
  css_selectors_used: string[];
  elements_captured: number;
  scroll_position: number;
  page_height: number;
}

// ===========================================
// Browser Session Management
// ===========================================

export interface BrowserSession {
  id: string;
  engine: SupportedEngine;
  status: 'idle' | 'active' | 'error' | 'closed';
  is_authenticated: boolean;
  last_activity: string;
  cookies: BrowserCookie[];
  created_at: string;
}

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly: boolean;
  secure: boolean;
}

export interface AuthCredentials {
  engine: SupportedEngine;
  
  // Email/Password login (interactive flow)
  email?: string;
  password?: string;
  
  // Token-based auth (fast injection)
  session_token?: string;
  access_token?: string;
  
  // Cookie-based auth (fastest - full session restore)
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
  }>;
  
  // API key (fallback for API-mode)
  api_key?: string;
  
  // OAuth tokens (for Google/X auth)
  oauth_token?: string;
  oauth_secret?: string;
  
  // 2FA support
  totp_secret?: string;
}

// ===========================================
// Browser Automation Input Types
// ===========================================

export interface BrowserSimulationInput {
  engine: SupportedEngine;
  prompt: string;
  language: SupportedLanguage;
  region: SupportedRegion;
  brand_domain: string;
  
  // Browser options
  options?: BrowserOptions;
}

export interface BrowserOptions {
  headless?: boolean;           // Run headless or visible (for debugging)
  timeout_ms?: number;          // Max wait time for response
  wait_for_streaming?: boolean; // Wait for streaming to complete
  capture_screenshots?: boolean;
  screenshot_path?: string;
  viewport?: { width: number; height: number };
  
  // Authentication
  use_auth?: boolean;           // Use authenticated session
  auth_credentials?: AuthCredentials;
  
  // Advanced
  block_images?: boolean;       // Faster loading
  block_analytics?: boolean;    // Block tracking scripts
  user_agent_override?: string;
  proxy?: ProxyConfig;
}

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

// ===========================================
// Engine-Specific DOM Selectors
// ===========================================

/**
 * CSS selectors for each AI engine's DOM structure
 * These need to be updated when engines change their UI
 */
export interface EngineDOMSelectors {
  // Container for the AI response
  response_container: string;
  
  // Text content
  response_text: string;
  streaming_indicator: string;
  
  // Citations
  citation_link: string;
  citation_number: string;
  citation_card: string;
  
  // Search/source elements
  source_list: string;
  source_card: string;
  search_chip: string;
  
  // Input elements
  prompt_input: string;
  submit_button: string;
  
  // Auth elements
  login_button: string;
  login_email_input: string;
  login_password_input: string;
  
  // Loading states
  loading_indicator: string;
  error_message: string;
}

/**
 * Engine-specific selectors registry
 */
export const ENGINE_SELECTORS: Record<SupportedEngine, EngineDOMSelectors> = {
  chatgpt: {
    response_container: '[data-message-author-role="assistant"]',
    response_text: '.markdown.prose',
    streaming_indicator: '.result-streaming',
    citation_link: 'a[href^="http"]',
    citation_number: 'sup',
    citation_card: '.citation-card',
    source_list: '.sources-list',
    source_card: '.source-card',
    search_chip: '.related-query',
    prompt_input: '#prompt-textarea',
    submit_button: '[data-testid="send-button"]',
    login_button: '[data-testid="login-button"]',
    login_email_input: 'input[name="email"]',
    login_password_input: 'input[name="password"]',
    loading_indicator: '.loading-spinner',
    error_message: '.error-message',
  },
  perplexity: {
    response_container: '[class*="prose"]',
    response_text: '[class*="prose"] > div',
    streaming_indicator: '[class*="animate-pulse"]',
    citation_link: 'a[class*="citation"]',
    citation_number: '[class*="citation-number"]',
    citation_card: '[class*="source-card"]',
    source_list: '[class*="sources"]',
    source_card: '[class*="source-item"]',
    search_chip: '[class*="related"]',
    prompt_input: 'textarea[placeholder*="Ask"]',
    submit_button: 'button[type="submit"]',
    login_button: 'button[class*="login"]',
    login_email_input: 'input[type="email"]',
    login_password_input: 'input[type="password"]',
    loading_indicator: '[class*="loading"]',
    error_message: '[class*="error"]',
  },
  gemini: {
    response_container: '.model-response-text',
    response_text: '.markdown-main-panel',
    streaming_indicator: '.loading-state',
    citation_link: 'a.source-link',
    citation_number: '.citation-index',
    citation_card: '.grounding-chunk',
    source_list: '.grounding-sources',
    source_card: '.source-chip',
    search_chip: '.suggested-query',
    prompt_input: 'rich-textarea',
    submit_button: 'button[aria-label="Send message"]',
    login_button: 'a[href*="accounts.google.com"]',
    login_email_input: 'input[type="email"]',
    login_password_input: 'input[type="password"]',
    loading_indicator: '.loading-indicator',
    error_message: '.error-container',
  },
  grok: {
    response_container: '[class*="message-content"]',
    response_text: '[class*="markdown"]',
    streaming_indicator: '[class*="typing"]',
    citation_link: 'a[href^="http"]',
    citation_number: 'sup.citation',
    citation_card: '.x-post-embed',
    source_list: '.sources-section',
    source_card: '.source-preview',
    search_chip: '.follow-up-query',
    prompt_input: 'textarea[placeholder*="message"]',
    submit_button: 'button[type="submit"]',
    login_button: 'a[href*="twitter.com"]',
    login_email_input: 'input[name="text"]',
    login_password_input: 'input[name="password"]',
    loading_indicator: '.thinking-indicator',
    error_message: '.error-banner',
  },
};

// ===========================================
// Utility Types
// ===========================================

export interface BrowserPoolConfig {
  max_browsers: number;
  max_pages_per_browser: number;
  browser_idle_timeout_ms: number;
  page_idle_timeout_ms: number;
}

export const DEFAULT_BROWSER_POOL_CONFIG: BrowserPoolConfig = {
  max_browsers: 5,
  max_pages_per_browser: 3,
  browser_idle_timeout_ms: 300000, // 5 minutes
  page_idle_timeout_ms: 60000,     // 1 minute
};

export interface BrowserMetrics {
  total_captures: number;
  successful_captures: number;
  failed_captures: number;
  avg_response_time_ms: number;
  avg_page_load_time_ms: number;
  auth_success_rate: number;
}

