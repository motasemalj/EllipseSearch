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
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai-config";

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
  crawled_pages: { url: string; title: string; excerpt: string }[];
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
  analysis_notes: string[];
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
}

// ===========================================
// Ground Truth Extraction
// ===========================================

/**
 * Extract structured ground truth data from crawled pages
 * This runs during the crawl job to pre-process the data
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
Return valid JSON only.`;

  const userPrompt = `Extract structured data from this website content:

${combinedContent}

Return JSON with this structure:
{
  "pricing": [{ "plan_name": "...", "price": "...", "features": ["..."], "is_free": true/false }],
  "features": ["feature1", "feature2"],
  "products": ["product1", "product2"],
  "services": ["service1", "service2"],
  "company_description": "One paragraph description",
  "tagline": "Main tagline if found",
  "locations": ["location1"],
  "certifications": ["cert1"],
  "faq_content": ["Q: question A: answer"]
}

Only include fields where you found real data. Use empty arrays if not found.`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response");

    const extracted = JSON.parse(content);

    return {
      ...extracted,
      raw_content: combinedContent,
      crawled_pages: crawledPages.map(p => ({
        url: p.url,
        title: p.title,
        excerpt: p.markdown?.slice(0, 500) || "",
      })),
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

  // Build ground truth summary for comparison
  const groundTruthSummary = buildGroundTruthSummary(groundTruth);
  
  if (!groundTruthSummary || groundTruthSummary.length < 100) {
    return {
      has_hallucinations: false,
      hallucinations: [],
      accuracy_score: 50, // Unknown accuracy without ground truth
      confidence: "low",
      analysis_notes: ["Insufficient ground truth data for comparison"],
    };
  }

  const systemPrompt = `You are a hallucination detection expert. Your job is to compare AI-generated claims about a brand against verified ground truth from the brand's website.

IMPORTANT DEFINITIONS:
- POSITIVE HALLUCINATION: AI claims something that isn't true (e.g., "has free plan" when no free plan exists)
- NEGATIVE HALLUCINATION: AI says "I don't know" or refuses to answer when the information IS available
- MISATTRIBUTION: AI attributes wrong products, services, or features to the brand
- OUTDATED: AI uses information that contradicts current website content

Be thorough but fair. Only flag clear discrepancies, not minor wording differences.`;

  const userPrompt = `Analyze this AI response about "${brandName}" (${brandDomain}) for hallucinations:

**AI RESPONSE:**
${aiResponse.slice(0, 3000)}

**GROUND TRUTH (from website crawl - this is the authoritative source):**
${groundTruthSummary}

---

Compare the AI response against the ground truth and return JSON:
{
  "has_hallucinations": true/false,
  "accuracy_score": 0-100,
  "confidence": "high"/"medium"/"low",
  "hallucinations": [
    {
      "type": "positive"/"negative"/"misattribution"/"outdated",
      "severity": "critical"/"major"/"minor",
      "claim": "What the AI said (exact quote if possible)",
      "reality": "What the ground truth shows",
      "affected_element": "Which website element needs fixing (e.g., 'H1 tag', 'pricing page', 'meta description')",
      "specific_fix": "Exact actionable fix (e.g., 'Change H1 from X to Y')"
    }
  ],
  "analysis_notes": ["note1", "note2"]
}

SEVERITY GUIDE:
- critical: Core business info wrong (pricing, main product category)
- major: Important feature or service misrepresented
- minor: Small detail inaccurate`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from hallucination detection");

    const result = JSON.parse(content);

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

    return {
      has_hallucinations: result.has_hallucinations || hallucinations.length > 0,
      hallucinations,
      accuracy_score: result.accuracy_score ?? 75,
      confidence: result.confidence || "medium",
      analysis_notes: [...analysisNotes, ...(result.analysis_notes || [])],
    };
  } catch (error) {
    console.error("[Hallucination] Detection failed:", error);
    return {
      has_hallucinations: false,
      hallucinations: [],
      accuracy_score: 50,
      confidence: "low",
      analysis_notes: ["Hallucination analysis could not be completed"],
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


