/**
 * Conversational Journey Tracking
 * 
 * Users rarely stop at one prompt - they "chain" queries.
 * This module simulates follow-up chains to prove "stickiness":
 * - Turn 1: "Best digital agencies Dubai" -> (Brand Mentioned?)
 * - Turn 2: "Which of these is the most affordable?" -> (Brand Mentioned?)
 * - Turn 3: "Do they have Arabic support?" -> (Hallucination Check)
 * 
 * Being mentioned in Turn 1 is useless if you're filtered out in Turn 2.
 */

import type {
  ConversationalJourney,
  ConversationalTurn,
  SupportedEngine,
  SupportedLanguage,
  SupportedRegion,
} from "@/types";
import { runSimulation } from "./factory";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { quickSentimentCheck } from "./sentiment-analyzer";

// Common follow-up prompt templates
const FOLLOW_UP_TEMPLATES = {
  affordability: [
    "Which of these is the most affordable?",
    "What are the pricing options for each?",
    "Which one offers the best value for money?",
  ],
  features: [
    "Which has the best features?",
    "What features does each offer?",
    "Compare the key features of these options",
  ],
  support: [
    "Do they offer Arabic support?",
    "Which has 24/7 customer support?",
    "What support options are available?",
  ],
  reviews: [
    "What do customers say about each?",
    "Which has the best reviews?",
    "Are there any complaints about these?",
  ],
  recommendation: [
    "Which would you recommend for a small business?",
    "Which is best for enterprise clients?",
    "If you had to choose one, which would it be?",
  ],
  local: [
    "Which are based in the UAE?",
    "Do they have local offices?",
    "Which has experience with Arabic markets?",
  ],
};

interface JourneyConfig {
  brand_name: string;
  brand_domain: string;
  brand_aliases?: string[];
  competitor_names?: string[];
  engine: SupportedEngine;
  language: SupportedLanguage;
  region?: SupportedRegion;
  initial_prompt: string;
  follow_up_types?: Array<keyof typeof FOLLOW_UP_TEMPLATES>;
  max_turns?: number;
}

/**
 * Run a full conversational journey simulation
 */
export async function runConversationalJourney(
  config: JourneyConfig
): Promise<ConversationalJourney> {
  const {
    brand_name,
    brand_domain,
    brand_aliases = [],
    competitor_names = [],
    engine,
    language,
    region = "global",
    initial_prompt,
    follow_up_types = ["affordability", "features", "recommendation"],
    max_turns = 4,
  } = config;

  const journey_id = `journey_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const turns: ConversationalTurn[] = [];
  
  console.log(`[Journey] Starting ${max_turns}-turn journey for "${brand_name}" on ${engine}`);

  // Track context from previous turns (for follow-ups that reference "these")
  let lastMentionedBrands: string[] = [];
  let brandEverMentioned = false;
  let dropOffTurn: number | undefined;

  // Turn 1: Initial prompt
  const turn1Result = await runTurn({
    turn_number: 1,
    prompt: initial_prompt,
    engine,
    language,
    region,
    brand_name,
    brand_domain,
    brand_aliases,
    competitor_names,
  });
  
  turns.push(turn1Result);
  
  if (turn1Result.brand_mentioned) {
    brandEverMentioned = true;
    lastMentionedBrands.push(brand_name);
  }
  lastMentionedBrands.push(...(turn1Result.competitors_mentioned || []));

  // Generate follow-up turns
  for (let i = 1; i < max_turns && i < follow_up_types.length + 1; i++) {
    const followUpType = follow_up_types[i - 1] || "recommendation";
    const templates = FOLLOW_UP_TEMPLATES[followUpType];
    const followUpPrompt = templates[Math.floor(Math.random() * templates.length)];

    // If brand was mentioned before but not in this turn, it might be filtered
    const turnResult = await runTurn({
      turn_number: i + 1,
      prompt: followUpPrompt,
      engine,
      language,
      region,
      brand_name,
      brand_domain,
      brand_aliases,
      competitor_names,
      context: lastMentionedBrands, // Pass context for follow-up understanding
    });

    turns.push(turnResult);

    // Track if brand was filtered out
    if (brandEverMentioned && !turnResult.brand_mentioned && !dropOffTurn) {
      dropOffTurn = i + 1;
      console.log(`[Journey] Brand filtered out at turn ${dropOffTurn}`);
    }

    // Update tracking
    if (turnResult.brand_mentioned) {
      brandEverMentioned = true;
    }
    
    // Update mentioned brands for next turn context
    const turnMentions = turnResult.competitors_mentioned || [];
    if (turnResult.brand_mentioned) {
      turnMentions.push(brand_name);
    }
    if (turnMentions.length > 0) {
      lastMentionedBrands = turnMentions;
    }
  }

  // Calculate stickiness score
  const stickinessScore = calculateStickinessScore(turns, brandEverMentioned, dropOffTurn);

  // Determine final outcome
  let finalOutcome: 'recommended' | 'filtered_out' | 'not_mentioned' = 'not_mentioned';
  if (brandEverMentioned) {
    if (dropOffTurn && dropOffTurn < turns.length) {
      finalOutcome = 'filtered_out';
    } else if (turns[turns.length - 1]?.brand_mentioned) {
      finalOutcome = 'recommended';
    } else {
      finalOutcome = 'filtered_out';
    }
  }

  console.log(`[Journey] Complete. Stickiness: ${stickinessScore}%, Outcome: ${finalOutcome}`);

  return {
    journey_id,
    brand_id: "", // Will be filled by caller
    turns,
    total_turns: turns.length,
    final_outcome: finalOutcome,
    stickiness_score: stickinessScore,
    drop_off_turn: dropOffTurn,
  };
}

interface TurnConfig {
  turn_number: number;
  prompt: string;
  engine: SupportedEngine;
  language: SupportedLanguage;
  region: SupportedRegion;
  brand_name: string;
  brand_domain: string;
  brand_aliases: string[];
  competitor_names: string[];
  context?: string[];
}

async function runTurn(config: TurnConfig): Promise<ConversationalTurn> {
  const {
    turn_number,
    prompt,
    engine,
    language,
    region,
    brand_name,
    brand_domain,
    brand_aliases,
    competitor_names,
  } = config;

  console.log(`[Journey] Turn ${turn_number}: "${prompt}"`);

  try {
    const result = await runSimulation({
      engine,
      keyword: prompt,
      language,
      region,
      brand_domain,
    });

    const responseLC = result.answer_html.toLowerCase();
    const brandLC = brand_name.toLowerCase();
    const domainLC = brand_domain.toLowerCase().replace(/\.(com|co|net|org|io).*$/, "");

    // Check if brand is mentioned
    let brandMentioned = responseLC.includes(brandLC) || responseLC.includes(domainLC);
    
    // Check aliases
    if (!brandMentioned) {
      for (const alias of brand_aliases) {
        if (alias.length > 2 && responseLC.includes(alias.toLowerCase())) {
          brandMentioned = true;
          break;
        }
      }
    }

    // Check competitors
    const competitorsMentioned: string[] = [];
    for (const competitor of competitor_names) {
      if (competitor.length > 2 && responseLC.includes(competitor.toLowerCase())) {
        competitorsMentioned.push(competitor);
      }
    }

    // Determine brand position if mentioned
    let brandPosition: number | undefined;
    if (brandMentioned) {
      brandPosition = calculateBrandPosition(result.answer_html, brand_name, brand_aliases, competitor_names);
    }

    // Determine outcome
    let outcome: 'mentioned' | 'filtered' | 'not_applicable' = 'not_applicable';
    if (turn_number === 1) {
      outcome = brandMentioned ? 'mentioned' : 'filtered';
    } else {
      // For follow-up turns, check if brand was filtered from consideration
      outcome = brandMentioned ? 'mentioned' : 'filtered';
    }

    return {
      turn_number,
      prompt,
      brand_mentioned: brandMentioned,
      brand_position: brandPosition,
      competitors_mentioned: competitorsMentioned,
      outcome,
    };
  } catch (error) {
    console.error(`[Journey] Turn ${turn_number} failed:`, error);
    return {
      turn_number,
      prompt,
      brand_mentioned: false,
      competitors_mentioned: [],
      outcome: 'not_applicable',
    };
  }
}

/**
 * Calculate brand's position in a list of options
 */
function calculateBrandPosition(
  response: string,
  brandName: string,
  aliases: string[],
  competitors: string[]
): number {
  const allBrands = [brandName, ...competitors];
  const positions: Array<{ name: string; index: number }> = [];

  for (const brand of allBrands) {
    const pattern = new RegExp(`\\b${escapeRegex(brand)}\\b`, "i");
    const match = pattern.exec(response);
    if (match) {
      positions.push({ name: brand, index: match.index });
    }
  }

  // Check aliases too
  for (const alias of aliases) {
    if (alias.length < 3) continue;
    const pattern = new RegExp(`\\b${escapeRegex(alias)}\\b`, "i");
    const match = pattern.exec(response);
    if (match && !positions.some(p => p.name === brandName)) {
      positions.push({ name: brandName, index: match.index });
    }
  }

  // Sort by position in text
  positions.sort((a, b) => a.index - b.index);

  // Find brand's rank
  const brandRank = positions.findIndex(p => 
    p.name.toLowerCase() === brandName.toLowerCase() ||
    aliases.some(a => a.toLowerCase() === p.name.toLowerCase())
  );

  return brandRank >= 0 ? brandRank + 1 : -1;
}

/**
 * Calculate stickiness score (0-100)
 * Measures how well the brand persists through the conversation
 */
function calculateStickinessScore(
  turns: ConversationalTurn[],
  brandEverMentioned: boolean,
  dropOffTurn?: number
): number {
  if (!brandEverMentioned) {
    return 0;
  }

  const totalTurns = turns.length;
  
  // Count turns where brand was mentioned
  const mentionedTurns = turns.filter(t => t.brand_mentioned).length;
  
  // Base score: percentage of turns with mentions
  let score = (mentionedTurns / totalTurns) * 100;

  // Bonus for being mentioned in first turn
  if (turns[0]?.brand_mentioned) {
    score += 10;
  }

  // Bonus for being mentioned in last turn (final recommendation)
  if (turns[turns.length - 1]?.brand_mentioned) {
    score += 15;
  }

  // Penalty for dropping off early
  if (dropOffTurn && dropOffTurn <= 2) {
    score -= 20;
  }

  // Bonus for good positions
  const avgPosition = turns
    .filter(t => t.brand_position && t.brand_position > 0)
    .reduce((sum, t) => sum + (t.brand_position || 0), 0) / mentionedTurns;
  
  if (avgPosition === 1) {
    score += 10; // Always first
  } else if (avgPosition <= 2) {
    score += 5; // Usually in top 2
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generate suggested follow-up prompts based on initial prompt
 */
export function suggestFollowUpPrompts(initialPrompt: string): string[] {
  const suggestions: string[] = [];
  const promptLC = initialPrompt.toLowerCase();

  // Detect prompt intent and suggest relevant follow-ups
  if (promptLC.includes("best") || promptLC.includes("top")) {
    suggestions.push(...FOLLOW_UP_TEMPLATES.affordability);
    suggestions.push(...FOLLOW_UP_TEMPLATES.reviews);
  }

  if (promptLC.includes("agency") || promptLC.includes("company") || promptLC.includes("firm")) {
    suggestions.push(...FOLLOW_UP_TEMPLATES.support);
    suggestions.push(...FOLLOW_UP_TEMPLATES.recommendation);
  }

  if (promptLC.includes("dubai") || promptLC.includes("uae") || promptLC.includes("saudi")) {
    suggestions.push(...FOLLOW_UP_TEMPLATES.local);
  }

  // Always include recommendation
  suggestions.push(...FOLLOW_UP_TEMPLATES.recommendation);

  // Deduplicate and limit
  return Array.from(new Set(suggestions)).slice(0, 6);
}

