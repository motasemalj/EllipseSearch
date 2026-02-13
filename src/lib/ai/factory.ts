/**
 * Engine Factory - Core AI Simulation Layer
 *
 * PRODUCTION PARITY ARCHITECTURE:
 * Each engine now uses its native grounding API to match real-world behavior.
 *
 * - ChatGPT: OpenAI model (default: gpt-5-nano) with web_search_preview tool (Responses API)
 * - Gemini: Vertex AI with google_search_retrieval grounding (NOT Tavily)
 * - Grok: xAI native API with web_search + x_search tools
 * - Perplexity: Native API with sonar-pro model and citations
 *
 * KEY INSIGHT: Agencies will churn if our data doesn't match what they see
 * on the real AI platforms. We must use native grounding APIs.
 */

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { LRUCache } from "lru-cache";
import { 
  CHATGPT_SIM_ENABLE_WEB_SEARCH, 
  OPENAI_CHATGPT_SIM_MODEL,
  CHATGPT_SIM_MODE,
  CHATGPT_SIMULATION_REASONING_EFFORT,
  ENABLE_SIMULATION_CACHE,
  SIMULATION_CACHE_TTL_MS,
  SIMULATION_CACHE_MAX_SIZE,
} from "@/lib/ai/openai-config";
import { UNTRUSTED_CONTENT_POLICY } from "@/lib/ai/prompt-policies";
import type {
  SupportedLanguage,
  SupportedRegion,
  SimulationRawResult,
  RunSimulationInput,
  SearchContext,
  SourceReference,
  StandardizedResult,
  StandardizedSource,
  GroundingMetadata,
  XPost,
} from "@/types";
import { getRegionInfo } from "@/types";
import { calculateAuthorityScore, getAuthorityTier, getSourceType, isBrandDomainMatch } from "@/lib/ai/citation-authority";
import { 
  extractRegistrableDomain, 
  extractUrlsFromText, 
  extractMarkdownLinks,
  canonicalizeUrl,
} from "@/lib/ai/domain-utils";

// ===========================================
// API Clients
// ===========================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const googleAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

// Perplexity uses OpenAI-compatible API
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: "https://api.perplexity.ai",
});

// xAI Grok uses OpenAI-compatible API
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

// ===========================================
// Response Caching
// ===========================================

const simulationCache = new LRUCache<string, SimulationRawResult>({
  max: SIMULATION_CACHE_MAX_SIZE,
  ttl: SIMULATION_CACHE_TTL_MS,
});

function getCacheKey(input: RunSimulationInput): string {
  return `${input.engine}:${input.keyword}:${input.region || 'global'}:${input.language}`;
}

// ===========================================
// Region Configurations
// ===========================================

const REGION_TO_OPENAI_LOCATION: Record<SupportedRegion, { city?: string; country: string; region?: string; timezone?: string } | null> = {
  global: null,
  us: { city: "New York", country: "US", region: "New York", timezone: "America/New_York" },
  uk: { city: "London", country: "GB", region: "England", timezone: "Europe/London" },
  ae: { city: "Dubai", country: "AE", region: "Dubai", timezone: "Asia/Dubai" },
  sa: { city: "Riyadh", country: "SA", region: "Riyadh Region", timezone: "Asia/Riyadh" },
  de: { city: "Berlin", country: "DE", region: "Berlin", timezone: "Europe/Berlin" },
  fr: { city: "Paris", country: "FR", region: "Île-de-France", timezone: "Europe/Paris" },
  in: { city: "Mumbai", country: "IN", region: "Maharashtra", timezone: "Asia/Kolkata" },
  au: { city: "Sydney", country: "AU", region: "New South Wales", timezone: "Australia/Sydney" },
  ca: { city: "Toronto", country: "CA", region: "Ontario", timezone: "America/Toronto" },
  jp: { city: "Tokyo", country: "JP", region: "Tokyo", timezone: "Asia/Tokyo" },
  sg: { city: "Singapore", country: "SG", timezone: "Asia/Singapore" },
  br: { city: "São Paulo", country: "BR", region: "São Paulo", timezone: "America/Sao_Paulo" },
  mx: { city: "Mexico City", country: "MX", region: "Mexico City", timezone: "America/Mexico_City" },
  nl: { city: "Amsterdam", country: "NL", region: "North Holland", timezone: "Europe/Amsterdam" },
  es: { city: "Madrid", country: "ES", region: "Community of Madrid", timezone: "Europe/Madrid" },
  it: { city: "Rome", country: "IT", region: "Lazio", timezone: "Europe/Rome" },
  eg: { city: "Cairo", country: "EG", region: "Cairo Governorate", timezone: "Africa/Cairo" },
  kw: { city: "Kuwait City", country: "KW", timezone: "Asia/Kuwait" },
  qa: { city: "Doha", country: "QA", timezone: "Asia/Qatar" },
  bh: { city: "Manama", country: "BH", timezone: "Asia/Bahrain" },
};

// ===========================================
// 1. CHATGPT PIPELINE (OpenAI with Web Search)
// ===========================================

/**
 * ChatGPT Simulation - Production Parity
 * Uses gpt-5-nano with web_search_preview tool via Responses API
 */
async function runChatGPTSimulation(
  keyword: string,
  language: SupportedLanguage,
  region: SupportedRegion = "global",
  brandDomain: string
): Promise<SimulationRawResult> {
  const langInstruction = language === "ar" ? " Respond in Arabic." : "";
  const regionInfo = getRegionInfo(region);
  const regionInstruction = region !== "global" 
    ? ` The user is located in ${regionInfo.name}. Prioritize information relevant to this region.`
    : "";
  
  const regionalQuery = region !== "global" && regionInfo.searchHint 
    ? `${keyword} ${regionInfo.searchHint}`
    : keyword;

  console.log(`[ChatGPT] Searching: "${keyword}" (region: ${region})`);

  // FIX: When web search is enabled, we MUST use regionalQuery to get region-specific results
  const inputQuery = CHATGPT_SIM_ENABLE_WEB_SEARCH ? regionalQuery : keyword;
  
  // Deep research models have specific constraints:
  // - Only support reasoning.effort "medium"
  // - Only support search_context_size "medium"  
  // - Do not support user_location
  const isDeepResearchModel = OPENAI_CHATGPT_SIM_MODEL.includes("deep-research");
  
  const request: Record<string, unknown> = {
    model: OPENAI_CHATGPT_SIM_MODEL,
    input: inputQuery,
    instructions: `You are ChatGPT. Answer naturally and helpfully.${langInstruction}${regionInstruction}\n\n${UNTRUSTED_CONTENT_POLICY}`,
    // Deep research models only support "medium" reasoning effort
    // For gpt-5-nano: use the configured reasoning effort (default "medium")
    reasoning: { effort: isDeepResearchModel ? "medium" : CHATGPT_SIMULATION_REASONING_EFFORT },
    max_output_tokens: isDeepResearchModel ? 16000 : 8192,
  };

  if (CHATGPT_SIM_ENABLE_WEB_SEARCH) {
    const locationConfig = REGION_TO_OPENAI_LOCATION[region];
    
    type WebSearchTool = {
      type: "web_search_preview" | "web_search";
      search_context_size?: "low" | "medium" | "high";
      user_location?: {
        type: "approximate";
        city?: string;
        country: string;
        region?: string;
        timezone?: string;
      };
    };
    
    // Deep research models only support search_context_size "medium" and don't support user_location
    const webSearchTool: WebSearchTool = { 
      type: CHATGPT_SIM_MODE === "stable" ? "web_search" : "web_search_preview",
      search_context_size: isDeepResearchModel ? "medium" : "high",
    };
    
    // Deep research models don't support user_location - skip for those models
    if (locationConfig && !isDeepResearchModel) {
      webSearchTool.user_location = {
        type: "approximate",
        ...locationConfig,
      };
      console.log(`[ChatGPT] Using regional web search (${CHATGPT_SIM_MODE} mode) for: ${locationConfig.city || locationConfig.country}`);
    } else if (locationConfig && isDeepResearchModel) {
      console.log(`[ChatGPT] Deep research model - skipping user_location (region hint: ${locationConfig.city || locationConfig.country})`);
    }
    
    request.tools = [webSearchTool];
    request.include = ["web_search_call.action.sources"];
  }

  const response = await openai.responses.create(
    request as unknown as Parameters<typeof openai.responses.create>[0]
  );
  const responseObj = response as unknown as { output?: unknown; output_text?: unknown };

  const sources: SourceReference[] = [];
  const searchResults: Array<{ url: string; title: string; snippet: string }> = [];
  const seenUrls = new Set<string>();

  const outputItems = Array.isArray(responseObj.output) ? responseObj.output : [];

  // Check response status first
  const responseAny = response as unknown as Record<string, unknown>;
  const responseStatus = responseAny.status;
  const incompleteDetails = responseAny.incomplete_details as { reason?: string } | null;
  
  if (responseStatus !== "completed") {
    console.warn(`[ChatGPT] Response status: ${responseStatus}`);
    if (incompleteDetails?.reason) {
      console.warn(`[ChatGPT] Incomplete reason: ${incompleteDetails.reason}`);
    }
  }
  
  // FIX: Extract content from multiple possible locations in the response
  // The Responses API can return content in different formats depending on model and settings
  let messageContent = "";
  let reasoningContent = ""; // Fallback: extract from reasoning items
  const contentTypes: string[] = [];
  const outputItemTypes: string[] = [];
  
  for (const item of outputItems as Array<{ type?: unknown; content?: unknown; summary?: unknown }>) {
    const itemType = String((item as { type?: unknown }).type || "");
    outputItemTypes.push(itemType);
    
    if (item.type === "message") {
      const msgContent = (item as unknown as { content?: unknown })?.content;
      if (Array.isArray(msgContent)) {
        for (const contentItem of msgContent as Array<{ type?: unknown; text?: unknown; value?: unknown }>) {
          const cType = String(contentItem.type || "");
          contentTypes.push(cType);
          
          // Handle multiple possible content formats
          let textValue: string | undefined;
          
          if (typeof contentItem.text === "string") {
            textValue = contentItem.text;
          } else if (typeof contentItem.value === "string") {
            textValue = contentItem.value;
          }
          
          if (textValue && textValue.trim().length > 0) {
            messageContent += messageContent ? `\n${textValue.trim()}` : textValue.trim();
          }
        }
      }
      
      // Also check if the message itself has a text property directly
      const directText = (item as unknown as { text?: unknown })?.text;
      if (typeof directText === "string" && directText.trim().length > 0) {
        const trimmedDirect = directText.trim();
        if (trimmedDirect.length > messageContent.length) {
          messageContent = trimmedDirect;
        }
      }
    } else if (item.type === "reasoning") {
      // Extract reasoning summary as fallback content
      // Reasoning items may have a 'summary' field with useful text
      const summary = (item as { summary?: unknown })?.summary;
      if (typeof summary === "string" && summary.trim().length > 0) {
        reasoningContent += reasoningContent ? `\n${summary.trim()}` : summary.trim();
      }
      
      // Also check for content array in reasoning items
      const reasoningItemContent = (item as unknown as { content?: unknown })?.content;
      if (Array.isArray(reasoningItemContent)) {
        for (const contentItem of reasoningItemContent as Array<{ type?: unknown; text?: unknown }>) {
          if (typeof contentItem.text === "string" && contentItem.text.trim().length > 0) {
            reasoningContent += reasoningContent ? `\n${contentItem.text.trim()}` : contentItem.text.trim();
          }
        }
      }
    }
  }

  // Use message content if available, then output_text, then reasoning as last resort
  const outputText = responseObj.output_text;
  const outputTextStr = typeof outputText === "string" ? outputText.trim() : "";
  
  // Choose the best content source (prioritize: message > output_text > reasoning)
  let content = "";
  if (messageContent.length > 10) {
    content = messageContent;
  } else if (outputTextStr.length > 10) {
    content = outputTextStr;
  } else if (reasoningContent.length > 50) {
    // Use reasoning content as fallback if no message output
    console.warn(`[ChatGPT] No message output, using reasoning content as fallback`);
    content = reasoningContent;
  } else {
    content = messageContent || outputTextStr;
  }
  
  // Debug logging for content extraction
  console.log(`[ChatGPT] Content extraction: message=${messageContent.length} chars, output_text=${outputTextStr.length} chars, reasoning=${reasoningContent.length} chars, using=${content.length} chars`);
  console.log(`[ChatGPT] Output item types: ${outputItemTypes.join(", ")}`);
  if (contentTypes.length > 0) {
    console.log(`[ChatGPT] Message content types: ${Array.from(new Set(contentTypes)).join(", ")}`);
  }
  
  // Last resort: if content is still very short, this indicates an incomplete response
  if (content.length < 50) {
    console.warn(`[ChatGPT] Very short content (${content.length} chars), trying fallback extraction...`);
    
    // Check if there's a 'text' property that's actually text (not the config object)
    if (typeof responseAny.text === 'object' && responseAny.text !== null) {
      // The 'text' field is the config, not content - skip it
    } else if (typeof responseAny.text === 'string' && responseAny.text.length > content.length) {
      content = responseAny.text;
      console.log(`[ChatGPT] Found content in response.text: ${content.length} chars`);
    }
    
    // Try to get any text from output items
    if (content.length < 50) {
      for (const item of outputItems) {
        const itemAny = item as Record<string, unknown>;
        // Check for text, summary, or content properties
        for (const key of ['text', 'summary', 'content']) {
          const val = itemAny[key];
          if (typeof val === 'string' && val.length > content.length && val.length > 50) {
            // Only use if it looks like actual content
            if (!val.startsWith('{') && !val.startsWith('[')) {
              content = val;
              console.log(`[ChatGPT] Found content in output item.${key}: ${content.length} chars`);
              break;
            }
          }
        }
        if (content.length >= 50) break;
      }
    }
    
    // Log the response structure for debugging if still no content
    if (content.length < 50) {
      console.error(`[ChatGPT] CRITICAL: Could not extract meaningful content.`);
      console.error(`[ChatGPT] Response status: ${responseStatus}, incomplete_details: ${JSON.stringify(incompleteDetails)}`);
      console.error(`[ChatGPT] Response keys: ${Object.keys(responseAny).join(', ')}`);
      console.error(`[ChatGPT] Output items count: ${outputItems.length}, types: ${outputItemTypes.join(', ')}`);
      
      // If the response is incomplete due to max_output_tokens, we should note this
      if (incompleteDetails?.reason === "max_output_tokens" || 
          incompleteDetails?.reason === "length" ||
          !outputItemTypes.includes("message")) {
        content = "[Response incomplete - the AI model is still processing. This may be due to a complex query requiring extensive reasoning. Please try again or simplify the query.]";
        console.error(`[ChatGPT] Response appears truncated or incomplete - no message output generated`);
      }
    }
  }

  // Second pass: extract web search results and sources
  for (const item of outputItems as Array<{ type?: unknown; content?: unknown }>) {
    if (item.type === "web_search_call") {
      console.log(`[ChatGPT] Web search performed for: "${keyword}"`);
      
      const maybeSources = (item as unknown as { action?: { sources?: unknown } })?.action?.sources;
      if (Array.isArray(maybeSources)) {
        for (const source of maybeSources as Array<{ url?: unknown; title?: unknown; snippet?: unknown }>) {
          const rawUrl = typeof source.url === "string" ? source.url : "";
          if (!rawUrl) continue;
          
          // Canonicalize URL for deduplication
          const canonicalUrl = canonicalizeUrl(rawUrl);
          if (seenUrls.has(canonicalUrl)) continue;
          seenUrls.add(canonicalUrl);
          
          sources.push({
            url: rawUrl,
            title: typeof source.title === "string" ? source.title : "",
          });
          searchResults.push({
            url: rawUrl,
            title: typeof source.title === "string" ? source.title : "",
            snippet: typeof source.snippet === "string" ? source.snippet : "",
          });
        }
      }
    }
  }

  // Extract citations from annotations (third pass)
  for (const item of outputItems as Array<{ type?: unknown; content?: unknown }>) {
    if (item.type === "message") {
      const msgContent = (item as unknown as { content?: unknown })?.content;
      if (!Array.isArray(msgContent)) continue;
      for (const contentItem of msgContent as Array<{ type?: unknown; annotations?: unknown }>) {
        // Check for both "text" and "output_text" content types
        const itemType = (contentItem as { type?: unknown }).type;
        if (itemType !== "text" && itemType !== "output_text") continue;
        const annotations = (contentItem as unknown as { annotations?: unknown })?.annotations;
        if (!Array.isArray(annotations)) continue;
        for (const ann of annotations as Array<{ type?: unknown; url?: unknown; title?: unknown }>) {
          if (ann.type !== "url_citation") continue;
          const rawUrl = typeof ann.url === "string" ? ann.url : "";
          if (!rawUrl) continue;
          
          const canonicalUrl = canonicalizeUrl(rawUrl);
          if (seenUrls.has(canonicalUrl)) continue;
          seenUrls.add(canonicalUrl);
          
          sources.push({
            url: rawUrl,
            title: typeof ann.title === "string" ? ann.title : "",
          });
          searchResults.push({
            url: rawUrl,
            title: typeof ann.title === "string" ? ann.title : "",
            snippet: "",
          });
        }
      }
    }
  }

  const searchContext: SearchContext = {
    query: keyword,
    results: searchResults.map((r, index) => ({
      url: r.url,
      title: r.title,
      snippet: r.snippet,
      body: r.snippet,
      score: index + 1,
    })),
    raw_response: response,
  };

  console.log(`[ChatGPT] Response generated with ${sources.length} sources for: "${keyword}"`);

  // Debug: Log warning if content is unexpectedly short
  if (content.length < 100) {
    console.warn(`[ChatGPT] WARNING: Short response (${content.length} chars). Output items: ${outputItems.length}`);
    // Log the structure of output items for debugging
    for (let i = 0; i < Math.min(outputItems.length, 3); i++) {
      const item = outputItems[i] as { type?: unknown; content?: unknown };
      console.warn(`[ChatGPT] Output item ${i}: type=${item.type}`);
      if (item.type === "message" && Array.isArray(item.content)) {
        const msgContentTypes = (item.content as Array<{ type?: unknown }>).map(c => c.type);
        console.warn(`[ChatGPT]   Content types: ${JSON.stringify(msgContentTypes)}`);
      }
    }
    
    // Check if response was truncated
    const hasMessageOutput = outputItemTypes.includes("message");
    if (!hasMessageOutput && sources.length > 0) {
      console.error(`[ChatGPT] ISSUE: Web search returned ${sources.length} sources but no message output was generated.`);
      console.error(`[ChatGPT] This usually means max_output_tokens was too low for reasoning + web search.`);
      console.error(`[ChatGPT] Response status: ${responseStatus}, incomplete_details: ${JSON.stringify(incompleteDetails)}`);
      
      // Create a fallback response that at least shows the sources
      if (content.length < 50 && sources.length > 0) {
        const topSources = sources.slice(0, 5).map(s => `- ${s.title || s.url}`).join('\n');
        content = `[The AI model performed web searches but did not generate a complete response. Top sources found:\n${topSources}]\n\nPlease try running this query again.`;
      }
    }
  }

  // Create standardized result (sentiment will be calculated by enrichment)
  const standardized = createStandardizedResult(
    'chatgpt',
    content,
    sources,
    brandDomain,
    searchContext.results
  );

  return {
    answer_html: content,
    sources,
    search_context: searchContext.results.length > 0 ? searchContext : undefined,
    standardized,
  };
}

// ===========================================
// 2. GEMINI PIPELINE (Vertex AI with Google Search Grounding)
// ===========================================

/**
 * Gemini Simulation - Uses Google's native grounding
 * 
 * CRITICAL: Uses google_search_retrieval tool which uses the same
 * Google Search infrastructure as consumer Gemini, NOT Tavily.
 */
async function runGeminiSimulation(
  keyword: string,
  language: SupportedLanguage,
  region: SupportedRegion = "global",
  brandDomain: string
): Promise<SimulationRawResult> {
  const regionInfo = getRegionInfo(region);
  const langInstruction = language === "ar" ? "Respond in Arabic. " : "";
  const regionInstruction = region !== "global" 
    ? `The user is searching from ${regionInfo.name}. Prioritize regional results. `
    : "";

  console.log(`[Gemini] Searching with Google grounding: "${keyword}" (region: ${region})`);

  const model = googleAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    tools: [{
      // @ts-expect-error - google_search is the new format, SDK types not updated
      google_search: {},
    }],
  });

  const prompt = `${langInstruction}${regionInstruction}${keyword}\n\n${UNTRUSTED_CONTENT_POLICY}`;
  
  const result = await model.generateContent(prompt);
  const response = result.response;
  const content = response.text();
  
  // Extract grounding metadata from the response
  const groundingMetadata: GroundingMetadata = {
    web_search_queries: [],
    grounding_chunks: [],
    grounding_coverage: 0,
  };
  
  const sources: SourceReference[] = [];
  const searchResults: Array<{ url: string; title: string; snippet: string; is_grounded?: boolean }> = [];

  // Vertex grounding redirect resolver
  const resolveVertexGroundingRedirect = async (url: string): Promise<string | null> => {
    if (!url.includes("vertexaisearch.cloud.google.com/grounding-api-redirect/")) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: controller.signal });
      clearTimeout(timeout);

      const location = res.headers.get("location");
      if (location && (location.startsWith("http://") || location.startsWith("https://"))) {
        return location;
      }

      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 2500);
      const res2 = await fetch(url, { method: "GET", redirect: "follow", signal: controller2.signal });
      clearTimeout(timeout2);
      if (res2.url && (res2.url.startsWith("http://") || res2.url.startsWith("https://"))) {
        return res2.url;
      }
    } catch {
      // ignore
    }
    return null;
  };
  
  // Parse grounding metadata from response
  const rawMetadata = (response as unknown as { 
    candidates?: Array<{
      groundingMetadata?: {
        webSearchQueries?: string[];
        groundingChunks?: Array<{
          web?: { uri: string; title?: string };
        }>;
        groundingSupports?: Array<{
          segment?: { text: string };
          groundingChunkIndices?: number[];
          confidenceScores?: number[];
        }>;
      };
    }>;
  })?.candidates?.[0]?.groundingMetadata;
  
  // Track per-source confidence scores
  const sourceConfidences: Map<string, number[]> = new Map();
  
  if (rawMetadata) {
    groundingMetadata.web_search_queries = rawMetadata.webSearchQueries || [];
    
    const internalDomains = [
      'cloud.google.com/vertex-ai',
      'generativelanguage.googleapis.com',
    ];

    if (rawMetadata.groundingChunks) {
      const chunks = rawMetadata.groundingChunks
        .filter((c) => !!c.web?.uri)
        .slice(0, 12);

      const resolvedUrls = await Promise.all(
        chunks.map(async (chunk) => {
          const originalUrl = chunk.web!.uri;
          const resolved = await resolveVertexGroundingRedirect(originalUrl);
          return {
            url: resolved || originalUrl,
            title: chunk.web!.title || "",
          };
        })
      );

      for (let i = 0; i < resolvedUrls.length; i++) {
        const item = resolvedUrls[i];
        const url = item.url;

        const isInternalUrl = internalDomains.some((domain) => url.includes(domain));
        if (isInternalUrl) continue;

        // Initialize confidence tracking for this source
        if (!sourceConfidences.has(url)) {
          sourceConfidences.set(url, []);
        }

        sources.push({
          url,
          title: item.title,
          // Don't set confidence yet - calculate after processing supports
          grounding_confidence: undefined,
        });
        searchResults.push({
          url,
          title: item.title,
          snippet: "",
          is_grounded: true,
        });

        groundingMetadata.grounding_chunks?.push({
          text: "",
          source_url: url,
          confidence: 0, // Will be updated
        });
      }
    }
    
    // Process grounding supports to get actual confidence scores
    if (rawMetadata.groundingSupports && rawMetadata.groundingSupports.length > 0) {
      let totalConfidence = 0;
      let confidenceCount = 0;
      
      for (const support of rawMetadata.groundingSupports) {
        const scores = support.confidenceScores || [];
        const indices = support.groundingChunkIndices || [];
        
        for (let i = 0; i < indices.length; i++) {
          const chunkIndex = indices[i];
          const score = scores[i] ?? 0.5;
          
          // Map to source URL if possible
          if (chunkIndex < sources.length) {
            const sourceUrl = sources[chunkIndex]?.url;
            if (sourceUrl) {
              const existing = sourceConfidences.get(sourceUrl) || [];
              existing.push(score);
              sourceConfidences.set(sourceUrl, existing);
            }
          }
          
          totalConfidence += score;
          confidenceCount++;
        }
      }
      
      // Calculate overall grounding coverage as average confidence
      groundingMetadata.grounding_coverage = confidenceCount > 0 
        ? Math.round((totalConfidence / confidenceCount) * 100)
        : 0;
        
      // Update source confidence scores with actual averages
      for (let i = 0; i < sources.length; i++) {
        const url = sources[i].url;
        const confidences = sourceConfidences.get(url);
        if (confidences && confidences.length > 0) {
          const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
          sources[i].grounding_confidence = avgConfidence;
          
          // Also update grounding_chunks
          if (groundingMetadata.grounding_chunks?.[i]) {
            groundingMetadata.grounding_chunks[i].confidence = avgConfidence;
          }
        }
        // If no confidence data, leave as undefined (unknown) rather than 1.0
      }
    }
    
    console.log(`[Gemini] Grounding: ${groundingMetadata.web_search_queries?.length || 0} queries, ${sources.length} sources, ${groundingMetadata.grounding_coverage}% coverage`);
  }
  
  // Fallback: Extract sources from response text if no grounding metadata
  if (sources.length === 0) {
    const extractedSources = extractSourcesFromResponse(content, { query: keyword, results: [] });
    sources.push(...extractedSources);
  }

  const searchContext: SearchContext = {
    query: keyword,
    results: searchResults,
    raw_response: response,
    grounding_metadata: groundingMetadata,
    derived_queries: groundingMetadata.web_search_queries,
  };

  const standardized = createStandardizedResult(
    'gemini',
    content,
    sources,
    brandDomain,
    searchResults,
    groundingMetadata
  );

  return {
    answer_html: content,
    sources,
    search_context: searchContext,
    standardized,
  };
}

// ===========================================
// 3. GROK PIPELINE (xAI with Web + X Search)
// ===========================================

/**
 * Clean Grok response content by removing internal function call metadata
 */
function cleanGrokResponse(content: string): string {
  if (!content) return "";
  
  let cleaned = content;
  
  const aggressivePatterns = [
    /<[^>]*functioncall[^>]*>[\s\S]*?<\/[^>]*functioncall[^>]*>/gi,
    /<[^>]*function_call[^>]*>[\s\S]*?<\/[^>]*function_call[^>]*>/gi,
    /<[^>]*functioncall[^>]*>[\s\S]*/gi,
    /<[^>]*function_call[^>]*>[\s\S]*/gi,
    /<hasfunctioncall>[^]*$/gi,
    /<functioncall>[^]*$/gi,
  ];
  
  for (const pattern of aggressivePatterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  
  const tagPatterns = [
    /<hasfunctioncall>[\s\S]*?<\/hasfunctioncall>/gi,
    /<functioncall>[\s\S]*?<\/functioncall>/gi,
    /<function_call>[\s\S]*?<\/function_call>/gi,
    /<tool_call>[\s\S]*?<\/tool_call>/gi,
    /<websearch>[\s\S]*?<\/websearch>/gi,
    /<search>[\s\S]*?<\/search>/gi,
    /<hasfunctioncall>[\s\S]*/gi,
    /<functioncall>[\s\S]*/gi,
    /<function_call>[\s\S]*/gi,
    /<tool_call>[\s\S]*/gi,
    /<websearch>[\s\S]*/gi,
    /<\/?hasfunctioncall[^>]*>/gi,
    /<\/?functioncall[^>]*>/gi,
    /<\/?function_call[^>]*>/gi,
    /<\/?tool_call[^>]*>/gi,
    /<\/?websearch[^>]*>/gi,
    /&lt;hasfunctioncall&gt;[\s\S]*?(&lt;\/hasfunctioncall&gt;)?/gi,
    /&lt;functioncall&gt;[\s\S]*?(&lt;\/functioncall&gt;)?/gi,
  ];
  
  for (const pattern of tagPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  
  const processingPhrases = [
    /I am searching the web for[^.]*\.?\s*/gi,
    /I am searching for[^.]*\.?\s*/gi,
    /I'm searching the web for[^.]*\.?\s*/gi,
    /I'm searching for[^.]*\.?\s*/gi,
    /Searching the web for[^.]*\.?\s*/gi,
    /Searching for[^.]*\.?\s*/gi,
    /Let me search[^.]*\.?\s*/gi,
    /I'll search[^.]*\.?\s*/gi,
    /I will search[^.]*\.?\s*/gi,
    /I am calling the \w+ function[^.]*\.?\s*/gi,
    /Calling the \w+ function[^.]*\.?\s*/gi,
    /I am using web search[^.]*\.?\s*/gi,
    /Using web search[^.]*\.?\s*/gi,
    /I need to search[^.]*\.?\s*/gi,
    /\[web_search\][^.]*\.?\s*/gi,
    /\[x_search\][^.]*\.?\s*/gi,
  ];
  
  for (const pattern of processingPhrases) {
    cleaned = cleaned.replace(pattern, "");
  }
  
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  
  const minMeaningfulLength = 20;
  if (cleaned.length < minMeaningfulLength) {
    const residualPatterns = [
      /^(searching|search|calling|let me|i am|i'm|i will|i'll)\b/i,
      /^[\s\n]*$/,
    ];
    for (const pattern of residualPatterns) {
      if (pattern.test(cleaned)) {
        console.log(`[Grok] Warning: Response appears to be only function call metadata, returning empty`);
        return "";
      }
    }
  }
  
  return cleaned;
}

/**
 * Extract tool-returned citations from Grok response
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGrokToolCitations(response: Record<string, any>): SourceReference[] {
  const sources: SourceReference[] = [];
  const seenUrls = new Set<string>();
  
  // Check for tool_calls in the response
  const toolCalls = response?.choices?.[0]?.message?.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const toolCall of toolCalls) {
      if (toolCall.type === 'function' && toolCall.function?.name === 'web_search') {
        // Parse the arguments if they contain URLs
        try {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          if (args.urls && Array.isArray(args.urls)) {
            for (const url of args.urls) {
              const canonical = canonicalizeUrl(url);
              if (!seenUrls.has(canonical)) {
                seenUrls.add(canonical);
                sources.push({ url, title: '' });
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
  
  // Also check for citations in message metadata
  const message = response?.choices?.[0]?.message;
  if (message?.citations && Array.isArray(message.citations)) {
    for (const citation of message.citations) {
      const url = citation.url || citation.href || citation.link;
      if (url) {
        const canonical = canonicalizeUrl(url);
        if (!seenUrls.has(canonical)) {
          seenUrls.add(canonical);
          sources.push({
            url,
            title: citation.title || citation.text || '',
          });
        }
      }
    }
  }
  
  return sources;
}

/**
 * Grok Simulation - xAI's Grok model with live search
 * 
 * CRITICAL: Grok has built-in live search capabilities.
 * The grok-3 model has access to real-time web and X (Twitter) data.
 */
async function runGrokSimulation(
  keyword: string,
  language: SupportedLanguage,
  region: SupportedRegion = "global",
  brandDomain: string
): Promise<SimulationRawResult> {
  const regionInfo = getRegionInfo(region);
  const langInstruction = language === "ar" ? "Respond in Arabic. " : "";
  const regionInstruction = region !== "global" 
    ? `The user is searching from ${regionInfo.name}. Prioritize regional results. `
    : "";

  console.log(`[Grok] Searching with live search: "${keyword}" (region: ${region})`);

  let response;
  try {
    const baseMessages = [
      {
        role: "system" as const,
        content: `You are Grok, an AI by xAI with real-time access to the web and X (Twitter). ${langInstruction}${regionInstruction}

Today's date is 2026-01-29.

CRITICAL:
1. Use web search to get the MOST CURRENT information (prefer last 30 days if possible).
2. Do NOT rely on training data for time-sensitive facts.
3. Always cite your sources with real URLs (never use example.com/example.org).
4. If you cannot find recent sources, say so explicitly.
5. ${UNTRUSTED_CONTENT_POLICY.replace(/\n/g, " ")}

Format citations as: [Source Title](URL) or mention the source domain inline.`,
      },
      { role: "user" as const, content: keyword },
    ];

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = await (xai.chat.completions.create as unknown as (body: Record<string, unknown>) => Promise<Record<string, any>>)({
        model: "grok-4-1-fast-reasoning",
        messages: baseMessages,
        tools: [{ type: "web_search" }, { type: "x_search" }],
        tool_choice: "auto",
      });
    } catch (toolErr) {
      const toolMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
      if (toolMsg.toLowerCase().includes("tools") || toolMsg.toLowerCase().includes("tool_choice")) {
        response = await xai.chat.completions.create({
          model: "grok-4-1-fast-reasoning",
          messages: baseMessages,
        });
      } else {
        throw toolErr;
      }
    }
  } catch (apiError) {
    const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
    console.error(`[Grok] API call failed:`, errorMsg);
    
    if (errorMsg.includes('model') || errorMsg.includes('404')) {
      console.error(`[Grok] Model not found. Ensure XAI_API_KEY is valid and has access to grok-3.`);
    }
    if (errorMsg.includes('authentication') || errorMsg.includes('401')) {
      console.error(`[Grok] Authentication failed. Check XAI_API_KEY environment variable.`);
    }
    
    throw new Error(`Grok API error: ${errorMsg}`);
  }

  const rawContent = response.choices[0]?.message?.content || "";
  const content = cleanGrokResponse(rawContent);
  
  if (rawContent !== content) {
    const cleaned = rawContent.length - content.length;
    if (cleaned > 0) {
      console.log(`[Grok] Cleaned ${cleaned} chars of metadata from response`);
    }
  }
  
  const sources: SourceReference[] = [];
  const xPosts: XPost[] = [];
  const searchResults: Array<{ url: string; title: string; snippet: string }> = [];
  const seenUrls = new Set<string>();

  // PRIORITY 1: Extract tool-returned citations (most reliable)
  const toolCitations = extractGrokToolCitations(response);
  for (const citation of toolCitations) {
    const canonical = canonicalizeUrl(citation.url);
    if (!seenUrls.has(canonical)) {
      seenUrls.add(canonical);
      sources.push(citation);
      searchResults.push({
        url: citation.url,
        title: citation.title || '',
        snippet: '',
      });
    }
  }

  // PRIORITY 2: Extract markdown links from content
  if (content) {
    const markdownLinks = extractMarkdownLinks(content);
    for (const link of markdownLinks) {
      const canonical = canonicalizeUrl(link.url);
      if (!seenUrls.has(canonical)) {
        seenUrls.add(canonical);
        sources.push({
          url: link.url,
          title: link.text,
        });
        searchResults.push({
          url: link.url,
          title: link.text,
          snippet: '',
        });
      }
    }
    
    // PRIORITY 3: Extract plain URLs from text (less reliable, last resort)
    const plainUrls = extractUrlsFromText(content);
    for (const url of plainUrls) {
      const canonical = canonicalizeUrl(url);
      if (!seenUrls.has(canonical)) {
        seenUrls.add(canonical);
        sources.push({ url, title: '' });
        searchResults.push({ url, title: '', snippet: '' });
      }
    }
    
    // Extract X posts
    const xPostPattern = /https?:\/\/(?:x\.com|twitter\.com)\/(\w+)\/status\/(\d+)/gi;
    let xMatch;
    while ((xMatch = xPostPattern.exec(content)) !== null) {
      const author = xMatch[1];
      const postId = xMatch[2];
      
      if (!xPosts.find(p => p.post_id === postId)) {
        const xPost: XPost = {
          post_id: postId,
          author: author,
          text: "",
          timestamp: undefined,
        };
        xPosts.push(xPost);
        
        const xUrl = `https://x.com/${author}/status/${postId}`;
        const canonical = canonicalizeUrl(xUrl);
        if (!seenUrls.has(canonical)) {
          seenUrls.add(canonical);
          sources.push({
            url: xUrl,
            title: `@${author}`,
            snippet: "",
            is_x_post: true,
            x_post_data: xPost,
          });
        }
      }
    }
  }
  
  console.log(`[Grok] Extracted ${sources.length} sources (${toolCitations.length} from tools), ${xPosts.length} X posts from response`);
  
  if (!content || content.trim().length === 0) {
    console.error(`[Grok] ERROR: Empty response from grok-3`);
    console.error(`[Grok] Full API response:`, JSON.stringify(response, null, 2));
    throw new Error("Grok returned empty response - check XAI_API_KEY and model access");
  }

  // Calculate grounding coverage based on actual citation quality
  const citationCount = sources.length;
  const hasToolCitations = toolCitations.length > 0;
  const hasXPosts = xPosts.length > 0;
  
  // More nuanced coverage calculation:
  // - Tool-returned citations are most reliable (high weight)
  // - Markdown links are moderately reliable
  // - Plain URL extraction is least reliable
  let groundingCoverage = 0;
  if (citationCount > 0) {
    const toolWeight = hasToolCitations ? 40 : 0;
    const linkWeight = Math.min(30, (sources.length - toolCitations.length) * 10);
    const xWeight = hasXPosts ? 20 : 0;
    groundingCoverage = Math.min(100, toolWeight + linkWeight + xWeight + 10);
  }

  const groundingMetadata: GroundingMetadata = {
    x_posts: xPosts,
    grounding_coverage: groundingCoverage,
  };

  const searchContext: SearchContext = {
    query: keyword,
    results: searchResults.map((r, index) => ({
      url: r.url,
      title: r.title,
      snippet: r.snippet,
      score: index + 1,
    })),
    raw_response: response,
    grounding_metadata: groundingMetadata,
  };

  console.log(`[Grok] Response generated with ${sources.length} sources, ${xPosts.length} X posts, ${groundingCoverage}% coverage for: "${keyword}"`);

  const standardized = createStandardizedResult(
    'grok',
    content,
    sources,
    brandDomain,
    searchResults,
    groundingMetadata
  );

  return {
    answer_html: content,
    sources,
    search_context: searchContext,
    standardized,
  };
}

// ===========================================
// 4. PERPLEXITY PIPELINE (Sonar Pro)
// ===========================================

/**
 * Perplexity Simulation - Uses sonar-pro with citations
 * 
 * CRITICAL: Must use sonar-pro (not small/chat variants) for accurate citations
 */
async function runPerplexitySimulation(
  keyword: string,
  language: SupportedLanguage,
  region: SupportedRegion = "global",
  brandDomain: string
): Promise<SimulationRawResult> {
  const langHint = language === "ar" ? " Respond in Arabic." : "";
  const regionInfo = getRegionInfo(region);
  const regionHint = region !== "global" 
    ? ` The user is searching from ${regionInfo.name}. Prioritize information and sources relevant to this region.`
    : "";

  const regionalQuery = region !== "global" && regionInfo.searchHint 
    ? `${keyword} ${regionInfo.searchHint}`
    : keyword;

  console.log(`[Perplexity] Searching with sonar-pro: "${regionalQuery}" (region: ${region})`);

  const response = await perplexity.chat.completions
    .create({
      model: "sonar-pro",
      messages: [
        { 
          role: "system", 
          content: `You are a helpful search engine. Provide a detailed, well-sourced answer.${langHint}${regionHint}\n\n${UNTRUSTED_CONTENT_POLICY}` 
        },
        { role: "user", content: regionalQuery },
      ],
      // @ts-expect-error - Perplexity-specific parameter
      return_citations: true,
      return_related_questions: true,
    })
    .withResponse();

  const content = response.data.choices[0]?.message?.content || "";

  const rawData = response.data as unknown as { 
    citations?: string[];
    related_questions?: string[];
  };
  
  const citationUrls = rawData?.citations || [];
  const sources: SourceReference[] = citationUrls.map((url: string) => ({ 
    url: canonicalizeUrl(url),
  }));

  // Verify citations against text content
  const verifiedSources: SourceReference[] = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const citationMarker = `[${i + 1}]`;
    const markerIndex = content.indexOf(citationMarker);
    
    if (markerIndex !== -1) {
      const start = Math.max(0, markerIndex - 100);
      const end = Math.min(content.length, markerIndex + 100);
      const snippet = content.slice(start, end);
      
      verifiedSources.push({
        ...source,
        snippet,
        grounding_confidence: 1.0, // Verified citation
      });
    } else {
      verifiedSources.push({
        ...source,
        grounding_confidence: 0.5, // Unverified (returned but not used inline)
      });
    }
  }

  const searchContext: SearchContext = {
    query: keyword,
    results: verifiedSources.map((s, index) => ({
      url: s.url,
      title: "",
      snippet: s.snippet || "",
      score: index + 1,
      is_grounded: (s.grounding_confidence ?? 0) > 0.8,
    })),
    raw_response: response.data,
  };

  console.log(`[Perplexity] Response generated with ${verifiedSources.length} verified citations for: "${keyword}"`);

  const standardized = createStandardizedResult(
    'perplexity',
    content,
    verifiedSources,
    brandDomain,
    searchContext.results
  );

  return {
    answer_html: content,
    sources: verifiedSources,
    search_context: searchContext,
    standardized,
  };
}

// ===========================================
// Standardized Result Creation (Normalization Layer)
// ===========================================

/**
 * Creates a standardized result WITHOUT calculating sentiment.
 * Sentiment is now calculated ONLY by the LLM-based sentiment-analyzer.ts
 * during the enrichment phase to avoid inconsistent outputs.
 */
function createStandardizedResult(
  engine: 'chatgpt' | 'gemini' | 'grok' | 'perplexity',
  answerText: string,
  sources: SourceReference[],
  brandDomain: string,
  searchResults: Array<{ url: string; title: string; snippet: string }>,
  groundingMetadata?: GroundingMetadata
): StandardizedResult {
  const standardizedSources: StandardizedSource[] = sources.map(source => {
    const domain = extractRegistrableDomain(source.url);
    const isBrandMatch = isBrandDomainMatch(source.url, brandDomain);
    
    return {
      url: source.url,
      domain,
      snippet: source.snippet || "",
      is_brand_match: isBrandMatch,
      authority_score: calculateAuthorityScore(source.url),
      authority_tier: getAuthorityTier(source.url),
      source_type: getSourceType(source.url),
    };
  });

  // DO NOT calculate sentiment here - this creates inconsistency
  // Sentiment will be calculated by sentiment-analyzer.ts during enrichment
  // Set placeholder values that indicate "not yet analyzed"
  return {
    engine,
    answer_text: answerText,
    answer_html: answerText,
    sources: standardizedSources,
    grounding_metadata: groundingMetadata,
    sentiment_score: 0, // Placeholder - will be overwritten by enrichment
    sentiment_label: 'neutral', // Placeholder - will be overwritten by enrichment
  };
}

// ===========================================
// Source Extraction Fallback
// ===========================================

function extractSourcesFromResponse(response: string, context: SearchContext): SourceReference[] {
  const sources: SourceReference[] = [];
  const seenUrls = new Set<string>();
  const normalizedResponse = response.toLowerCase();

  // 1. Explicit Markdown Links: [Name](url)
  const markdownLinks = extractMarkdownLinks(response);
  for (const link of markdownLinks) {
    const canonical = canonicalizeUrl(link.url);
    if (!seenUrls.has(canonical)) {
      seenUrls.add(canonical);
      sources.push({ url: link.url, title: link.text });
    }
  }

  // 2. Heuristic Matching from context
  context.results.forEach((result) => {
    const canonical = canonicalizeUrl(result.url);
    if (seenUrls.has(canonical)) return;

    try {
      const domain = extractRegistrableDomain(result.url);
      if (normalizedResponse.includes(domain) || normalizedResponse.includes(result.title.toLowerCase())) {
        seenUrls.add(canonical);
        sources.push({ url: result.url, title: result.title, snippet: result.snippet });
      }
    } catch {
      /* ignore invalid URLs */
    }
  });

  return sources;
}

// ===========================================
// Main Entry Point
// ===========================================

export async function runSimulation(input: RunSimulationInput): Promise<SimulationRawResult> {
  const { engine, keyword, language, brand_domain, region = "global" } = input;
  const regionInfo = getRegionInfo(region);
  
  // Check cache first
  if (ENABLE_SIMULATION_CACHE) {
    const cacheKey = getCacheKey(input);
    const cached = simulationCache.get(cacheKey);
    if (cached) {
      console.log(`[Factory] Cache hit for ${engine}: "${keyword}" (${language}, region: ${regionInfo.flag} ${regionInfo.name})`);
      return cached;
    }
  }
  
  console.log(`[Factory] Running ${engine} for: "${keyword}" (${language}, region: ${regionInfo.flag} ${regionInfo.name})`);

  try {
    let result: SimulationRawResult;
    
    switch (engine) {
      case "perplexity":
        result = await runPerplexitySimulation(keyword, language, region, brand_domain);
        break;
      case "chatgpt":
        result = await runChatGPTSimulation(keyword, language, region, brand_domain);
        break;
      case "gemini":
        result = await runGeminiSimulation(keyword, language, region, brand_domain);
        break;
      case "grok":
        result = await runGrokSimulation(keyword, language, region, brand_domain);
        break;
      default:
        throw new Error(`Unsupported engine: ${engine}`);
    }
    
    // Cache the result
    if (ENABLE_SIMULATION_CACHE) {
      const cacheKey = getCacheKey(input);
      simulationCache.set(cacheKey, result);
    }
    
    return result;
  } catch (error) {
    console.error(`[Factory] Simulation failed for ${engine}:`, error);
    throw error;
  }
}

/**
 * Clear the simulation cache.
 * Useful for testing or when you need fresh results.
 */
export function clearSimulationCache(): void {
  simulationCache.clear();
  console.log('[Factory] Simulation cache cleared');
}

/**
 * Get cache statistics.
 */
export function getSimulationCacheStats(): { size: number; maxSize: number } {
  return {
    size: simulationCache.size,
    maxSize: SIMULATION_CACHE_MAX_SIZE,
  };
}
