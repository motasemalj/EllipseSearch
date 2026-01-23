/**
 * Selection Signal Analysis
 * 
 * This module analyzes AI responses to understand WHY certain sources were selected
 * and provides actionable recommendations based on the GEO (Generative Engine Optimization) framework.
 * 
 * Priority Framework:
 * - FOUNDATIONAL: Crawler access, Brand Entity Clarity, Schema Markup
 * - HIGH: Third-party authority + "Best of" lists + Community Consensus + Knowledge Graph
 * - MEDIUM: Long-tail Q&A + Direct Answer Formatting + Freshness Signals
 * - NICE-TO-HAVE: Multimedia citations + Proprietary data
 * 
 * Platform-Specific Strategies:
 * - ChatGPT: Big Media PR + Bing SEO + Wikipedia
 * - Perplexity: Information Density + Niche Authority + Top 5 Rankings
 * - Gemini: YouTube + Google Business Profile + Schema
 * - Grok: X Presence + KOL Engagement + Real-Time News
 */

import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai-config";
import type {
  SelectionSignals,
  SearchContext,
  SupportedEngine,
  Sentiment,
  TieredRecommendation,
} from "@/types";
import {
  generateTieredRecommendations,
  generateRecommendationSummary,
  groupRecommendations,
  type RecommendationContext,
} from "@/lib/ai/recommendation-engine";
export { groupRecommendations };
import type { CrawlAnalysis } from "@/lib/ai/crawl-analyzer";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AnalyzeSelectionInput {
  answer_html: string;
  answer_text?: string;
  search_context: SearchContext | null;
  brand_domain: string;
  brand_aliases: string[];
  engine: SupportedEngine;
  keyword: string;
}

// ===========================================
// GEO Framework Context
// ===========================================

const GEO_FRAMEWORK = `
## GEO (Generative Engine Optimization) Priority Framework

When generating recommendations, follow this priority hierarchy:

### 🔴 HIGH PRIORITY (Almost Always Critical)
1. **Third-Party Authoritative Coverage**
   - Get featured in credible industry lists, comparisons, and roundups
   - Earn mentions on authoritative publications and directories
   - Build citations on "top X" and "best of" style pages
   
2. **Comparison & Alternative Pages**
   - Be included in "vs" comparison content
   - Appear in buyer's guides and comparison tables
   - Get featured in "alternatives to" style content

3. **Entity/Facts Pages (On-Site)**
   - Create comprehensive "About" pages with verifiable facts
   - Build project/product index pages with structured data
   - Develop proof-heavy landing pages (stats, awards, timeline)

### 🟡 MEDIUM PRIORITY (Almost Always Important)
4. **Brand Consistency Across Web**
   - Ensure same brand name/spelling everywhere
   - Consistent descriptors and key facts across all profiles
   - Unified NAP (Name, Address, Phone) information

5. **Q&A Content**
   - FAQ pages targeting common questions
   - Answer-focused content that directly addresses queries
   - Forum/community presence with helpful answers

6. **Proof-Heavy Case Studies**
   - Detailed success stories with metrics
   - Client testimonials with specifics
   - Portfolio pages with concrete outcomes

### 🔵 FOUNDATIONAL (Table Stakes)
7. **Technical SEO**
   - Ensure AI crawlers can access content (robots.txt, WAF rules)
   - Allow OAI-SearchBot, Google-Extended, etc.
   - Fast-loading, mobile-friendly pages

8. **Schema Markup**
   - Organization, LocalBusiness, FAQPage schema
   - Product/Service schema where relevant
   - sameAs links to official profiles

### ⚪ NICE-TO-HAVE
9. **Monitoring & Measurement**
   - Track AI referral traffic (utm_source=chatgpt.com)
   - Regular prompt testing
   - Citation tracking across engines

## Contextual Adjustments

Apply these modifiers based on query/brand context:

**If engine uses live web search (Perplexity, ChatGPT Search):**
- ↑ Elevate technical SEO + indexation importance
- Fresh content can rank faster
- Schema becomes more critical

**If query has local intent ("near me", specific city/area):**
- ↑ Add local listings layer (Google Business Profile, Apple/Bing Maps)
- NAP consistency becomes critical
- Reviews and local citations matter more

**If query is YMYL (medical, legal, finance):**
- ↑ Credentialing + authorship become HIGH priority
- Expert attribution, licenses, editorial policies
- Authoritative source citations essential

**If brand is new/niche:**
- Entity pages alone won't work
- ↑ Stronger push on third-party mentions to "teach" AI you exist
- Need more external validation before on-site optimization pays off
`;

/**
 * Analyze the AI's response to determine selection signals
 */
export async function analyzeSelectionSignals(
  input: AnalyzeSelectionInput
): Promise<SelectionSignals> {
  const {
    answer_html,
    search_context,
    brand_domain,
    brand_aliases,
    engine,
    keyword,
  } = input;

  // Build context about the search results
  const searchResultsSummary = search_context?.results
    .map((r, i) => `[${i + 1}] ${r.title} (${r.url})\nSnippet: ${r.snippet}`)
    .join("\n\n") || "No search context available";

  // Check if brand domain is in search results
  const brandInResults = search_context?.results?.some(
    (r) =>
      r.url.includes(brand_domain) ||
      brand_aliases.some((alias) => r.url.toLowerCase().includes(alias.toLowerCase()))
  ) || false;

  // Identify winning sources from search results
  const winningSourcesContext = search_context?.results
    .slice(0, 5)
    .map((r) => `- ${r.url}: "${r.snippet?.substring(0, 300)}..."`)
    .join("\n") || "None identified";

  // Determine if this is a search-heavy engine
  const isSearchEngine = engine === "perplexity" || engine === "chatgpt";
  
  // Detect query characteristics
  const isLocalQuery = /near me|in dubai|in \w+ city|neighborhood|area|location/i.test(keyword);
  const isComparisonQuery = /best|top|vs|compare|alternative|review/i.test(keyword);
  const isYMYLQuery = /doctor|lawyer|legal|medical|health|finance|investment|insurance/i.test(keyword);

  const systemPrompt = `You are an expert AEO (Answer Engine Optimization) / GEO (Generative Engine Optimization) consultant.

Your task is to analyze an AI response and provide HIGHLY SPECIFIC, ACTIONABLE recommendations following the GEO priority framework.

${GEO_FRAMEWORK}

## Analysis Context for This Query

- **Engine:** ${engine} ${isSearchEngine ? "(uses live web search - technical SEO matters more)" : "(model-based)"}
- **Query Type:** ${isComparisonQuery ? "Comparison/Best-of query" : "Informational query"}${isLocalQuery ? " + Local intent" : ""}${isYMYLQuery ? " + YMYL topic" : ""}
- **Brand in search results:** ${brandInResults ? "Yes" : "No - brand may need more third-party visibility"}

## Your Response Requirements

1. **Categorize each action item** by priority level (high/medium/foundational/nice-to-have)
2. **Be extremely specific** - don't say "improve content", say exactly WHAT content to create and WHERE
3. **Reference the winning sources** and explain what they did that the brand didn't
4. **Consider query intent** when prioritizing recommendations
5. **Include specific steps** for each action item

Return your analysis as valid JSON only.`;

  // Handle empty or very short responses
  const cleanedHtml = answer_html?.trim() || "";
  const cleanedText = input.answer_text?.trim() || "";
  
  // ENHANCED: Better text extraction - try multiple strategies
  let textFromHtml = "";
  if (cleanedHtml) {
    textFromHtml = stripHtmlToText(cleanedHtml);
    // Also try extracting from HTML if stripHtmlToText returned little
    if (textFromHtml.length < 30 && cleanedHtml.length > 100) {
      // Try another extraction - the HTML might contain the content in a different structure
      textFromHtml = cleanedHtml
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  
  // Use the best available text source
  let responseForAnalysis = "";
  if (textFromHtml.length >= cleanedText.length && textFromHtml.length > 20) {
    responseForAnalysis = textFromHtml;
  } else if (cleanedText.length > 20) {
    responseForAnalysis = cleanedText;
  } else {
    // Last resort - combine both
    responseForAnalysis = (textFromHtml + " " + cleanedText).trim();
  }
  
  // ENHANCED: More lenient minimum - ChatGPT can have short valid responses
  const minValidLength = 30; // Reduced from 50
  const hasValidResponse = responseForAnalysis.length > minValidLength;
  
  if (!hasValidResponse) {
    console.warn(`[SelectionSignals] Empty or very short AI response (${responseForAnalysis.length} chars), checking for partial data`);
    
    // ENHANCED: Still do a quick visibility check even for short responses
    // Sometimes the response is short but still mentions the brand
    const quickVisCheck = quickVisibilityCheck(
      responseForAnalysis || cleanedHtml || cleanedText,
      brand_domain,
      brand_aliases
    );
    
    // Check sources for brand visibility
    const brandInSources = search_context?.results?.some(
      (r) =>
        r.url.includes(brand_domain) ||
        brand_aliases.some((alias) => r.url.toLowerCase().includes(alias.toLowerCase()))
    ) || false;
    
    console.warn(`[SelectionSignals] Quick visibility: ${quickVisCheck}, Brand in sources: ${brandInSources}`);
    
    // Return a fallback analysis that reflects what we could determine
    return {
      is_visible: quickVisCheck || brandInSources,
      sentiment: (quickVisCheck || brandInSources) ? "neutral" : "negative" as const,
      winning_sources: search_context?.results?.slice(0, 5).map(r => r.url) || [],
      gap_analysis: {
        structure_score: 3,
        data_density_score: 3,
        directness_score: 3,
        authority_score: 3,
        crawlability_score: 3,
      },
      action_items: [],
      competitor_insights: `Unable to fully analyze - AI response was short (${responseForAnalysis.length} chars). ${quickVisCheck ? "Brand was mentioned but context unclear." : "Brand does not appear to be mentioned."}`,
      quick_wins: [],
      recommendation: responseForAnalysis.length < 10 
        ? "The AI response could not be captured properly. This may be a browser automation issue - please try running the analysis again."
        : "The AI response was too short for full analysis. The brand may need more online presence to be included in AI responses.",
      // Flag to indicate this was a partial analysis
      analysis_partial: true,
      response_length: responseForAnalysis.length,
    } as SelectionSignals;
  }

  // Sanitize and prepare the response for analysis
  // Remove potentially problematic characters that might cause OpenAI issues
  const sanitizedResponse = responseForAnalysis
    // Remove null bytes and control characters (except newlines and tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove excessive consecutive newlines
    .replace(/\n{4,}/g, '\n\n\n')
    // Remove excessive spaces
    .replace(/  +/g, ' ')
    .trim();
  
  const MAX_RESPONSE_CHARS = 12000;
  const clippedResponse = sanitizedResponse.length > MAX_RESPONSE_CHARS
    ? `${sanitizedResponse.slice(0, MAX_RESPONSE_CHARS)}\n\n[Truncated for length]`
    : sanitizedResponse;
  
  // Debug: Log sanitization results
  if (sanitizedResponse.length !== responseForAnalysis.length) {
    console.log(`[SelectionSignals] Sanitized content: ${responseForAnalysis.length} -> ${sanitizedResponse.length} chars`);
  }

  const userPrompt = `Analyze this AI response and provide detailed GEO recommendations.

**Query:** "${keyword}"
**AI Engine:** ${engine}
**Target Brand Domain:** ${brand_domain}
**Brand Aliases:** ${brand_aliases.join(", ") || "None specified"}
**Brand Found in Search Results:** ${brandInResults ? "Yes" : "No"}
**Brand Cited in AI Response:** ${responseForAnalysis.toLowerCase().includes(brand_domain.toLowerCase()) ? "Yes" : "No"}

## AI Response Given to User:
${clippedResponse}

## Search Results That Were Available:
${searchResultsSummary}

## Top Sources That Influenced the Response:
${winningSourcesContext}

---

Return a JSON object with this EXACT structure:
{
  "is_visible": boolean,
  "sentiment": "positive" | "neutral" | "negative",
  "winning_sources": ["url1", "url2"],
  "gap_analysis": {
    "structure_score": 1-5,
    "data_density_score": 1-5,
    "directness_score": 1-5,
    "authority_score": 1-5,
    "crawlability_score": 1-5
  },
  "action_items": [
    {
      "priority": "high" | "medium" | "foundational" | "nice-to-have",
      "category": "third-party" | "entity-pages" | "brand-consistency" | "qa-content" | "proof-content" | "technical" | "schema" | "measurement" | "local",
      "title": "Short action title (max 10 words)",
      "description": "Detailed explanation of what to do and why",
      "specific_steps": ["Step 1", "Step 2", "Step 3"]
    }
  ],
  "competitor_insights": "What are the winning sources doing that ${brand_domain} is not? Be specific about their content strategy.",
  "quick_wins": ["3 highest-impact things that can be done THIS WEEK"],
  "recommendation_summary": "2-3 sentence executive summary focusing on the #1 gap"
}

IMPORTANT RULES:
- Provide 5-10 action items across different priority levels and categories
- At least 2 items should be "high" priority (third-party or entity-pages)
- Include at least 1 "foundational" item (technical or schema)
- Be extremely specific - mention actual page types, schema types, specific content to create
- Reference the actual winning sources and explain what they did better
- For comparison queries, emphasize getting included in third-party lists
- If brand is NOT in search results, prioritize third-party visibility over on-site changes`;

  // Retry logic for API resilience
  const maxRetries = 3;
  let lastError: Error | null = null;
  let emptyRetries = 0;

  // Debug: Log input stats
  console.log(`[SelectionSignals] Starting analysis for ${engine}, keyword: "${keyword.slice(0, 50)}..."`);
  console.log(`[SelectionSignals] Input: ${clippedResponse.length} chars (sanitized), search results: ${search_context?.results?.length || 0}`);
  
  // Use a known working model, with fallback
  const modelToUse = OPENAI_CHAT_MODEL || "gpt-4o-mini";
  console.log(`[SelectionSignals] Using model: ${modelToUse}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[SelectionSignals] Attempt ${attempt}/${maxRetries} - Calling OpenAI (${modelToUse})...`);
      
      const response = await openai.chat.completions.create({
        model: modelToUse,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 3000,
      });

      // Enhanced debugging - check full response structure
      const choice = response.choices[0];
      const content = choice?.message?.content;
      const finishReason = choice?.finish_reason;
      const refusal = choice?.message?.refusal;
      
      console.log(`[SelectionSignals] Response: finish_reason=${finishReason}, content_length=${content?.length || 0}, refusal=${refusal || 'none'}`);
      
      // Check for refusal (content policy)
      if (refusal) {
        console.warn(`[SelectionSignals] OpenAI refused the request: ${refusal}`);
        lastError = new Error(`OpenAI refused: ${refusal}`);
        break; // Don't retry refusals
      }
      
      // Check for content filter or other stop reasons
      if (finishReason === 'content_filter') {
        console.warn(`[SelectionSignals] Content was filtered by OpenAI`);
        lastError = new Error('Content filtered by OpenAI');
        break; // Don't retry content filter
      }
      
      if (!content || content.trim() === "") {
        emptyRetries++;
        console.warn(`[SelectionSignals] Attempt ${attempt} returned empty content (finish_reason: ${finishReason})`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        // All retries returned empty - don't throw, will return fallback below
        console.warn(`[SelectionSignals] All ${maxRetries} attempts returned empty`);
        break;
      }
      
      console.log(`[SelectionSignals] Got ${content.length} chars of content, parsing JSON...`);

      const parsed = parseJsonFromContent(content) as Record<string, unknown>;
      const gapAnalysis = (parsed.gap_analysis ?? {}) as Record<string, unknown>;

    // Validate and normalize the response
    return {
      is_visible: Boolean(parsed.is_visible),
      sentiment: validateSentiment(parsed.sentiment),
      winning_sources: Array.isArray(parsed.winning_sources)
        ? parsed.winning_sources
        : [],
      gap_analysis: {
        structure_score: clampScore(gapAnalysis.structure_score),
        data_density_score: clampScore(gapAnalysis.data_density_score),
        directness_score: clampScore(gapAnalysis.directness_score),
        authority_score: clampScore(gapAnalysis.authority_score ?? 3),
        crawlability_score: clampScore(gapAnalysis.crawlability_score ?? 3),
      },
      action_items: validateActionItems(parsed.action_items),
      competitor_insights: String(parsed.competitor_insights || ""),
      quick_wins: Array.isArray(parsed.quick_wins) ? parsed.quick_wins : [],
      recommendation: String(parsed.recommendation_summary || parsed.recommendation || "No recommendation available"),
    };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Selection analysis attempt ${attempt} failed:`, lastError.message);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
    }
  }

  // All retries exhausted
  console.error(`[SelectionSignals] All retries exhausted. Last error: ${lastError?.message || 'Unknown'}. Empty retries: ${emptyRetries}`);
  
  // Try to do a basic visibility check even if GPT analysis failed
  const basicVisCheck = quickVisibilityCheck(
    responseForAnalysis,
    brand_domain,
    brand_aliases
  );
  
  console.log(`[SelectionSignals] Fallback visibility check: ${basicVisCheck}`);
  
  // Check if brand appears in search results (using existing variable if available)
  const fallbackBrandInResults = search_context?.results?.some(
    (r) =>
      r.url.includes(brand_domain) ||
      brand_aliases.some((alias) => r.url.toLowerCase().includes(alias.toLowerCase()))
  ) || false;
    
  // Return a fallback analysis with what we can determine
  return {
    is_visible: basicVisCheck || fallbackBrandInResults,
    sentiment: (basicVisCheck || fallbackBrandInResults) ? "neutral" : "negative" as const,
    winning_sources: search_context?.results?.slice(0, 5).map(r => r.url) || [],
    gap_analysis: {
      structure_score: 3,
      data_density_score: 3,
      directness_score: 3,
      authority_score: 3,
      crawlability_score: 3,
    },
    action_items: [],
    competitor_insights: "",
    quick_wins: [],
    recommendation: `GPT analysis failed (${lastError?.message || 'empty response'}). Basic visibility check: ${basicVisCheck ? 'Brand was detected' : 'Brand was not detected'}.`,
    analysis_partial: true,
    response_length: responseForAnalysis.length,
  };
}

/**
 * Quick check if brand is visible in response (without full analysis)
 * This is a more robust check that looks for various forms of the brand name
 */
export function quickVisibilityCheck(
  response: string,
  brandDomain: string,
  brandAliases: string[]
): boolean {
  const responseLower = response.toLowerCase();
  
  // 1. Check exact domain
  if (responseLower.includes(brandDomain.toLowerCase())) {
    return true;
  }

  // 2. Extract brand name from domain (e.g., "damacproperties.com" -> "damac", "damacproperties")
  const domainWithoutTLD = brandDomain.replace(/\.(com|ae|co|net|org|io|sa|qa|bh|kw|om).*$/i, "");
  const domainWithoutWWW = domainWithoutTLD.replace(/^www\./i, "");
  
  // Check domain name without TLD
  if (domainWithoutWWW.length > 2 && responseLower.includes(domainWithoutWWW.toLowerCase())) {
    return true;
  }
  
  // 3. Split domain into parts (e.g., "damacproperties" -> ["damac", "properties"])
  // Common patterns: brandnameXYZ, brand-name, brandName
  const domainParts = domainWithoutWWW
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase
    .replace(/[-_]/g, ' ') // dashes/underscores
    .replace(/properties|realty|real|estate|group|holdings|development|developers/gi, ' ') // common suffixes
    .split(/\s+/)
    .filter(part => part.length > 2);
  
  for (const part of domainParts) {
    if (part.length > 3 && responseLower.includes(part.toLowerCase())) {
      return true;
    }
  }

  // 4. Check aliases
  for (const alias of brandAliases) {
    if (alias.length > 2 && responseLower.includes(alias.toLowerCase())) {
      return true;
    }
  }

  // 5. Check for common brand name patterns
  // Extract potential brand name (first significant word from domain)
  const potentialBrandName = domainWithoutWWW
    .replace(/properties|realty|real|estate|group|holdings|development|developers|uae|dubai|qatar|saudi/gi, '')
    .replace(/[-_]/g, '')
    .trim();
  
  if (potentialBrandName.length > 3 && responseLower.includes(potentialBrandName.toLowerCase())) {
    return true;
  }

  return false;
}

/**
 * More thorough visibility check that also considers context
 */
export function thoroughVisibilityCheck(
  response: string,
  brandDomain: string,
  brandAliases: string[],
  brandName?: string
): { isVisible: boolean; mentions: string[] } {
  const mentions: string[] = [];
  const responseLower = response.toLowerCase();
  
  // Check brand name if provided
  if (brandName && brandName.length > 2) {
    // Check for exact brand name
    if (responseLower.includes(brandName.toLowerCase())) {
      mentions.push(brandName);
    }
    // Check for brand name without common words
    const simplifiedName = brandName.replace(/properties|realty|real estate|group|holdings|development|developers/gi, '').trim();
    if (simplifiedName.length > 2 && responseLower.includes(simplifiedName.toLowerCase())) {
      mentions.push(simplifiedName);
    }
  }
  
  // Check domain
  if (responseLower.includes(brandDomain.toLowerCase())) {
    mentions.push(brandDomain);
  }
  
  // Extract and check domain parts
  const domainWithoutTLD = brandDomain.replace(/\.(com|ae|co|net|org|io|sa|qa|bh|kw|om).*$/i, "").replace(/^www\./i, "");
  if (domainWithoutTLD.length > 3 && responseLower.includes(domainWithoutTLD.toLowerCase())) {
    mentions.push(domainWithoutTLD);
  }
  
  // Check aliases
  for (const alias of brandAliases) {
    if (alias.length > 2 && responseLower.includes(alias.toLowerCase())) {
      mentions.push(alias);
    }
  }
  
  return {
    isVisible: mentions.length > 0,
    mentions: Array.from(new Set(mentions)), // Remove duplicates
  };
}

/**
 * Helper: Validate sentiment value
 */
function validateSentiment(value: unknown): Sentiment {
  if (value === "positive" || value === "neutral" || value === "negative") {
    return value;
  }
  return "neutral";
}

/**
 * Helper: Clamp score to 1-5 range
 */
function clampScore(value: unknown): number {
  const num = Number(value);
  if (isNaN(num)) return 3;
  return Math.max(1, Math.min(5, Math.round(num)));
}

function stripHtmlToText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutStyles.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
}

function parseJsonFromContent(content: string): unknown {
  const trimmed = content.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error("Invalid JSON returned from selection analysis.");
  }
}

/**
 * Helper: Validate action items array
 */
function validateActionItems(items: unknown): SelectionSignals["action_items"] {
  if (!Array.isArray(items)) return [];
  
  return items.map((item) => ({
    priority: validatePriority(item?.priority),
    category: validateCategory(item?.category),
    title: String(item?.title || "Action item"),
    description: String(item?.description || ""),
    steps: Array.isArray(item?.steps) 
      ? item.steps.map(String) 
      : Array.isArray(item?.specific_steps)
        ? item.specific_steps.map(String)
        : [],
  })).slice(0, 12); // Max 12 items
}

function validatePriority(value: unknown): "high" | "medium" | "foundational" | "nice-to-have" {
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  if (value === "foundational") return "foundational";
  if (value === "nice-to-have" || value === "low") return "nice-to-have";
  return "medium";
}

function validateCategory(value: unknown): "technical" | "content" | "third-party" | "entity" | "measurement" | "local" | "ymyl" {
  const validCategories = ["technical", "content", "third-party", "entity", "measurement", "local", "ymyl"];
  if (typeof value === "string" && validCategories.includes(value)) {
    return value as "technical" | "content" | "third-party" | "entity" | "measurement" | "local" | "ymyl";
  }
  
  const categoryMap: Record<string, "technical" | "content" | "third-party" | "entity" | "measurement" | "local" | "ymyl"> = {
    "third-party": "third-party",
    "entity-pages": "entity",
    "brand-consistency": "entity",
    "qa-content": "content",
    "proof-content": "content",
    "schema": "technical",
  };
  
  if (typeof value === "string" && categoryMap[value]) {
    return categoryMap[value];
  }
  return "content";
}

/**
 * Calculate overall selection score from gap analysis (legacy method)
 */
export function calculateOverallScore(gapAnalysis: {
  structure_score: number;
  data_density_score: number;
  directness_score: number;
  authority_score?: number;
  crawlability_score?: number;
}): number {
  const scores = [
    gapAnalysis.structure_score,
    gapAnalysis.data_density_score,
    gapAnalysis.directness_score,
    gapAnalysis.authority_score || 3,
    gapAnalysis.crawlability_score || 3,
  ];
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 20);
}

/**
 * Calculate overall score considering both gap analysis and AEO score
 * Prioritizes AEO score when available as it's more comprehensive
 */
export function calculateCombinedScore(signals: SelectionSignals): number {
  // If AEO score is available, use it as the primary score
  if (signals.aeo_score) {
    return signals.aeo_score.normalized_score;
  }
  
  // Fall back to legacy gap analysis scoring
  return calculateOverallScore(signals.gap_analysis);
}

// ===========================================
// Enhanced Tiered Recommendation Integration
// ===========================================

export interface EnhanceRecommendationsInput {
  // Selection signals from initial analysis
  selectionSignals: SelectionSignals;
  
  // Brand context
  brandName: string;
  brandDomain: string;
  
  // Query context
  query: string;
  engine: SupportedEngine;
  
  // CRAWL ANALYSIS - Source of verified recommendations
  crawlAnalysis?: CrawlAnalysis;
}

/**
 * Enhance selection signals with tiered, platform-specific recommendations
 * This replaces generic recommendations with highly contextual action items
 */
export function enhanceWithTieredRecommendations(
  input: EnhanceRecommendationsInput
): SelectionSignals {
  const {
    selectionSignals,
    brandName,
    brandDomain,
    query,
    engine,
    crawlAnalysis,
  } = input;

  // Build recommendation context
  const recommendationContext: RecommendationContext = {
    brand_name: brandName,
    brand_domain: brandDomain,
    query,
    engine,
    is_visible: selectionSignals.is_visible,
    winning_sources: selectionSignals.winning_sources,
    crawl_analysis: crawlAnalysis,
  };

  // Generate tiered recommendations
  const tieredRecommendations = generateTieredRecommendations(recommendationContext);
  
  // Generate executive summary
  const recommendationSummary = generateRecommendationSummary(tieredRecommendations);

  // Convert tiered recommendations to legacy action_items format for backwards compatibility
  const legacyActionItems = tieredRecommendations.slice(0, 10).map(rec => ({
    priority: rec.tier as 'high' | 'medium' | 'foundational' | 'nice-to-have',
    category: mapCategoryToLegacy(rec.category),
    // Use plain title - UI components will add icons via Lucide to avoid hydration issues
    title: rec.title,
    description: rec.description,
    steps: [rec.action, rec.impact, rec.evidence].filter(Boolean) as string[],
    // Add section info for UI to style differently
    isActionable: rec.section === 'actionable',
  }));

  // Return enhanced selection signals
  return {
    ...selectionSignals,
    recommendation: recommendationSummary,
    action_items: legacyActionItems,
    tiered_recommendations: tieredRecommendations,
  };
}

/**
 * Map new recommendation categories to legacy action item categories
 */
function mapCategoryToLegacy(
  category: TieredRecommendation['category']
): 'technical' | 'content' | 'third-party' | 'entity' | 'measurement' | 'local' | 'ymyl' {
  const mapping: Record<string, 'technical' | 'content' | 'third-party' | 'entity' | 'measurement' | 'local' | 'ymyl'> = {
    'crawler-access': 'technical',
    'brand-entity': 'entity',
    'schema-markup': 'technical',
    'third-party-lists': 'third-party',
    'community-consensus': 'third-party',
    'knowledge-graph': 'entity',
    'long-tail-qa': 'content',
    'direct-answer': 'content',
    'freshness': 'content',
    'multimedia': 'content',
    'proprietary-data': 'content',
    'platform-specific': 'content',
  };
  
  return mapping[category] || 'content';
}

/**
 * Quick wins extractor - gets top 3 highest-impact immediate actions
 */
export function extractQuickWins(recommendations: TieredRecommendation[]): string[] {
  // Prioritize foundational and high-priority items that are actionable this week
  const quickWinCandidates = recommendations
    .filter(r => r.tier === 'foundational' || r.tier === 'high')
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 3);
  
  return quickWinCandidates.map(r => r.action.slice(0, 150));
}
