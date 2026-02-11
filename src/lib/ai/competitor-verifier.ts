/**
 * Competitor Verification Layer
 * 
 * Verifies that competitor insights from AI responses are accurate and relevant.
 * Uses LLM to validate that mentioned competitors are actually in the same market space.
 */

import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai-config";
import { callOpenAIResponses, extractOpenAIResponsesText } from "@/lib/ai/llm-runtime";
import { LLM_TIMEOUTS_MS } from "@/lib/ai/openai-timeouts";
import { UNTRUSTED_CONTENT_POLICY } from "@/lib/ai/prompt-policies";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===========================================
// Types
// ===========================================

export interface CompetitorInsight {
  name: string;
  isVerified: boolean;
  relevanceScore: number; // 0-10
  relationship: "direct_competitor" | "indirect_competitor" | "not_competitor" | "unknown";
  reasoning: string;
  marketOverlap?: string[];
}

export interface VerifiedCompetitorInsights {
  originalInsights: string;
  verifiedCompetitors: CompetitorInsight[];
  filteredCompetitors: string[]; // Names of competitors that were filtered out
  summary: string;
  verificationTimestamp: string;
}

export interface VerifyCompetitorsInput {
  competitorInsightsText: string;
  brandName: string;
  brandDomain?: string;
  brandDescription?: string;
  brandIndustry?: string;
  brandProducts?: string[];
}

// ===========================================
// Competitor Name Extraction
// ===========================================

/**
 * Extract potential competitor names from the insights text
 */
function extractPotentialCompetitors(text: string): string[] {
  if (!text || text.trim() === "") return [];
  
  // Common patterns for competitor mentions
  const patterns = [
    // "competitors like X, Y, and Z"
    /competitors?\s+(?:like|such as|including)\s+([^.]+)/gi,
    // "X, Y, and Z are competitors"
    /([A-Z][a-zA-Z0-9\s&.-]+(?:,\s*[A-Z][a-zA-Z0-9\s&.-]+)*)\s+(?:are|is)\s+(?:a\s+)?competitors?/gi,
    // "vs X" or "versus X"
    /(?:vs\.?|versus)\s+([A-Z][a-zA-Z0-9\s&.-]+)/gi,
    // "compared to X"
    /compared\s+to\s+([A-Z][a-zA-Z0-9\s&.-]+)/gi,
    // "alternatives like X"
    /alternatives?\s+(?:like|such as|including)\s+([^.]+)/gi,
  ];

  const competitors = new Set<string>();
  const blacklist = new Set([
    "Competitor",
    "Competitors",
    "Alternative",
    "Alternatives",
    "Rival",
    "Rivals",
    "Companies",
    "Company",
    "Brands",
    "Brand",
    "Providers",
    "Provider",
    "Platforms",
    "Platform",
    "Solutions",
    "Solution",
  ]);
  
  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      if (match[1]) {
        // Split by common delimiters
        const names = match[1]
          .split(/,|and|or|&/)
          .map(s => s.trim())
          .filter(s => s.length > 1 && s.length < 50);
        
        names.forEach(name => {
          // Basic cleanup
          const cleaned = name
            .replace(/^(the|a|an)\s+/i, "")
            .replace(/\s+$/, "")
            .trim();
          
          if (cleaned && /^[A-Z]/.test(cleaned)) {
            if (!blacklist.has(cleaned)) competitors.add(cleaned);
          }
        });
      }
    }
  }

  // Also look for capitalized words/phrases that might be brand names
  const capitalizedPattern = /\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)\b/g;
  const capitalizedMatches = Array.from(text.matchAll(capitalizedPattern));
  for (const match of capitalizedMatches) {
    const word = match[1];
    // Filter out common words that are capitalized at sentence start
    const excludeWords = new Set([
      "The", "This", "These", "That", "They", "Their", "There",
      "However", "Moreover", "Furthermore", "Therefore", "Meanwhile",
      "While", "When", "Where", "Which", "What", "Who", "Why",
    ]);
    
    if (!excludeWords.has(word) && !blacklist.has(word) && word.length > 2 && word.length < 30) {
      competitors.add(word);
    }
  }

  return Array.from(competitors);
}

// ===========================================
// Verification Logic
// ===========================================

/**
 * Verify competitors using LLM
 */
export async function verifyCompetitors(
  input: VerifyCompetitorsInput
): Promise<VerifiedCompetitorInsights> {
  const { competitorInsightsText, brandName, brandDomain, brandDescription, brandIndustry, brandProducts } = input;
  
  // Early return if no insights
  if (!competitorInsightsText || competitorInsightsText.trim() === "") {
    return {
      originalInsights: "",
      verifiedCompetitors: [],
      filteredCompetitors: [],
      summary: "No competitor insights provided",
      verificationTimestamp: new Date().toISOString(),
    };
  }

  // Extract potential competitor names
  const potentialCompetitors = extractPotentialCompetitors(competitorInsightsText);
  
  if (potentialCompetitors.length === 0) {
    return {
      originalInsights: competitorInsightsText,
      verifiedCompetitors: [],
      filteredCompetitors: [],
      summary: "No specific competitors identified in the insights",
      verificationTimestamp: new Date().toISOString(),
    };
  }

  // Build context for verification
  const brandContext = [
    brandDescription ? `Description: ${brandDescription}` : null,
    brandIndustry ? `Industry: ${brandIndustry}` : null,
    brandProducts?.length ? `Products/Services: ${brandProducts.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const systemPrompt = `You are a competitive intelligence analyst. Your job is to verify if mentioned companies are actual competitors to a given brand.

${UNTRUSTED_CONTENT_POLICY}

For each potential competitor, determine:
1. If they operate in the same market space
2. If they target similar customers
3. If they offer competing products/services
4. Their relationship type: "direct_competitor", "indirect_competitor", or "not_competitor"

Be STRICT:
- Only mark as competitors if they offer the same category of product/service AND target the same buyer.
- If you are not confident, mark as "not_competitor" or "unknown".
- Avoid generic category words (e.g., "Solar", "Installation") as competitors.
- Prefer fewer, higher-confidence competitors over a long list.`;

  const userPrompt = `## Brand to Analyze
Name: ${brandName}
${brandDomain ? `Domain: ${brandDomain}` : ""}
${brandContext}

## Potential Competitors to Verify
${potentialCompetitors.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Original Competitor Insights
${competitorInsightsText}

For each potential competitor, provide your analysis in this exact JSON format:
{
  "verified_competitors": [
    {
      "name": "Company Name",
      "is_verified": true/false,
      "relevance_score": 0-10,
      "relationship": "direct_competitor|indirect_competitor|not_competitor|unknown",
      "reasoning": "Brief explanation",
      "market_overlap": ["shared market 1", "shared market 2"]
    }
  ],
  "summary": "Overall summary of competitive landscape"
}`;

  try {
    const { response } = await callOpenAIResponses({
      client: openai,
      provider: "openai",
      model: OPENAI_CHAT_MODEL,
      timeoutMs: LLM_TIMEOUTS_MS.selectionSignals,
      request: {
        model: OPENAI_CHAT_MODEL,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_output_tokens: 2000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as Record<string, any>,
    });

    const content = extractOpenAIResponsesText(response);
    
    if (!content) {
      console.warn("[CompetitorVerifier] Empty response from LLM");
      return createFallbackResult(competitorInsightsText, potentialCompetitors);
    }

    // Parse JSON response
    let parsed;
    try {
      // Find JSON in response
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.warn("[CompetitorVerifier] JSON parse error:", parseError);
      return createFallbackResult(competitorInsightsText, potentialCompetitors);
    }

    // Process verified competitors (strict post-filter)
    const verifiedCompetitors: CompetitorInsight[] = [];
    const filteredCompetitors: string[] = [];

    if (Array.isArray(parsed.verified_competitors)) {
      for (const comp of parsed.verified_competitors) {
        const insight: CompetitorInsight = {
          name: comp.name || "",
          isVerified: Boolean(comp.is_verified),
          relevanceScore: Math.min(10, Math.max(0, Number(comp.relevance_score) || 0)),
          relationship: validateRelationship(comp.relationship),
          reasoning: String(comp.reasoning || ""),
          marketOverlap: Array.isArray(comp.market_overlap) ? comp.market_overlap : undefined,
        };

        const passesStrictFilter =
          insight.isVerified &&
          insight.relationship === "direct_competitor" &&
          insight.relevanceScore >= 7;

        if (passesStrictFilter) {
          verifiedCompetitors.push(insight);
        } else {
          filteredCompetitors.push(insight.name);
        }
      }
    }

    console.log(`[CompetitorVerifier] Verified ${verifiedCompetitors.length} competitors, filtered ${filteredCompetitors.length}`);

    // If nothing passes strict verification, return a safe summary.
    if (verifiedCompetitors.length === 0) {
      return {
        originalInsights: competitorInsightsText,
        verifiedCompetitors: [],
        filteredCompetitors,
        summary: "No verified competitors identified with high confidence.",
        verificationTimestamp: new Date().toISOString(),
      };
    }

    return {
      originalInsights: competitorInsightsText,
      verifiedCompetitors,
      filteredCompetitors,
      summary: String(parsed.summary || "Competitor analysis complete"),
      verificationTimestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[CompetitorVerifier] Verification failed:", error);
    return createFallbackResult(competitorInsightsText, potentialCompetitors);
  }
}

// ===========================================
// Helper Functions
// ===========================================

function validateRelationship(rel: unknown): CompetitorInsight["relationship"] {
  const valid: CompetitorInsight["relationship"][] = ["direct_competitor", "indirect_competitor", "not_competitor", "unknown"];
  return valid.includes(rel as CompetitorInsight["relationship"]) 
    ? (rel as CompetitorInsight["relationship"]) 
    : "unknown";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createFallbackResult(originalInsights: string, potentialCompetitors: string[]): VerifiedCompetitorInsights {
  return {
    originalInsights,
    // IMPORTANT: don't present unverified competitors as "verified"
    verifiedCompetitors: [],
    filteredCompetitors: [],
    summary: "Competitor verification incomplete - using unverified insights",
    verificationTimestamp: new Date().toISOString(),
  };
}

/**
 * Quick check if competitor insights likely contain actual competitors
 * Can be used as a pre-filter before full verification
 */
export function hasLikelyCompetitors(text: string): boolean {
  if (!text) return false;
  
  const competitorKeywords = [
    "competitor", "competing", "alternative", "versus", "vs", 
    "compared to", "similar to", "rivals", "market leader",
  ];
  
  const lowerText = text.toLowerCase();
  return competitorKeywords.some(kw => lowerText.includes(kw));
}

