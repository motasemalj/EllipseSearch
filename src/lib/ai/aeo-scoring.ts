/**
 * AEO (Answer Engine Optimization) Scoring System
 *
 * Enhanced scoring system that uses dynamic AI analysis to evaluate:
 * A. DYNAMIC ANALYSIS:
 *    1. Brand Mention Likelihood (22 pts) - Exact/Partial/None matching
 *    2. Accuracy & Context Quality (15 pts) - Does it accurately describe the brand?
 *    3. Attribution/Citation Presence (12 pts) - Is brand domain cited?
 *    4. Comparative Positioning (10 pts) - Position relative to competitors
 *
 * B. PENALTIES:
 *    - Misattribution Risk (-15 pts) - Hallucination detection
 *
 * Total Max Score: 59 points (before normalization to 0-100)
 */

import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai-config";
import { UNTRUSTED_CONTENT_POLICY, JSON_ONLY_POLICY } from "@/lib/ai/prompt-policies";
import { callOpenAIResponses, extractOpenAIResponsesText } from "@/lib/ai/llm-runtime";
import { LLM_TIMEOUTS_MS } from "@/lib/ai/openai-timeouts";
import type {
  AEOScore,
  AEOScoreBreakdown,
  AEOPenalties,
  SourceReference,
} from "@/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===========================================
// Scoring Weights (from types)
// ===========================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WEIGHTS = {
  brand_mention: { max: 22, exact: 22, partial: 10, fuzzy: 10, none: 0 },
  accuracy_context: { max: 15, accurate: 15, vague: 5, none: 0 },
  attribution: { max: 12, present: 12, missing: 0 },
  comparative_position: { max: 10, first: 10, exclusive: 10, after: 5, not_mentioned: 0 },
  penalties: { misattribution: -15 },
};

const MAX_SCORE = 59;

// ===========================================
// Input Types
// ===========================================

export interface AEOScoringInput {
  answer_html: string;
  brand_name: string;
  brand_domain: string;
  brand_aliases: string[];
  brand_description?: string;
  brand_industry?: string;
  competitor_names?: string[];
  sources?: SourceReference[];
  citations?: string[];
  /** Ground truth content from website crawl for accuracy verification */
  ground_truth_content?: string;
}

// ===========================================
// Core Scoring Functions
// ===========================================

/**
 * Calculates the full AEO score using a combination of:
 * - Deterministic checks (citation matching, text searching)
 * - AI-powered analysis (accuracy, hallucination detection)
 */
export async function calculateAEOScore(input: AEOScoringInput): Promise<AEOScore> {
  const {
    answer_html,
    brand_name,
    brand_domain,
    brand_aliases,
    brand_description,
    competitor_names = [],
    sources = [],
    citations = [],
    ground_truth_content,
  } = input;

  const analysisNotes: string[] = [];

  // Step 1: Brand Mention Likelihood (22 pts) - Deterministic + Fuzzy
  const brandMentionResult = analyzeBrandMention(answer_html, brand_name, brand_aliases);
  analysisNotes.push(`Brand mention: ${brandMentionResult.match_type} match${brandMentionResult.matched_term ? ` ("${brandMentionResult.matched_term}")` : ""}`);

  // Step 2: Attribution/Citation Presence (12 pts) - Deterministic
  const attributionResult = analyzeAttribution(answer_html, brand_domain, sources, citations);
  if (attributionResult.found_in_citations || attributionResult.found_in_text) {
    analysisNotes.push(`Attribution: Found in ${attributionResult.found_in_citations ? "citations" : "text"}`);
  } else {
    analysisNotes.push("Attribution: Brand domain not cited");
  }

  // Step 3: Comparative Positioning (10 pts) - Deterministic
  const comparativeResult = analyzeComparativePosition(answer_html, brand_name, brand_aliases, competitor_names);
  if (comparativeResult.position !== "not_mentioned") {
    analysisNotes.push(
      `Position: ${comparativeResult.position}${
        comparativeResult.competitors_found.length > 0
          ? ` (competitors: ${comparativeResult.competitors_found.join(", ")})`
          : ""
      }`
    );
  }

  // Step 4 & 5: AI-Powered Analysis for Accuracy & Hallucination
  // Uses ground truth from website crawl when available for better accuracy detection
  const aiAnalysis = await analyzeWithAI(
    answer_html,
    brand_name,
    brand_domain,
    brand_description,
    brandMentionResult.context,
    ground_truth_content
  );

  // Accuracy & Context Quality (15 pts)
  const accuracyResult = {
    score: aiAnalysis.accuracy_score,
    max: 15 as const,
    quality: aiAnalysis.accuracy_quality,
    reasoning: aiAnalysis.accuracy_reasoning,
  };
  analysisNotes.push(`Accuracy: ${accuracyResult.quality} - ${accuracyResult.reasoning || "N/A"}`);

  // Misattribution Risk Penalty (-15 pts)
  const misattributionResult = {
    penalty: aiAnalysis.misattribution_detected ? -15 : 0,
    risk_detected: aiAnalysis.misattribution_detected,
    hallucination_details: aiAnalysis.hallucination_details,
  };
  if (misattributionResult.risk_detected) {
    analysisNotes.push(`⚠️ PENALTY: Misattribution detected - ${misattributionResult.hallucination_details}`);
  }

  // Build the score breakdown
  const breakdown: AEOScoreBreakdown = {
    brand_mention: brandMentionResult,
    accuracy_context: accuracyResult,
    attribution: attributionResult,
    comparative_position: comparativeResult,
  };

  const penalties: AEOPenalties = {
    misattribution_risk: misattributionResult,
  };

  // Calculate total score
  const totalScore =
    brandMentionResult.score +
    accuracyResult.score +
    attributionResult.score +
    comparativeResult.score +
    misattributionResult.penalty;

  // Normalize to 0-100 scale
  // Max possible: 59, Min possible: -15
  // Shift range to 0-74, then scale to 0-100
  const normalizedScore = Math.max(0, Math.min(100, Math.round(((totalScore + 15) / 74) * 100)));

  return {
    total_score: totalScore,
    normalized_score: normalizedScore,
    breakdown,
    penalties,
    analysis_notes: analysisNotes,
    llm_usage: aiAnalysis.llm_usage,
  };
}

// ===========================================
// A1: Brand Mention Analysis (22 pts)
// ===========================================

function analyzeBrandMention(
  text: string,
  brandName: string,
  aliases: string[]
): AEOScoreBreakdown["brand_mention"] {
  const textLower = text.toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const brandLower = brandName.toLowerCase();

  // Extract context around brand mention if found
  let context: string | undefined;
  const extractContext = (term: string): string | undefined => {
    const index = textLower.indexOf(term.toLowerCase());
    if (index === -1) return undefined;
    const start = Math.max(0, index - 100);
    const end = Math.min(text.length, index + term.length + 100);
    return text.slice(start, end).trim();
  };

  // Check for exact brand name match (case-insensitive but full word)
  const exactPattern = new RegExp(`\\b${escapeRegex(brandName)}\\b`, "i");
  if (exactPattern.test(text)) {
    context = extractContext(brandName);
    return {
      score: 22,
      max: 22,
      match_type: "exact",
      matched_term: brandName,
      context,
    };
  }

  // Check aliases for exact match
  for (const alias of aliases) {
    if (alias.length < 2) continue;
    const aliasPattern = new RegExp(`\\b${escapeRegex(alias)}\\b`, "i");
    if (aliasPattern.test(text)) {
      context = extractContext(alias);
      return {
        score: 22, // Alias exact match = full points
        max: 22,
        match_type: "exact",
        matched_term: alias,
        context,
      };
    }
  }

  // Partial/Fuzzy matching - check for brand name parts
  // E.g., "DAMAC Properties" could match "DAMAC"
  const brandParts = brandName.split(/\s+/).filter((p) => p.length > 2);
  for (const part of brandParts) {
    const partPattern = new RegExp(`\\b${escapeRegex(part)}\\b`, "i");
    if (partPattern.test(text)) {
      context = extractContext(part);
      return {
        score: 10,
        max: 22,
        match_type: "partial",
        matched_term: part,
        context,
      };
    }
  }

  // Check domain name without TLD
  const domainMatch = brandName.match(/^([\w-]+)/);
  if (domainMatch && domainMatch[1].length > 3) {
    const domainPart = domainMatch[1];
    if (textLower.includes(domainPart.toLowerCase())) {
      context = extractContext(domainPart);
      return {
        score: 10,
        max: 22,
        match_type: "fuzzy",
        matched_term: domainPart,
        context,
      };
    }
  }

  // No match found
  return {
    score: 0,
    max: 22,
    match_type: "none",
    matched_term: undefined,
    context: undefined,
  };
}

// ===========================================
// A3: Attribution/Citation Analysis (12 pts)
// ===========================================

function analyzeAttribution(
  text: string,
  brandDomain: string,
  sources: SourceReference[],
  citations: string[]
): AEOScoreBreakdown["attribution"] {
  const domainLower = brandDomain.toLowerCase();
  const textLower = text.toLowerCase();

  // Check if domain appears in text
  const foundInText = textLower.includes(domainLower);

  // Check if domain appears in sources/citations
  let foundInCitations = false;
  let citationUrl: string | undefined;

  // Check sources array
  for (const source of sources) {
    if (source.url.toLowerCase().includes(domainLower)) {
      foundInCitations = true;
      citationUrl = source.url;
      break;
    }
  }

  // Check citations array
  if (!foundInCitations) {
    for (const citation of citations) {
      if (citation.toLowerCase().includes(domainLower)) {
        foundInCitations = true;
        citationUrl = citation;
        break;
      }
    }
  }

  // Also check for Markdown links containing the domain
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    if (match[2].toLowerCase().includes(domainLower)) {
      foundInCitations = true;
      citationUrl = match[2];
      break;
    }
  }

  const isPresent = foundInCitations || foundInText;

  return {
    score: isPresent ? 12 : 0,
    max: 12,
    found_in_citations: foundInCitations,
    found_in_text: foundInText,
    citation_url: citationUrl,
  };
}

// ===========================================
// A4: Comparative Positioning (10 pts)
// ===========================================

function analyzeComparativePosition(
  text: string,
  brandName: string,
  aliases: string[],
  competitors: string[]
): AEOScoreBreakdown["comparative_position"] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const textLower = text.toLowerCase();

  // Find brand position in text
  let brandIndex = -1;
  const brandTerms = [brandName, ...aliases].filter((t) => t.length > 2);

  for (const term of brandTerms) {
    const pattern = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
    const match = pattern.exec(text);
    if (match) {
      if (brandIndex === -1 || match.index < brandIndex) {
        brandIndex = match.index;
      }
    }
  }

  // If brand not mentioned, return not_mentioned
  if (brandIndex === -1) {
    return {
      score: 0,
      max: 10,
      position: "not_mentioned",
      competitors_found: [],
      brand_position_index: undefined,
    };
  }

  // Find competitor positions
  const competitorPositions: { name: string; index: number }[] = [];
  for (const competitor of competitors) {
    if (competitor.length < 2) continue;
    const pattern = new RegExp(`\\b${escapeRegex(competitor)}\\b`, "i");
    const match = pattern.exec(text);
    if (match) {
      competitorPositions.push({ name: competitor, index: match.index });
    }
  }

  // Determine position
  const competitorsFound = competitorPositions.map((c) => c.name);

  // If no competitors found, brand is exclusive
  if (competitorPositions.length === 0) {
    return {
      score: 10,
      max: 10,
      position: "exclusive",
      competitors_found: [],
      brand_position_index: brandIndex,
    };
  }

  // Check if brand appears before all competitors
  const allCompetitorsAfter = competitorPositions.every((c) => c.index > brandIndex);
  if (allCompetitorsAfter) {
    return {
      score: 10,
      max: 10,
      position: "first",
      competitors_found: competitorsFound,
      brand_position_index: brandIndex,
    };
  }

  // Brand appears after at least one competitor
  return {
    score: 5,
    max: 10,
    position: "after_competitors",
    competitors_found: competitorsFound,
    brand_position_index: brandIndex,
  };
}

// ===========================================
// AI-Powered Analysis (Accuracy & Hallucination)
// ===========================================

interface AIAnalysisResult {
  accuracy_score: number;
  accuracy_quality: "accurate" | "vague" | "none";
  accuracy_reasoning: string;
  misattribution_detected: boolean;
  hallucination_details?: string;
  llm_usage?: unknown;
}

async function analyzeWithAI(
  answerHtml: string,
  brandName: string,
  brandDomain: string,
  brandDescription?: string,
  brandContext?: string,
  groundTruthContent?: string
): Promise<AIAnalysisResult> {
  // If brand isn't mentioned at all, skip AI analysis
  if (!brandContext) {
    return {
      accuracy_score: 0,
      accuracy_quality: "none",
      accuracy_reasoning: "Brand not mentioned in response",
      misattribution_detected: false,
    };
  }

  // Build the ground truth section if available (from website crawl)
  const groundTruthSection = groundTruthContent
    ? `
**GROUND TRUTH (from website crawl - use this as the authoritative source):**
${groundTruthContent.slice(0, 4000)}${groundTruthContent.length > 4000 ? "..." : ""}

IMPORTANT: Compare the AI response against this ground truth. Any claims not supported by the ground truth should be flagged as potential misattributions.
`
    : "";

  const systemPrompt = `You are an AEO (Answer Engine Optimization) expert analyzing AI-generated content for accuracy and potential hallucinations about a specific brand.

Your task is to:
1. Analyze if the AI response accurately describes the brand's core offering
2. Check for any misattributions or hallucinations (false claims about products/services the brand doesn't offer)
${groundTruthContent ? "3. Use the provided GROUND TRUTH content from the brand's website as the authoritative source for verification" : ""}

CRITICAL OUTPUT RULES (MUST FOLLOW):
- Output MUST be strict RFC 8259 JSON (no trailing commas, no comments).
- Output ONLY JSON (no markdown fences, no prose).
- Use double quotes for all strings.`;
 
  const hardenedSystemPrompt = `${UNTRUSTED_CONTENT_POLICY}\n\n${systemPrompt}\n\n${JSON_ONLY_POLICY}`;

  const userPrompt = `Analyze this AI-generated content for a brand:

**Brand Name:** ${brandName}
**Brand Domain:** ${brandDomain}
**Brand Description (if available):** ${brandDescription || "Not provided - use general knowledge"}
${groundTruthSection}
**Context where brand is mentioned:**
"${brandContext}"

**Full AI Response:**
${answerHtml.slice(0, 3000)}${answerHtml.length > 3000 ? "..." : ""}

---

Return a JSON object with this exact structure:
{
  "accuracy_assessment": {
    "quality": "accurate" | "vague" | "none",
    "score": 15 | 5 | 0,
    "reasoning": "Explanation of why the description is accurate/vague/incorrect${groundTruthContent ? " based on the ground truth" : ""}"
  },
  "misattribution_check": {
    "detected": true | false,
    "details": "If detected, explain what product/service was incorrectly attributed to the brand"
  }
}

**Scoring Rules:**
- "accurate" (15 pts): The text correctly describes the brand's actual products/services/industry${groundTruthContent ? " as verified by ground truth" : ""}
- "vague" (5 pts): Generic statements that could apply to many brands, or only tangentially related
- "none" (0 pts): Brand mentioned but no meaningful description of what they offer

**Misattribution Check:**
${groundTruthContent
    ? "- Compare claims against the GROUND TRUTH content\n- Any product/service/feature not mentioned in ground truth is potentially a hallucination\n- Flag specific mismatches between AI response and ground truth"
    : "- Look for any claims about products, services, or capabilities the brand likely doesn't have\n- Consider if facts stated about the brand match their known offerings\n- If uncertain about the brand, lean towards \"not detected\" unless clearly false"}`;

  // Structured Outputs (Responses API) to avoid flaky JSON parsing
  const aeoSchema = {
    type: "json_schema",
    name: "aeo_accuracy_check",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["accuracy_assessment", "misattribution_check"],
      properties: {
        accuracy_assessment: {
          type: "object",
          additionalProperties: false,
          required: ["quality", "score", "reasoning"],
          properties: {
            quality: { type: "string", enum: ["accurate", "vague", "none"] },
            score: { type: "number", enum: [15, 5, 0] },
            reasoning: { type: "string" },
          },
        },
        misattribution_check: {
          type: "object",
          additionalProperties: false,
          required: ["detected", "details"],
          properties: {
            detected: { type: "boolean" },
            details: { type: "string" },
          },
        },
      },
    },
  } as const;

  try {
    // Use Responses API for best compatibility with gpt-5-* family
    const { response, usage } = await callOpenAIResponses({
      client: openai,
      provider: "openai",
      model: OPENAI_CHAT_MODEL,
      timeoutMs: LLM_TIMEOUTS_MS.aeoScoring,
      request: {
      model: OPENAI_CHAT_MODEL,
      input: [
        { role: "system", content: hardenedSystemPrompt },
        { role: "user", content: userPrompt },
      ],
      reasoning: { effort: "low" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      text: { verbosity: "low", format: aeoSchema as Record<string, unknown> },
      // a bit higher to reduce incomplete:max_output_tokens
      max_output_tokens: 900,
      } as unknown as Parameters<typeof openai.responses.create>[0],
    });

    const content = extractOpenAIResponsesText(response);
    if (!content || content.trim().length === 0) {
      throw new Error("Empty response from AI analysis (no output_text/content)");
    }

    // Robust JSON parsing with recovery for malformed responses
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error("[AEO] JSON parse error, attempting recovery:", parseError);
      // Try to extract valid JSON
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        try {
          const cleanedContent = content.slice(jsonStart, jsonEnd + 1)
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]")
            .replace(/'/g, '"')
            .replace(/[\x00-\x1F\x7F]/g, " "); // Remove control characters
          parsed = JSON.parse(cleanedContent);
          console.log("[AEO] JSON recovery successful");
        } catch {
          console.error("[AEO] JSON recovery failed, using defaults");
          // Return safe defaults
          return {
            accuracy_score: 5,
            accuracy_quality: "vague" as const,
            accuracy_reasoning: "Analysis could not parse AI response",
            misattribution_detected: false,
          };
        }
      } else {
        return {
          accuracy_score: 5,
          accuracy_quality: "vague" as const,
          accuracy_reasoning: "Analysis could not parse AI response",
          misattribution_detected: false,
        };
      }
    }

    const qualityMap: Record<string, "accurate" | "vague" | "none"> = {
      accurate: "accurate",
      vague: "vague",
      none: "none",
    };

    return {
      accuracy_score: parsed.accuracy_assessment?.score ?? 5,
      accuracy_quality: qualityMap[parsed.accuracy_assessment?.quality] || "vague",
      accuracy_reasoning: parsed.accuracy_assessment?.reasoning || "",
      misattribution_detected: Boolean(parsed.misattribution_check?.detected),
      hallucination_details: parsed.misattribution_check?.details,
      llm_usage: usage,
    };
  } catch (error) {
    console.error("AI analysis failed:", error);
    // Return conservative defaults on error
    return {
      accuracy_score: 5, // Assume vague on error
      accuracy_quality: "vague",
      accuracy_reasoning: "Analysis could not be completed",
      misattribution_detected: false,
    };
  }
}

// ===========================================
// Helper Functions
// ===========================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Quick AEO score calculation without AI (for fast estimates)
 */
export function calculateQuickAEOScore(input: Omit<AEOScoringInput, "brand_description" | "brand_industry">): {
  score: number;
  normalized: number;
  hasExactMention: boolean;
  hasCitation: boolean;
} {
  const brandMention = analyzeBrandMention(input.answer_html, input.brand_name, input.brand_aliases);
  const attribution = analyzeAttribution(
    input.answer_html,
    input.brand_domain,
    input.sources || [],
    input.citations || []
  );
  const comparative = analyzeComparativePosition(
    input.answer_html,
    input.brand_name,
    input.brand_aliases,
    input.competitor_names || []
  );

  const score = brandMention.score + attribution.score + comparative.score;
  const normalized = Math.round((score / MAX_SCORE) * 100);

  return {
    score,
    normalized,
    hasExactMention: brandMention.match_type === "exact",
    hasCitation: attribution.found_in_citations || attribution.found_in_text,
  };
}

