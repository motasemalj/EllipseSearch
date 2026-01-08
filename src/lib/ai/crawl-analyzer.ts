/**
 * Crawl Content Analyzer
 * 
 * Analyzes crawled website content to extract specific AEO issues.
 * This is the "Ground Truth" that makes recommendations specific rather than generic.
 * 
 * Analysis Categories:
 * 1. Crawler Access: robots.txt, AI bot blocks
 * 2. Schema Markup: JSON-LD presence, completeness
 * 3. Brand Entity: H1 clarity, meta descriptions
 * 4. Content Structure: Headings, pricing location, FAQ presence
 * 5. Authority Signals: Press page, testimonials, awards
 * 6. Freshness: Last-modified dates
 */

import type { CrawledPage } from "@/lib/firecrawl/client";

// ===========================================
// Types
// ===========================================

export interface CrawlAnalysis {
  // Crawler Access
  crawler_access: {
    robots_txt_found: boolean;
    robots_txt_content?: string;
    blocks_gptbot: boolean;
    blocks_google_extended: boolean;
    blocks_claudebot: boolean;
    blocks_all_bots: boolean;
    blocking_lines: string[];
  };
  
  // Schema Markup
  schema_markup: {
    has_schema: boolean;
    schema_types_found: string[];
    missing_critical_schemas: string[];
    schema_issues: SchemaIssue[];
    organization_schema?: {
      found: boolean;
      has_name: boolean;
      has_url: boolean;
      has_logo: boolean;
      has_sameas: boolean;
      same_as_links: string[];
    };
    product_schema?: {
      found: boolean;
      has_price: boolean;
      has_currency: boolean;
      has_availability: boolean;
      has_rating: boolean;
      missing_fields: string[];
    };
    faq_schema?: {
      found: boolean;
      question_count: number;
    };
  };
  
  // Brand Entity
  brand_entity: {
    homepage_h1?: string;
    homepage_h1_vague: boolean;
    homepage_h1_issues: string[];
    meta_title?: string;
    meta_description?: string;
    meta_description_length: number;
    brand_name_in_title: boolean;
    brand_name_in_h1: boolean;
    brand_name_in_meta: boolean;
  };
  
  // Content Structure  
  content_structure: {
    has_pricing_page: boolean;
    pricing_in_top_20_percent: boolean;
    pricing_page_url?: string;
    pricing_visibility_issue?: string;
    has_faq_page: boolean;
    faq_page_url?: string;
    has_about_page: boolean;
    about_page_url?: string;
    average_heading_structure_score: number; // 1-5
    pages_missing_h1: number;
  };
  
  // Authority Signals
  authority_signals: {
    has_press_page: boolean;
    press_page_url?: string;
    has_media_mentions: boolean;
    media_mention_count: number;
    has_testimonials_page: boolean;
    testimonial_count: number;
    has_case_studies: boolean;
    case_study_count: number;
    has_awards_section: boolean;
    awards_mentioned: string[];
    has_client_logos: boolean;
  };
  
  // Freshness
  freshness: {
    oldest_page_date?: string;
    newest_page_date?: string;
    pages_older_than_6_months: number;
    pages_older_than_12_months: number;
    stale_critical_pages: { url: string; title: string; age_months: number }[];
  };
  
  // Summary
  summary: {
    total_pages_analyzed: number;
    critical_issues: CriticalIssue[];
    high_priority_issues: HighPriorityIssue[];
    medium_priority_issues: MediumPriorityIssue[];
  };
}

export interface SchemaIssue {
  type: string;
  issue: string;
  fix: string;
  page_url: string;
}

export interface CriticalIssue {
  category: 'crawler-access' | 'schema' | 'brand-entity';
  title: string;
  details: string;
  fix: string;
  page_url?: string;
  line_number?: number;
}

export interface HighPriorityIssue {
  category: 'authority' | 'content-structure' | 'schema';
  title: string;
  details: string;
  fix: string;
  page_url?: string;
}

export interface MediumPriorityIssue {
  category: 'freshness' | 'content-structure' | 'authority';
  title: string;
  details: string;
  fix: string;
  page_url?: string;
}

// ===========================================
// Main Analyzer
// ===========================================

export async function analyzeCrawledContent(
  pages: CrawledPage[],
  brandName: string,
  brandDomain: string,
  robotsTxtContent?: string
): Promise<CrawlAnalysis> {
  const analysis: CrawlAnalysis = {
    crawler_access: analyzeCrawlerAccess(robotsTxtContent),
    schema_markup: analyzeSchemaMarkup(pages),
    brand_entity: analyzeBrandEntity(pages, brandName),
    content_structure: analyzeContentStructure(pages),
    authority_signals: analyzeAuthoritySignals(pages),
    freshness: analyzeFreshness(pages),
    summary: { total_pages_analyzed: pages.length, critical_issues: [], high_priority_issues: [], medium_priority_issues: [] },
  };
  
  // Generate summary issues
  analysis.summary = generateSummary(analysis, brandName, brandDomain);
  
  return analysis;
}

// ===========================================
// Crawler Access Analysis
// ===========================================

function analyzeCrawlerAccess(robotsTxt?: string): CrawlAnalysis['crawler_access'] {
  const result: CrawlAnalysis['crawler_access'] = {
    robots_txt_found: !!robotsTxt,
    robots_txt_content: robotsTxt,
    blocks_gptbot: false,
    blocks_google_extended: false,
    blocks_claudebot: false,
    blocks_all_bots: false,
    blocking_lines: [],
  };
  
  if (!robotsTxt) return result;
  
  const lines = robotsTxt.split('\n');
  let currentUserAgent = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase();
    
    if (line.startsWith('user-agent:')) {
      currentUserAgent = line.replace('user-agent:', '').trim();
    }
    
    if (line.startsWith('disallow:')) {
      const disallowPath = line.replace('disallow:', '').trim();
      
      // Check if this is a blocking rule
      if (disallowPath === '/' || disallowPath === '/*') {
        // Check which bots are affected
        if (currentUserAgent === '*') {
          result.blocks_all_bots = true;
          result.blocking_lines.push(`Line ${i + 1}: User-agent: * with Disallow: ${disallowPath}`);
        }
        if (currentUserAgent === 'gptbot' || currentUserAgent === 'chatgpt-user') {
          result.blocks_gptbot = true;
          result.blocking_lines.push(`Line ${i + 1}: Blocks GPTBot with Disallow: ${disallowPath}`);
        }
        if (currentUserAgent === 'google-extended') {
          result.blocks_google_extended = true;
          result.blocking_lines.push(`Line ${i + 1}: Blocks Google-Extended with Disallow: ${disallowPath}`);
        }
        if (currentUserAgent === 'claudebot' || currentUserAgent === 'anthropic-ai') {
          result.blocks_claudebot = true;
          result.blocking_lines.push(`Line ${i + 1}: Blocks ClaudeBot with Disallow: ${disallowPath}`);
        }
      }
    }
  }
  
  return result;
}

// ===========================================
// Schema Markup Analysis
// ===========================================

function analyzeSchemaMarkup(pages: CrawledPage[]): CrawlAnalysis['schema_markup'] {
  const result: CrawlAnalysis['schema_markup'] = {
    has_schema: false,
    schema_types_found: [],
    missing_critical_schemas: [],
    schema_issues: [],
  };
  
  const schemaTypesSet = new Set<string>();
  let hasOrganization = false;
  let hasProduct = false;
  let hasFAQ = false;
  
  for (const page of pages) {
    const html = page.html || '';
    const markdown = page.markdown || '';
    
    // Look for JSON-LD script tags in HTML or markdown
    const jsonLdMatches = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    
    for (const match of jsonLdMatches) {
      result.has_schema = true;
      
      try {
        // Extract JSON content
        const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '').trim();
        const parsed = JSON.parse(jsonContent);
        
        // Handle @graph arrays
        const schemas = parsed['@graph'] ? parsed['@graph'] : [parsed];
        
        for (const schema of schemas) {
          const schemaType = schema['@type'];
          if (schemaType) {
            schemaTypesSet.add(schemaType);
            
            // Analyze Organization schema
            if (schemaType === 'Organization' || schemaType === 'LocalBusiness') {
              hasOrganization = true;
              result.organization_schema = {
                found: true,
                has_name: !!schema.name,
                has_url: !!schema.url,
                has_logo: !!schema.logo,
                has_sameas: Array.isArray(schema.sameAs) && schema.sameAs.length > 0,
                same_as_links: Array.isArray(schema.sameAs) ? schema.sameAs : [],
              };
              
              // Check for issues
              if (!schema.name) {
                result.schema_issues.push({
                  type: 'Organization',
                  issue: 'Missing "name" field',
                  fix: 'Add "name" field with your brand name',
                  page_url: page.url,
                });
              }
              if (!schema.sameAs || schema.sameAs.length === 0) {
                result.schema_issues.push({
                  type: 'Organization',
                  issue: 'Missing "sameAs" links to social profiles',
                  fix: 'Add sameAs array with links to LinkedIn, Twitter, Facebook, etc.',
                  page_url: page.url,
                });
              }
            }
            
            // Analyze Product schema
            if (schemaType === 'Product' || schemaType === 'Offer' || schemaType === 'Service') {
              hasProduct = true;
              const offers = schema.offers || schema;
              result.product_schema = {
                found: true,
                has_price: !!offers.price || !!offers.lowPrice,
                has_currency: !!offers.priceCurrency,
                has_availability: !!offers.availability,
                has_rating: !!schema.aggregateRating,
                missing_fields: [],
              };
              
              // Check for issues
              if (!offers.price && !offers.lowPrice) {
                result.product_schema.missing_fields.push('price');
                result.schema_issues.push({
                  type: 'Product',
                  issue: 'Missing "price" field in Product/Offer schema',
                  fix: 'Add "price" field with actual price value',
                  page_url: page.url,
                });
              }
              if (!offers.priceCurrency) {
                result.product_schema.missing_fields.push('priceCurrency');
              }
            }
            
            // Analyze FAQ schema
            if (schemaType === 'FAQPage') {
              hasFAQ = true;
              const questionCount = schema.mainEntity?.length || 0;
              result.faq_schema = {
                found: true,
                question_count: questionCount,
              };
            }
          }
        }
      } catch (e) {
        result.schema_issues.push({
          type: 'Invalid',
          issue: 'Invalid JSON-LD syntax',
          fix: 'Fix JSON syntax errors in schema markup',
          page_url: page.url,
        });
      }
    }
  }
  
  result.schema_types_found = Array.from(schemaTypesSet);
  
  // Determine missing critical schemas
  if (!hasOrganization) {
    result.missing_critical_schemas.push('Organization');
  }
  if (!hasProduct) {
    // Check if this looks like a product/service business
    const hasPricingContent = pages.some(p => 
      (p.markdown || '').toLowerCase().includes('pricing') ||
      (p.markdown || '').toLowerCase().includes('$') ||
      (p.url || '').toLowerCase().includes('pricing')
    );
    if (hasPricingContent) {
      result.missing_critical_schemas.push('Product or Offer');
    }
  }
  if (!hasFAQ) {
    // Check if there's FAQ content without schema
    const hasFAQContent = pages.some(p => 
      (p.url || '').toLowerCase().includes('faq') ||
      (p.title || '').toLowerCase().includes('faq') ||
      (p.markdown || '').toLowerCase().includes('frequently asked')
    );
    if (hasFAQContent) {
      result.missing_critical_schemas.push('FAQPage');
    }
  }
  
  return result;
}

// ===========================================
// Brand Entity Analysis
// ===========================================

function analyzeBrandEntity(pages: CrawledPage[], brandName: string): CrawlAnalysis['brand_entity'] {
  const result: CrawlAnalysis['brand_entity'] = {
    homepage_h1_vague: false,
    homepage_h1_issues: [],
    meta_description_length: 0,
    brand_name_in_title: false,
    brand_name_in_h1: false,
    brand_name_in_meta: false,
  };
  
  // Find homepage (usually first or shortest URL path)
  const homepage = pages.find(p => {
    try {
      // Handle URLs that may be missing protocol
      const urlStr = p.url?.startsWith('http') ? p.url : `https://${p.url}`;
      const path = new URL(urlStr).pathname;
      return path === '/' || path === '' || path === '/index.html';
    } catch {
      // If URL parsing fails, check for common homepage indicators
      return p.url?.endsWith('/') || !p.url?.includes('/') || p.url === '';
    }
  }) || pages[0];
  
  if (!homepage) return result;
  
  const markdown = homepage.markdown || '';
  const brandLower = brandName.toLowerCase();
  
  // Extract H1 from markdown (first # heading)
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) {
    result.homepage_h1 = h1Match[1].trim();
    
    // Check if H1 is vague
    const vaguePatterns = [
      /^(welcome|hello|hi|hey)\b/i,
      /^(the future|tomorrow|innovation|transform)/i,
      /^(unlock|discover|experience|explore)\b/i,
      /^(we|our)\s+(help|make|build|create)/i,
      /^(your|a)\s+(partner|solution|journey)/i,
    ];
    
    for (const pattern of vaguePatterns) {
      if (pattern.test(result.homepage_h1)) {
        result.homepage_h1_vague = true;
        result.homepage_h1_issues.push(`H1 "${result.homepage_h1}" is vague marketing language. AI cannot determine what ${brandName} actually does.`);
        break;
      }
    }
    
    // Check if brand name is in H1
    result.brand_name_in_h1 = result.homepage_h1.toLowerCase().includes(brandLower);
    
    // Check if H1 lacks category/description
    const hasCategory = /\b(software|platform|tool|service|agency|company|app|saas|solution|crm|erp|cms)\b/i.test(result.homepage_h1);
    if (!hasCategory && !result.homepage_h1_vague) {
      result.homepage_h1_issues.push(`H1 doesn't mention what type of product/service ${brandName} is.`);
    }
  } else {
    result.homepage_h1_issues.push('No H1 tag found on homepage');
  }
  
  // Extract title and meta description
  result.meta_title = homepage.title;
  result.meta_description = homepage.description;
  result.meta_description_length = (homepage.description || '').length;
  
  // Check brand name presence
  if (homepage.title) {
    result.brand_name_in_title = homepage.title.toLowerCase().includes(brandLower);
  }
  if (homepage.description) {
    result.brand_name_in_meta = homepage.description.toLowerCase().includes(brandLower);
  }
  
  return result;
}

// ===========================================
// Content Structure Analysis  
// ===========================================

function analyzeContentStructure(pages: CrawledPage[]): CrawlAnalysis['content_structure'] {
  const result: CrawlAnalysis['content_structure'] = {
    has_pricing_page: false,
    pricing_in_top_20_percent: false,
    has_faq_page: false,
    has_about_page: false,
    average_heading_structure_score: 3,
    pages_missing_h1: 0,
  };
  
  let totalHeadingScore = 0;
  let scoredPages = 0;
  
  for (const page of pages) {
    const url = page.url.toLowerCase();
    const title = (page.title || '').toLowerCase();
    const markdown = page.markdown || '';
    const markdownLower = markdown.toLowerCase();
    
    // Find pricing page
    if (url.includes('pricing') || url.includes('plans') || title.includes('pricing')) {
      result.has_pricing_page = true;
      result.pricing_page_url = page.url;
      
      // Check if pricing is in top 20% of content
      const contentLength = markdown.length;
      const top20 = markdown.slice(0, Math.floor(contentLength * 0.2)).toLowerCase();
      
      if (top20.includes('$') || top20.includes('price') || top20.includes('month') || top20.includes('/mo')) {
        result.pricing_in_top_20_percent = true;
      } else {
        result.pricing_visibility_issue = `Pricing details are buried on ${page.url}. Move pricing to the top 20% of the page.`;
      }
    }
    
    // Find FAQ page
    if (url.includes('faq') || title.includes('faq') || title.includes('frequently')) {
      result.has_faq_page = true;
      result.faq_page_url = page.url;
    }
    
    // Find about page
    if (url.includes('about') || title.includes('about')) {
      result.has_about_page = true;
      result.about_page_url = page.url;
    }
    
    // Score heading structure
    const hasH1 = /^#\s+/m.test(markdown);
    const h2Count = (markdown.match(/^##\s+/gm) || []).length;
    const h3Count = (markdown.match(/^###\s+/gm) || []).length;
    
    if (!hasH1) {
      result.pages_missing_h1++;
    }
    
    // Calculate heading score (1-5)
    let headingScore = 1;
    if (hasH1) headingScore++;
    if (h2Count >= 2) headingScore++;
    if (h3Count >= 2) headingScore++;
    if (h2Count >= 4 && h3Count >= 3) headingScore++;
    
    totalHeadingScore += headingScore;
    scoredPages++;
  }
  
  if (scoredPages > 0) {
    result.average_heading_structure_score = Math.round(totalHeadingScore / scoredPages);
  }
  
  return result;
}

// ===========================================
// Authority Signals Analysis
// ===========================================

function analyzeAuthoritySignals(pages: CrawledPage[]): CrawlAnalysis['authority_signals'] {
  const result: CrawlAnalysis['authority_signals'] = {
    has_press_page: false,
    has_media_mentions: false,
    media_mention_count: 0,
    has_testimonials_page: false,
    testimonial_count: 0,
    has_case_studies: false,
    case_study_count: 0,
    has_awards_section: false,
    awards_mentioned: [],
    has_client_logos: false,
  };
  
  // Media outlet patterns
  const mediaOutlets = /\b(forbes|techcrunch|wsj|nytimes|bloomberg|business\s*insider|wired|theverge|cnet|mashable|venturebeat|fast\s*company)\b/gi;
  
  // Award patterns
  const awardPatterns = /\b(award|winner|finalist|recognized|best\s+\w+\s+\d{4}|top\s+\d+|g2\s+leader|capterra|gartner)\b/gi;
  
  for (const page of pages) {
    const url = page.url.toLowerCase();
    const title = (page.title || '').toLowerCase();
    const markdown = page.markdown || '';
    
    // Find press/news page
    if (url.includes('press') || url.includes('news') || url.includes('media') || 
        title.includes('press') || title.includes('in the news')) {
      result.has_press_page = true;
      result.press_page_url = page.url;
    }
    
    // Find testimonials
    if (url.includes('testimonial') || url.includes('review') || url.includes('customer') ||
        title.includes('testimonial') || title.includes('what our customers')) {
      result.has_testimonials_page = true;
      
      // Count testimonials (look for quote patterns)
      const quoteMatches = markdown.match(/[""].*?[""]/g) || [];
      result.testimonial_count += quoteMatches.filter(q => q.length > 50).length;
    }
    
    // Find case studies
    if (url.includes('case-stud') || url.includes('success-stor') || url.includes('portfolio') ||
        title.includes('case stud') || title.includes('success stor')) {
      result.has_case_studies = true;
      result.case_study_count++;
    }
    
    // Check for media mentions
    const mediaMatches = markdown.match(mediaOutlets) || [];
    if (mediaMatches.length > 0) {
      result.has_media_mentions = true;
      result.media_mention_count += mediaMatches.length;
    }
    
    // Check for awards
    const awardMatches = markdown.match(awardPatterns) || [];
    if (awardMatches.length > 0) {
      result.has_awards_section = true;
      result.awards_mentioned.push(...awardMatches.slice(0, 5));
    }
    
    // Check for client logos (look for "clients" or "trusted by" sections)
    if (/\b(our\s+clients|trusted\s+by|used\s+by|loved\s+by)\b/i.test(markdown)) {
      result.has_client_logos = true;
    }
  }
  
  // Dedupe awards
  result.awards_mentioned = [...new Set(result.awards_mentioned)].slice(0, 10);
  
  return result;
}

// ===========================================
// Freshness Analysis
// ===========================================

function analyzeFreshness(pages: CrawledPage[]): CrawlAnalysis['freshness'] {
  const result: CrawlAnalysis['freshness'] = {
    pages_older_than_6_months: 0,
    pages_older_than_12_months: 0,
    stale_critical_pages: [],
  };
  
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  
  // Critical pages that should be fresh
  const criticalPagePatterns = ['pricing', 'product', 'feature', 'service', 'solution', 'about'];
  
  for (const page of pages) {
    const crawledAt = new Date(page.crawledAt);
    const metadata = page.metadata as { lastModified?: string; modifiedTime?: string } | undefined;
    const lastModified = metadata?.lastModified || metadata?.modifiedTime;
    
    if (lastModified) {
      const modDate = new Date(lastModified);
      
      if (!result.oldest_page_date || modDate < new Date(result.oldest_page_date)) {
        result.oldest_page_date = modDate.toISOString();
      }
      if (!result.newest_page_date || modDate > new Date(result.newest_page_date)) {
        result.newest_page_date = modDate.toISOString();
      }
      
      if (modDate < sixMonthsAgo) {
        result.pages_older_than_6_months++;
        
        // Check if this is a critical page
        const isCritical = criticalPagePatterns.some(p => 
          page.url.toLowerCase().includes(p) || 
          (page.title || '').toLowerCase().includes(p)
        );
        
        if (isCritical) {
          const ageMonths = Math.floor((now.getTime() - modDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
          result.stale_critical_pages.push({
            url: page.url,
            title: page.title || page.url,
            age_months: ageMonths,
          });
        }
      }
      
      if (modDate < twelveMonthsAgo) {
        result.pages_older_than_12_months++;
      }
    }
  }
  
  return result;
}

// ===========================================
// Summary Generation
// ===========================================

function generateSummary(
  analysis: CrawlAnalysis,
  brandName: string,
  brandDomain: string
): CrawlAnalysis['summary'] {
  const critical: CriticalIssue[] = [];
  const high: HighPriorityIssue[] = [];
  const medium: MediumPriorityIssue[] = [];
  
  // CRITICAL: Crawler blocks
  if (analysis.crawler_access.blocks_gptbot) {
    critical.push({
      category: 'crawler-access',
      title: 'Blocking ChatGPT/GPTBot',
      details: `${brandDomain}/robots.txt is blocking GPTBot. ChatGPT cannot crawl your content.`,
      fix: `Remove or modify these lines in robots.txt: ${analysis.crawler_access.blocking_lines.join('; ')}`,
    });
  }
  
  if (analysis.crawler_access.blocks_google_extended) {
    critical.push({
      category: 'crawler-access',
      title: 'Blocking Google Gemini (Google-Extended)',
      details: `robots.txt blocks Google-Extended. Google Gemini uses this for AI training and answers.`,
      fix: `Remove Google-Extended blocks from robots.txt`,
    });
  }
  
  if (analysis.crawler_access.blocks_all_bots) {
    critical.push({
      category: 'crawler-access',
      title: 'Blocking All Crawlers',
      details: `robots.txt has "User-agent: * Disallow: /" which blocks ALL search engines and AI bots.`,
      fix: `Remove the blanket disallow rule. Use specific paths to block only sensitive areas.`,
    });
  }
  
  // CRITICAL: Missing Organization schema
  if (analysis.schema_markup.missing_critical_schemas.includes('Organization')) {
    critical.push({
      category: 'schema',
      title: 'Missing Organization Schema',
      details: `No Organization schema found. AI cannot verify ${brandName} is a legitimate company entity.`,
      fix: `Add JSON-LD Organization schema with: name, url, logo, description, and sameAs links to social profiles.`,
    });
  }
  
  // CRITICAL: Vague H1
  if (analysis.brand_entity.homepage_h1_vague && analysis.brand_entity.homepage_h1) {
    critical.push({
      category: 'brand-entity',
      title: 'Vague Homepage H1',
      details: `H1 is "${analysis.brand_entity.homepage_h1}" - AI cannot determine what ${brandName} does from this.`,
      fix: `Change H1 to clearly state: "${brandName}: [Your Category] for [Your Audience]" (e.g., "${brandName}: HR Software for Small Business")`,
    });
  }
  
  // HIGH: Missing Product schema with pricing
  if (analysis.schema_markup.product_schema?.found && !analysis.schema_markup.product_schema.has_price) {
    high.push({
      category: 'schema',
      title: 'Product Schema Missing Price',
      details: `Product schema exists but lacks "price" field. AI cannot answer pricing questions accurately.`,
      fix: `Add "price" and "priceCurrency" fields to your Product/Offer schema.`,
    });
  }
  
  // HIGH: No press/media page
  if (!analysis.authority_signals.has_press_page && !analysis.authority_signals.has_media_mentions) {
    high.push({
      category: 'authority',
      title: 'No Press/Media Section',
      details: `No "Press", "In the News", or media mentions page found. AI cannot verify third-party authority.`,
      fix: `Create a /press or /media page linking to external coverage. Even a few mentions help establish authority.`,
    });
  }
  
  // HIGH: No testimonials/social proof
  if (!analysis.authority_signals.has_testimonials_page && analysis.authority_signals.testimonial_count === 0) {
    high.push({
      category: 'authority',
      title: 'No Customer Testimonials',
      details: `No testimonials or customer reviews found. AI relies on social proof for recommendations.`,
      fix: `Add a testimonials section with real customer quotes. Include names, companies, and outcomes.`,
    });
  }
  
  // MEDIUM: Pricing buried
  if (analysis.content_structure.has_pricing_page && !analysis.content_structure.pricing_in_top_20_percent) {
    medium.push({
      category: 'content-structure',
      title: 'Pricing Buried in Content',
      details: analysis.content_structure.pricing_visibility_issue || 'Pricing is not in the top 20% of your pricing page.',
      fix: `Move pricing tables/numbers to the top of ${analysis.content_structure.pricing_page_url}. AI answers cost questions from the first 20% of page content.`,
      page_url: analysis.content_structure.pricing_page_url,
    });
  }
  
  // MEDIUM: Stale critical pages
  if (analysis.freshness.stale_critical_pages.length > 0) {
    const stalest = analysis.freshness.stale_critical_pages[0];
    medium.push({
      category: 'freshness',
      title: 'Critical Pages Are Stale',
      details: `${stalest.title} hasn't been updated in ${stalest.age_months} months. AI deprioritizes stale content.`,
      fix: `Update ${stalest.url} with current information. Add "Last Updated" date. Refresh at least every 6 months.`,
      page_url: stalest.url,
    });
  }
  
  // MEDIUM: No FAQ page
  if (!analysis.content_structure.has_faq_page) {
    medium.push({
      category: 'content-structure',
      title: 'No FAQ Page',
      details: `No FAQ or "Frequently Asked Questions" page found. AI uses FAQs to answer common queries.`,
      fix: `Create /faq page with common questions. Add FAQPage schema. Target questions people ask about ${brandName}.`,
    });
  }
  
  // MEDIUM: Schema sameAs missing
  if (analysis.schema_markup.organization_schema?.found && !analysis.schema_markup.organization_schema.has_sameas) {
    medium.push({
      category: 'schema',
      title: 'Organization Schema Missing sameAs Links',
      details: `Organization schema lacks sameAs links. AI cannot connect ${brandName} to social profiles.`,
      fix: `Add sameAs array with links to: LinkedIn, Twitter/X, Facebook, Instagram, YouTube, Crunchbase, Wikipedia (if exists).`,
    });
  }
  
  return {
    total_pages_analyzed: analysis.summary.total_pages_analyzed,
    critical_issues: critical,
    high_priority_issues: high,
    medium_priority_issues: medium,
  };
}

// ===========================================
// Export for use in recommendations
// ===========================================

export type { CrawledPage };

