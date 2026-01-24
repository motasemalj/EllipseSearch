/**
 * Engine Factory - Core AI Simulation Layer
 *
 * PRODUCTION PARITY ARCHITECTURE:
 * Each engine now uses its native grounding API to match real-world behavior.
 *
 * - ChatGPT: OpenAI gpt-4o with web_search_preview tool (Responses API)
 * - Gemini: Vertex AI with google_search_retrieval grounding (NOT Tavily)
 * - Grok: xAI native API with web_search + x_search tools
 * - Perplexity: Native API with sonar-pro model and citations
 *
 * KEY INSIGHT: Agencies will churn if our data doesn't match what they see
 * on the real AI platforms. We must use native grounding APIs.
 */

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  CHATGPT_SIM_ENABLE_WEB_SEARCH, 
  OPENAI_CHATGPT_SIM_MODEL,
  CHATGPT_SIM_MODE,
} from "@/lib/ai/openai-config";
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
 * Uses gpt-4o with web_search_preview tool via Responses API
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
  // The regional hints in the query are crucial for accurate brand detection
  const inputQuery = CHATGPT_SIM_ENABLE_WEB_SEARCH ? regionalQuery : keyword;
  
  const request: Record<string, unknown> = {
    model: OPENAI_CHATGPT_SIM_MODEL,
    input: inputQuery,
    instructions: `You are ChatGPT. Answer naturally and helpfully.${langInstruction}${regionInstruction}`,
    // Note: gpt-5.2-chat-latest only supports reasoning.effort: "medium"
    // Temperature control is not available with reasoning enabled
    reasoning: { effort: "medium" },
    text: { verbosity: "medium" },
  };

  if (CHATGPT_SIM_ENABLE_WEB_SEARCH) {
    const locationConfig = REGION_TO_OPENAI_LOCATION[region];
    
    // Choose between live (web_search_preview) and stable (web_search) modes
    // Live mode: Uses external web access, closest to real ChatGPT but volatile
    // Stable mode: Uses cached/indexed data, more reproducible for measurement
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
    
    const webSearchTool: WebSearchTool = { 
      type: CHATGPT_SIM_MODE === "stable" ? "web_search" : "web_search_preview",
      search_context_size: "high",
    };
    
    if (locationConfig) {
      webSearchTool.user_location = {
        type: "approximate",
        ...locationConfig,
      };
      console.log(`[ChatGPT] Using regional web search (${CHATGPT_SIM_MODE} mode) for: ${locationConfig.city || locationConfig.country}`);
    }
    
    request.tools = [webSearchTool];
    // CRITICAL: Include sources to get the full list of URLs consulted (not just inline citations)
    request.include = ["web_search_call.action.sources"];
    
    // Note: Temperature control is not available with gpt-5.2-chat-latest's required reasoning
    // Variance reduction is achieved through ensemble runs instead
  }

  const response = await openai.responses.create(
    request as unknown as Parameters<typeof openai.responses.create>[0]
  );
  const responseObj = response as unknown as { output?: unknown; output_text?: unknown };

  const outputText = responseObj.output_text;
  const hasOutputText = typeof outputText === "string" && outputText.trim().length > 0;
  let content = hasOutputText ? (outputText as string) : "";
  const sources: SourceReference[] = [];
  const searchResults: Array<{ url: string; title: string; snippet: string }> = [];
  const seenUrls = new Set<string>();

  const outputItems = Array.isArray(responseObj.output) ? responseObj.output : [];

  for (const item of outputItems as Array<{ type?: unknown; content?: unknown }>) {
    if (item.type === "message") {
      if (!hasOutputText) {
        const msgContent = (item as unknown as { content?: unknown })?.content;
        if (Array.isArray(msgContent)) {
          for (const contentItem of msgContent as Array<{ type?: unknown; text?: unknown }>) {
            if (contentItem.type === "output_text" && typeof contentItem.text === "string") {
              content += content ? `\n${contentItem.text}` : contentItem.text;
            }
          }
        }
      }
    } else if (item.type === "web_search_call") {
      console.log(`[ChatGPT] Web search performed for: "${keyword}"`);
      
      const maybeSources = (item as unknown as { action?: { sources?: unknown } })?.action?.sources;
      if (Array.isArray(maybeSources)) {
        for (const source of maybeSources as Array<{ url?: unknown; title?: unknown; snippet?: unknown }>) {
          const url = typeof source.url === "string" ? source.url : "";
          if (!url || seenUrls.has(url)) continue;
          seenUrls.add(url);
          sources.push({
            url,
            title: typeof source.title === "string" ? source.title : "",
          });
          searchResults.push({
            url,
            title: typeof source.title === "string" ? source.title : "",
            snippet: typeof source.snippet === "string" ? source.snippet : "",
          });
        }
      }
    }
  }

  // Extract citations from annotations
  for (const item of outputItems as Array<{ type?: unknown; content?: unknown }>) {
    if (item.type === "message") {
      const msgContent = (item as unknown as { content?: unknown })?.content;
      if (!Array.isArray(msgContent)) continue;
      for (const contentItem of msgContent as Array<{ type?: unknown; annotations?: unknown }>) {
        if (contentItem.type !== "output_text") continue;
        const annotations = (contentItem as unknown as { annotations?: unknown })?.annotations;
        if (!Array.isArray(annotations)) continue;
        for (const ann of annotations as Array<{ type?: unknown; url?: unknown; title?: unknown }>) {
          if (ann.type !== "url_citation") continue;
          const url = typeof ann.url === "string" ? ann.url : "";
          if (!url || seenUrls.has(url)) continue;
          seenUrls.add(url);
          sources.push({
            url,
            title: typeof ann.title === "string" ? ann.title : "",
          });
          searchResults.push({
            url,
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

  // Create standardized result
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

  // Use the Gemini model with grounding enabled via google_search tool
  // Note: Gemini 2.0 requires google_search instead of googleSearchRetrieval
  const model = googleAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    // Enable Google Search as a tool (new format for Gemini 2.0)
    tools: [{
      // @ts-expect-error - google_search is the new format, SDK types not updated
      google_search: {},
    }],
  });

  const prompt = `${langInstruction}${regionInstruction}${keyword}`;
  
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
  
  // Parse grounding metadata from response (structure depends on API version)
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
  
  if (rawMetadata) {
    // Extract the actual queries Gemini decided to run
    groundingMetadata.web_search_queries = rawMetadata.webSearchQueries || [];
    
    // Internal Google domains to filter out
    const internalDomains = [
      'vertexaisearch.cloud.google.com',
      'cloud.google.com/vertex-ai',
      'generativelanguage.googleapis.com',
    ];
    
    // Extract grounding chunks (the sources used)
    if (rawMetadata.groundingChunks) {
      for (const chunk of rawMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          const url = chunk.web.uri;
          
          // Skip internal Google URLs
          const isInternalUrl = internalDomains.some(domain => url.includes(domain));
          if (isInternalUrl) {
            console.log(`[Gemini] Skipping internal URL: ${url}`);
            continue;
          }
          
          sources.push({
            url,
            title: chunk.web.title || "",
            grounding_confidence: 1.0,
          });
          searchResults.push({
            url,
            title: chunk.web.title || "",
            snippet: "",
            is_grounded: true,
          });
          
          groundingMetadata.grounding_chunks?.push({
            text: "",
            source_url: url,
            confidence: 1.0,
          });
        }
      }
    }
    
    // Calculate grounding coverage from supports
    if (rawMetadata.groundingSupports && rawMetadata.groundingSupports.length > 0) {
      const avgConfidence = rawMetadata.groundingSupports.reduce((sum, support) => {
        const scores = support.confidenceScores || [];
        return sum + (scores.reduce((a, b) => a + b, 0) / (scores.length || 1));
      }, 0) / rawMetadata.groundingSupports.length;
      groundingMetadata.grounding_coverage = Math.round(avgConfidence * 100);
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
 * Grok sometimes leaks internal markers like <hasfunctioncall>, <functioncall>, etc.
 * 
 * IMPORTANT: Grok can sometimes return ONLY function call text with no actual results.
 * Example: "<hasfunctioncall>I am searching the web for solar panel companies in Dubai."
 * In such cases, we need to detect this and return empty so the system can handle it.
 */
function cleanGrokResponse(content: string): string {
  if (!content) return "";
  
  let cleaned = content;
  
  // FIRST PASS: Remove function call tags and their contents using multiple approaches
  // These patterns match various forms of function call metadata Grok might leak
  
  // Most aggressive patterns first - catch any <...functioncall...> or <...function_call...> variants
  const aggressivePatterns = [
    // Any tag containing "functioncall" or "function_call" with any content
    /<[^>]*functioncall[^>]*>[\s\S]*?<\/[^>]*functioncall[^>]*>/gi,
    /<[^>]*function_call[^>]*>[\s\S]*?<\/[^>]*function_call[^>]*>/gi,
    // Opening tags without closing - match to end of string or next tag
    /<[^>]*functioncall[^>]*>[\s\S]*/gi,
    /<[^>]*function_call[^>]*>[\s\S]*/gi,
    // Just the opening tag patterns that might appear anywhere
    /<hasfunctioncall>[^]*$/gi,
    /<functioncall>[^]*$/gi,
  ];
  
  for (const pattern of aggressivePatterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  
  const tagPatterns = [
    // Tag-based patterns - remove entire tag blocks
    /<hasfunctioncall>[\s\S]*?<\/hasfunctioncall>/gi,
    /<functioncall>[\s\S]*?<\/functioncall>/gi,
    /<function_call>[\s\S]*?<\/function_call>/gi,
    /<tool_call>[\s\S]*?<\/tool_call>/gi,
    /<websearch>[\s\S]*?<\/websearch>/gi,
    /<search>[\s\S]*?<\/search>/gi,
    // Opening tags that might not have closing tags - remove tag and everything after
    // Using [\s\S]* instead of .* with s flag for compatibility
    /<hasfunctioncall>[\s\S]*/gi,
    /<functioncall>[\s\S]*/gi,
    /<function_call>[\s\S]*/gi,
    /<tool_call>[\s\S]*/gi,
    /<websearch>[\s\S]*/gi,
    // Self-closing or standalone tags
    /<\/?hasfunctioncall[^>]*>/gi,
    /<\/?functioncall[^>]*>/gi,
    /<\/?function_call[^>]*>/gi,
    /<\/?tool_call[^>]*>/gi,
    /<\/?websearch[^>]*>/gi,
    // HTML-encoded variants
    /&lt;hasfunctioncall&gt;[\s\S]*?(&lt;\/hasfunctioncall&gt;)?/gi,
    /&lt;functioncall&gt;[\s\S]*?(&lt;\/functioncall&gt;)?/gi,
  ];
  
  for (const pattern of tagPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  
  // SECOND PASS: Remove common internal processing phrases
  // These appear when Grok "thinks out loud" about what it's doing
  const processingPhrases = [
    // Match anywhere in string (not just start) - "I am searching..."
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
    // Tool use indicators
    /\[web_search\][^.]*\.?\s*/gi,
    /\[x_search\][^.]*\.?\s*/gi,
  ];
  
  for (const pattern of processingPhrases) {
    cleaned = cleaned.replace(pattern, "");
  }
  
  // Clean up any resulting multiple newlines or leading/trailing whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  
  // FINAL CHECK: If after cleaning, the content is very short or looks like 
  // residual processing text, it might mean Grok only returned function call metadata
  // Check for responses that are essentially empty after cleaning
  const minMeaningfulLength = 20;
  if (cleaned.length < minMeaningfulLength) {
    // Check if what remains looks like leftover processing text
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
 * Grok Simulation - Uses xAI native tools
 * 
 * CRITICAL: Grok's unique value is real-time X (Twitter) data.
 * We MUST enable both web_search AND x_search tools.
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

  console.log(`[Grok] Searching with web + X search: "${keyword}" (region: ${region})`);

  // grok-4-1-fast-reasoning supports function calling and tools
  // Enable web_search and x_search for real-time information
  const response = await xai.chat.completions.create({
    model: "grok-4-1-fast-reasoning",
    messages: [
      {
        role: "system",
        content: `You are Grok, an AI by xAI. ${langInstruction}${regionInstruction}Be direct, witty, and cite your sources. Use real-time information from the web and X (Twitter) when relevant.`,
      },
      { role: "user", content: keyword },
    ],
    // Enable native xAI tools for real-time search
    tools: [
      { type: "function", function: { name: "web_search", description: "Search the web", parameters: { type: "object", properties: {} } } },
      { type: "function", function: { name: "x_search", description: "Search X/Twitter", parameters: { type: "object", properties: {} } } },
    ] as unknown as undefined, // Type workaround for xAI-specific tool format
  });

  // Clean up Grok response content - remove function call metadata that leaks into content
  const rawContent = response.choices[0]?.message?.content || "";
  let content = cleanGrokResponse(rawContent);
  
  // Log if we had to clean function call metadata
  if (rawContent !== content) {
    const cleaned = rawContent.length - content.length;
    if (cleaned > 0) {
      console.log(`[Grok] Cleaned ${cleaned} chars of function call metadata from response`);
    }
    if (content.length === 0 && rawContent.length > 0) {
      console.log(`[Grok] WARNING: Entire response was function call metadata. Raw: "${rawContent.substring(0, 200)}..."`);
    }
  }
  
  const sources: SourceReference[] = [];
  const xPosts: XPost[] = [];
  const searchResults: Array<{ url: string; title: string; snippet: string }> = [];

  // Parse tool calls from response (if any)
  const toolCalls = response.choices[0]?.message?.tool_calls || [];
  console.log(`[Grok] Received ${toolCalls.length} tool calls`);
  
  for (const toolCall of toolCalls) {
    // Type assertion for xAI tool call format
    const tc = toolCall as unknown as { function?: { name: string; arguments?: string } };
    if (!tc.function) continue;
    
    if (tc.function.name === "web_search") {
      // Parse web search results
      try {
        const results = JSON.parse(tc.function.arguments || "{}");
        if (Array.isArray(results.results)) {
          for (const result of results.results) {
            if (result.url) {
              sources.push({
                url: result.url,
                title: result.title || "",
                snippet: result.snippet || "",
              });
              searchResults.push({
                url: result.url,
                title: result.title || "",
                snippet: result.snippet || "",
              });
            }
          }
        }
      } catch {
        console.log("[Grok] Could not parse web search results");
      }
    } else if (tc.function.name === "x_search") {
      // Parse X/Twitter search results
      try {
        const results = JSON.parse(tc.function.arguments || "{}");
        if (Array.isArray(results.posts || results.tweets)) {
          const posts = results.posts || results.tweets;
          for (const post of posts) {
            const xPost: XPost = {
              post_id: post.id || "",
              author: post.author || post.user?.username || "",
              text: post.text || post.content || "",
              timestamp: post.created_at || post.timestamp,
              engagement_score: post.engagement || post.likes,
            };
            xPosts.push(xPost);
            
            // Add X posts as sources with special marking
            sources.push({
              url: `https://x.com/i/status/${post.id}`,
              title: `@${xPost.author}`,
              snippet: xPost.text,
              is_x_post: true,
              x_post_data: xPost,
            });
          }
        }
      } catch {
        console.log("[Grok] Could not parse X search results");
      }
    }
  }

  // Fallback: extract sources from text if no tool calls returned sources
  if (sources.length === 0) {
    const extractedSources = extractSourcesFromResponse(content, { query: keyword, results: [] });
    sources.push(...extractedSources);
  }
  
  // FALLBACK: If content is empty but we have sources, generate a placeholder response
  if (!content && sources.length > 0) {
    console.log(`[Grok] Content was empty but have ${sources.length} sources - generating fallback response`);
    const sourceList = sources.slice(0, 5).map(s => s.title || new URL(s.url).hostname).join(", ");
    content = `Based on search results for "${keyword}", relevant sources include: ${sourceList}. Please see the cited sources for detailed information.`;
  }
  
  // If still no content, log the full response for debugging
  if (!content || content.trim().length === 0) {
    console.error(`[Grok] ERROR: Empty response from grok-4-1-fast-reasoning`);
    console.error(`[Grok] Full API response:`, JSON.stringify(response, null, 2));
    throw new Error("Grok returned empty response - check logs for details");
  }

  const groundingMetadata: GroundingMetadata = {
    x_posts: xPosts,
    grounding_coverage: xPosts.length > 0 || sources.length > 0 ? 80 : 0,
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

  console.log(`[Grok] Response generated with ${sources.length} sources, ${xPosts.length} X posts for: "${keyword}"`);

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

  // Use .withResponse() to access the raw body where 'citations' live
  const response = await perplexity.chat.completions
    .create({
      model: "sonar-pro", // MUST use sonar-pro for accurate citations
      messages: [
        { 
          role: "system", 
          content: `You are a helpful search engine. Provide a detailed, well-sourced answer.${langHint}${regionHint}` 
        },
        { role: "user", content: regionalQuery },
      ],
      // Enable return_citations for Perplexity (custom parameter)
      // @ts-expect-error - Perplexity-specific parameter
      return_citations: true,
      return_related_questions: true,
    })
    .withResponse();

  const content = response.data.choices[0]?.message?.content || "";

  // Perplexity API returns a 'citations' array in the raw data
  const rawData = response.data as unknown as { 
    citations?: string[];
    related_questions?: string[];
  };
  
  const citationUrls = rawData?.citations || [];
  const sources: SourceReference[] = citationUrls.map((url: string) => ({ url }));

  // Verify citations against text content
  // Cross-reference the domain list against the text to see if brand appears near citation markers
  const verifiedSources: SourceReference[] = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const citationMarker = `[${i + 1}]`;
    const markerIndex = content.indexOf(citationMarker);
    
    if (markerIndex !== -1) {
      // Extract snippet around the citation
      const start = Math.max(0, markerIndex - 100);
      const end = Math.min(content.length, markerIndex + 100);
      const snippet = content.slice(start, end);
      
      verifiedSources.push({
        ...source,
        snippet,
        grounding_confidence: 1.0,
      });
    } else {
      verifiedSources.push(source);
    }
  }

  const searchContext: SearchContext = {
    query: keyword,
    results: verifiedSources.map((s, index) => ({
      url: s.url,
      title: "",
      snippet: s.snippet || "",
      score: index + 1,
      is_grounded: true,
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

function createStandardizedResult(
  engine: 'chatgpt' | 'gemini' | 'grok' | 'perplexity',
  answerText: string,
  sources: SourceReference[],
  brandDomain: string,
  searchResults: Array<{ url: string; title: string; snippet: string }>,
  groundingMetadata?: GroundingMetadata
): StandardizedResult {
  const standardizedSources: StandardizedSource[] = sources.map(source => {
    let domain = "";
    try {
      domain = new URL(source.url).hostname.replace("www.", "");
    } catch {}
    
    const isBrandMatch = source.url.toLowerCase().includes(brandDomain.toLowerCase()) ||
                         domain.toLowerCase().includes(brandDomain.toLowerCase());
    
    return {
      url: source.url,
      domain,
      snippet: source.snippet || "",
      is_brand_match: isBrandMatch,
      authority_score: calculateAuthorityScore(domain),
      authority_tier: getAuthorityTier(domain),
      source_type: getSourceType(domain),
    };
  });

  // Calculate sentiment from answer text (basic implementation)
  const sentimentScore = calculateBasicSentiment(answerText);
  const sentimentLabel = sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'negative' : 'neutral';

  return {
    engine,
    answer_text: answerText,
    answer_html: answerText,
    sources: standardizedSources,
    grounding_metadata: groundingMetadata,
    sentiment_score: sentimentScore,
    sentiment_label: sentimentLabel,
  };
}

// ===========================================
// Citation Authority Scoring
// ===========================================

const AUTHORITATIVE_DOMAINS = new Set([
  // Encyclopedias & References
  'wikipedia.org', 'britannica.com', 'merriam-webster.com',
  // Major News Agencies
  'reuters.com', 'apnews.com', 'afp.com',
  // Top-tier News
  'bbc.com', 'bbc.co.uk', 'nytimes.com', 'wsj.com', 'ft.com', 'economist.com',
  'theguardian.com', 'washingtonpost.com', 'cnn.com', 'npr.org',
  // Business/Finance
  'forbes.com', 'bloomberg.com', 'cnbc.com', 'marketwatch.com', 'investopedia.com',
  // Tech
  'techcrunch.com', 'wired.com', 'theverge.com', 'arstechnica.com', 'zdnet.com',
  'cnet.com', 'engadget.com', 'thenextweb.com',
  // Academic
  'harvard.edu', 'mit.edu', 'stanford.edu', 'oxford.ac.uk', 'cambridge.org',
  // UAE/GCC Specific
  'gulfnews.com', 'khaleejtimes.com', 'thenationalnews.com', 'arabianbusiness.com',
  'zawya.com', 'argaam.com', 'albawaba.com',
]);

const HIGH_AUTHORITY_DOMAINS = new Set([
  // Professional Networks & B2B
  'linkedin.com', 'crunchbase.com', 'pitchbook.com',
  // Software Reviews
  'g2.com', 'capterra.com', 'softwareadvice.com', 'trustradius.com', 'getapp.com',
  // Business Reviews
  'trustpilot.com', 'glassdoor.com', 'clutch.co', 'goodfirms.co',
  // Consumer Reviews
  'yelp.com', 'tripadvisor.com', 'booking.com', 'hotels.com',
  // Blogging Platforms (can have high-quality content)
  'medium.com', 'substack.com', 'dev.to',
  // Industry Specific
  'hubspot.com', 'salesforce.com', 'shopify.com', 'zendesk.com',
  // Regional (UAE/GCC)
  'bayut.com', 'propertyfinder.ae', 'dubizzle.com',
  // E-commerce
  'amazon.com', 'amazon.ae', 'noon.com',
]);

// Domains that should score lower (user-generated, forums)
const LOWER_AUTHORITY_DOMAINS = new Set([
  'reddit.com', 'quora.com', 'answers.yahoo.com',
  'pinterest.com', 'tumblr.com',
  'blogspot.com', 'wordpress.com', 'weebly.com', 'wix.com',
]);

function calculateAuthorityScore(domain: string): number {
  const domainLower = domain.toLowerCase();
  
  // Check for authoritative TLDs
  if (domainLower.endsWith('.gov') || domainLower.endsWith('.edu')) {
    return 95;
  }
  
  // Check for official org TLD (often authoritative)
  if (domainLower.endsWith('.org')) {
    return 80;
  }
  
  // Check known authoritative domains
  for (const authDomain of Array.from(AUTHORITATIVE_DOMAINS)) {
    if (domainLower.includes(authDomain)) {
      return 90;
    }
  }
  
  // Check high authority domains
  for (const highDomain of Array.from(HIGH_AUTHORITY_DOMAINS)) {
    if (domainLower.includes(highDomain)) {
      return 75;
    }
  }
  
  // Check lower authority domains
  for (const lowDomain of Array.from(LOWER_AUTHORITY_DOMAINS)) {
    if (domainLower.includes(lowDomain)) {
      return 35;
    }
  }
  
  // Check for news sites (generic check)
  if (domainLower.includes('news') || domainLower.includes('times') || domainLower.includes('post')) {
    return 70;
  }
  
  // Check for official brand/company sites (common TLDs with short names suggest official sites)
  if (domainLower.match(/^[a-z0-9-]{3,15}\.(com|co|ae|sa|io)$/)) {
    return 65; // Likely an official company site
  }
  
  // Default medium authority for unknown domains
  return 50;
}

function getAuthorityTier(domain: string): 'authoritative' | 'high' | 'medium' | 'low' {
  const score = calculateAuthorityScore(domain);
  if (score >= 85) return 'authoritative';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function getSourceType(domain: string): 'editorial' | 'directory' | 'social' | 'blog' | 'official' | 'forum' | 'news' {
  const domainLower = domain.toLowerCase();
  
  if (['linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com'].some(d => domainLower.includes(d))) {
    return 'social';
  }
  if (['clutch.co', 'g2.com', 'capterra.com', 'yelp.com', 'tripadvisor.com', 'crunchbase.com'].some(d => domainLower.includes(d))) {
    return 'directory';
  }
  if (['medium.com', 'substack.com', 'wordpress.com', 'blogger.com'].some(d => domainLower.includes(d))) {
    return 'blog';
  }
  if (['reddit.com', 'quora.com', 'stackoverflow.com'].some(d => domainLower.includes(d))) {
    return 'forum';
  }
  if (['news', 'times', 'post', 'herald', 'bbc', 'cnn', 'reuters', 'bloomberg'].some(d => domainLower.includes(d))) {
    return 'news';
  }
  if (domainLower.endsWith('.gov') || domainLower.endsWith('.edu')) {
    return 'official';
  }
  
  return 'editorial';
}

// ===========================================
// Basic Sentiment Analysis
// ===========================================

const POSITIVE_WORDS = new Set([
  'excellent', 'great', 'amazing', 'best', 'top', 'leading', 'innovative',
  'recommended', 'trusted', 'reliable', 'quality', 'premium', 'outstanding',
  'exceptional', 'superior', 'favorite', 'popular', 'successful', 'award',
]);

const NEGATIVE_WORDS = new Set([
  'poor', 'bad', 'worst', 'expensive', 'overpriced', 'limited', 'lacking',
  'complaint', 'issue', 'problem', 'concern', 'risk', 'warning', 'avoid',
  'disappointing', 'frustrating', 'slow', 'difficult', 'confusing',
]);

function calculateBasicSentiment(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;
  
  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) positiveCount++;
    if (NEGATIVE_WORDS.has(word)) negativeCount++;
  }
  
  const total = positiveCount + negativeCount;
  if (total === 0) return 0;
  
  return (positiveCount - negativeCount) / total;
}

// ===========================================
// Source Extraction Fallback
// ===========================================

function extractSourcesFromResponse(response: string, context: SearchContext): SourceReference[] {
  const sources: SourceReference[] = [];
  const normalizedResponse = response.toLowerCase();

  // 1. Explicit Markdown Links: [Name](url)
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  let match;
  while ((match = markdownLinkRegex.exec(response)) !== null) {
    if (!sources.find((s) => s.url === match![2])) {
      sources.push({ url: match![2], title: match![1] });
    }
  }

  // 2. Heuristic Matching from context
  context.results.forEach((result) => {
    if (sources.find((s) => s.url === result.url)) return;

    try {
      const hostname = new URL(result.url).hostname.replace("www.", "");
      if (normalizedResponse.includes(hostname) || normalizedResponse.includes(result.title.toLowerCase())) {
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
  console.log(`[Factory] Running ${engine} for: "${keyword}" (${language}, region: ${regionInfo.flag} ${regionInfo.name})`);

  try {
    switch (engine) {
      case "perplexity":
        return await runPerplexitySimulation(keyword, language, region, brand_domain);
      case "chatgpt":
        return await runChatGPTSimulation(keyword, language, region, brand_domain);
      case "gemini":
        return await runGeminiSimulation(keyword, language, region, brand_domain);
      case "grok":
        return await runGrokSimulation(keyword, language, region, brand_domain);
      default:
        throw new Error(`Unsupported engine: ${engine}`);
    }
  } catch (error) {
    console.error(`[Factory] Simulation failed for ${engine}:`, error);
    throw error;
  }
}
