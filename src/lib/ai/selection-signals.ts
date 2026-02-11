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
import { UNTRUSTED_CONTENT_POLICY, JSON_ONLY_POLICY } from "@/lib/ai/prompt-policies";
import { callOpenAIResponses } from "@/lib/ai/llm-runtime";
import { LLM_TIMEOUTS_MS } from "@/lib/ai/openai-timeouts";
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

CRITICAL OUTPUT RULES (MUST FOLLOW):
- Output MUST be strict RFC 8259 JSON (no trailing commas, no comments).
- Output ONLY JSON (no markdown fences, no prose).
- Use double quotes for all strings.
- Keep the output concise (this powers a fast dashboard).
- Keep every string short; do NOT write long paragraphs.`;
 
  const hardenedSystemPrompt = `${UNTRUSTED_CONTENT_POLICY}\n\n${systemPrompt}\n\n${JSON_ONLY_POLICY}`;

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

Return a JSON object with this EXACT structure (example below is VALID JSON):
{
  "is_visible": false,
  "sentiment": "neutral",
  "winning_sources": ["https://example.com/source-1", "https://example.com/source-2"],
  "gap_analysis": {
    "structure_score": 3,
    "data_density_score": 3,
    "directness_score": 3,
    "authority_score": 3,
    "crawlability_score": 3
  },
  "action_items": [
    {
      "priority": "high",
      "category": "third-party",
      "title": "Get listed in comparison pages",
      "description": "Create a partner page and pitch top-ranking comparison sites that the AI uses as sources.",
      "steps": ["Identify 5 ranking sources", "Create a partner page", "Pitch editors with proof and pricing"]
    }
  ],
  "competitor_insights": "Short, specific insight referencing the winning sources.",
  "quick_wins": ["One quick win", "Second quick win", "Third quick win"],
  "recommendation_summary": "2-3 sentence executive summary."
}

IMPORTANT RULES:
- Provide 3-6 action items (max 6) across different priority levels and categories
- At least 1 item should be "high" priority (third-party or entity-pages) when brand is not visible
- Include at least 1 "foundational" item (technical or schema) when applicable
- Be extremely specific - mention actual page types, schema types, specific content to create
- Reference the actual winning sources and explain what they did better
- For comparison queries, emphasize getting included in third-party lists
- If brand is NOT in search results, prioritize third-party visibility over on-site changes`;

  // Retry logic for API resilience
  const maxRetries = 2;
  let lastError: Error | null = null;
  let emptyRetries = 0;

  // Debug: Log input stats
  console.log(`[SelectionSignals] Starting analysis for ${engine}, keyword: "${keyword.slice(0, 50)}..."`);
  console.log(`[SelectionSignals] Input: ${clippedResponse.length} chars (sanitized), search results: ${search_context?.results?.length || 0}`);
  
  // Use a known working model, with fallback
  const modelToUse = OPENAI_CHAT_MODEL || "gpt-5-nano";
  console.log(`[SelectionSignals] Using model: ${modelToUse}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[SelectionSignals] Attempt ${attempt}/${maxRetries} - Calling OpenAI (${modelToUse})...`);
      
      // Use Responses API + json_schema to guarantee parseable JSON.
      const { response, usage } = await callOpenAIResponses({
        client: openai,
        provider: "openai",
        model: modelToUse,
        timeoutMs: LLM_TIMEOUTS_MS.selectionSignals,
        request: {
        model: modelToUse,
        input: [
          { role: "system", content: hardenedSystemPrompt },
          { role: "user", content: userPrompt },
        ],
        reasoning: { effort: "low" },
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "selection_signals",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "is_visible",
                "sentiment",
                "winning_sources",
                "gap_analysis",
                "action_items",
                "competitor_insights",
                "quick_wins",
                "recommendation_summary",
              ],
              properties: {
                is_visible: { type: "boolean" },
                sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                winning_sources: { type: "array", maxItems: 5, items: { type: "string", maxLength: 220 } },
                gap_analysis: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "structure_score",
                    "data_density_score",
                    "directness_score",
                    "authority_score",
                    "crawlability_score",
                  ],
                  properties: {
                    structure_score: { type: "integer", minimum: 1, maximum: 5 },
                    data_density_score: { type: "integer", minimum: 1, maximum: 5 },
                    directness_score: { type: "integer", minimum: 1, maximum: 5 },
                    authority_score: { type: "integer", minimum: 1, maximum: 5 },
                    crawlability_score: { type: "integer", minimum: 1, maximum: 5 },
                  },
                },
                action_items: {
                  type: "array",
                  maxItems: 4,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["priority", "category", "title", "description", "steps"],
                    properties: {
                      priority: { type: "string", enum: ["high", "medium", "foundational", "nice-to-have"] },
                      category: { type: "string", enum: ["technical", "content", "third-party", "entity", "measurement", "local", "ymyl"] },
                      title: { type: "string", maxLength: 80 },
                      description: { type: "string", maxLength: 320 },
                      steps: { type: "array", maxItems: 4, items: { type: "string", maxLength: 140 } },
                    },
                  },
                },
                competitor_insights: { type: "string", maxLength: 600 },
                quick_wins: { type: "array", items: { type: "string", maxLength: 140 }, maxItems: 3 },
                recommendation_summary: { type: "string", maxLength: 320 },
              },
            },
          },
        },
        // IMPORTANT: must be high enough to allow the model to close the JSON object.
        max_output_tokens: 1500,
        } as unknown as Parameters<typeof openai.responses.create>[0],
      });

      const responseObj = response as unknown as { output_text?: unknown };
      const content = typeof responseObj.output_text === "string" ? responseObj.output_text : "";

      console.log(`[SelectionSignals] Response: content_length=${content.length}`);
      
      if (!content || content.trim() === "") {
        emptyRetries++;
        console.warn(`[SelectionSignals] Attempt ${attempt} returned empty content`);
        
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
      llm_usage: usage,
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
 * Generic words that should NOT count as brand mentions when appearing alone
 * These are common words that might be part of a brand name but aren't distinctive
 */
const GENERIC_WORDS = new Set([
  // Common business words
  'tactics', 'strategy', 'solutions', 'services', 'consulting', 'digital', 
  'marketing', 'agency', 'group', 'partners', 'global', 'international',
  'creative', 'design', 'studio', 'labs', 'tech', 'media', 'hub', 'pro',
  'first', 'best', 'top', 'prime', 'elite', 'premium', 'plus', 'max',
  // Common industry terms
  'properties', 'realty', 'real', 'estate', 'homes', 'living', 'capital',
  'ventures', 'investments', 'financial', 'finance', 'wealth', 'advisory',
  // Common descriptors
  'smart', 'fast', 'quick', 'easy', 'simple', 'better', 'next', 'new',
  'online', 'cloud', 'data', 'web', 'app', 'mobile', 'soft', 'software',
]);

/**
 * Check if a brand name is too generic to reliably detect
 * Returns true if the brand name consists mostly of generic words
 */
function isGenericBrandName(brandName: string): boolean {
  const words = brandName.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 2);
  if (words.length === 0) return true;
  
  const genericCount = words.filter(w => GENERIC_WORDS.has(w)).length;
  // If more than 50% of words are generic, the brand name is too generic
  return genericCount / words.length > 0.5;
}

/**
 * Get the distinctive part of a brand name (non-generic words)
 */
function getDistinctivePart(brandName: string): string | null {
  const words = brandName.split(/[\s\-_]+/).filter(w => w.length > 2);
  const distinctive = words.filter(w => !GENERIC_WORDS.has(w.toLowerCase()));
  
  if (distinctive.length === 0) return null;
  return distinctive.join(' ');
}

/**
 * Check if a mention is in context of a proper noun/brand (not generic usage)
 * Uses surrounding words to determine if it's likely a brand reference
 */
function isLikelyBrandContext(text: string, term: string, position: number): boolean {
  const termLower = term.toLowerCase();
  
  // Get surrounding context (50 chars before and after)
  const start = Math.max(0, position - 50);
  const end = Math.min(text.length, position + term.length + 50);
  const context = text.slice(start, end).toLowerCase();
  
  // Indicators that it's a brand mention (not generic)
  const brandIndicators = [
    // Company/organization references
    /\b(by|from|at|with|visit|contact|according to|says|announced|partnered|founded)\s+/i,
    // Possessive forms
    new RegExp(`${escapeRegex(termLower)}'s`, 'i'),
    // URL/link context
    /https?:\/\/|\.com|\.ae|\.io/i,
    // Quotation marks around it
    new RegExp(`["']${escapeRegex(termLower)}["']`, 'i'),
  ];
  
  // Check if any brand indicators are present in the context
  for (const indicator of brandIndicators) {
    if (indicator.test(context)) {
      return true;
    }
  }
  
  // Check if it's at the start of a sentence (often indicates proper noun)
  const beforeTerm = text.slice(start, position);
  if (/[.!?]\s*$/.test(beforeTerm) || position === 0) {
    return true;
  }
  
  // If the term is capitalized in the original text, it's more likely a brand
  const originalTerm = text.slice(position, position + term.length);
  if (originalTerm[0] === originalTerm[0].toUpperCase() && /[a-z]/.test(originalTerm)) {
    return true;
  }
  
  return false;
}

/**
 * Generate brand name variations including with/without spaces
 * Examples: "city solar" -> ["city solar", "citysolar", "city-solar"]
 *           "citysolar" -> ["citysolar", "city solar"] (if looks like compound word)
 */
function generateBrandVariations(brandName: string): string[] {
  const variations = new Set<string>([brandName.toLowerCase()]);
  const nameLower = brandName.toLowerCase().trim();
  
  // 1. If brand has spaces, create no-space and hyphenated versions
  if (nameLower.includes(' ')) {
    variations.add(nameLower.replace(/\s+/g, '')); // "city solar" -> "citysolar"
    variations.add(nameLower.replace(/\s+/g, '-')); // "city solar" -> "city-solar"
    variations.add(nameLower.replace(/\s+/g, '_')); // "city solar" -> "city_solar"
  }
  
  // 2. If brand has NO spaces but looks like compound word (camelCase or all lowercase with common patterns)
  // Try to split it into words
  if (!nameLower.includes(' ') && nameLower.length > 4) {
    // Try camelCase splitting: "CitySolar" -> "city solar"
    const camelSplit = brandName.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    if (camelSplit !== nameLower) {
      variations.add(camelSplit);
    }
    
    // Try common word boundary patterns for compound words
    // Common prefixes/suffixes that might indicate word boundaries
    const commonWords = ['solar', 'tech', 'soft', 'digital', 'media', 'web', 'app', 'smart', 'pro', 'hub', 
                         'city', 'home', 'life', 'care', 'health', 'finance', 'pay', 'shop', 'buy', 'sell',
                         'global', 'world', 'net', 'link', 'connect', 'cloud', 'data', 'info', 'systems'];
    
    for (const word of commonWords) {
      // Check if brand starts with common word
      if (nameLower.startsWith(word) && nameLower.length > word.length + 2) {
        const remainder = nameLower.slice(word.length);
        variations.add(`${word} ${remainder}`);
        variations.add(`${word}-${remainder}`);
      }
      // Check if brand ends with common word
      if (nameLower.endsWith(word) && nameLower.length > word.length + 2) {
        const prefix = nameLower.slice(0, -word.length);
        variations.add(`${prefix} ${word}`);
        variations.add(`${prefix}-${word}`);
      }
    }
  }
  
  // 3. If brand has hyphens, create space and no-space versions
  if (nameLower.includes('-')) {
    variations.add(nameLower.replace(/-/g, ' ')); // "city-solar" -> "city solar"
    variations.add(nameLower.replace(/-/g, '')); // "city-solar" -> "citysolar"
  }
  
  // 4. If brand has underscores, create space and no-space versions
  if (nameLower.includes('_')) {
    variations.add(nameLower.replace(/_/g, ' ')); // "city_solar" -> "city solar"
    variations.add(nameLower.replace(/_/g, '')); // "city_solar" -> "citysolar"
  }
  
  return Array.from(variations).filter(v => v.length >= 3);
}

/**
 * More thorough visibility check that also considers context
 * ENHANCED: Now smarter about generic brand names to avoid false positives
 * ENHANCED: Now checks brand name variations with/without spaces
 */
export function thoroughVisibilityCheck(
  response: string,
  brandDomain: string,
  brandAliases: string[],
  brandName?: string
): { isVisible: boolean; mentions: string[] } {
  const mentions: string[] = [];
  
  // Strip HTML tags for cleaner matching
  const textContent = stripHtmlToText(response);
  const responseLower = textContent.toLowerCase();
  
  // Also check the raw response in case HTML-encoded brand names
  const rawResponseLower = response.toLowerCase();
  
  // Helper to check for brand mention with word boundary awareness
  const checkMention = (text: string, term: string): boolean => {
    if (term.length < 2) return false;
    const termLower = term.toLowerCase();
    
    // Direct include check
    if (text.includes(termLower)) return true;
    
    // Check with word boundaries (handles "Brand" vs "rebrand")
    const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(termLower)}\\b`, 'i');
    if (wordBoundaryRegex.test(text)) return true;
    
    return false;
  };

  // Helper to check mention with context awareness for generic terms
  const checkMentionWithContext = (text: string, originalText: string, term: string, requireContext: boolean): boolean => {
    if (term.length < 2) return false;
    const termLower = term.toLowerCase();
    
    // Check with word boundaries
    const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(termLower)}\\b`, 'gi');
    let match;
    
    while ((match = wordBoundaryRegex.exec(text)) !== null) {
      if (!requireContext) {
        return true;
      }
      // For generic terms, require brand context
      if (isLikelyBrandContext(originalText, term, match.index)) {
        return true;
      }
    }
    
    return false;
  };
  
  // Check brand name if provided
  if (brandName && brandName.length > 2) {
    const isGeneric = isGenericBrandName(brandName);
    
    // ENHANCED: Generate all variations of the brand name (with/without spaces, hyphens, etc.)
    const brandVariations = generateBrandVariations(brandName);
    
    // For generic brand names, require full name match OR context-aware partial match
    if (isGeneric) {
      // First try exact full brand name match and all variations
      let foundMatch = false;
      for (const variation of brandVariations) {
        if (checkMention(responseLower, variation) || checkMention(rawResponseLower, variation)) {
          mentions.push(variation);
          foundMatch = true;
          break; // Found at least one match
        }
      }
      
      if (!foundMatch) {
        // For generic brands, check if the distinctive part appears with brand context
        const distinctivePart = getDistinctivePart(brandName);
        if (distinctivePart && distinctivePart.length > 3) {
          if (checkMentionWithContext(responseLower, textContent, distinctivePart, true) ||
              checkMentionWithContext(rawResponseLower, response, distinctivePart, true)) {
            mentions.push(distinctivePart);
          }
        }
      }
    } else {
      // Non-generic brand names: check all variations
      for (const variation of brandVariations) {
        if (checkMention(responseLower, variation) || checkMention(rawResponseLower, variation)) {
          if (!mentions.includes(variation)) {
            mentions.push(variation);
            break; // Found a match, no need to continue
          }
        }
      }
      
      // Check for brand name without common words (for real estate, etc.)
      const simplifiedName = brandName.replace(/properties|realty|real estate|group|holdings|development|developers|company|inc\.?|llc|ltd\.?/gi, '').trim();
      if (simplifiedName.length > 2 && !mentions.some(m => m.toLowerCase() === simplifiedName.toLowerCase())) {
        // Also check variations of the simplified name
        const simplifiedVariations = generateBrandVariations(simplifiedName);
        for (const variation of simplifiedVariations) {
          if (checkMention(responseLower, variation) || checkMention(rawResponseLower, variation)) {
            if (!mentions.includes(variation)) {
              mentions.push(variation);
              break;
            }
          }
        }
      }
    }
  }
  
  // Check domain - domain matches are always reliable
  if (checkMention(responseLower, brandDomain) || checkMention(rawResponseLower, brandDomain)) {
    if (!mentions.includes(brandDomain)) mentions.push(brandDomain);
  }
  
  // Extract and check domain parts (without TLD) - more reliable than generic brand names
  const domainWithoutTLD = brandDomain.replace(/\.(com|ae|co|net|org|io|sa|qa|bh|kw|om|uk|us|ca|au).*$/i, "").replace(/^www\./i, "");
  if (domainWithoutTLD.length > 3) {
    // Only match domain part if it's not a generic word
    if (!GENERIC_WORDS.has(domainWithoutTLD.toLowerCase())) {
      if (checkMention(responseLower, domainWithoutTLD) || checkMention(rawResponseLower, domainWithoutTLD)) {
        if (!mentions.includes(domainWithoutTLD)) mentions.push(domainWithoutTLD);
      }
    }
  }
  
  // Check aliases - these are user-defined so we trust them more
  // ENHANCED: Also check variations of aliases (with/without spaces)
  for (const alias of brandAliases) {
    if (alias.length > 2) {
      // Skip single generic words as aliases
      if (alias.split(/\s+/).length === 1 && GENERIC_WORDS.has(alias.toLowerCase())) {
        continue;
      }
      
      // Generate variations for this alias
      const aliasVariations = generateBrandVariations(alias);
      
      for (const variation of aliasVariations) {
        if (checkMention(responseLower, variation) || checkMention(rawResponseLower, variation)) {
          if (!mentions.includes(variation) && !mentions.includes(alias)) {
            mentions.push(alias); // Store original alias, not variation
            break;
          }
        }
      }
    }
  }
  
  return {
    isVisible: mentions.length > 0,
    mentions: Array.from(new Set(mentions)), // Remove duplicates
  };
}

/**
 * Escape special regex characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  const candidates: string[] = [unfenced];

  const startObj = unfenced.indexOf("{");
  const endObj = unfenced.lastIndexOf("}");
  if (startObj >= 0 && endObj > startObj) {
    candidates.push(unfenced.slice(startObj, endObj + 1));
  }

  const tryParse = (s: string): unknown => JSON.parse(s);

  // 1) Strict parse attempts
  for (const c of candidates) {
    try {
      return tryParse(c);
    } catch {
      // keep trying
    }
  }

  // 2) Common repairs (trailing commas, smart quotes)
  for (const c of candidates) {
    const repaired = c
      // Normalize smart quotes
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      // Remove trailing commas before } or ]
      .replace(/,\s*([}\]])/g, "$1");

    try {
      return tryParse(repaired);
    } catch {
      // keep trying
    }
  }

  // 3) Give a helpful error for debugging (truncate to avoid log spam)
  const snippet = unfenced.slice(0, 400);
  throw new Error(`Invalid JSON returned from selection analysis. Snippet: ${snippet}`);
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
