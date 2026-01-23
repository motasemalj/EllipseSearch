/**
 * Brand Extractor - Dedicated Brand Detection Pass
 * 
 * CRITICAL FOR ACCURACY: This module separates "answer generation" from "brand detection"
 * to optimize for HIGH RECALL in brand identification.
 * 
 * Key insight: A missed brand creates "false flags" for users. The solution is:
 * 1. Extract brands from the model answer text (MENTIONED brands)
 * 2. Extract brands from web search sources (SUPPORTED brands)
 * 3. Use Structured Outputs to ensure consistent, parseable results
 * 
 * The web search docs note that:
 * - Inline citations show only the most relevant references
 * - The sources field is the complete list of URLs consulted
 * So we use SOURCES as the recall backbone.
 */

import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai-config";
import type { 
  SourceReference, 
  SupportedEngine,
} from "@/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===========================================
// Types for Brand Extraction
// ===========================================

export interface MentionedBrand {
  name: string;
  canonical_domain?: string;
  evidence: {
    answer_spans: string[];  // Text snippets where brand is mentioned
    citations: string[];      // URLs that cite this brand
  };
  confidence: "high" | "medium" | "low";
  mention_type: "explicit" | "partial" | "fuzzy";
}

export interface SupportedBrand {
  name: string;
  canonical_domain?: string;
  evidence: {
    source_urls: string[];    // URLs from sources that support this brand
  };
  confidence: "high" | "medium" | "low";
}

export interface BrandExtractionResult {
  mentioned_brands: MentionedBrand[];
  supported_brands: SupportedBrand[];
  uncertainty_notes: string[];
  // Aggregated brand list with deduplication
  all_brands: ExtractedBrand[];
  // Source analysis
  source_analysis: {
    total_sources: number;
    unique_domains: string[];
    brand_source_map: Record<string, string[]>;
  };
}

export interface ExtractedBrand {
  name: string;
  normalized_name: string;  // Lowercase, trimmed
  domain?: string;
  is_mentioned: boolean;    // Found in answer text
  is_supported: boolean;    // Found in sources
  mention_count: number;    // How many times mentioned in answer
  source_count: number;     // How many sources support this brand
  confidence: "high" | "medium" | "low";
  evidence_summary: string;
}

// ===========================================
// JSON Schema for Structured Outputs
// ===========================================

const BRAND_EXTRACTION_SCHEMA = {
  name: "brand_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      mentioned_brands: {
        type: "array",
        description: "Brands explicitly mentioned or strongly implied in the answer text",
        items: {
          type: "object",
          properties: {
            name: { 
              type: "string", 
              description: "Brand name as mentioned (e.g., 'Apple', 'DAMAC Properties')" 
            },
            canonical_domain: { 
              type: ["string", "null"], 
              description: "The brand's main website domain if known (e.g., 'apple.com')" 
            },
            answer_spans: {
              type: "array",
              items: { type: "string" },
              description: "Exact text snippets from the answer where this brand appears"
            },
            citation_urls: {
              type: "array",
              items: { type: "string" },
              description: "URLs from citations that reference this brand"
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "How confident we are this brand is correctly identified"
            },
            mention_type: {
              type: "string",
              enum: ["explicit", "partial", "fuzzy"],
              description: "explicit=exact name match, partial=shortened/abbreviated, fuzzy=implied"
            }
          },
          required: ["name", "canonical_domain", "answer_spans", "citation_urls", "confidence", "mention_type"],
          additionalProperties: false
        }
      },
      supported_brands: {
        type: "array",
        description: "Brands implied by sources even if not explicitly mentioned in the answer",
        items: {
          type: "object",
          properties: {
            name: { 
              type: "string", 
              description: "Brand name inferred from sources" 
            },
            canonical_domain: { 
              type: ["string", "null"], 
              description: "The brand's main website domain" 
            },
            source_urls: {
              type: "array",
              items: { type: "string" },
              description: "URLs from sources that support this brand"
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"]
            }
          },
          required: ["name", "canonical_domain", "source_urls", "confidence"],
          additionalProperties: false
        }
      },
      uncertainty_notes: {
        type: "array",
        items: { type: "string" },
        description: "Any ambiguities or uncertainties in brand identification"
      }
    },
    required: ["mentioned_brands", "supported_brands", "uncertainty_notes"],
    additionalProperties: false
  }
} as const;

// ===========================================
// Domain to Brand Name Mapping
// ===========================================

// Common marketplace/review domains to exclude from brand candidates
const MARKETPLACE_DOMAINS = new Set([
  'amazon.com', 'amazon.ae', 'amazon.co.uk', 'amazon.de',
  'ebay.com', 'walmart.com', 'target.com',
  'noon.com', 'namshi.com', 'souq.com',
  'alibaba.com', 'aliexpress.com',
  'etsy.com', 'shopify.com',
]);

const REVIEW_AGGREGATOR_DOMAINS = new Set([
  'g2.com', 'capterra.com', 'trustradius.com', 'softwareadvice.com',
  'trustpilot.com', 'yelp.com', 'tripadvisor.com',
  'glassdoor.com', 'indeed.com',
  'clutch.co', 'goodfirms.co',
  'bayut.com', 'propertyfinder.ae', 'dubizzle.com',
]);

const GENERIC_DOMAINS = new Set([
  'wikipedia.org', 'youtube.com', 'reddit.com', 'quora.com',
  'medium.com', 'linkedin.com', 'twitter.com', 'x.com',
  'facebook.com', 'instagram.com', 'tiktok.com',
  'google.com', 'bing.com', 'yahoo.com',
  'bbc.com', 'cnn.com', 'reuters.com', 'bloomberg.com',
]);

/**
 * Extract registrable domain from URL
 */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. prefix
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Infer brand name from domain
 */
function domainToBrandName(domain: string): string | null {
  // Skip marketplace/review/generic domains
  if (MARKETPLACE_DOMAINS.has(domain) || 
      REVIEW_AGGREGATOR_DOMAINS.has(domain) || 
      GENERIC_DOMAINS.has(domain)) {
    return null;
  }
  
  // Extract the main part of the domain (before TLD)
  const parts = domain.split('.');
  if (parts.length < 2) return null;
  
  // Get the second-level domain (e.g., "apple" from "apple.com")
  const brandPart = parts[parts.length - 2];
  
  // Skip if too short or generic
  if (brandPart.length < 3) return null;
  if (['www', 'blog', 'shop', 'store', 'app', 'api', 'dev'].includes(brandPart)) {
    return null;
  }
  
  // Convert to title case for brand name
  return brandPart.charAt(0).toUpperCase() + brandPart.slice(1).toLowerCase();
}

// ===========================================
// Brand Extraction Function
// ===========================================

export interface ExtractBrandsInput {
  answer_text: string;
  sources: SourceReference[];
  search_results?: Array<{ url: string; title: string; snippet: string }>;
  target_brand?: {
    name: string;
    domain: string;
    aliases: string[];
  };
  engine: SupportedEngine;
}

/**
 * Extract brands from AI response using Structured Outputs
 * 
 * This is a DEDICATED PASS for brand detection, separate from answer generation.
 * Optimized for HIGH RECALL to minimize false negatives.
 */
export async function extractBrands(input: ExtractBrandsInput): Promise<BrandExtractionResult> {
  const { answer_text, sources, search_results, target_brand, engine } = input;
  
  // 1. Build candidate brand set from sources
  const candidateBrands = new Map<string, string[]>(); // domain -> urls
  const uniqueDomains: string[] = [];
  
  for (const source of sources) {
    const domain = extractDomain(source.url);
    if (!domain) continue;
    
    if (!candidateBrands.has(domain)) {
      candidateBrands.set(domain, []);
      uniqueDomains.push(domain);
    }
    candidateBrands.get(domain)!.push(source.url);
  }
  
  // Add search results to candidates
  if (search_results) {
    for (const result of search_results) {
      const domain = extractDomain(result.url);
      if (!domain) continue;
      
      if (!candidateBrands.has(domain)) {
        candidateBrands.set(domain, []);
        uniqueDomains.push(domain);
      }
      candidateBrands.get(domain)!.push(result.url);
    }
  }
  
  // 2. Convert domains to potential brand names
  const brandCandidateList: string[] = [];
  for (const domain of uniqueDomains) {
    const brandName = domainToBrandName(domain);
    if (brandName) {
      brandCandidateList.push(`${brandName} (${domain})`);
    }
  }
  
  // Add target brand if specified
  if (target_brand) {
    brandCandidateList.unshift(`${target_brand.name} (${target_brand.domain}) [TARGET]`);
    if (target_brand.aliases.length > 0) {
      brandCandidateList.push(`  Aliases: ${target_brand.aliases.join(', ')}`);
    }
  }
  
  // 3. Prepare sources summary for the extraction prompt
  const sourcesSummary = sources.slice(0, 30).map((s, i) => {
    const domain = extractDomain(s.url);
    return `[${i + 1}] ${domain}: ${s.title || s.url}`;
  }).join('\n');
  
  // 4. Run Structured Output extraction
  const systemPrompt = `You are a brand/company extraction specialist. Your job is to identify ALL brands and companies mentioned or implied in AI responses.

CRITICAL: Err on the side of OVER-DETECTION. A missed brand is worse than a false positive.

Your task:
1. Extract brands MENTIONED in the answer text (even partial/abbreviated references)
2. Extract brands SUPPORTED by the sources (brands whose websites appear in sources)
3. Note any ambiguities or uncertainties

Brand candidate domains found in sources:
${brandCandidateList.join('\n')}

RULES:
- Include the target brand if it's mentioned AT ALL, even vaguely
- Include brands that are implied but not explicitly named
- Include brands whose official websites appear in sources, even if not mentioned in text
- DO NOT include generic marketplaces (Amazon, eBay, etc.) as brands
- DO NOT include review sites (G2, Trustpilot, etc.) as brands
- DO include the actual companies/products being reviewed on those sites`;

  const userPrompt = `Extract all brands from this ${engine} AI response:

=== AI ANSWER ===
${answer_text}

=== SOURCES CONSULTED ===
${sourcesSummary}

Extract:
1. mentioned_brands: Brands in the answer text
2. supported_brands: Brands implied by sources but not mentioned
3. uncertainty_notes: Any ambiguities`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: BRAND_EXTRACTION_SCHEMA,
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from brand extractor");
    }

    const parsed = JSON.parse(content) as {
      mentioned_brands: Array<{
        name: string;
        canonical_domain: string | null;
        answer_spans: string[];
        citation_urls: string[];
        confidence: "high" | "medium" | "low";
        mention_type: "explicit" | "partial" | "fuzzy";
      }>;
      supported_brands: Array<{
        name: string;
        canonical_domain: string | null;
        source_urls: string[];
        confidence: "high" | "medium" | "low";
      }>;
      uncertainty_notes: string[];
    };

    // 5. Aggregate and deduplicate brands
    const allBrands = aggregateBrands(parsed, candidateBrands);

    return {
      mentioned_brands: parsed.mentioned_brands.map(b => ({
        name: b.name,
        canonical_domain: b.canonical_domain || undefined,
        evidence: {
          answer_spans: b.answer_spans,
          citations: b.citation_urls,
        },
        confidence: b.confidence,
        mention_type: b.mention_type,
      })),
      supported_brands: parsed.supported_brands.map(b => ({
        name: b.name,
        canonical_domain: b.canonical_domain || undefined,
        evidence: {
          source_urls: b.source_urls,
        },
        confidence: b.confidence,
      })),
      uncertainty_notes: parsed.uncertainty_notes,
      all_brands: allBrands,
      source_analysis: {
        total_sources: sources.length,
        unique_domains: uniqueDomains,
        brand_source_map: Object.fromEntries(candidateBrands),
      },
    };

  } catch (error) {
    console.error("[BrandExtractor] Error:", error);
    
    // Fallback: Simple pattern matching
    return fallbackBrandExtraction(input);
  }
}

/**
 * Aggregate and deduplicate brands from extraction result
 */
function aggregateBrands(
  parsed: {
    mentioned_brands: Array<{
      name: string;
      canonical_domain: string | null;
      answer_spans: string[];
      citation_urls: string[];
      confidence: "high" | "medium" | "low";
      mention_type: "explicit" | "partial" | "fuzzy";
    }>;
    supported_brands: Array<{
      name: string;
      canonical_domain: string | null;
      source_urls: string[];
      confidence: "high" | "medium" | "low";
    }>;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _candidateBrands: Map<string, string[]>
): ExtractedBrand[] {
  const brandMap = new Map<string, ExtractedBrand>();

  // Process mentioned brands
  for (const brand of parsed.mentioned_brands) {
    const normalizedName = brand.name.toLowerCase().trim();
    
    if (!brandMap.has(normalizedName)) {
      brandMap.set(normalizedName, {
        name: brand.name,
        normalized_name: normalizedName,
        domain: brand.canonical_domain || undefined,
        is_mentioned: true,
        is_supported: false,
        mention_count: brand.answer_spans.length,
        source_count: brand.citation_urls.length,
        confidence: brand.confidence,
        evidence_summary: `Mentioned ${brand.answer_spans.length}x in answer`,
      });
    } else {
      const existing = brandMap.get(normalizedName)!;
      existing.is_mentioned = true;
      existing.mention_count += brand.answer_spans.length;
      existing.source_count += brand.citation_urls.length;
    }
  }

  // Process supported brands
  for (const brand of parsed.supported_brands) {
    const normalizedName = brand.name.toLowerCase().trim();
    
    if (!brandMap.has(normalizedName)) {
      brandMap.set(normalizedName, {
        name: brand.name,
        normalized_name: normalizedName,
        domain: brand.canonical_domain || undefined,
        is_mentioned: false,
        is_supported: true,
        mention_count: 0,
        source_count: brand.source_urls.length,
        confidence: brand.confidence,
        evidence_summary: `Supported by ${brand.source_urls.length} sources`,
      });
    } else {
      const existing = brandMap.get(normalizedName)!;
      existing.is_supported = true;
      existing.source_count += brand.source_urls.length;
      // Upgrade evidence summary
      existing.evidence_summary = `Mentioned ${existing.mention_count}x, ${existing.source_count} sources`;
    }
  }

  // Sort by confidence and mention count
  return Array.from(brandMap.values()).sort((a, b) => {
    const confOrder = { high: 3, medium: 2, low: 1 };
    const confDiff = confOrder[b.confidence] - confOrder[a.confidence];
    if (confDiff !== 0) return confDiff;
    return (b.mention_count + b.source_count) - (a.mention_count + a.source_count);
  });
}

/**
 * Fallback brand extraction using simple pattern matching
 */
function fallbackBrandExtraction(input: ExtractBrandsInput): BrandExtractionResult {
  const { answer_text, sources, target_brand } = input;
  const mentionedBrands: MentionedBrand[] = [];
  const supportedBrands: SupportedBrand[] = [];
  
  // Check for target brand
  if (target_brand) {
    const answerLower = answer_text.toLowerCase();
    const brandLower = target_brand.name.toLowerCase();
    const domainLower = target_brand.domain.toLowerCase().replace(/^www\./, '');
    
    const isMentioned = 
      answerLower.includes(brandLower) ||
      answerLower.includes(domainLower) ||
      target_brand.aliases.some(a => answerLower.includes(a.toLowerCase()));
    
    if (isMentioned) {
      mentionedBrands.push({
        name: target_brand.name,
        canonical_domain: target_brand.domain,
        evidence: {
          answer_spans: [`Found in answer text`],
          citations: [],
        },
        confidence: "medium",
        mention_type: "partial",
      });
    }
    
    // Check sources for target brand domain
    const brandSources = sources.filter(s => {
      const domain = extractDomain(s.url);
      return domain.includes(domainLower);
    });
    
    if (brandSources.length > 0) {
      supportedBrands.push({
        name: target_brand.name,
        canonical_domain: target_brand.domain,
        evidence: {
          source_urls: brandSources.map(s => s.url),
        },
        confidence: "high",
      });
    }
  }
  
  // Extract unique domains from sources
  const uniqueDomains: string[] = [];
  const brandSourceMap: Record<string, string[]> = {};
  
  for (const source of sources) {
    const domain = extractDomain(source.url);
    if (!domain) continue;
    
    if (!brandSourceMap[domain]) {
      brandSourceMap[domain] = [];
      uniqueDomains.push(domain);
    }
    brandSourceMap[domain].push(source.url);
  }

  return {
    mentioned_brands: mentionedBrands,
    supported_brands: supportedBrands,
    uncertainty_notes: ["Using fallback extraction - results may be incomplete"],
    all_brands: aggregateBrands(
      {
        mentioned_brands: mentionedBrands.map(b => ({
          name: b.name,
          canonical_domain: b.canonical_domain || null,
          answer_spans: b.evidence.answer_spans,
          citation_urls: b.evidence.citations,
          confidence: b.confidence,
          mention_type: b.mention_type,
        })),
        supported_brands: supportedBrands.map(b => ({
          name: b.name,
          canonical_domain: b.canonical_domain || null,
          source_urls: b.evidence.source_urls,
          confidence: b.confidence,
        })),
      },
      new Map(Object.entries(brandSourceMap))
    ),
    source_analysis: {
      total_sources: sources.length,
      unique_domains: uniqueDomains,
      brand_source_map: brandSourceMap,
    },
  };
}

// ===========================================
// Target Brand Visibility Check
// ===========================================

export interface BrandVisibilityResult {
  is_visible: boolean;
  visibility_type: "mentioned" | "supported" | "absent";
  confidence: "high" | "medium" | "low";
  mention_count: number;
  source_count: number;
  evidence: string[];
}

/**
 * Check if a specific target brand is visible in the extracted brands
 */
export function checkBrandVisibility(
  extractionResult: BrandExtractionResult,
  targetBrand: { name: string; domain: string; aliases: string[] }
): BrandVisibilityResult {
  const targetNormalized = targetBrand.name.toLowerCase().trim();
  const targetDomainNormalized = targetBrand.domain.toLowerCase().replace(/^www\./, '');
  const aliasesNormalized = targetBrand.aliases.map(a => a.toLowerCase().trim());
  
  // Find matching brand in all_brands
  const matchingBrand = extractionResult.all_brands.find(b => {
    const nameMatch = 
      b.normalized_name === targetNormalized ||
      b.normalized_name.includes(targetNormalized) ||
      targetNormalized.includes(b.normalized_name) ||
      aliasesNormalized.some(a => b.normalized_name.includes(a) || a.includes(b.normalized_name));
    
    const domainMatch = b.domain && (
      b.domain.toLowerCase().includes(targetDomainNormalized) ||
      targetDomainNormalized.includes(b.domain.toLowerCase())
    );
    
    return nameMatch || domainMatch;
  });
  
  if (!matchingBrand) {
    // Check if any sources contain the brand domain
    const brandInSources = extractionResult.source_analysis.unique_domains.some(
      d => d.includes(targetDomainNormalized) || targetDomainNormalized.includes(d)
    );
    
    return {
      is_visible: brandInSources,
      visibility_type: brandInSources ? "supported" : "absent",
      confidence: brandInSources ? "low" : "high",
      mention_count: 0,
      source_count: brandInSources ? 1 : 0,
      evidence: brandInSources 
        ? ["Brand domain found in sources but not in answer"] 
        : ["Brand not found in answer or sources"],
    };
  }
  
  const evidence: string[] = [];
  if (matchingBrand.is_mentioned) {
    evidence.push(`Mentioned ${matchingBrand.mention_count}x in answer`);
  }
  if (matchingBrand.is_supported) {
    evidence.push(`Supported by ${matchingBrand.source_count} source(s)`);
  }
  
  return {
    is_visible: true,
    visibility_type: matchingBrand.is_mentioned ? "mentioned" : "supported",
    confidence: matchingBrand.confidence,
    mention_count: matchingBrand.mention_count,
    source_count: matchingBrand.source_count,
    evidence,
  };
}

