/**
 * Citation Authority Scoring
 * 
 * Uses proper eTLD+1 domain extraction for accurate matching.
 * Scores sources based on authority, type, and brand relevance.
 */

import type { CitationAuthority } from "@/types";
import {
  extractRegistrableDomain,
  extractDomainCore,
  isBrandDomainMatch as domainMatch,
  canonicalizeUrl,
} from "@/lib/ai/domain-utils";

// ===========================================
// Authority Domain Lists
// ===========================================

// Encyclopedias & References - Highest authority
const AUTHORITATIVE_DOMAINS = new Set([
  "wikipedia.org",
  "britannica.com",
  "merriam-webster.com",
  // Major News Agencies
  "reuters.com",
  "apnews.com",
  "afp.com",
  // Top-tier News
  "bbc.com",
  "bbc.co.uk",
  "nytimes.com",
  "wsj.com",
  "ft.com",
  "economist.com",
  "theguardian.com",
  "washingtonpost.com",
  "cnn.com",
  "npr.org",
  // Business/Finance
  "forbes.com",
  "bloomberg.com",
  "cnbc.com",
  "marketwatch.com",
  "investopedia.com",
  // Tech
  "techcrunch.com",
  "wired.com",
  "theverge.com",
  "arstechnica.com",
  "zdnet.com",
  "cnet.com",
  "engadget.com",
  "thenextweb.com",
  // Academic
  "harvard.edu",
  "mit.edu",
  "stanford.edu",
  "oxford.ac.uk",
  "cambridge.org",
  // UAE/GCC Specific
  "gulfnews.com",
  "khaleejtimes.com",
  "thenationalnews.com",
  "arabianbusiness.com",
  "zawya.com",
  "argaam.com",
  "albawaba.com",
]);

const HIGH_AUTHORITY_DOMAINS = new Set([
  // Professional Networks & B2B
  "linkedin.com",
  "crunchbase.com",
  "pitchbook.com",
  // Software Reviews
  "g2.com",
  "capterra.com",
  "softwareadvice.com",
  "trustradius.com",
  "getapp.com",
  // Business Reviews
  "trustpilot.com",
  "glassdoor.com",
  "clutch.co",
  "goodfirms.co",
  // Consumer Reviews
  "yelp.com",
  "tripadvisor.com",
  "booking.com",
  "hotels.com",
  // Blogging Platforms (can have high-quality content)
  "medium.com",
  "substack.com",
  "dev.to",
  // Industry Specific
  "hubspot.com",
  "salesforce.com",
  "shopify.com",
  "zendesk.com",
  // Regional (UAE/GCC)
  "bayut.com",
  "propertyfinder.ae",
  "dubizzle.com",
  // E-commerce
  "amazon.com",
  "amazon.ae",
  "noon.com",
]);

const LOWER_AUTHORITY_DOMAINS = new Set([
  "reddit.com",
  "quora.com",
  "answers.yahoo.com",
  "pinterest.com",
  "tumblr.com",
  "blogspot.com",
  "wordpress.com",
  "weebly.com",
  "wix.com",
]);

// ===========================================
// Domain Extraction (now using eTLD+1)
// ===========================================

/**
 * Extract registrable domain from URL using eTLD+1.
 * @deprecated Use extractRegistrableDomain from domain-utils.ts
 */
export function extractDomainFromUrl(url: string): string {
  return extractRegistrableDomain(url);
}

/**
 * Normalize domain for comparison.
 * @deprecated Use extractRegistrableDomain from domain-utils.ts
 */
export function normalizeDomain(domain: string): string {
  return extractRegistrableDomain(domain);
}

/**
 * Extract domain core (without TLD) for fuzzy matching.
 * @deprecated Use extractDomainCore from domain-utils.ts
 */
export function normalizeDomainCore(domain: string): string {
  return extractDomainCore(domain);
}

/**
 * Check if a source URL/domain matches a brand domain.
 * Uses proper eTLD+1 extraction for accurate matching.
 */
export function isBrandDomainMatch(
  sourceUrlOrDomain: string,
  brandDomain: string,
  brandAliases: string[] = []
): boolean {
  return domainMatch(sourceUrlOrDomain, brandDomain, brandAliases);
}

// ===========================================
// Authority Scoring
// ===========================================

/**
 * Calculate authority score for a domain (0-100).
 * Higher scores indicate more trustworthy sources.
 */
export function calculateAuthorityScore(urlOrDomain: string): number {
  const domain = extractRegistrableDomain(urlOrDomain);
  const core = extractDomainCore(urlOrDomain);
  
  // Government and education domains
  if (domain.endsWith(".gov") || domain.endsWith(".edu")) return 95;
  if (domain.endsWith(".gov.uk") || domain.endsWith(".ac.uk")) return 95;
  if (domain.endsWith(".org")) return 80;
  
  // Check authoritative domains
  if (AUTHORITATIVE_DOMAINS.has(domain)) return 90;
  
  // Check high authority domains
  if (HIGH_AUTHORITY_DOMAINS.has(domain)) return 75;
  
  // Check lower authority domains
  if (LOWER_AUTHORITY_DOMAINS.has(domain)) return 35;
  
  // Heuristics for news-like domains
  if (core.includes("news") || core.includes("times") || core.includes("post")) {
    return 70;
  }
  
  // Short branded domains are often legitimate businesses
  if (/^[a-z0-9-]{3,15}$/.test(core)) {
    return 65;
  }
  
  // Default for unknown domains
  return 50;
}

/**
 * Get authority tier based on score.
 */
export function getAuthorityTier(urlOrDomain: string): "authoritative" | "high" | "medium" | "low" {
  const score = calculateAuthorityScore(urlOrDomain);
  if (score >= 85) return "authoritative";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * Determine source type based on domain.
 */
export function getSourceType(urlOrDomain: string): CitationAuthority["source_type"] {
  const domain = extractRegistrableDomain(urlOrDomain);
  
  // Social platforms
  const socialDomains = ["linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com"];
  if (socialDomains.some((d) => domain === d)) {
    return "social";
  }
  
  // Directory/review sites
  const directoryDomains = [
    "clutch.co", "g2.com", "capterra.com", "yelp.com", "tripadvisor.com",
    "crunchbase.com", "trustpilot.com", "glassdoor.com",
  ];
  if (directoryDomains.some((d) => domain === d)) {
    return "directory";
  }
  
  // Blog platforms
  const blogDomains = ["medium.com", "substack.com", "wordpress.com", "blogger.com", "dev.to"];
  if (blogDomains.some((d) => domain === d)) {
    return "blog";
  }
  
  // Forum/community
  const forumDomains = ["reddit.com", "quora.com", "stackoverflow.com"];
  if (forumDomains.some((d) => domain === d)) {
    return "forum";
  }
  
  // News outlets
  const newsDomains = [
    "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "cnn.com",
    "bloomberg.com", "nytimes.com", "wsj.com", "ft.com",
  ];
  if (newsDomains.some((d) => domain === d)) {
    return "news";
  }
  
  // Check for news-like patterns in domain
  const core = extractDomainCore(urlOrDomain);
  if (["news", "times", "post", "herald", "tribune", "journal"].some((n) => core.includes(n))) {
    return "news";
  }
  
  // Official/government
  if (domain.endsWith(".gov") || domain.endsWith(".edu") || domain.endsWith(".gov.uk")) {
    return "official";
  }
  
  // Default to editorial
  return "editorial";
}

// ===========================================
// Build Citation Authority Analysis
// ===========================================

/**
 * Build citation authority analysis for a list of sources.
 */
export function buildCitationAuthorities(
  sources: Array<{ url: string; title?: string; domain?: string; snippet?: string }>,
  brandDomain: string,
  brandAliases: string[] = []
): CitationAuthority[] {
  return sources.map((s) => {
    // Canonicalize URL first
    const canonicalUrl = canonicalizeUrl(s.url);
    const domain = extractRegistrableDomain(canonicalUrl);
    
    // Check if this is a brand domain
    const isBrand = isBrandDomainMatch(canonicalUrl, brandDomain, brandAliases);
    
    // Brand domains get max authority for brand-related queries
    const score = isBrand ? 100 : calculateAuthorityScore(canonicalUrl);
    
    return {
      domain,
      authority_score: score,
      tier: getAuthorityTier(canonicalUrl),
      source_type: getSourceType(canonicalUrl),
      is_brand_domain: isBrand,
    };
  });
}

/**
 * Calculate aggregate authority score for a set of sources.
 * Useful for comparing overall citation quality across engines.
 */
export function calculateAggregateAuthority(
  sources: Array<{ url: string }>
): {
  average_score: number;
  authoritative_count: number;
  low_authority_count: number;
  brand_citation_count: number;
} {
  if (sources.length === 0) {
    return {
      average_score: 0,
      authoritative_count: 0,
      low_authority_count: 0,
      brand_citation_count: 0,
    };
  }
  
  let totalScore = 0;
  let authoritative = 0;
  let lowAuthority = 0;
  
  for (const source of sources) {
    const score = calculateAuthorityScore(source.url);
    totalScore += score;
    
    const tier = getAuthorityTier(source.url);
    if (tier === "authoritative") authoritative++;
    if (tier === "low") lowAuthority++;
  }
  
  return {
    average_score: Math.round(totalScore / sources.length),
    authoritative_count: authoritative,
    low_authority_count: lowAuthority,
    brand_citation_count: 0, // Set by caller with brand context
  };
}
