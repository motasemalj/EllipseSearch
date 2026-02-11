/**
 * Domain Utilities - Production-Grade URL/Domain Normalization
 * 
 * Uses the Public Suffix List (via tldts) for proper eTLD+1 extraction.
 * This ensures accurate brand/domain matching across different URL formats.
 */

import { parse } from 'tldts';

// Use ReturnType to infer the correct type from parse function
type ParsedResult = ReturnType<typeof parse>;

// ===========================================
// URL Canonicalization
// ===========================================

/**
 * Canonicalize a URL by:
 * - Normalizing protocol (https preferred)
 * - Lowercasing hostname
 * - Removing tracking parameters
 * - Removing trailing slashes
 * - Removing default ports
 */
export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    
    // Normalize to https (unless localhost/IP)
    const isLocal = parsed.hostname === 'localhost' || /^[\d.]+$/.test(parsed.hostname);
    if (!isLocal && parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    
    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();
    
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'ref', 'source', 'mc_cid', 'mc_eid',
      '_ga', '_gl', 'yclid', 'wickedid', 'sscid', 'affid',
    ];
    
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }
    
    // Remove hash fragments (often tracking)
    parsed.hash = '';
    
    // Remove default ports
    if ((parsed.protocol === 'https:' && parsed.port === '443') ||
        (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }
    
    // Remove trailing slash from path (except root)
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    
    return parsed.toString();
  } catch {
    return url.toLowerCase().trim();
  }
}

// ===========================================
// Domain Extraction (eTLD+1)
// ===========================================

/**
 * Extract the registrable domain (eTLD+1) from a URL or hostname.
 * 
 * Examples:
 * - "https://www.blog.example.co.uk/page" → "example.co.uk"
 * - "https://sub.domain.github.io" → "domain.github.io"
 * - "www.example.com" → "example.com"
 */
export function extractRegistrableDomain(urlOrHostname: string): string {
  try {
    // Handle full URLs
    let hostname = urlOrHostname;
    if (urlOrHostname.includes('://')) {
      hostname = new URL(urlOrHostname).hostname;
    }
    
    // Remove www. prefix for parsing
    hostname = hostname.replace(/^www\./i, '');
    
    const parsed: ParsedResult = parse(hostname);
    
    // Return the registrable domain (domain + public suffix)
    if (parsed.domain) {
      return parsed.domain.toLowerCase();
    }
    
    // Fallback for IPs or invalid domains
    return hostname.toLowerCase();
  } catch {
    // Last resort fallback
    const cleaned = urlOrHostname
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .split('?')[0]
      .toLowerCase();
    return cleaned;
  }
}

/**
 * Extract the domain core (main brand identifier) from a domain.
 * 
 * Examples:
 * - "example.com" → "example"
 * - "example.co.uk" → "example"
 * - "my-brand.io" → "my-brand"
 */
export function extractDomainCore(urlOrHostname: string): string {
  const registrable = extractRegistrableDomain(urlOrHostname);
  const parsed: ParsedResult = parse(registrable);
  
  if (parsed.domainWithoutSuffix) {
    return parsed.domainWithoutSuffix.toLowerCase();
  }
  
  // Fallback: take first part before dot
  return registrable.split('.')[0] || registrable;
}

/**
 * Get full parse result for advanced use cases.
 */
export function parseDomain(urlOrHostname: string): ParsedResult {
  try {
    let hostname = urlOrHostname;
    if (urlOrHostname.includes('://')) {
      hostname = new URL(urlOrHostname).hostname;
    }
    return parse(hostname.replace(/^www\./i, ''));
  } catch {
    return parse(urlOrHostname);
  }
}

// ===========================================
// Domain Matching
// ===========================================

/**
 * Check if two URLs/domains match at the registrable domain level.
 * 
 * Examples:
 * - "https://blog.example.com" matches "www.example.com" → true
 * - "example.com" matches "example.co.uk" → false (different TLDs)
 */
export function doDomainsMatch(
  urlOrDomain1: string,
  urlOrDomain2: string
): boolean {
  const domain1 = extractRegistrableDomain(urlOrDomain1);
  const domain2 = extractRegistrableDomain(urlOrDomain2);
  return domain1 === domain2;
}

/**
 * Check if a URL belongs to a brand's domain (with alias support).
 * 
 * @param sourceUrl - The URL to check
 * @param brandDomain - The brand's primary domain
 * @param brandAliases - Alternative domains/names for the brand
 */
export function isBrandDomainMatch(
  sourceUrl: string,
  brandDomain: string,
  brandAliases: string[] = []
): boolean {
  const sourceDomain = extractRegistrableDomain(sourceUrl);
  const sourceCore = extractDomainCore(sourceUrl);
  const brandRegistrable = extractRegistrableDomain(brandDomain);
  const brandCore = extractDomainCore(brandDomain);
  
  // Exact registrable domain match
  if (sourceDomain === brandRegistrable) {
    return true;
  }
  
  // Core domain match (handles different TLDs)
  if (brandCore.length >= 3 && sourceCore === brandCore) {
    return true;
  }
  
  // Check aliases
  for (const alias of brandAliases) {
    if (!alias || alias.length < 3) continue;
    
    const aliasLower = alias.toLowerCase().trim();
    
    // Full domain alias
    if (sourceDomain.includes(aliasLower) || aliasLower.includes(sourceDomain)) {
      return true;
    }
    
    // Core name alias
    if (sourceCore.includes(aliasLower) || aliasLower.includes(sourceCore)) {
      return true;
    }
  }
  
  return false;
}

// ===========================================
// URL Validation & Extraction
// ===========================================

/**
 * Extract all valid URLs from text content.
 * More robust than simple regex - handles edge cases.
 */
export function extractUrlsFromText(text: string): string[] {
  const urls: string[] = [];
  const seenCanonical = new Set<string>();
  
  // Pattern for URLs (more comprehensive)
  const urlPattern = /https?:\/\/[^\s<>"'`\[\]{}|\\^]+/gi;
  const matches = text.match(urlPattern) || [];
  
  for (const match of matches) {
    // Clean up trailing punctuation that might have been captured
    const url = match.replace(/[.,;:!?)]+$/, '');
    
    // Validate URL
    try {
      new URL(url);
    } catch {
      continue;
    }
    
    // Canonicalize and deduplicate
    const canonical = canonicalizeUrl(url);
    if (!seenCanonical.has(canonical)) {
      seenCanonical.add(canonical);
      urls.push(url);
    }
  }
  
  return urls;
}

/**
 * Extract URLs from markdown links.
 * Returns array of { text: string, url: string }
 */
export function extractMarkdownLinks(text: string): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    const url = match[2];
    try {
      new URL(url);
      links.push({ text: match[1], url });
    } catch {
      // Invalid URL, skip
    }
  }
  
  return links;
}

// ===========================================
// Domain Classification
// ===========================================

/**
 * Check if a domain is a known social platform.
 */
export function isSocialPlatform(urlOrDomain: string): boolean {
  const domain = extractRegistrableDomain(urlOrDomain);
  const socialDomains = new Set([
    'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com',
    'youtube.com', 'tiktok.com', 'reddit.com', 'pinterest.com', 'tumblr.com',
    'snapchat.com', 'whatsapp.com', 'telegram.org', 'discord.com',
  ]);
  return socialDomains.has(domain);
}

/**
 * Check if a domain is a known marketplace/e-commerce platform.
 */
export function isMarketplace(urlOrDomain: string): boolean {
  const domain = extractRegistrableDomain(urlOrDomain);
  const marketplaces = new Set([
    'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.ae', 'amazon.in',
    'ebay.com', 'walmart.com', 'target.com', 'etsy.com', 'shopify.com',
    'alibaba.com', 'aliexpress.com', 'noon.com', 'namshi.com', 'souq.com',
  ]);
  return marketplaces.has(domain);
}

/**
 * Check if a domain is a known review/directory platform.
 */
export function isReviewDirectory(urlOrDomain: string): boolean {
  const domain = extractRegistrableDomain(urlOrDomain);
  const directories = new Set([
    'g2.com', 'capterra.com', 'trustradius.com', 'softwareadvice.com',
    'trustpilot.com', 'yelp.com', 'tripadvisor.com', 'glassdoor.com',
    'indeed.com', 'clutch.co', 'goodfirms.co', 'getapp.com',
    'bayut.com', 'propertyfinder.ae', 'dubizzle.com',
  ]);
  return directories.has(domain);
}

/**
 * Check if a domain is a generic/UGC content platform.
 */
export function isUgcPlatform(urlOrDomain: string): boolean {
  const domain = extractRegistrableDomain(urlOrDomain);
  const ugcPlatforms = new Set([
    'wikipedia.org', 'reddit.com', 'quora.com', 'medium.com',
    'substack.com', 'dev.to', 'stackoverflow.com', 'github.com',
    'wordpress.com', 'blogger.com', 'tumblr.com', 'wix.com', 'weebly.com',
  ]);
  return ugcPlatforms.has(domain);
}

