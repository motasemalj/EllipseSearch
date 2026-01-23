/**
 * Enhanced Sentiment Analysis Module
 * 
 * Goes beyond simple positive/neutral/negative to provide:
 * - Net Sentiment Score (NSS) for precise measurement
 * - Key phrase extraction with sentiment labels
 * - Concerns and praises identification
 * - Sentiment polarity tracking for "mentioned but negatively" detection
 */

import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai-config";
import type { SentimentAnalysis, Sentiment } from "@/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Perform deep sentiment analysis on AI response about a brand
 */
export async function analyzeSentiment(
  aiResponse: string,
  brandName: string,
  brandDomain: string
): Promise<SentimentAnalysis> {
  // Quick check - if brand not mentioned, return neutral
  const responseLC = aiResponse.toLowerCase();
  const brandLC = brandName.toLowerCase();
  const domainLC = brandDomain.toLowerCase().replace(/\.(com|co|net|org|io).*$/, "");
  
  if (!responseLC.includes(brandLC) && !responseLC.includes(domainLC)) {
    return createNotMentionedResult();
  }

  try {
    const result = await performAISentimentAnalysis(aiResponse, brandName);
    return result;
  } catch (error) {
    console.error("[Sentiment] Analysis failed:", error);
    return createFallbackResult(aiResponse);
  }
}

async function performAISentimentAnalysis(
  aiResponse: string,
  brandName: string
): Promise<SentimentAnalysis> {
  const systemPrompt = `You are a sentiment analysis expert. Analyze how a brand is portrayed in AI-generated content.

Focus on:
1. Overall sentiment polarity (-1 to 1 scale)
2. Key phrases that convey sentiment
3. Specific concerns or negatives mentioned
4. Specific praises or positives mentioned
5. Whether being mentioned is actually GOOD (positive portrayal) or BAD (negative context)

Return valid JSON only.`;

  const userPrompt = `Analyze the sentiment toward "${brandName}" in this AI response:

"""
${aiResponse.slice(0, 4000)}
"""

Return JSON:
{
  "polarity": -1 to 1 (where -1 is very negative, 0 is neutral, 1 is very positive),
  "confidence": 0 to 1 (how confident in the assessment),
  "label": "positive" | "neutral" | "negative",
  "key_phrases": [
    { "text": "exact quote from text", "sentiment": "positive|neutral|negative", "intensity": 0-1 }
  ],
  "concerns": ["list of negative aspects mentioned about the brand"],
  "praises": ["list of positive aspects mentioned about the brand"],
  "context_quality": "The mention is in a [favorable/neutral/unfavorable] context because..."
}

IMPORTANT:
- A brand can be "mentioned" but in a NEGATIVE context (e.g., "avoid Brand X due to high fees")
- Look for qualifiers like "however", "but", "although" that might negate positive mentions
- Consider comparative context (is brand presented as worse than alternatives?)`;

  const response = await openai.chat.completions.create({
    model: OPENAI_CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 800,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from sentiment analysis");
  }

  const parsed = JSON.parse(content);

  // Calculate Net Sentiment Score (0-100 scale for UI)
  // Shift polarity from [-1, 1] to [0, 100]
  const netSentimentScore = Math.round((parsed.polarity + 1) * 50);

  return {
    polarity: parsed.polarity ?? 0,
    label: validateLabel(parsed.label),
    confidence: parsed.confidence ?? 0.5,
    key_phrases: (parsed.key_phrases || []).map((kp: { text?: string; sentiment?: string; intensity?: number }) => ({
      text: kp.text || "",
      sentiment: validateLabel(kp.sentiment),
      intensity: kp.intensity ?? 0.5,
    })),
    concerns: parsed.concerns || [],
    praises: parsed.praises || [],
    net_sentiment_score: netSentimentScore,
  };
}

/**
 * Quick sentiment check without AI (for filtering)
 */
export function quickSentimentCheck(text: string): { label: Sentiment; score: number } {
  const textLC = text.toLowerCase();
  
  // Positive indicators
  const positivePatterns = [
    /\b(best|top|leading|excellent|outstanding|recommended|trusted|premier|award|innovative)\b/gi,
    /\b(highly\s+rated|well\s+known|popular\s+choice|go-to|favorite)\b/gi,
  ];
  
  // Negative indicators
  const negativePatterns = [
    /\b(avoid|expensive|overpriced|poor|bad|worst|disappointing|frustrating|complaint|issue|problem)\b/gi,
    /\b(not\s+recommended|limited|lacking|beware|caution|warning)\b/gi,
    /\b(however|but|although|despite).*\b(expensive|slow|difficult|confusing|limited)\b/gi,
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const pattern of positivePatterns) {
    const matches = textLC.match(pattern);
    positiveCount += matches?.length || 0;
  }

  for (const pattern of negativePatterns) {
    const matches = textLC.match(pattern);
    negativeCount += matches?.length || 0;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) {
    return { label: "neutral", score: 50 };
  }

  const score = Math.round(((positiveCount - negativeCount) / total + 1) * 50);
  const label: Sentiment = score > 60 ? "positive" : score < 40 ? "negative" : "neutral";

  return { label, score };
}

/**
 * Detect if brand mention is in a negative comparative context
 */
export function detectNegativeContext(text: string, brandName: string): {
  isNegative: boolean;
  reason?: string;
  excerpt?: string;
} {
  const textLC = text.toLowerCase();
  const brandLC = brandName.toLowerCase();
  
  // Find brand mention position
  const brandIndex = textLC.indexOf(brandLC);
  if (brandIndex === -1) {
    return { isNegative: false };
  }

  // Get context around brand mention (200 chars before and after)
  const contextStart = Math.max(0, brandIndex - 200);
  const contextEnd = Math.min(text.length, brandIndex + brandName.length + 200);
  const context = text.slice(contextStart, contextEnd).toLowerCase();

  // Check for negative comparative patterns
  const negativePatterns = [
    { pattern: /more\s+expensive\s+than/i, reason: "Mentioned as more expensive" },
    { pattern: /not\s+as\s+good\s+as/i, reason: "Compared unfavorably" },
    { pattern: /avoid|skip|steer\s+clear/i, reason: "Explicitly advised against" },
    { pattern: /complaints?\s+about|issues?\s+with/i, reason: "Associated with complaints" },
    { pattern: /however|but\s+.*\b(expensive|slow|limited|poor)\b/i, reason: "Qualified with negatives" },
    { pattern: /alternatives?\s+to\s+(?=.*\b${brandLC}\b)/i, reason: "Listed as something to find alternatives for" },
  ];

  for (const { pattern, reason } of negativePatterns) {
    if (pattern.test(context)) {
      return {
        isNegative: true,
        reason,
        excerpt: text.slice(contextStart, contextEnd).trim(),
      };
    }
  }

  return { isNegative: false };
}

function validateLabel(value: unknown): Sentiment {
  if (value === "positive" || value === "neutral" || value === "negative") {
    return value;
  }
  return "neutral";
}

function createNotMentionedResult(): SentimentAnalysis {
  return {
    polarity: 0,
    label: "neutral",
    confidence: 1,
    key_phrases: [],
    concerns: [],
    praises: [],
    net_sentiment_score: 50,
  };
}

function createFallbackResult(text: string): SentimentAnalysis {
  const quick = quickSentimentCheck(text);
  return {
    polarity: (quick.score - 50) / 50,
    label: quick.label,
    confidence: 0.3,
    key_phrases: [],
    concerns: [],
    praises: [],
    net_sentiment_score: quick.score,
  };
}

