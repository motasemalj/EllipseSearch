/**
 * Hallucination Detection Engine
 * 
 * Uses "Ground Truth" from website crawl to detect when AI responses
 * contain false, inaccurate, or fabricated information about a brand.
 * 
 * Types of Hallucinations Detected:
 * 1. POSITIVE: AI claims something false (e.g., "free plan" when none exists)
 * 2. NEGATIVE: AI refuses to answer or says "I don't know" when data exists
 * 3. MISATTRIBUTION: AI attributes wrong products/services to the brand
 * 4. OUTDATED: AI uses old information that's no longer accurate
 */

import OpenAI from "openai";
import { OPENAI_CHAT_MODEL, ANALYSIS_REASONING_EFFORT } from "@/lib/ai/openai-config";
import type { SchemaFix } from "@/types";
import { UNTRUSTED_CONTENT_POLICY } from "@/lib/ai/prompt-policies";
import { callOpenAIResponses, extractOpenAIResponsesText } from "@/lib/ai/llm-runtime";
import { LLM_TIMEOUTS_MS } from "@/lib/ai/openai-timeouts";
import { HallucinationDetectionSchema, GROUND_TRUTH_RESPONSES_SCHEMA, GroundTruthExtractionSchema } from "@/lib/schemas/llm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===========================================
// Types
// ===========================================

export interface GroundTruthData {
  // Extracted from website crawl
  pricing?: PricingInfo[];
  features?: string[];
  products?: string[];
  services?: string[];
  company_description?: string;
  tagline?: string;
  locations?: string[];
  contact_info?: ContactInfo;
  certifications?: string[];
  team_info?: string[];
  client_testimonials?: string[];
  faq_content?: string[];
  
  // Raw crawled content for fallback
  raw_content: string;
  crawled_pages: { url: string; title: string; excerpt: string; crawled_at?: string }[];
  
  // Metadata
  extraction_timestamp?: string;
}

export interface PricingInfo {
  plan_name: string;
  price: string;
  features?: string[];
  is_free?: boolean;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  address?: string;
}

export interface HallucinationResult {
  has_hallucinations: boolean;
  hallucinations: DetectedHallucination[];
  accuracy_score: number; // 0-100
  confidence: "high" | "medium" | "low";
  summary: string;
  analysis_notes: string[];
  /** Ground truth freshness info */
  ground_truth_freshness?: {
    is_stale: boolean;
    days_since_crawl: number;
    recommendation?: string;
  };
  /** Optional provider usage metadata (tokens, etc.) */
  llm_usage?: unknown;
}

export interface DetectedHallucination {
  type: "positive" | "negative" | "misattribution" | "outdated";
  severity: "critical" | "major" | "minor";
  claim: string; // What the AI said
  reality: string; // What the ground truth shows
  recommendation: EnhancedRecommendation;
}

export interface EnhancedRecommendation {
  title: string;
  description: string;
  specific_fix: string; // Exact actionable fix based on crawler data
  affected_element?: string; // e.g., "H1 tag", "pricing page", "meta description"
  priority: "critical" | "high" | "medium" | "low";
  schema_fix?: SchemaFix; // Optional JSON-LD/schema patch (if generated)
}

// ===========================================
// Ground Truth Freshness Check
// ===========================================

/** Default number of days after which ground truth is considered stale */
const DEFAULT_STALE_THRESHOLD_DAYS = 30;

/**
 * Check if ground truth data is stale (older than threshold).
 * Stale data may lead to false positives in hallucination detection.
 */
export function isGroundTruthStale(
  groundTruth: GroundTruthData,
  thresholdDays: number = DEFAULT_STALE_THRESHOLD_DAYS
): { isStale: boolean; daysSinceCrawl: number; recommendation?: string } {
  // Try to find the most recent crawl timestamp
  let mostRecentCrawl: Date | null = null;
  
  // Check extraction timestamp first
  if (groundTruth.extraction_timestamp) {
    try {
      mostRecentCrawl = new Date(groundTruth.extraction_timestamp);
    } catch {
      // Invalid date
    }
  }
  
  // Check individual page crawl dates
  if (!mostRecentCrawl && groundTruth.crawled_pages?.length > 0) {
    for (const page of groundTruth.crawled_pages) {
      if (page.crawled_at) {
        try {
          const pageDate = new Date(page.crawled_at);
          if (!mostRecentCrawl || pageDate > mostRecentCrawl) {
            mostRecentCrawl = pageDate;
          }
        } catch {
          // Invalid date
        }
      }
    }
  }
  
  // If no timestamp found, assume it's stale
  if (!mostRecentCrawl) {
    return {
      isStale: true,
      daysSinceCrawl: -1, // Unknown
      recommendation: "Ground truth has no timestamp. Re-crawl the website to get fresh data.",
    };
  }
  
  const daysSinceCrawl = Math.floor(
    (Date.now() - mostRecentCrawl.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  const isStale = daysSinceCrawl > thresholdDays;
  
  return {
    isStale,
    daysSinceCrawl,
    recommendation: isStale 
      ? `Ground truth is ${daysSinceCrawl} days old (threshold: ${thresholdDays}). Re-crawl the website for more accurate hallucination detection.`
      : undefined,
  };
}

// ===========================================
// Ground Truth Extraction (Schema-Locked)
// ===========================================

/**
 * Extract structured ground truth data from crawled pages.
 * Uses Responses API with strict schema for reliable structured output.
 */
export async function extractGroundTruthData(
  crawledPages: { url: string; title: string; markdown: string }[]
): Promise<GroundTruthData> {
  // Combine relevant page content
  const combinedContent = crawledPages
    .map(p => `## ${p.title}\nURL: ${p.url}\n\n${p.markdown?.slice(0, 2000) || ""}`)
    .join("\n\n---\n\n")
    .slice(0, 15000); // Limit total size

  const systemPrompt = `You are a data extraction expert. Extract structured information from website content.
Focus on: pricing, features, products/services, company description, and key facts.
Only include fields where you found real data. Use empty arrays if not found.

${UNTRUSTED_CONTENT_POLICY}`;

  const userPrompt = `Extract structured data from this website content:

${combinedContent}

Extract:
- pricing: Array of plans with name, price, features, is_free flag
- features: Array of product/service features
- products: Array of product names
- services: Array of service offerings
- company_description: One paragraph description (max 1000 chars)
- tagline: Main tagline if found (max 200 chars)
- locations: Array of office/service locations
- certifications: Array of certifications/awards
- faq_content: Array of Q&A pairs from FAQ pages`;

  try {
    // Use Responses API with strict schema for reliable extraction
    const { response } = await callOpenAIResponses({
      client: openai,
      provider: "openai",
      model: OPENAI_CHAT_MODEL,
      timeoutMs: LLM_TIMEOUTS_MS.groundTruthExtraction,
      request: {
        model: OPENAI_CHAT_MODEL,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        reasoning: { effort: ANALYSIS_REASONING_EFFORT },
        text: { 
          verbosity: "low",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          format: GROUND_TRUTH_RESPONSES_SCHEMA as Record<string, unknown>,
        },
        max_output_tokens: 3000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as Record<string, unknown>,
    });

    const content = extractOpenAIResponsesText(response);
    if (!content) {
      // Soft-fail: OpenAI can occasionally return empty output (e.g. incomplete max_output_tokens).
      // Return minimal ground truth so downstream pipelines don't crash.
      console.warn("[GroundTruth] Empty response from ground truth extraction (soft-fail)");
      return {
        raw_content: combinedContent,
        crawled_pages: crawledPages.map(p => ({
          url: p.url,
          title: p.title,
          excerpt: p.markdown?.slice(0, 500) || "",
        })),
        extraction_timestamp: new Date().toISOString(),
      };
    }

    const extractedRaw = JSON.parse(content);
    
    // Validate with Zod schema
    const extracted = GroundTruthExtractionSchema.parse(extractedRaw);

    return {
      ...extracted,
      raw_content: combinedContent,
      crawled_pages: crawledPages.map(p => ({
        url: p.url,
        title: p.title,
        excerpt: p.markdown?.slice(0, 500) || "",
        crawled_at: new Date().toISOString(),
      })),
      extraction_timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[GroundTruth] Extraction failed:", error);
    // Return minimal ground truth with raw content
    return {
      raw_content: combinedContent,
      crawled_pages: crawledPages.map(p => ({
        url: p.url,
        title: p.title,
        excerpt: p.markdown?.slice(0, 500) || "",
      })),
      extraction_timestamp: new Date().toISOString(),
    };
  }
}

// ===========================================
// Hallucination Detection
// ===========================================

/**
 * Main hallucination detection function
 * Compares AI response against ground truth data
 */
export async function detectHallucinations(
  aiResponse: string,
  groundTruth: GroundTruthData,
  brandName: string,
  brandDomain: string
): Promise<HallucinationResult> {
  const analysisNotes: string[] = [];

  // Check ground truth freshness
  const freshnessCheck = isGroundTruthStale(groundTruth);
  if (freshnessCheck.isStale) {
    analysisNotes.push(`⚠️ Ground truth may be stale (${freshnessCheck.daysSinceCrawl} days old)`);
  }

  // Build ground truth summary for comparison
  const groundTruthSummary = buildGroundTruthSummary(groundTruth);
  
  if (!groundTruthSummary || groundTruthSummary.length < 100) {
    return {
      has_hallucinations: false,
      hallucinations: [],
      accuracy_score: 50, // Unknown accuracy without ground truth
      confidence: "low",
      summary: "Insufficient website data for hallucination detection. Run another analysis after website crawl completes.",
      analysis_notes: ["Insufficient ground truth data for comparison"],
      ground_truth_freshness: {
        is_stale: true,
        days_since_crawl: freshnessCheck.daysSinceCrawl,
        recommendation: freshnessCheck.recommendation,
      },
    };
  }

  const systemPrompt = `You are a hallucination detection expert. Your job is to compare AI-generated claims about a brand against verified ground truth from the brand's website.

IMPORTANT DEFINITIONS:
- POSITIVE HALLUCINATION: AI claims something that is CLEARLY FALSE (e.g., "has free plan" when no free plan exists)
- NEGATIVE HALLUCINATION: AI says "I don't know" or refuses to answer when the information IS clearly available
- MISATTRIBUTION: AI attributes WRONG products, services, or features to the brand
- OUTDATED: AI uses information that CLEARLY contradicts current website content

CRITICAL RULES FOR DETECTION:
1. DO NOT flag minor wording differences or paraphrasing as hallucinations
2. DO NOT flag approximate values that are "in the ballpark" (e.g., "around $100" when actual is $99)
3. DO NOT flag general/vague statements that could reasonably be inferred
4. DO NOT flag missing details as negative hallucinations unless the AI explicitly says it doesn't know
5. ONLY flag claims that are materially wrong and could mislead a customer
6. When in doubt, DO NOT flag it - err on the side of giving the AI credit

${UNTRUSTED_CONTENT_POLICY}`;

  const userPrompt = `Analyze this AI response about "${brandName}" (${brandDomain}) for SIGNIFICANT hallucinations only:

**AI RESPONSE:**
${aiResponse.slice(0, 3000)}

**GROUND TRUTH (from website crawl - this is the authoritative source):**
${groundTruthSummary}

---

Return JSON with:
- has_hallucinations: boolean
- accuracy_score: 0-100
- confidence: "high"/"medium"/"low"
- summary: Brief summary (if no issues: "No significant hallucinations detected. The AI response is accurate.")
- hallucinations: Array of issues (EMPTY if none found)
- analysis_notes: Array of notes

IMPORTANT:
- Return EMPTY hallucinations array [] if no significant issues
- Only include hallucinations that would actually mislead a customer
- A good AI response should have: accuracy_score >= 90, has_hallucinations: false`;

  // Schema for structured output
  const hallucinationSchema = {
    type: "json_schema",
    name: "hallucination_detection",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["has_hallucinations", "accuracy_score", "confidence", "summary", "hallucinations", "analysis_notes"],
      properties: {
        has_hallucinations: { type: "boolean" },
        accuracy_score: { type: "number", minimum: 0, maximum: 100 },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        summary: { type: "string", maxLength: 500 },
        hallucinations: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            // OpenAI schema validator requires `required` to include every key in `properties` when `strict: true`.
            // We still keep these fields effectively optional by allowing null.
            required: ["type", "severity", "claim", "reality", "affected_element", "specific_fix"],
            properties: {
              type: { type: "string", enum: ["positive", "negative", "misattribution", "outdated"] },
              severity: { type: "string", enum: ["critical", "major", "minor"] },
              claim: { type: "string", maxLength: 500 },
              reality: { type: "string", maxLength: 500 },
              // Optional fields: allow nulls (some model responses emit null for optionals)
              affected_element: { type: ["string", "null"], maxLength: 100 },
              specific_fix: { type: ["string", "null"], maxLength: 500 },
            },
          },
        },
        analysis_notes: {
          type: "array",
          maxItems: 10,
          items: { type: "string", maxLength: 200 },
        },
      },
    },
  } as const;

  try {
    const { response, usage } = await callOpenAIResponses({
      client: openai,
      provider: "openai",
      model: OPENAI_CHAT_MODEL,
      timeoutMs: LLM_TIMEOUTS_MS.hallucination,
      request: {
        model: OPENAI_CHAT_MODEL,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        reasoning: { effort: ANALYSIS_REASONING_EFFORT },
        text: { 
          verbosity: "low",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          format: hallucinationSchema as Record<string, unknown>,
        },
        max_output_tokens: 1500,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as Record<string, unknown>,
    });

    const content = extractOpenAIResponsesText(response);
    if (!content) {
      console.warn("[Hallucination] Empty response from OpenAI, returning safe default");
      return {
        has_hallucinations: false,
        hallucinations: [],
        accuracy_score: 75,
        confidence: "low" as const,
        summary: "Hallucination detection could not complete - no response from analysis model.",
        analysis_notes: [...analysisNotes, "Analysis skipped due to empty model response"],
      };
    }

    let resultRaw;
    try {
      resultRaw = JSON.parse(content);
    } catch (parseError) {
      console.warn("[Hallucination] JSON parse error, attempting recovery:", parseError);
      // Try to extract valid JSON
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        try {
          const cleanedContent = content.slice(jsonStart, jsonEnd + 1)
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]")
            .replace(/[\x00-\x1F\x7F]/g, " ");
          resultRaw = JSON.parse(cleanedContent);
          console.log("[Hallucination] Successfully recovered JSON");
        } catch {
          console.warn("[Hallucination] JSON recovery failed, returning safe default");
          return {
            has_hallucinations: false,
            hallucinations: [],
            accuracy_score: 75,
            confidence: "low" as const,
            summary: "Hallucination detection could not parse response.",
            analysis_notes: [...analysisNotes, "Analysis failed due to malformed response"],
          };
        }
      } else {
        console.warn("[Hallucination] No valid JSON found, returning safe default");
        return {
          has_hallucinations: false,
          hallucinations: [],
          accuracy_score: 75,
          confidence: "low" as const,
          summary: "Hallucination detection could not parse response.",
          analysis_notes: [...analysisNotes, "Analysis failed due to invalid response format"],
        };
      }
    }
    const result = HallucinationDetectionSchema.parse(resultRaw);

    // Transform hallucinations to include enhanced recommendations
    const hallucinations: DetectedHallucination[] = (result.hallucinations || []).map(
      (h: {
        type: string;
        severity: string;
        claim: string;
        reality: string;
        affected_element?: string;
        specific_fix?: string;
      }) => ({
        type: h.type as DetectedHallucination["type"],
        severity: h.severity as DetectedHallucination["severity"],
        claim: h.claim,
        reality: h.reality,
        recommendation: generateEnhancedRecommendation(h, brandName, groundTruth),
      })
    );

    const hasIssues = result.has_hallucinations || hallucinations.length > 0;
    const defaultSummary = hasIssues 
      ? `Found ${hallucinations.length} issue${hallucinations.length === 1 ? '' : 's'} in the AI response that may mislead customers.`
      : "No significant hallucinations detected. The AI response is accurate.";

    return {
      has_hallucinations: hasIssues,
      hallucinations,
      accuracy_score: result.accuracy_score ?? 75,
      confidence: result.confidence || "medium",
      summary: result.summary || defaultSummary,
      analysis_notes: [...analysisNotes, ...(result.analysis_notes || [])],
      ground_truth_freshness: {
        is_stale: freshnessCheck.isStale,
        days_since_crawl: freshnessCheck.daysSinceCrawl,
        recommendation: freshnessCheck.recommendation,
      },
      llm_usage: usage,
    };
  } catch (error) {
    console.error("[Hallucination] Detection failed:", error);
    return {
      has_hallucinations: false,
      hallucinations: [],
      accuracy_score: 50,
      confidence: "low",
      summary: "Hallucination analysis could not be completed.",
      analysis_notes: ["Hallucination analysis could not be completed"],
      ground_truth_freshness: {
        is_stale: freshnessCheck.isStale,
        days_since_crawl: freshnessCheck.daysSinceCrawl,
        recommendation: freshnessCheck.recommendation,
      },
    };
  }
}

// ===========================================
// Negative Hallucination Detection
// ===========================================

/**
 * Detect "Negative Hallucinations" - when AI refuses to answer
 * because content is invisible to bots
 */
export function detectNegativeHallucination(
  aiResponse: string,
  groundTruth: GroundTruthData
): DetectedHallucination | null {
  const refusalPhrases = [
    "i cannot verify",
    "i don't have information",
    "i'm not sure about",
    "unable to confirm",
    "no reliable information",
    "cannot find details",
    "information not available",
    "i don't know",
  ];

  const responseLower = aiResponse.toLowerCase();
  const hasRefusal = refusalPhrases.some(phrase => responseLower.includes(phrase));

  if (!hasRefusal) return null;

  // Check if we have ground truth data that the AI couldn't see
  const hasGroundTruth = 
    groundTruth.pricing?.length ||
    groundTruth.features?.length ||
    groundTruth.products?.length;

  if (!hasGroundTruth) return null;

  // AI refused but we have data - likely invisible content
  return {
    type: "negative",
    severity: "major",
    claim: "AI said it cannot find or verify information about this brand",
    reality: `Website has ${groundTruth.pricing?.length || 0} pricing plans, ${groundTruth.features?.length || 0} features, and ${groundTruth.products?.length || 0} products documented`,
    recommendation: {
      title: "Content Invisible to AI Bots",
      description: "The AI cannot read important content on your website, likely because it's hidden behind JavaScript, 'Click to Reveal' buttons, or requires interaction.",
      specific_fix: "Move critical information (pricing, features, product descriptions) to plain HTML text. Avoid hiding content behind accordions, modals, or dynamic loading for the main product pages.",
      affected_element: "Page structure / JavaScript rendering",
      priority: "critical",
    },
  };
}

// ===========================================
// Enhanced Recommendation Generation
// ===========================================

function generateEnhancedRecommendation(
  hallucination: {
    type: string;
    severity: string;
    claim: string;
    reality: string;
    affected_element?: string;
    specific_fix?: string;
  },
  brandName: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  groundTruth: GroundTruthData
): EnhancedRecommendation {
  const priority = hallucination.severity === "critical" ? "critical" :
                   hallucination.severity === "major" ? "high" : "medium";

  // If AI provided a specific fix, use it
  if (hallucination.specific_fix && hallucination.affected_element) {
    return {
      title: `Fix ${hallucination.type} hallucination`,
      description: `AI incorrectly stated: "${hallucination.claim}"`,
      specific_fix: hallucination.specific_fix,
      affected_element: hallucination.affected_element,
      priority,
    };
  }

  // Generate context-aware recommendation based on hallucination type
  switch (hallucination.type) {
    case "positive":
      return {
        title: "Correct False AI Claim",
        description: `AI is claiming something false about ${brandName}: "${hallucination.claim}"`,
        specific_fix: `Update your website to clearly state the truth: "${hallucination.reality}". Add this to your homepage H1, meta description, or FAQ section so AI models can learn the correct information.`,
        affected_element: "Homepage / Product page",
        priority,
      };

    case "misattribution":
      return {
        title: "Fix Category/Product Misattribution",
        description: `AI thinks ${brandName} is something it's not: "${hallucination.claim}"`,
        specific_fix: `Change your H1 tag and meta description to explicitly state what ${brandName} actually is. Instead of vague language, use: "${hallucination.reality}". Add structured data (Schema.org) to define your organization type.`,
        affected_element: "H1 tag, Meta description, Schema markup",
        priority,
      };

    case "negative":
      return {
        title: "Make Content Visible to AI",
        description: "AI cannot find information that exists on your website",
        specific_fix: "Move important content from JavaScript-rendered sections to static HTML. Ensure pricing, features, and key information are in plain text, not hidden behind buttons or tabs.",
        affected_element: "Page structure",
        priority,
      };

    case "outdated":
      return {
        title: "Update Outdated Information",
        description: `AI is using old information: "${hallucination.claim}"`,
        specific_fix: `Prominently display current information on your website. Add a "Last Updated" date to key pages. Consider adding a changelog or news section that AI can reference for updates.`,
        affected_element: "Content freshness signals",
        priority,
      };

    default:
      return {
        title: "Address AI Accuracy Issue",
        description: `Discrepancy found: "${hallucination.claim}"`,
        specific_fix: hallucination.reality,
        priority,
      };
  }
}

// ===========================================
// Helper Functions
// ===========================================

function buildGroundTruthSummary(groundTruth: GroundTruthData): string {
  const parts: string[] = [];

  if (groundTruth.company_description) {
    parts.push(`**Company Description:** ${groundTruth.company_description}`);
  }

  if (groundTruth.tagline) {
    parts.push(`**Tagline:** ${groundTruth.tagline}`);
  }

  if (groundTruth.pricing && groundTruth.pricing.length > 0) {
    const pricingStr = groundTruth.pricing
      .map(p => `${p.plan_name}: ${p.price}${p.is_free ? " (FREE)" : ""}`)
      .join(", ");
    parts.push(`**Pricing Plans:** ${pricingStr}`);
  }

  if (groundTruth.products && groundTruth.products.length > 0) {
    parts.push(`**Products:** ${groundTruth.products.join(", ")}`);
  }

  if (groundTruth.services && groundTruth.services.length > 0) {
    parts.push(`**Services:** ${groundTruth.services.join(", ")}`);
  }

  if (groundTruth.features && groundTruth.features.length > 0) {
    parts.push(`**Features:** ${groundTruth.features.slice(0, 10).join(", ")}`);
  }

  if (groundTruth.locations && groundTruth.locations.length > 0) {
    parts.push(`**Locations:** ${groundTruth.locations.join(", ")}`);
  }

  if (groundTruth.certifications && groundTruth.certifications.length > 0) {
    parts.push(`**Certifications:** ${groundTruth.certifications.join(", ")}`);
  }

  // Add raw content excerpts for additional context
  if (groundTruth.crawled_pages && groundTruth.crawled_pages.length > 0) {
    const pageExcerpts = groundTruth.crawled_pages
      .slice(0, 5)
      .map(p => `- ${p.title}: ${p.excerpt.slice(0, 200)}...`)
      .join("\n");
    parts.push(`**Key Page Content:**\n${pageExcerpts}`);
  }

  return parts.join("\n\n");
}

/**
 * Quick check if response might have hallucinations (no AI call)
 * Use for filtering before expensive AI analysis
 */
export function quickHallucinationCheck(
  aiResponse: string,
  groundTruth: GroundTruthData
): { likely: boolean; reason?: string } {
  const responseLower = aiResponse.toLowerCase();

  // Check for negative hallucination signals
  if (responseLower.includes("i cannot") || responseLower.includes("i don't know")) {
    if (groundTruth.pricing?.length || groundTruth.features?.length) {
      return { likely: true, reason: "AI refuses to answer but data exists" };
    }
  }

  // Check for pricing mismatches
  if (groundTruth.pricing?.length) {
    const hasFree = groundTruth.pricing.some(p => p.is_free);
    if (!hasFree && responseLower.includes("free plan")) {
      return { likely: true, reason: "Claims free plan but none exists" };
    }
    if (!hasFree && responseLower.includes("free tier")) {
      return { likely: true, reason: "Claims free tier but none exists" };
    }
  }

  return { likely: false };
}
