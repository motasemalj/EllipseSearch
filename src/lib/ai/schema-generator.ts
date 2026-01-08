/**
 * Schema Fix Generator
 * 
 * Generates exact JSON-LD Schema markup that agencies can copy-paste
 * to fix hallucinations and improve AI visibility.
 * 
 * This is the core of the "Fix It" button functionality.
 */

import type { SchemaFix, DetectedHallucination } from "@/types";
import type { PricingInfo, GroundTruthData } from "@/lib/ai/hallucination-detector";

interface BrandContext {
  name: string;
  domain: string;
  description?: string;
  location?: string;
  industry?: string;
  pricing?: PricingInfo[];
  features?: string[];
  services?: string[];
  products?: string[];
  sameAsLinks?: string[];
}

/**
 * Generate Schema fix for a specific hallucination
 */
export function generateSchemaFix(
  hallucination: DetectedHallucination,
  brandContext: BrandContext,
  groundTruth?: GroundTruthData
): SchemaFix | null {
  const { type, claim, reality } = hallucination;

  switch (type) {
    case "positive":
      // AI claimed something false - generate corrective schema
      return generateCorrectiveSchema(claim, reality, brandContext, groundTruth);
    
    case "misattribution":
      // AI misunderstood what the brand does - generate Organization schema
      return generateOrganizationSchema(brandContext, groundTruth);
    
    case "negative":
      // AI couldn't find info - generate comprehensive FAQPage schema
      return generateFAQSchema(brandContext, groundTruth);
    
    case "outdated":
      // AI using old info - generate schema with dateModified
      return generateFreshnessSchema(reality, brandContext);
    
    default:
      return null;
  }
}

/**
 * Generate Organization schema to correct misattribution
 */
export function generateOrganizationSchema(
  brand: BrandContext,
  groundTruth?: GroundTruthData
): SchemaFix {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": brand.name,
    "url": `https://${brand.domain}`,
    "description": brand.description || groundTruth?.company_description || "",
    "slogan": groundTruth?.tagline || undefined,
    "knowsAbout": [
      ...(brand.services || []),
      ...(brand.products || []),
      ...(groundTruth?.services || []),
      ...(groundTruth?.products || []),
    ].filter(Boolean).slice(0, 10),
    "sameAs": brand.sameAsLinks || [],
    "areaServed": brand.location ? {
      "@type": "Place",
      "name": brand.location,
    } : undefined,
  };

  // Clean undefined values
  const cleanSchema = JSON.parse(JSON.stringify(schema));

  return {
    schema_type: "Organization",
    json_ld: `<script type="application/ld+json">
${JSON.stringify(cleanSchema, null, 2)}
</script>`,
    placement_hint: "Add to <head> section of homepage",
    fixes_issue: "Helps AI understand what your organization actually does",
  };
}

/**
 * Generate schema to correct false pricing/feature claims
 */
function generateCorrectiveSchema(
  claim: string,
  reality: string,
  brand: BrandContext,
  groundTruth?: GroundTruthData
): SchemaFix {
  const claimLC = claim.toLowerCase();

  // Check if it's a pricing-related hallucination
  if (claimLC.includes("price") || claimLC.includes("cost") || claimLC.includes("free") || claimLC.includes("$")) {
    return generatePricingSchema(brand, groundTruth);
  }

  // Check if it's a service/product hallucination
  if (claimLC.includes("offer") || claimLC.includes("provide") || claimLC.includes("service")) {
    return generateServiceSchema(brand, groundTruth);
  }

  // Default to FAQ schema to clarify the issue
  return {
    schema_type: "FAQPage",
    json_ld: generateFAQJsonLd([
      {
        question: `What does ${brand.name} actually offer?`,
        answer: reality,
      },
    ], brand),
    placement_hint: "Add to homepage or FAQ page <head>",
    fixes_issue: `Corrects AI claim: "${claim.slice(0, 100)}..."`,
  };
}

/**
 * Generate Offer schema for correct pricing
 */
function generatePricingSchema(
  brand: BrandContext,
  groundTruth?: GroundTruthData
): SchemaFix {
  const pricing = brand.pricing || groundTruth?.pricing || [];

  if (pricing.length === 0) {
    // No pricing data - generate placeholder
    return {
      schema_type: "Product",
      json_ld: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "${brand.name}",
  "description": "${brand.description || ''}",
  "brand": {
    "@type": "Brand",
    "name": "${brand.name}"
  },
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "url": "https://${brand.domain}/pricing"
  }
}
</script>`,
      placement_hint: "Add to pricing page <head>. Update price values with actual prices.",
      fixes_issue: "Provides correct pricing information to AI",
    };
  }

  // Generate offers from actual pricing data
  const offers = pricing.map(p => ({
    "@type": "Offer",
    "name": p.plan_name,
    "price": extractPrice(p.price),
    "priceCurrency": extractCurrency(p.price),
    "description": p.features?.join(", ") || "",
    "availability": "https://schema.org/InStock",
  }));

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": brand.name,
    "description": brand.description || "",
    "brand": {
      "@type": "Brand",
      "name": brand.name,
    },
    "offers": offers.length === 1 ? offers[0] : offers,
  };

  return {
    schema_type: "Offer",
    json_ld: `<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`,
    placement_hint: "Add to pricing page <head>",
    fixes_issue: "Provides accurate pricing to prevent hallucinations",
  };
}

/**
 * Generate Service schema
 */
function generateServiceSchema(
  brand: BrandContext,
  groundTruth?: GroundTruthData
): SchemaFix {
  const services = brand.services || groundTruth?.services || [];
  const products = brand.products || groundTruth?.products || [];

  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": brand.name,
    "url": `https://${brand.domain}`,
    "description": brand.description || groundTruth?.company_description || "",
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": `${brand.name} Services`,
      "itemListElement": [
        ...services.map((s, i) => ({
          "@type": "Service",
          "position": i + 1,
          "name": s,
        })),
        ...products.map((p, i) => ({
          "@type": "Product",
          "position": services.length + i + 1,
          "name": p,
        })),
      ],
    },
  };

  return {
    schema_type: "Service",
    json_ld: `<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`,
    placement_hint: "Add to services/products page <head>",
    fixes_issue: "Clarifies exactly what services/products are offered",
  };
}

/**
 * Generate FAQPage schema to make info visible to AI
 */
function generateFAQSchema(
  brand: BrandContext,
  groundTruth?: GroundTruthData
): SchemaFix {
  const faqs: Array<{ question: string; answer: string }> = [];

  // Generate FAQs from ground truth
  if (groundTruth?.faq_content) {
    for (const faq of groundTruth.faq_content.slice(0, 5)) {
      // Parse Q: A: format
      const match = faq.match(/Q:\s*(.+?)\s*A:\s*(.+)/i);
      if (match) {
        faqs.push({ question: match[1], answer: match[2] });
      }
    }
  }

  // Add standard FAQs if none found
  if (faqs.length === 0) {
    faqs.push(
      { question: `What is ${brand.name}?`, answer: brand.description || groundTruth?.company_description || `${brand.name} is a ${brand.industry || 'company'}.` },
      { question: `What services does ${brand.name} offer?`, answer: (brand.services || groundTruth?.services || []).join(", ") || "Contact us for details." },
    );
    
    if (brand.pricing || groundTruth?.pricing) {
      const pricing = brand.pricing || groundTruth?.pricing || [];
      faqs.push({
        question: `What are ${brand.name}'s pricing plans?`,
        answer: pricing.map(p => `${p.plan_name}: ${p.price}`).join("; ") || "Contact us for pricing.",
      });
    }
  }

  return {
    schema_type: "FAQPage",
    json_ld: generateFAQJsonLd(faqs, brand),
    placement_hint: "Add to FAQ page or homepage <head>",
    fixes_issue: "Makes key information visible to AI crawlers",
  };
}

/**
 * Generate schema with freshness signals
 */
function generateFreshnessSchema(
  currentInfo: string,
  brand: BrandContext
): SchemaFix {
  const today = new Date().toISOString().split("T")[0];

  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": `${brand.name} - Current Information`,
    "description": currentInfo,
    "dateModified": today,
    "datePublished": today,
    "publisher": {
      "@type": "Organization",
      "name": brand.name,
      "url": `https://${brand.domain}`,
    },
    "mainEntity": {
      "@type": "Article",
      "headline": `Latest from ${brand.name}`,
      "dateModified": today,
      "articleBody": currentInfo,
    },
  };

  return {
    schema_type: "Article",
    json_ld: `<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`,
    placement_hint: "Add to relevant page <head>. Update dateModified whenever content changes.",
    fixes_issue: "Signals to AI that content is current and should replace outdated information",
  };
}

// ===========================================
// Helper Functions
// ===========================================

function generateFAQJsonLd(
  faqs: Array<{ question: string; answer: string }>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  brand: BrandContext
): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer,
      },
    })),
  };

  return `<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`;
}

function extractPrice(priceStr: string): string {
  // Extract numeric price from string like "$99/month" or "99 USD"
  const match = priceStr.match(/[\d,.]+/);
  return match ? match[0].replace(",", "") : "0";
}

function extractCurrency(priceStr: string): string {
  if (priceStr.includes("$") || priceStr.toLowerCase().includes("usd")) return "USD";
  if (priceStr.includes("€") || priceStr.toLowerCase().includes("eur")) return "EUR";
  if (priceStr.includes("£") || priceStr.toLowerCase().includes("gbp")) return "GBP";
  if (priceStr.toLowerCase().includes("aed")) return "AED";
  return "USD";
}

/**
 * Generate LocalBusiness schema for local SEO
 */
export function generateLocalBusinessSchema(
  brand: BrandContext,
  address?: { street?: string; city?: string; region?: string; postalCode?: string; country?: string },
  phone?: string,
  email?: string
): SchemaFix {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": brand.name,
    "url": `https://${brand.domain}`,
    "description": brand.description || "",
    "telephone": phone || undefined,
    "email": email || undefined,
    "address": address ? {
      "@type": "PostalAddress",
      "streetAddress": address.street,
      "addressLocality": address.city,
      "addressRegion": address.region,
      "postalCode": address.postalCode,
      "addressCountry": address.country,
    } : undefined,
    "sameAs": brand.sameAsLinks || [],
  };

  // Clean undefined values
  const cleanSchema = JSON.parse(JSON.stringify(schema));

  return {
    schema_type: "LocalBusiness",
    json_ld: `<script type="application/ld+json">
${JSON.stringify(cleanSchema, null, 2)}
</script>`,
    placement_hint: "Add to homepage and contact page <head>",
    fixes_issue: "Improves local search visibility and NAP consistency",
  };
}

