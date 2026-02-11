/**
 * Sentiment Analysis Module - Production Grade
 *
 * This is the SINGLE SOURCE OF TRUTH for sentiment analysis.
 * All sentiment calculations should use this module.
 *
 * Uses a hybrid approach:
 * 1. Lexicon-based analysis for quick checks (500+ words per category)
 * 2. LLM-based deep analysis for nuanced understanding
 *
 * Features:
 * - N-gram phrase detection
 * - Negation handling
 * - Intensity modifiers
 * - Industry-specific terms
 * - Comparative context detection
 */

import OpenAI from "openai";
import type { SentimentAnalysis } from "@/types";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai-config";
import { UNTRUSTED_CONTENT_POLICY, JSON_ONLY_POLICY } from "@/lib/ai/prompt-policies";
import { callOpenAIResponses, extractOpenAIResponsesText } from "@/lib/ai/llm-runtime";
import { LLM_TIMEOUTS_MS } from "@/lib/ai/openai-timeouts";
import { SentimentAnalysisSchema } from "@/lib/schemas/llm";
import {
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
  NEGATION_WORDS,
  INTENSITY_AMPLIFIERS,
  INTENSITY_DIMINISHERS,
  POSITIVE_PHRASES,
  NEGATIVE_PHRASES,
  calculateDetailedSentiment,
} from "@/lib/ai/sentiment-lexicon";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===========================================
// Lexicon-Based Analysis (Fast)
// ===========================================

/**
 * Quick sentiment check using lexicon analysis.
 * Use this for fast preliminary checks without API calls.
 */
export function quickSentimentCheck(text: string): {
  score: number;
  label: "positive" | "neutral" | "negative";
  confidence: number;
  signals: string[];
} {
  const result = calculateDetailedSentiment(text);
  
  let label: "positive" | "neutral" | "negative";
  if (result.score > 0.15) {
    label = "positive";
  } else if (result.score < -0.15) {
    label = "negative";
  } else {
    label = "neutral";
  }
  
  const signals: string[] = [];
  if (result.positive_phrases.length > 0) {
    signals.push(`Positive phrases: ${result.positive_phrases.slice(0, 3).join(", ")}`);
  }
  if (result.negative_phrases.length > 0) {
    signals.push(`Negative phrases: ${result.negative_phrases.slice(0, 3).join(", ")}`);
  }
  if (result.positive_count > result.negative_count) {
    signals.push(`${result.positive_count} positive vs ${result.negative_count} negative terms`);
  } else if (result.negative_count > result.positive_count) {
    signals.push(`${result.negative_count} negative vs ${result.positive_count} positive terms`);
  }
  
  return {
    score: result.score,
    label,
    confidence: result.confidence,
    signals,
  };
}

/**
 * Detect negative comparative context (e.g., "better than X", "unlike X").
 * Returns true if the brand is being compared unfavorably.
 */
export function detectNegativeComparativeContext(
  text: string,
  brandName: string
): {
  hasNegativeContext: boolean;
  patterns: string[];
} {
  const lowerText = text.toLowerCase();
  const lowerBrand = brandName.toLowerCase();
  const patterns: string[] = [];
  
  // Patterns that suggest unfavorable comparison
  const negativePatterns = [
    { pattern: `better than ${lowerBrand}`, description: "Competitor compared favorably" },
    { pattern: `unlike ${lowerBrand}`, description: "Negative distinction made" },
    { pattern: `compared to ${lowerBrand}`, description: "Comparison context (check sentiment)" },
    { pattern: `not like ${lowerBrand}`, description: "Negative distinction" },
    { pattern: `instead of ${lowerBrand}`, description: "Alternative preference" },
    { pattern: `rather than ${lowerBrand}`, description: "Alternative preference" },
    { pattern: `over ${lowerBrand}`, description: "Preference expressed" },
    { pattern: `${lowerBrand} lacks`, description: "Feature gap noted" },
    { pattern: `${lowerBrand} doesn't`, description: "Capability gap noted" },
    { pattern: `${lowerBrand} fails`, description: "Failure noted" },
    { pattern: `${lowerBrand} struggles`, description: "Difficulty noted" },
    { pattern: `problems with ${lowerBrand}`, description: "Issues noted" },
    { pattern: `issues with ${lowerBrand}`, description: "Issues noted" },
    { pattern: `${lowerBrand} is expensive`, description: "Price criticism" },
    { pattern: `${lowerBrand} is overpriced`, description: "Price criticism" },
  ];
  
  for (const { pattern, description } of negativePatterns) {
    if (lowerText.includes(pattern)) {
      patterns.push(description);
    }
  }
  
  return {
    hasNegativeContext: patterns.length > 0,
    patterns,
  };
}

// ===========================================
// LLM-Based Deep Analysis
// ===========================================

/**
 * Deep sentiment analysis using LLM.
 * This is the primary analysis method for production use.
 */
export async function analyzeSentiment(
  answerText: string,
  brandName: string
): Promise<SentimentAnalysis> {
  // First, do a quick lexicon-based check
  const quickCheck = quickSentimentCheck(answerText);
  const comparativeContext = detectNegativeComparativeContext(answerText, brandName);
  
  const systemPrompt = `You are a sentiment analysis expert specializing in brand perception.
Analyze the AI response about "${brandName}" for sentiment.

Focus on:
1. Overall sentiment toward the brand (polarity: -1 to 1)
2. Confidence level (0 to 1)
3. Key phrases that indicate sentiment
4. Specific concerns mentioned about the brand
5. Specific praises mentioned about the brand
6. Context quality (how well the response represents the brand)

IMPORTANT:
- Be objective - don't assume positive sentiment
- Look for subtle negative indicators (comparisons, qualifications, warnings)
- Identify both explicit and implicit sentiment
- Consider comparative context (is brand being compared unfavorably?)

${UNTRUSTED_CONTENT_POLICY}
${JSON_ONLY_POLICY}`;

  // Truncate more aggressively to prevent token exhaustion
  const truncatedText = answerText.slice(0, 2500);
  const userPrompt = `Analyze sentiment about "${brandName}" in this AI response:

"""
${truncatedText}
"""${answerText.length > 2500 ? "\n[Text truncated for analysis...]" : ""}

Quick lexicon analysis suggests: ${quickCheck.label} (score: ${quickCheck.score.toFixed(2)}, confidence: ${quickCheck.confidence.toFixed(2)})
${quickCheck.signals.length > 0 ? `Signals: ${quickCheck.signals.join("; ")}` : ""}
${comparativeContext.hasNegativeContext ? `⚠️ Negative comparative context detected: ${comparativeContext.patterns.join("; ")}` : ""}

Provide deep sentiment analysis in JSON format:
{
  "polarity": <number -1 to 1>,
  "confidence": <number 0 to 1>,
  "label": "positive" | "neutral" | "negative",
  "key_phrases": [
    {"text": "<phrase>", "sentiment": "positive"|"neutral"|"negative", "intensity": <0-1>}
  ],
  "concerns": ["<concern 1>", "<concern 2>"],
  "praises": ["<praise 1>", "<praise 2>"],
  "context_quality": "<assessment of how well the response represents the brand>"
}`;

  // Structured output schema
  const sentimentSchema = {
    type: "json_schema",
    name: "sentiment_analysis",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["polarity", "confidence", "label", "key_phrases", "concerns", "praises", "context_quality"],
      properties: {
        polarity: { type: "number", minimum: -1, maximum: 1 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        label: { type: "string", enum: ["positive", "neutral", "negative"] },
        key_phrases: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "sentiment", "intensity"],
            properties: {
              text: { type: "string", maxLength: 200 },
              sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
              intensity: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
        concerns: {
          type: "array",
          maxItems: 10,
          items: { type: "string", maxLength: 200 },
        },
        praises: {
          type: "array",
          maxItems: 10,
          items: { type: "string", maxLength: 200 },
        },
        context_quality: { type: "string", maxLength: 500 },
      },
    },
  } as const;

  try {
    const { response } = await callOpenAIResponses({
      client: openai,
      provider: "openai",
      model: OPENAI_CHAT_MODEL,
      timeoutMs: LLM_TIMEOUTS_MS.sentiment,
      request: {
        model: OPENAI_CHAT_MODEL,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        // Skip reasoning to save tokens - sentiment analysis doesn't need reasoning
        text: { 
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          format: sentimentSchema as Record<string, unknown>,
        },
        max_output_tokens: 2500, // Increased buffer for structured output
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as Record<string, unknown>,
    });

    const content = extractOpenAIResponsesText(response);
    if (!content) {
      console.error("[Sentiment] Empty response, using lexicon fallback");
      return createFallbackSentiment(quickCheck, brandName);
    }

    // Attempt to parse JSON with error handling for malformed responses
    let rawResult;
    try {
      rawResult = JSON.parse(content);
    } catch (parseError) {
      console.error("[Sentiment] JSON parse error, attempting recovery:", parseError);
      
      // Multiple recovery attempts
      const recoveryStrategies = [
        // Strategy 1: Extract JSON between first { and last }
        () => {
          const jsonStart = content.indexOf("{");
          const jsonEnd = content.lastIndexOf("}");
          if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) return null;
          return content.slice(jsonStart, jsonEnd + 1);
        },
        // Strategy 2: If there are nested objects, try to find complete JSON
        () => {
          const match = content.match(/\{[\s\S]*"polarity"[\s\S]*"confidence"[\s\S]*\}/);
          return match ? match[0] : null;
        },
      ];
      
      for (const strategy of recoveryStrategies) {
        const extracted = strategy();
        if (!extracted) continue;
        
        try {
          let cleanedContent = extracted
            // Fix common JSON issues
            .replace(/,\s*}/g, "}") // Remove trailing commas before }
            .replace(/,\s*]/g, "]") // Remove trailing commas before ]
            .replace(/[\x00-\x1F\x7F]/g, " ") // Remove control characters
            .replace(/\n/g, " ") // Remove newlines
            .replace(/\r/g, " ") // Remove carriage returns
            .replace(/"\s*:\s*"[^"]*$/g, '": ""') // Fix unterminated strings at end
            .replace(/,\s*"[^"]+"\s*:\s*"[^"]*$/g, "") // Remove incomplete key-value pairs
            .replace(/,\s*"[^"]+"\s*:\s*$/g, "") // Remove key without value
            .replace(/,\s*$/g, ""); // Remove trailing comma
          
          // Fix unterminated arrays in key_phrases, concerns, praises
          const arrayFields = ["key_phrases", "concerns", "praises"];
          for (const field of arrayFields) {
            // Check if array is unterminated
            const fieldMatch = cleanedContent.match(new RegExp(`"${field}"\\s*:\\s*\\[([^\\]]*)$`));
            if (fieldMatch) {
              // Close the array
              cleanedContent = cleanedContent.replace(
                new RegExp(`"${field}"\\s*:\\s*\\[([^\\]]*)$`),
                `"${field}": []`
              );
            }
          }
          
          rawResult = JSON.parse(cleanedContent);
          console.log("[Sentiment] Successfully recovered JSON with strategy");
          break;
        } catch {
          continue;
        }
      }
      
      if (!rawResult) {
        console.error("[Sentiment] All JSON recovery strategies failed, using fallback");
        return createFallbackSentiment(quickCheck, brandName);
      }
    }
    const result = SentimentAnalysisSchema.parse(rawResult);

    // Calculate net sentiment score (combines polarity with concerns/praises)
    // NORMALIZED TO 0-100 SCALE for UI display
    const praiseScore = result.praises?.length || 0;
    const concernScore = result.concerns?.length || 0;
    const netAdjustment = (praiseScore - concernScore) * 0.05;
    const adjustedPolarity = Math.max(-1, Math.min(1, result.polarity + netAdjustment));
    // Convert -1 to +1 scale to 0 to 100 scale: (polarity + 1) / 2 * 100
    const netSentimentScore = Math.round(((adjustedPolarity + 1) / 2) * 100);

    // Detect negative comparative context
    const comparativeCheck = detectNegativeComparativeContext(answerText, brandName);
    let finalPolarity = result.polarity;
    if (comparativeCheck.hasNegativeContext && result.polarity > -0.2) {
      // Adjust polarity down if negative comparisons detected but not reflected in score
      finalPolarity = Math.max(-1, result.polarity - 0.2);
    }

    return {
      polarity: finalPolarity,
      confidence: result.confidence,
      label: result.label,
      key_phrases: result.key_phrases || [],
      concerns: result.concerns || [],
      praises: result.praises || [],
      context_quality: result.context_quality,
      net_sentiment_score: netSentimentScore,
    };
  } catch (error) {
    console.error("[Sentiment] Analysis failed:", error);
    return createFallbackSentiment(quickCheck, brandName);
  }
}

/**
 * Create fallback sentiment from lexicon analysis when LLM fails.
 */
function createFallbackSentiment(
  quickCheck: ReturnType<typeof quickSentimentCheck>,
  brandName: string
): SentimentAnalysis {
  // Convert -1 to +1 polarity score to 0-100 scale for net_sentiment_score
  const netSentimentScore = Math.round(((quickCheck.score + 1) / 2) * 100);
  
  return {
    polarity: quickCheck.score,
    confidence: quickCheck.confidence * 0.7, // Lower confidence for fallback
    label: quickCheck.label,
    key_phrases: quickCheck.signals.map(s => ({
      text: s,
      sentiment: quickCheck.label,
      intensity: 0.5,
    })),
    concerns: quickCheck.label === "negative" ? [`Potential issues with ${brandName}`] : [],
    praises: quickCheck.label === "positive" ? [`Positive mentions of ${brandName}`] : [],
    context_quality: "Analysis based on lexicon (LLM unavailable)",
    net_sentiment_score: netSentimentScore, // 0-100 scale
  };
}

// ===========================================
// Brand-Specific Sentiment Analysis
// ===========================================

/**
 * Analyze sentiment specifically for brand visibility context.
 * Includes additional checks for comparative contexts and competitive mentions.
 */
export async function analyzeBrandSentiment(
  answerText: string,
  brandName: string,
  brandDomain: string,
  competitorNames: string[] = []
): Promise<SentimentAnalysis & {
  competitor_context?: {
    has_competitor_mentions: boolean;
    competitors_mentioned: string[];
    brand_position: "favorable" | "neutral" | "unfavorable";
  };
}> {
  // Base sentiment analysis
  const sentiment = await analyzeSentiment(answerText, brandName);
  
  // Check for competitor mentions
  const lowerText = answerText.toLowerCase();
  const mentionedCompetitors = competitorNames.filter(
    comp => lowerText.includes(comp.toLowerCase())
  );
  
  let brandPosition: "favorable" | "neutral" | "unfavorable" = "neutral";
  
  if (mentionedCompetitors.length > 0) {
    // Check comparative context
    const brandMentionIndex = lowerText.indexOf(brandName.toLowerCase());
    
    for (const competitor of mentionedCompetitors) {
      const compIndex = lowerText.indexOf(competitor.toLowerCase());
      const nearbyText = lowerText.slice(
        Math.max(0, Math.min(brandMentionIndex, compIndex) - 50),
        Math.max(brandMentionIndex, compIndex) + 50
      );
      
      // Check for positive comparison indicators
      if (nearbyText.includes("better than") || nearbyText.includes("superior to")) {
        if (brandMentionIndex < compIndex) {
          brandPosition = "favorable";
        } else {
          brandPosition = "unfavorable";
        }
        break;
      }
      
      // Check for negative comparison indicators
      if (nearbyText.includes("unlike") || nearbyText.includes("compared to")) {
        brandPosition = "neutral"; // Ambiguous comparison
      }
    }
  }
  
  return {
    ...sentiment,
    competitor_context: mentionedCompetitors.length > 0 ? {
      has_competitor_mentions: true,
      competitors_mentioned: mentionedCompetitors,
      brand_position: brandPosition,
    } : undefined,
  };
}

// ===========================================
// Utility Exports
// ===========================================

export {
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
  NEGATION_WORDS,
  INTENSITY_AMPLIFIERS,
  INTENSITY_DIMINISHERS,
  POSITIVE_PHRASES,
  NEGATIVE_PHRASES,
  calculateDetailedSentiment,
};
