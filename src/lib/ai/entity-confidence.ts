/**
 * Entity Confidence Score Module
 * 
 * Verifies if a brand is a recognized Entity in the Knowledge Graph.
 * LLMs rely on Knowledge Graphs to "understand" brands - if you're not
 * an Entity, LLMs treat your brand as just a text string.
 * 
 * Uses Google Knowledge Graph API for entity verification.
 */

import type { EntityConfidence } from "@/types";

const KNOWLEDGE_GRAPH_API_KEY = process.env.GOOGLE_KNOWLEDGE_GRAPH_API_KEY;
const KNOWLEDGE_GRAPH_ENDPOINT = "https://kgsearch.googleapis.com/v1/entities:search";

// Common platforms that should have "sameAs" links for entity recognition
const RECOMMENDED_PLATFORMS = [
  { name: "Wikipedia", domain: "wikipedia.org", importance: "critical" },
  { name: "Crunchbase", domain: "crunchbase.com", importance: "high" },
  { name: "LinkedIn", domain: "linkedin.com", importance: "high" },
  { name: "Wikidata", domain: "wikidata.org", importance: "critical" },
  { name: "Facebook", domain: "facebook.com", importance: "medium" },
  { name: "Twitter/X", domain: "twitter.com", importance: "medium" },
  { name: "YouTube", domain: "youtube.com", importance: "medium" },
  { name: "Apple Maps", domain: "maps.apple.com", importance: "medium" },
  { name: "Google Business", domain: "google.com/business", importance: "high" },
];

interface KGSearchResult {
  "@type": string;
  result: {
    "@id": string;
    "@type": string[];
    name: string;
    description?: string;
    detailedDescription?: {
      articleBody: string;
      url: string;
    };
    url?: string;
    image?: {
      contentUrl: string;
    };
  };
  resultScore: number;
}

interface KGSearchResponse {
  itemListElement: KGSearchResult[];
}

/**
 * Check if a brand is a recognized entity in Google's Knowledge Graph
 */
export async function checkEntityConfidence(
  brandName: string,
  brandDomain: string,
  brandAliases: string[] = []
): Promise<EntityConfidence> {
  // Check if API key is available
  if (!KNOWLEDGE_GRAPH_API_KEY) {
    console.log("[EntityConfidence] No Knowledge Graph API key configured");
    return createFallbackResult(brandName);
  }

  try {
    // Search for the brand in Knowledge Graph
    const searchParams = new URLSearchParams({
      query: brandName,
      key: KNOWLEDGE_GRAPH_API_KEY,
      limit: "5",
      languages: "en",
    });

    const response = await fetch(`${KNOWLEDGE_GRAPH_ENDPOINT}?${searchParams}`);
    
    if (!response.ok) {
      throw new Error(`Knowledge Graph API error: ${response.status}`);
    }

    const data: KGSearchResponse = await response.json();
    
    if (!data.itemListElement || data.itemListElement.length === 0) {
      // No entity found - brand is not recognized
      return createNotRecognizedResult(brandName, brandDomain);
    }

    // Find the best matching entity
    const bestMatch = findBestMatch(data.itemListElement, brandName, brandDomain, brandAliases);
    
    if (!bestMatch) {
      return createNotRecognizedResult(brandName, brandDomain);
    }

    // Extract entity details
    const entityId = bestMatch.result["@id"];
    const entityTypes = bestMatch.result["@type"] || [];
    const description = bestMatch.result.description || 
                       bestMatch.result.detailedDescription?.articleBody || "";
    
    // Check for same_as links (from detailed description URL)
    const sameAsLinks: string[] = [];
    if (bestMatch.result.url) {
      sameAsLinks.push(bestMatch.result.url);
    }
    if (bestMatch.result.detailedDescription?.url) {
      sameAsLinks.push(bestMatch.result.detailedDescription.url);
    }

    // Determine which platforms are missing
    const missingLinks = getMissingPlatforms(sameAsLinks);

    // Calculate confidence score based on result score and entity completeness
    const confidenceScore = calculateConfidenceScore(bestMatch, sameAsLinks.length);

    console.log(`[EntityConfidence] Found entity: ${bestMatch.result.name} (${entityId}) with score ${confidenceScore}`);

    return {
      is_recognized_entity: true,
      entity_id: entityId,
      entity_type: entityTypes[0] || "Thing",
      entity_description: description.slice(0, 500),
      confidence_score: confidenceScore,
      same_as_links: sameAsLinks,
      missing_links: missingLinks,
      recommendation: generateRecommendation(confidenceScore, missingLinks),
    };
  } catch (error) {
    console.error("[EntityConfidence] Error checking entity:", error);
    return createFallbackResult(brandName);
  }
}

/**
 * Find the best matching entity from search results
 */
function findBestMatch(
  results: KGSearchResult[],
  brandName: string,
  brandDomain: string,
  brandAliases: string[]
): KGSearchResult | null {
  const brandNameLower = brandName.toLowerCase();
  const domainParts = brandDomain.toLowerCase().replace(/\.(com|co|net|org|io).*$/, "").split(".");
  const mainDomainPart = domainParts[domainParts.length - 1];

  // Score each result based on relevance
  let bestMatch: KGSearchResult | null = null;
  let bestScore = 0;

  for (const result of results) {
    const entityName = result.result.name?.toLowerCase() || "";
    const entityUrl = result.result.url?.toLowerCase() || "";
    const resultScore = result.resultScore || 0;
    
    let matchScore = resultScore;

    // Boost score for exact name match
    if (entityName === brandNameLower) {
      matchScore += 100;
    } else if (entityName.includes(brandNameLower) || brandNameLower.includes(entityName)) {
      matchScore += 50;
    }

    // Boost for domain match
    if (entityUrl.includes(mainDomainPart)) {
      matchScore += 75;
    }

    // Boost for alias match
    for (const alias of brandAliases) {
      if (entityName.includes(alias.toLowerCase())) {
        matchScore += 25;
      }
    }

    // Check entity type - prefer Organization/Corporation/Company
    const types = result.result["@type"] || [];
    if (types.some(t => ["Organization", "Corporation", "Company", "LocalBusiness"].includes(t))) {
      matchScore += 30;
    }

    if (matchScore > bestScore) {
      bestScore = matchScore;
      bestMatch = result;
    }
  }

  // Only return if score is above threshold
  return bestScore > 50 ? bestMatch : null;
}

/**
 * Calculate confidence score (0-100)
 */
function calculateConfidenceScore(match: KGSearchResult, linkCount: number): number {
  let score = 0;

  // Base score from Knowledge Graph result score (0-1000 typically)
  score += Math.min(40, (match.resultScore || 0) / 25);

  // Bonus for having a description
  if (match.result.description) {
    score += 15;
  }

  // Bonus for detailed description
  if (match.result.detailedDescription?.articleBody) {
    score += 15;
  }

  // Bonus for having an image
  if (match.result.image?.contentUrl) {
    score += 10;
  }

  // Bonus for same_as links
  score += Math.min(20, linkCount * 5);

  return Math.min(100, Math.round(score));
}

/**
 * Get list of recommended platforms that are missing
 */
function getMissingPlatforms(existingLinks: string[]): string[] {
  const existingLower = existingLinks.map(l => l.toLowerCase());
  
  return RECOMMENDED_PLATFORMS
    .filter(platform => 
      !existingLower.some(link => link.includes(platform.domain))
    )
    .filter(platform => platform.importance === "critical" || platform.importance === "high")
    .map(platform => platform.name);
}

/**
 * Generate actionable recommendation
 */
function generateRecommendation(score: number, missingLinks: string[]): string {
  if (score >= 80) {
    return "Your brand is well-recognized as an Entity. Continue maintaining your presence on authoritative platforms.";
  }
  
  if (score >= 50) {
    if (missingLinks.length > 0) {
      return `Strengthen your Entity status by adding SameAs Schema markup linking to: ${missingLinks.slice(0, 3).join(", ")}. This helps AI understand your brand as a factual concept.`;
    }
    return "Your brand is moderately recognized. Add more third-party authoritative mentions to improve Entity recognition.";
  }

  if (score > 0) {
    return `Your brand has weak Entity recognition. Priority actions: 1) Create/update Wikipedia article, 2) Ensure Crunchbase profile is complete, 3) Add sameAs Schema markup linking all official profiles.`;
  }

  return `Your brand is NOT recognized as an Entity in the Knowledge Graph. AI treats it as just text, not a factual concept. Immediate actions needed: Create authoritative profiles on Wikipedia, Crunchbase, and LinkedIn. Add Organization Schema with sameAs links.`;
}

/**
 * Create result for unrecognized entities
 */
function createNotRecognizedResult(brandName: string, brandDomain: string): EntityConfidence {
  return {
    is_recognized_entity: false,
    entity_id: undefined,
    entity_type: undefined,
    entity_description: undefined,
    confidence_score: 0,
    same_as_links: [],
    missing_links: RECOMMENDED_PLATFORMS
      .filter(p => p.importance === "critical" || p.importance === "high")
      .map(p => p.name),
    recommendation: `Your brand "${brandName}" is NOT recognized as an Entity in Google's Knowledge Graph. AI models treat it as just a text string, not a factual concept. Critical action: Create Wikipedia article, complete Crunchbase profile, and add Organization Schema with sameAs links to ${brandDomain}.`,
  };
}

/**
 * Create fallback result when API is unavailable
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createFallbackResult(brandName: string): EntityConfidence {
  return {
    is_recognized_entity: false,
    entity_id: undefined,
    entity_type: undefined,
    entity_description: undefined,
    confidence_score: -1, // -1 indicates unknown
    same_as_links: [],
    missing_links: [],
    recommendation: "Entity verification unavailable. Configure GOOGLE_KNOWLEDGE_GRAPH_API_KEY to enable entity recognition checking.",
  };
}

/**
 * Generate Schema.org JSON-LD for improving entity recognition
 */
export function generateEntitySchema(
  brandName: string,
  brandDomain: string,
  description?: string,
  sameAsLinks?: string[]
): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": brandName,
    "url": `https://${brandDomain}`,
    "description": description || `${brandName} - Official Website`,
    "sameAs": sameAsLinks || [],
  };

  return JSON.stringify(schema, null, 2);
}

