/**
 * Brand Context Generator
 * 
 * Uses AI to analyze a website and generate brand context for better prompt replacement.
 */

import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "@/lib/ai/openai-config";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface BrandContext {
  product_description: string;
  category: string;
  industry: string;
  target_audience: string;
  key_products: string[];
  competitors: string[];
  unique_selling_points: string[];
}

export interface BrandContextInput {
  domain: string;
  name: string;
  websiteContent?: string; // Optional scraped content
}

/**
 * Generate brand context from website domain using AI
 */
export async function generateBrandContext(input: BrandContextInput): Promise<BrandContext> {
  const { domain, name, websiteContent } = input;
  
  const systemPrompt = `You are an expert business analyst. Your task is to analyze a brand/company and provide structured context about them.

Based on the domain name, brand name, and any provided website content, infer:
1. What product or service they offer
2. Their industry/category
3. Their target audience
4. Their main products/services (list up to 5)
5. Likely competitors (list up to 5)
6. Their unique selling points (list up to 3)

Be specific and practical. If the brand name or domain gives clear hints, use those.
If you're unsure, make reasonable inferences based on common business patterns.

IMPORTANT: Your response must be valid JSON matching this schema:
{
  "product_description": "A short description of what they sell (e.g., 'premium energy drinks', 'CRM software for small businesses')",
  "category": "The product/service category (e.g., 'beverages', 'software', 'real estate')",
  "industry": "The broader industry (e.g., 'Food & Beverage', 'Technology', 'Healthcare')",
  "target_audience": "Who they target (e.g., 'young professionals', 'enterprise companies', 'fitness enthusiasts')",
  "key_products": ["Product 1", "Product 2"],
  "competitors": ["Competitor 1", "Competitor 2"],
  "unique_selling_points": ["USP 1", "USP 2"]
}`;

  const userPrompt = `Analyze this brand and generate context:

Brand Name: ${name}
Domain: ${domain}
${websiteContent ? `\nWebsite Content:\n${websiteContent.slice(0, 3000)}` : ''}

Generate the brand context JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content) as BrandContext;
    return parsed;
  } catch (error) {
    console.error("Failed to generate brand context:", error);
    
    // Return sensible defaults based on the domain/name
    return inferBasicContext(name, domain);
  }
}

/**
 * Fallback: Infer basic context from name and domain without AI
 */
function inferBasicContext(name: string, domain: string): BrandContext {
  const combined = `${name} ${domain}`.toLowerCase();
  
  // Common industry patterns
  const patterns: [RegExp, Partial<BrandContext>][] = [
    [/energy|drink|beverage/i, { 
      category: "beverages", 
      industry: "Food & Beverage",
      product_description: "energy drinks and beverages",
    }],
    [/crm|sales|customer/i, { 
      category: "software", 
      industry: "Technology",
      product_description: "CRM software",
    }],
    [/real.?estate|property|home/i, { 
      category: "real estate", 
      industry: "Real Estate",
      product_description: "real estate services",
    }],
    [/health|medical|clinic/i, { 
      category: "healthcare", 
      industry: "Healthcare",
      product_description: "healthcare services",
    }],
    [/finance|bank|invest/i, { 
      category: "finance", 
      industry: "Financial Services",
      product_description: "financial services",
    }],
    [/tech|software|app|saas/i, { 
      category: "software", 
      industry: "Technology",
      product_description: "software solutions",
    }],
    [/food|restaurant|delivery/i, { 
      category: "food", 
      industry: "Food & Beverage",
      product_description: "food products",
    }],
    [/travel|hotel|booking/i, { 
      category: "travel", 
      industry: "Travel & Hospitality",
      product_description: "travel services",
    }],
    [/education|learn|course/i, { 
      category: "education", 
      industry: "Education",
      product_description: "educational services",
    }],
    [/fashion|clothing|apparel/i, { 
      category: "fashion", 
      industry: "Retail",
      product_description: "fashion and apparel",
    }],
  ];

  let context: BrandContext = {
    product_description: `${name} products and services`,
    category: "general",
    industry: "Business",
    target_audience: "general consumers",
    key_products: [name],
    competitors: [],
    unique_selling_points: [],
  };

  for (const [pattern, partial] of patterns) {
    if (pattern.test(combined)) {
      context = { ...context, ...partial };
      break;
    }
  }

  return context;
}

/**
 * Scrape basic content from a website for context generation
 * Note: This is a simple approach - in production you might use a dedicated scraping service
 */
export async function scrapeWebsiteContent(domain: string): Promise<string | null> {
  try {
    const url = domain.startsWith("http") ? domain : `https://${domain}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EllipseBot/1.0)",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    
    // Extract text content (basic approach)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000); // Limit to 5000 chars

    return textContent;
  } catch (error) {
    console.error("Failed to scrape website:", error);
    return null;
  }
}


