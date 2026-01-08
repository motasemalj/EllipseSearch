/**
 * Placeholder Replacer
 * 
 * Replaces square bracket placeholders in prompts with brand-specific context.
 * e.g., "best [product type] in 2025" becomes "best energy drinks in 2025" for an energy drink brand.
 */

interface BrandContext {
  name: string;
  domain: string;
  aliases: string[];
  description?: string; // Optional field for product/service description
  category?: string; // Optional explicit category
  industry?: string;
  target_audience?: string;
  competitors?: string[];
}

// Common placeholder patterns and their semantic meaning
const PLACEHOLDER_PATTERNS = [
  { pattern: /\[product[ _-]?type\]/gi, key: 'productType' },
  { pattern: /\[product[ _-]?category\]/gi, key: 'productCategory' },
  { pattern: /\[category\]/gi, key: 'category' },
  { pattern: /\[product\]/gi, key: 'product' },
  { pattern: /\[service\]/gi, key: 'service' },
  { pattern: /\[industry\]/gi, key: 'industry' },
  { pattern: /\[brand\]/gi, key: 'brand' },
  { pattern: /\[brand[ _-]?name\]/gi, key: 'brandName' },
  { pattern: /\[competitor\]/gi, key: 'competitor' },
  { pattern: /\[alternatives?\]/gi, key: 'alternative' },
  { pattern: /\[company\]/gi, key: 'company' },
  { pattern: /\[solution\]/gi, key: 'solution' },
  { pattern: /\[software\]/gi, key: 'software' },
  { pattern: /\[tool\]/gi, key: 'tool' },
  { pattern: /\[platform\]/gi, key: 'platform' },
  { pattern: /\[app\]/gi, key: 'app' },
];

/**
 * Infer product/service type from brand context
 * Uses explicit fields first, then falls back to heuristics
 */
function inferProductContext(brand: BrandContext): Record<string, string> {
  const brandName = brand.name.toLowerCase();
  const domain = brand.domain.toLowerCase();
  
  // Base context with brand info
  const context: Record<string, string> = {
    brand: brand.name,
    brandName: brand.name,
    company: brand.name,
  };
  
  // Use explicit product description if available
  const productType = brand.description || brand.category || inferTypeFromName(brandName, domain);
  
  context.productType = productType;
  context.productCategory = brand.category || productType;
  context.category = brand.category || productType;
  context.product = productType;
  context.service = productType;
  context.solution = productType;
  context.software = productType;
  context.tool = productType;
  context.platform = productType;
  context.app = productType;
  
  // Use explicit industry if available
  context.industry = brand.industry || brand.category || productType;
  
  // Use explicit target audience if available
  context.audience = brand.target_audience || "consumers";
  context.targetAudience = brand.target_audience || "consumers";
  
  // Use first competitor if available, otherwise use brand name
  const firstCompetitor = brand.competitors?.[0];
  context.competitor = firstCompetitor || brand.name;
  context.alternative = firstCompetitor || brand.name;
  
  return context;
}

/**
 * Infer product type from brand name and domain keywords
 */
function inferTypeFromName(brandName: string, domain: string): string {
  const combined = `${brandName} ${domain}`;
  
  // Common industry keywords mapping
  const industryKeywords: [RegExp, string][] = [
    [/crm|customer|relation/i, 'CRM software'],
    [/erp|enterprise|resource/i, 'ERP solutions'],
    [/hr|human|talent|hiring|recruit/i, 'HR software'],
    [/email|mail|newsletter/i, 'email marketing tools'],
    [/analytics|data|bi|intelligence/i, 'analytics platforms'],
    [/project|task|agile|scrum/i, 'project management software'],
    [/design|creative|graphic|ui|ux/i, 'design tools'],
    [/marketing|ads|advertis|seo|growth/i, 'marketing platforms'],
    [/sales|pipeline|deal|revenue/i, 'sales software'],
    [/finance|accounting|invoice|payment/i, 'financial software'],
    [/security|cyber|protect|vpn/i, 'security solutions'],
    [/cloud|hosting|server|devops/i, 'cloud services'],
    [/ecommerce|shop|store|retail/i, 'e-commerce platforms'],
    [/health|medical|clinic|doctor/i, 'healthcare solutions'],
    [/education|learn|course|school/i, 'education platforms'],
    [/travel|hotel|book|flight/i, 'travel services'],
    [/food|restaurant|delivery|meal/i, 'food & beverage'],
    [/fitness|gym|workout|health/i, 'fitness solutions'],
    [/real.?estate|property|home|rent/i, 'real estate services'],
    [/legal|law|attorney|contract/i, 'legal services'],
    [/insurance|policy|coverage/i, 'insurance products'],
    [/bank|invest|trading|wealth/i, 'financial services'],
    [/auto|car|vehicle|motor/i, 'automotive products'],
    [/tech|software|saas|app/i, 'technology solutions'],
    [/energy|power|solar|electric/i, 'energy solutions'],
    [/drink|beverage|water|juice/i, 'beverages'],
  ];
  
  for (const [pattern, type] of industryKeywords) {
    if (pattern.test(combined)) {
      return type;
    }
  }
  
  // Default fallback - use brand name as the product type
  // This ensures the prompt still makes sense
  return `${brandName} products`;
}

/**
 * Replace placeholders in a prompt with brand-specific context
 */
export function replacePlaceholders(prompt: string, brand: BrandContext): string {
  const context = inferProductContext(brand);
  let result = prompt;
  
  // Replace each known placeholder pattern
  for (const { pattern, key } of PLACEHOLDER_PATTERNS) {
    if (context[key]) {
      result = result.replace(pattern, context[key]);
    }
  }
  
  // Handle any remaining square bracket placeholders
  // Replace [anything] with the inferred product type or brand name
  result = result.replace(/\[([^\]]+)\]/g, (match, placeholder) => {
    // Check if it's a custom placeholder we don't recognize
    const normalizedKey = placeholder.toLowerCase().replace(/[_-\s]/g, '');
    
    // Try to find a matching context key
    for (const [ctxKey, value] of Object.entries(context)) {
      if (ctxKey.toLowerCase() === normalizedKey) {
        return value;
      }
    }
    
    // Default to product type for unknown product-like placeholders
    if (/product|type|category|service|solution/i.test(placeholder)) {
      return context.productType || context.brand;
    }
    
    // Default to brand name for unknown brand-like placeholders
    if (/brand|company|name|competitor/i.test(placeholder)) {
      return context.brand;
    }
    
    // Last resort - return the placeholder as-is but log a warning
    console.warn(`Unknown placeholder: ${match} - using product type`);
    return context.productType || context.brand;
  });
  
  return result;
}

/**
 * Check if a prompt contains any placeholders
 */
export function hasPlaceholders(prompt: string): boolean {
  return /\[[^\]]+\]/.test(prompt);
}

/**
 * Extract all placeholders from a prompt
 */
export function extractPlaceholders(prompt: string): string[] {
  const matches = prompt.match(/\[[^\]]+\]/g);
  return matches ? matches.map(m => m.slice(1, -1)) : [];
}

