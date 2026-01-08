/**
 * Recommendation Engine
 * 
 * Generates TWO SEPARATE sections of recommendations:
 * 
 * ═══════════════════════════════════════════════════════════════
 * SECTION 1: ACTIONABLE RECOMMENDATIONS
 * ═══════════════════════════════════════════════════════════════
 * - ONLY from Firecrawl crawl data - 100% verified issues
 * - Every recommendation has `evidence` field with exact proof
 * - If NO crawl data exists → this section is EMPTY
 * - User MUST crawl website first to get actionable recommendations
 * 
 * ═══════════════════════════════════════════════════════════════
 * SECTION 2: SUGGESTED RECOMMENDATIONS
 * ═══════════════════════════════════════════════════════════════
 * - Generic AI optimization best practices
 * - Platform-specific strategies for each engine
 * - ALWAYS available (even without crawl)
 * - Not verified against actual website
 * ═══════════════════════════════════════════════════════════════
 * 
 * ALL recommendations are engine-specific based on target platform.
 */

import type { CrawlAnalysis } from "@/lib/ai/crawl-analyzer";
import type { 
  SupportedEngine, 
  TieredRecommendation, 
  GroupedRecommendations,
} from "@/types";

export interface RecommendationContext {
  brand_name: string;
  brand_domain: string;
  query: string;
  engine: SupportedEngine;
  
  // CRAWL ANALYSIS - Source of actionable recommendations
  crawl_analysis?: CrawlAnalysis;
  
  // Additional context
  winning_sources?: string[];
  is_visible: boolean;
}

// ===========================================
// Main Recommendation Generator
// ===========================================

/**
 * Generate recommendations in two separate sections:
 * 
 * ACTIONABLE RECOMMENDATIONS:
 * - ONLY generated if crawl_analysis exists
 * - 100% verified issues from actual website crawl
 * - If no crawl → returns EMPTY actionable array
 * 
 * SUGGESTED RECOMMENDATIONS:
 * - Generic best practices for the AI engine
 * - Always generated regardless of crawl
 */
export function generateTieredRecommendations(
  context: RecommendationContext
): TieredRecommendation[] {
  const allRecs: TieredRecommendation[] = [];
  const { engine, crawl_analysis } = context;
  
  // ═══════════════════════════════════════════════════════════
  // SECTION 1: ACTIONABLE RECOMMENDATIONS
  // ONLY from crawl data - if no crawl, this section is EMPTY
  // ═══════════════════════════════════════════════════════════
  
  if (crawl_analysis) {
    console.log(`📋 Generating ACTIONABLE recommendations from crawl data...`);
    allRecs.push(...generateActionableRecommendations(context, crawl_analysis, engine));
    
    // Winning sources are also actionable (from actual AI response analysis)
    if (context.winning_sources && context.winning_sources.length > 0) {
      allRecs.push(...generateWinningSourcesRecommendations(context, engine));
    }
    
    const actionableCount = allRecs.filter(r => r.section === 'actionable').length;
    console.log(`   Found ${actionableCount} actionable recommendations`);
  } else {
    console.log(`⚠️ NO crawl data available - Actionable Recommendations will be EMPTY`);
    console.log(`   To get actionable recommendations, crawl the website first`);
  }
  
  // ═══════════════════════════════════════════════════════════
  // SECTION 2: SUGGESTED RECOMMENDATIONS
  // Generic best practices - always generated
  // ═══════════════════════════════════════════════════════════
  
  console.log(`💡 Generating SUGGESTED recommendations (${getEngineName(engine)} best practices)...`);
  allRecs.push(...generateEngineSuggestions(context, engine));
  
  const suggestionCount = allRecs.filter(r => r.section === 'suggestion').length;
  console.log(`   Generated ${suggestionCount} suggestions`);
  
  // Deduplicate
  const deduped = deduplicateRecommendations(allRecs);
  
  // Sort: actionable first, then by tier/score
  return deduped.sort((a, b) => {
    // Actionable recommendations come first
    if (a.section !== b.section) {
      return a.section === 'actionable' ? -1 : 1;
    }
    
    const tierOrder = { 'foundational': 0, 'high': 1, 'medium': 2, 'nice-to-have': 3 };
    
    if (tierOrder[a.tier] !== tierOrder[b.tier]) {
      return tierOrder[a.tier] - tierOrder[b.tier];
    }
    return b.priority_score - a.priority_score;
  });
}

/**
 * Group recommendations for UI display into two distinct sections:
 * 
 * @returns {GroupedRecommendations}
 * - actionable: Verified issues from crawl (EMPTY if no crawl data)
 * - suggested: Generic best practices (always populated)
 */
export function groupRecommendations(
  recommendations: TieredRecommendation[]
): GroupedRecommendations {
  const actionable = recommendations.filter(r => r.section === 'actionable');
  const suggested = recommendations.filter(r => r.section === 'suggestion');
  
  if (actionable.length === 0) {
    console.log(`⚠️ No actionable recommendations - website needs to be crawled first`);
  }
  
  return { actionable, suggested };
}

// ===========================================
// ACTIONABLE RECOMMENDATIONS (from crawl data ONLY)
// ===========================================

function generateActionableRecommendations(
  context: RecommendationContext,
  analysis: CrawlAnalysis,
  engine: SupportedEngine
): TieredRecommendation[] {
  const recs: TieredRecommendation[] = [];
  const { brand_name, brand_domain } = context;
  
  // ============================================
  // CRAWLER ACCESS - Engine-specific blocks
  // ============================================
  
  // ChatGPT-specific
  if (engine === 'chatgpt' && analysis.crawler_access.blocks_gptbot) {
    recs.push({
      tier: 'foundational',
      section: 'actionable',
      category: 'crawler-access',
      title: 'ChatGPT Blocked by robots.txt',
      description: `Your robots.txt blocks GPTBot. ChatGPT cannot crawl ${brand_domain}.`,
      action: `Edit robots.txt: Remove "User-agent: GPTBot" and "Disallow: /" lines. Affected: ${analysis.crawler_access.blocking_lines.filter(l => l.toLowerCase().includes('gpt')).join('; ') || analysis.crawler_access.blocking_lines[0]}`,
      impact: 'ChatGPT will NEVER recommend you if it cannot read your website.',
      priority_score: 100,
      engine: 'chatgpt',
      evidence: `robots.txt: ${analysis.crawler_access.blocking_lines.join('; ')}`,
    });
  }
  
  // Gemini-specific
  if (engine === 'gemini' && analysis.crawler_access.blocks_google_extended) {
    recs.push({
      tier: 'foundational',
      section: 'actionable',
      category: 'crawler-access',
      title: 'Gemini Blocked by robots.txt',
      description: `Your robots.txt blocks Google-Extended, which Gemini uses for AI answers.`,
      action: `Edit robots.txt: Remove "User-agent: Google-Extended" block.`,
      impact: 'Google Gemini cannot use your content for AI-generated answers.',
      priority_score: 100,
      engine: 'gemini',
      evidence: `robots.txt blocks Google-Extended user-agent`,
    });
  }
  
  // All engines - complete block
  if (analysis.crawler_access.blocks_all_bots) {
    recs.push({
      tier: 'foundational',
      section: 'actionable',
      category: 'crawler-access',
      title: `${getEngineName(engine)} Blocked - All Crawlers Disabled`,
      description: `robots.txt has "User-agent: * Disallow: /" which blocks ALL crawlers including ${getEngineName(engine)}.`,
      action: `Edit robots.txt: Remove the blanket "Disallow: /" rule. Only block specific sensitive paths.`,
      impact: `${getEngineName(engine)} cannot access any content on your website.`,
      priority_score: 100,
      engine,
      evidence: `robots.txt: User-agent: * Disallow: /`,
    });
  }
  
  // ============================================
  // SCHEMA MARKUP - Engine-specific importance
  // ============================================
  
  // Gemini values schema highly
  if (engine === 'gemini' && !analysis.schema_markup.has_schema) {
    recs.push({
      tier: 'foundational',
      section: 'actionable',
      category: 'schema-markup',
      title: 'Gemini: No Schema Markup Found',
      description: `Google Gemini heavily relies on JSON-LD schema. ${brand_domain} has none.`,
      action: `Add JSON-LD schema: Organization (with sameAs links), Product/Offer (with prices), FAQPage, LocalBusiness if applicable.`,
      impact: 'Gemini uses schema for structured facts. Without it, Gemini must guess your details.',
      priority_score: 95,
      engine: 'gemini',
      evidence: `Crawl: 0 JSON-LD schema blocks found`,
    });
  }
  
  // All engines - missing Organization schema
  if (analysis.schema_markup.missing_critical_schemas.includes('Organization')) {
    recs.push({
      tier: 'foundational',
      section: 'actionable',
      category: 'schema-markup',
      title: `${getEngineName(engine)}: Missing Organization Schema`,
      description: `No Organization schema found. ${getEngineName(engine)} cannot verify ${brand_name} is a legitimate company.`,
      action: `Add JSON-LD Organization schema with: name, url, logo, description, sameAs (links to LinkedIn, Twitter, etc.)`,
      impact: `${getEngineName(engine)} may misclassify or ignore your brand.`,
      priority_score: 90,
      engine,
      evidence: `Crawl: Organization schema not found`,
    });
  }
  
  // Schema issues
  for (const schemaIssue of analysis.schema_markup.schema_issues.slice(0, 2)) {
    recs.push({
      tier: 'medium',
      section: 'actionable',
      category: 'schema-markup',
      title: `${getEngineName(engine)}: ${schemaIssue.type} Schema Issue`,
      description: `On ${schemaIssue.page_url}: ${schemaIssue.issue}`,
      action: schemaIssue.fix,
      impact: `${getEngineName(engine)} may show incorrect information about ${brand_name}.`,
      priority_score: 65,
      engine,
      evidence: `Schema validation: ${schemaIssue.issue}`,
      urls_to_target: [schemaIssue.page_url],
    });
  }
  
  // ============================================
  // H1 TAG - All engines care about this
  // ============================================
  
  if (analysis.brand_entity.homepage_h1_vague && analysis.brand_entity.homepage_h1) {
    recs.push({
      tier: 'foundational',
      section: 'actionable',
      category: 'brand-entity',
      title: `${getEngineName(engine)}: Vague H1 Tag`,
      description: `H1 is "${analysis.brand_entity.homepage_h1}" - ${getEngineName(engine)} cannot determine what ${brand_name} does.`,
      action: `Change H1 to: "${brand_name}: [Category] for [Audience]". Example: "${brand_name}: Solar Installation for Homeowners"`,
      impact: `${getEngineName(engine)} uses H1 to categorize your business. Vague H1 = wrong category.`,
      priority_score: 95,
      engine,
      evidence: `Crawled H1: "${analysis.brand_entity.homepage_h1}"`,
    });
  }
  
  // ============================================
  // CONTENT STRUCTURE - Engine-specific
  // ============================================
  
  // Perplexity cares about content density
  if (engine === 'perplexity' && analysis.content_structure.pricing_visibility_issue) {
    recs.push({
      tier: 'medium',
      section: 'actionable',
      category: 'direct-answer',
      title: 'Perplexity: Pricing Buried in Content',
      description: `Perplexity extracts from top of pages. Your pricing is buried.`,
      action: `Move pricing to TOP of ${analysis.content_structure.pricing_page_url}. Perplexity reads the first 20% most carefully.`,
      impact: 'Perplexity may skip your pricing when answering cost questions.',
      priority_score: 70,
      engine: 'perplexity',
      evidence: analysis.content_structure.pricing_visibility_issue,
      urls_to_target: analysis.content_structure.pricing_page_url ? [analysis.content_structure.pricing_page_url] : undefined,
    });
  }
  
  // All engines - no FAQ
  if (!analysis.content_structure.has_faq_page) {
    recs.push({
      tier: 'medium',
      section: 'actionable',
      category: 'long-tail-qa',
      title: `${getEngineName(engine)}: No FAQ Page`,
      description: `${brand_domain} has no FAQ page. ${getEngineName(engine)} uses FAQs to answer common questions.`,
      action: `Create /faq page with common questions. Add FAQPage schema. Target questions people ask about ${brand_name}.`,
      impact: `${getEngineName(engine)} cannot find pre-packaged answers for common queries.`,
      priority_score: 65,
      engine,
      evidence: `Crawl: No FAQ page found`,
    });
  }
  
  // ============================================
  // AUTHORITY SIGNALS - Platform-specific
  // ============================================
  
  // ChatGPT values press/media
  if (engine === 'chatgpt' && !analysis.authority_signals.has_press_page) {
    recs.push({
      tier: 'high',
      section: 'actionable',
      category: 'third-party-lists',
      title: 'ChatGPT: No Press/Media Page',
      description: `ChatGPT weights authoritative media. ${brand_domain} has no press page.`,
      action: `Create /press page linking to any media coverage. ChatGPT trusts brands mentioned in news.`,
      impact: 'ChatGPT heavily favors brands with verified media presence.',
      priority_score: 80,
      engine: 'chatgpt',
      evidence: `Crawl: No press/news page found`,
    });
  }
  
  // Grok values X/social presence
  if (engine === 'grok' && !analysis.authority_signals.has_testimonials_page) {
    recs.push({
      tier: 'high',
      section: 'actionable',
      category: 'community-consensus',
      title: 'Grok: No Social Proof Found',
      description: `Grok values authentic user sentiment. No testimonials found on ${brand_domain}.`,
      action: `Add testimonials with real names. Link to X/Twitter discussions about ${brand_name}.`,
      impact: 'Grok uses social signals to gauge brand reputation.',
      priority_score: 80,
      engine: 'grok',
      evidence: `Crawl: 0 testimonials detected`,
    });
  }
  
  // ============================================
  // FRESHNESS - All engines
  // ============================================
  
  for (const stalePage of analysis.freshness.stale_critical_pages.slice(0, 2)) {
    recs.push({
      tier: 'medium',
      section: 'actionable',
      category: 'freshness',
      title: `${getEngineName(engine)}: Stale Content (${stalePage.age_months}mo)`,
      description: `"${stalePage.title.slice(0, 30)}..." is ${stalePage.age_months} months old.`,
      action: `Update ${stalePage.url}. Add "Last Updated: [date]" to signal freshness.`,
      impact: `${getEngineName(engine)} deprioritizes stale content.`,
      priority_score: 55,
      engine,
      evidence: `Last-Modified: ${stalePage.age_months} months ago`,
      urls_to_target: [stalePage.url],
    });
  }
  
  return recs;
}

// ===========================================
// ENGINE-SPECIFIC SUGGESTIONS (Generic)
// ===========================================

function generateEngineSuggestions(
  context: RecommendationContext,
  engine: SupportedEngine
): TieredRecommendation[] {
  const { brand_name, brand_domain, is_visible } = context;
  
  switch (engine) {
    case 'chatgpt':
      return generateChatGPTSuggestions(brand_name, brand_domain, is_visible);
    case 'perplexity':
      return generatePerplexitySuggestions(brand_name, brand_domain, is_visible);
    case 'gemini':
      return generateGeminiSuggestions(brand_name, brand_domain, is_visible);
    case 'grok':
      return generateGrokSuggestions(brand_name, brand_domain, is_visible);
    default:
      return [];
  }
}

function generateChatGPTSuggestions(
  brandName: string,
  brandDomain: string,
  isVisible: boolean
): TieredRecommendation[] {
  const recs: TieredRecommendation[] = [];
  
  // ChatGPT relies on Bing + authoritative media + partnerships
  recs.push({
    tier: 'high',
    section: 'suggestion',
    category: 'third-party-lists',
    title: 'ChatGPT: Big Media PR Strategy',
    description: `ChatGPT heavily biases towards authoritative media and content partners (Axel Springer, news outlets).`,
    action: `Target PR in major publications: TechCrunch, Business Insider, Wirecutter, Forbes. ChatGPT trusts established publishers over niche blogs.`,
    impact: 'ChatGPT citations correlate strongly with mainstream media mentions.',
    priority_score: 75,
    engine: 'chatgpt',
  });
  
  recs.push({
    tier: 'high',
    section: 'suggestion',
    category: 'platform-specific',
    title: 'ChatGPT: Optimize Bing Rankings',
    description: `ChatGPT often pulls from top Bing search results for real-time queries.`,
    action: `1. Submit sitemap to Bing Webmaster Tools. 2. Verify in Bing Places (if local). 3. Build .edu/.gov backlinks (Bing weights these). 4. Optimize meta descriptions for CTR.`,
    impact: 'Bing ranking directly influences ChatGPT citations.',
    priority_score: 70,
    engine: 'chatgpt',
  });
  
  recs.push({
    tier: 'medium',
    section: 'suggestion',
    category: 'knowledge-graph',
    title: 'ChatGPT: Wikipedia Presence',
    description: `ChatGPT trusts Wikipedia implicitly for entity definitions.`,
    action: `1. Create Wikidata entry for ${brandName}. 2. Get cited in existing Wikipedia articles. 3. If notable, create Wikipedia page with third-party sources.`,
    impact: 'Wikipedia entries establish entity legitimacy for ChatGPT.',
    priority_score: 65,
    engine: 'chatgpt',
  });
  
  if (!isVisible) {
    recs.push({
      tier: 'foundational',
      section: 'suggestion',
      category: 'crawler-access',
      title: 'ChatGPT: Allow GPTBot Crawler',
      description: `Ensure robots.txt allows GPTBot and OAI-SearchBot access.`,
      action: `Check ${brandDomain}/robots.txt for "User-agent: GPTBot" blocks. Remove any Disallow rules.`,
      impact: 'ChatGPT cannot recommend brands it cannot crawl.',
      priority_score: 85,
      engine: 'chatgpt',
    });
  }
  
  return recs;
}

function generatePerplexitySuggestions(
  brandName: string,
  brandDomain: string,
  isVisible: boolean
): TieredRecommendation[] {
  const recs: TieredRecommendation[] = [];
  
  // Perplexity is a "citation engine" - reads top ~10 results
  recs.push({
    tier: 'high',
    section: 'suggestion',
    category: 'platform-specific',
    title: 'Perplexity: Maximize Information Density',
    description: `Perplexity obsesses over factual, dense content. It hates marketing fluff.`,
    action: `1. Remove vague marketing language from key pages. 2. Add specific numbers, stats, dates. 3. Make technical docs public (not behind login). 4. Add "Last Updated" dates.`,
    impact: 'Perplexity cites dense, factual content. Fluffy content gets skipped.',
    priority_score: 80,
    engine: 'perplexity',
  });
  
  recs.push({
    tier: 'high',
    section: 'suggestion',
    category: 'third-party-lists',
    title: 'Perplexity: Target Niche Authority Sites',
    description: `Perplexity values niche expertise over general popularity.`,
    action: `Get featured on vertical-specific blogs and directories in your industry. Niche authority beats Forbes for Perplexity.`,
    impact: 'Being #1 on a niche blog beats a mention on Forbes for Perplexity.',
    priority_score: 75,
    engine: 'perplexity',
  });
  
  if (!isVisible) {
    recs.push({
      tier: 'foundational',
      section: 'suggestion',
      category: 'platform-specific',
      title: 'Perplexity: Reach Top 5 Search Rankings',
      description: `Perplexity ONLY cites from approximately top 5 search results.`,
      action: `Analyze why competitors rank above ${brandDomain}. Create deeper content, build relevant backlinks, target specific queries.`,
      impact: 'If not in top 5 organic results, Perplexity will not cite you.',
      priority_score: 90,
      engine: 'perplexity',
    });
  }
  
  recs.push({
    tier: 'medium',
    section: 'suggestion',
    category: 'direct-answer',
    title: 'Perplexity: Structure for Extraction',
    description: `Perplexity extracts answers from structured content.`,
    action: `Add TL;DR summaries at top of pages. Use bullet points. Include comparison tables. Answer the query in paragraph 1.`,
    impact: 'Structured content is easier for Perplexity to extract and cite.',
    priority_score: 65,
    engine: 'perplexity',
  });
  
  return recs;
}

function generateGeminiSuggestions(
  brandName: string,
  brandDomain: string,
  isVisible: boolean
): TieredRecommendation[] {
  const recs: TieredRecommendation[] = [];
  
  // Gemini is multimodal - YouTube, Maps, Shopping Graph
  recs.push({
    tier: 'high',
    section: 'suggestion',
    category: 'multimedia',
    title: 'Gemini: YouTube Content Strategy',
    description: `Google Gemini heavily integrates YouTube. It summarizes videos for "how to" queries.`,
    action: `Create YouTube videos: "Is ${brandName} worth it?", "How to use ${brandName}", "${brandName} tutorial". Include chapters, good audio, detailed descriptions.`,
    impact: 'Gemini often answers instructional queries from YouTube transcripts.',
    priority_score: 85,
    engine: 'gemini',
  });
  
  recs.push({
    tier: 'high',
    section: 'suggestion',
    category: 'platform-specific',
    title: 'Gemini: Google Business Profile',
    description: `Gemini pulls from Google's ecosystem - Business Profile, Merchant Center, Shopping Graph.`,
    action: `1. Claim/complete Google Business Profile. 2. Update hours, services, photos weekly. 3. Respond to all reviews. 4. Set up Google Merchant Center with accurate pricing.`,
    impact: 'Gemini looks outside your website to Google\'s own data sources.',
    priority_score: 80,
    engine: 'gemini',
  });
  
  recs.push({
    tier: 'foundational',
    section: 'suggestion',
    category: 'schema-markup',
    title: 'Gemini: Comprehensive Schema Markup',
    description: `Gemini strictly follows schema markup for structured data.`,
    action: `Add JSON-LD: Organization (with sameAs), Product (with price, availability, reviews), FAQPage, LocalBusiness. Include Review/Rating aggregates.`,
    impact: 'Gemini uses schema as ground truth. No schema = guessing = errors.',
    priority_score: 90,
    engine: 'gemini',
  });
  
  if (!isVisible) {
    recs.push({
      tier: 'foundational',
      section: 'suggestion',
      category: 'crawler-access',
      title: 'Gemini: Allow Google-Extended',
      description: `Ensure robots.txt allows Google-Extended for Gemini AI features.`,
      action: `Check ${brandDomain}/robots.txt. Remove "User-agent: Google-Extended" blocks if present.`,
      impact: 'Blocking Google-Extended limits Gemini\'s access to your content.',
      priority_score: 85,
      engine: 'gemini',
    });
  }
  
  return recs;
}

function generateGrokSuggestions(
  brandName: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _brandDomain: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _isVisible: boolean
): TieredRecommendation[] {
  const recs: TieredRecommendation[] = [];
  
  // Grok has real-time X (Twitter) access
  recs.push({
    tier: 'high',
    section: 'suggestion',
    category: 'community-consensus',
    title: 'Grok: Active X (Twitter) Presence',
    description: `Grok has real-time access to X. It values authentic discussions over PR.`,
    action: `1. Maintain active, verified X account for ${brandName}. 2. Post updates, engage in conversations. 3. Respond to mentions. 4. Share insights, not just promotions.`,
    impact: 'Grok scans X replies to gauge brand sentiment. Absence = invisibility.',
    priority_score: 90,
    engine: 'grok',
  });
  
  recs.push({
    tier: 'high',
    section: 'suggestion',
    category: 'platform-specific',
    title: 'Grok: KOL (Key Opinion Leader) Strategy',
    description: `Grok weights discussions from influential X accounts heavily.`,
    action: `1. Identify 10-20 industry KOLs on X. 2. Engage authentically with their content. 3. Offer early access for honest reviews. 4. Collaborate on X threads or Spaces.`,
    impact: 'One influential X thread > 100 generic brand mentions for Grok.',
    priority_score: 85,
    engine: 'grok',
  });
  
  recs.push({
    tier: 'medium',
    section: 'suggestion',
    category: 'platform-specific',
    title: 'Grok: Real-Time News on X',
    description: `Grok prioritizes real-time information from X over static websites.`,
    action: `Announce features, updates, news on X FIRST (before blog). Use thread format. Pin important updates. Include specific details.`,
    impact: 'Grok picks up X announcements faster than website changes.',
    priority_score: 70,
    engine: 'grok',
  });
  
  recs.push({
    tier: 'medium',
    section: 'suggestion',
    category: 'community-consensus',
    title: 'Grok: Community Sentiment Building',
    description: `Grok reflects real-time X sentiment about brands.`,
    action: `1. Encourage customers to share experiences on X. 2. Address complaints publicly. 3. Create shareable content. 4. Avoid astroturfing (Grok detects inauthentic patterns).`,
    impact: 'Positive X sentiment = positive Grok representation.',
    priority_score: 65,
    engine: 'grok',
  });
  
  return recs;
}

// ===========================================
// Winning Sources Recommendations
// ===========================================

function generateWinningSourcesRecommendations(
  context: RecommendationContext,
  engine: SupportedEngine
): TieredRecommendation[] {
  const recs: TieredRecommendation[] = [];
  const { brand_name, brand_domain, winning_sources } = context;
  
  if (!winning_sources || winning_sources.length === 0) return recs;
  
  const competitorSources = winning_sources.filter(url => 
    !url.toLowerCase().includes(brand_domain.toLowerCase())
  );
  
  if (competitorSources.length === 0) return recs;
  
  const listSources = competitorSources.filter(url => 
    /best|top|review|compare|alternative|vs|guide|picks|roundup/i.test(url)
  );
  
  if (listSources.length > 0) {
    recs.push({
      tier: 'high',
      section: 'actionable',
      category: 'third-party-lists',
      title: `${getEngineName(engine)}: Missing from Cited Lists`,
      description: `${getEngineName(engine)} cited these "best of" lists where ${brand_name} is absent.`,
      action: `Target inclusion: ${listSources.slice(0, 3).join(', ')}`,
      impact: `These lists directly influence ${getEngineName(engine)} recommendations.`,
      priority_score: 90,
      engine,
      evidence: `${getEngineName(engine)} cited: ${listSources.slice(0, 3).join(', ')}`,
      urls_to_target: listSources.slice(0, 5),
    });
  }
  
  return recs;
}

// ===========================================
// Helpers
// ===========================================

function getEngineName(engine: SupportedEngine): string {
  const names: Record<SupportedEngine, string> = {
    'chatgpt': 'ChatGPT',
    'perplexity': 'Perplexity',
    'gemini': 'Gemini',
    'grok': 'Grok',
  };
  return names[engine] || engine;
}

function deduplicateRecommendations(recs: TieredRecommendation[]): TieredRecommendation[] {
  const seen = new Map<string, TieredRecommendation>();
  
  for (const rec of recs) {
    const key = `${rec.engine}-${rec.category}-${rec.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)}`;
    const existing = seen.get(key);
    
    // Prefer actionable over suggestions, then higher priority score
    if (!existing) {
      seen.set(key, rec);
    } else if (rec.section === 'actionable' && existing.section === 'suggestion') {
      seen.set(key, rec);
    } else if (rec.section === existing.section && rec.priority_score > existing.priority_score) {
      seen.set(key, rec);
    }
  }
  
  return Array.from(seen.values());
}

// ===========================================
// Summary Generator
// ===========================================

export function generateRecommendationSummary(
  recommendations: TieredRecommendation[]
): string {
  if (recommendations.length === 0) {
    return 'Crawl your website first to get specific recommendations.';
  }
  
  const verified = recommendations.filter(r => r.section === 'actionable');
  const foundational = verified.filter(r => r.tier === 'foundational');
  
  if (foundational.length > 0) {
    const top = foundational[0];
    return `CRITICAL (${top.engine}): ${top.title}. ${top.evidence || top.description.slice(0, 80)}...`;
  }
  
  const high = verified.filter(r => r.tier === 'high');
  if (high.length > 0) {
    const top = high[0];
    return `HIGH PRIORITY (${top.engine}): ${top.title}. ${top.evidence || top.description.slice(0, 80)}...`;
  }
  
  if (verified.length > 0) {
    const top = verified[0];
    return `${top.tier.toUpperCase()} (${top.engine}): ${top.title}`;
  }
  
  // Fall back to suggestions
  const top = recommendations[0];
  return `SUGGESTION (${top.engine}): ${top.title}`;
}
