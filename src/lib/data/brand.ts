import { cache } from "react";
import { SupportedEngine } from "@/types";
import {
  getCachedBrand,
  getCachedBrandSimulations,
  getCachedPromptSets,
  getCachedPrompts,
  getSupabaseClient,
} from "@/lib/cache";

// =============================================================================
// BRAND DATA FETCHING
// Optimized with parallel fetching and request-level caching
// =============================================================================

export interface BrandStats {
  totalSimulations: number;
  visibleSimulations: number;
  overallVisibility: number;
  engineStats: Record<SupportedEngine, {
    total: number;
    visible: number;
    avgScores: { structure: number; dataDensity: number; directness: number };
  }>;
  topSources: [string, number][];
  topSourcesDetailed: Array<{
    domain: string;
    citations: number;
    urls: string[];
  }>;
}

export interface PromptWithStats {
  id: string;
  text: string;
  prompt_set_id: string | null;
  set_name: string | undefined;
  total_sims: number;
  visible_sims: number;
  last_checked_at: string | null;
}

/**
 * Get all brand page data in parallel - cached per request
 */
export const getBrandPageData = cache(async (brandId: string, organizationId: string) => {
  // Fetch brand first to validate ownership
  const brand = await getCachedBrand(brandId, organizationId);
  if (!brand) return null;

  // Fetch all other data in parallel
  const [promptSets, prompts, simulations, recentBatches] = await Promise.all([
    getCachedPromptSets(brandId),
    getCachedPrompts(brandId),
    getCachedBrandSimulations(brandId, 90),
    getRecentBatches(brandId),
  ]);

  // Process all data
  const { promptsWithStats, stats, charts } = processBrandData(prompts, simulations);

  return {
    brand,
    promptSets,
    promptsWithStats,
    recentBatches,
    stats,
    charts,
  };
});

/**
 * Get recent batches for a brand
 */
async function getRecentBatches(brandId: string) {
  const supabase = await getSupabaseClient();
  const { data } = await supabase
    .from("analysis_batches")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(5);
  return data || [];
}

/**
 * Process brand simulation data into stats and charts
 */
function processBrandData(
  prompts: Array<{
    id: string;
    text: string;
    prompt_set_id: string | null;
    last_checked_at: string | null;
    prompt_sets: unknown;
  }>,
  simulations: Array<{
    prompt_id: string;
    engine: string;
    is_visible: boolean;
    selection_signals: unknown;
    created_at: string;
  }>
) {
  // Calculate per-prompt stats
  const promptStats: Record<string, { total: number; visible: number }> = {};
  
  // Engine stats initialization
  const engineStats: Record<SupportedEngine, {
    total: number;
    visible: number;
    avgScores: { structure: number; dataDensity: number; directness: number };
  }> = {
    chatgpt: { total: 0, visible: 0, avgScores: { structure: 0, dataDensity: 0, directness: 0 } },
    perplexity: { total: 0, visible: 0, avgScores: { structure: 0, dataDensity: 0, directness: 0 } },
    gemini: { total: 0, visible: 0, avgScores: { structure: 0, dataDensity: 0, directness: 0 } },
    grok: { total: 0, visible: 0, avgScores: { structure: 0, dataDensity: 0, directness: 0 } },
  };

  // Source tracking
  const sourceCounts: Record<string, number> = {};
  const sourceUrls: Record<string, Set<string>> = {};

  // Daily stats for charts
  const byDay: Record<string, {
    total: number;
    visible: number;
    byEngine: Partial<Record<SupportedEngine, { total: number; visible: number }>>;
  }> = {};

  // Single pass through simulations
  simulations.forEach((sim) => {
    const engine = sim.engine as SupportedEngine;
    const day = String(sim.created_at).slice(0, 10);

    // Per-prompt stats
    if (!promptStats[sim.prompt_id]) {
      promptStats[sim.prompt_id] = { total: 0, visible: 0 };
    }
    promptStats[sim.prompt_id].total++;
    if (sim.is_visible) promptStats[sim.prompt_id].visible++;

    // Engine stats
    if (engineStats[engine]) {
      engineStats[engine].total++;
      if (sim.is_visible) engineStats[engine].visible++;

      const signals = sim.selection_signals as {
        gap_analysis?: {
          structure_score?: number;
          data_density_score?: number;
          directness_score?: number;
        };
        winning_sources?: string[];
      } | null;

      if (signals?.gap_analysis) {
        engineStats[engine].avgScores.structure += signals.gap_analysis.structure_score || 0;
        engineStats[engine].avgScores.dataDensity += signals.gap_analysis.data_density_score || 0;
        engineStats[engine].avgScores.directness += signals.gap_analysis.directness_score || 0;
      }

      // Source tracking
      signals?.winning_sources?.forEach((source) => {
        try {
          const domain = new URL(source).hostname;
          sourceCounts[domain] = (sourceCounts[domain] || 0) + 1;
          if (!sourceUrls[domain]) sourceUrls[domain] = new Set();
          sourceUrls[domain].add(source);
        } catch {
          // Invalid URL, skip
        }
      });
    }

    // Daily stats
    if (!byDay[day]) {
      byDay[day] = { total: 0, visible: 0, byEngine: {} };
    }
    byDay[day].total++;
    if (sim.is_visible) byDay[day].visible++;

    if (!byDay[day].byEngine[engine]) {
      byDay[day].byEngine[engine] = { total: 0, visible: 0 };
    }
    byDay[day].byEngine[engine]!.total++;
    if (sim.is_visible) byDay[day].byEngine[engine]!.visible++;
  });

  // Average engine scores
  Object.values(engineStats).forEach((stat) => {
    if (stat.total > 0) {
      stat.avgScores.structure = Math.round((stat.avgScores.structure / stat.total) * 10) / 10;
      stat.avgScores.dataDensity = Math.round((stat.avgScores.dataDensity / stat.total) * 10) / 10;
      stat.avgScores.directness = Math.round((stat.avgScores.directness / stat.total) * 10) / 10;
    }
  });

  // Build prompts with stats
  const promptsWithStats: PromptWithStats[] = prompts.map((p) => {
    const promptSetsData = p.prompt_sets as unknown;
    const setName = Array.isArray(promptSetsData)
      ? (promptSetsData[0] as { name: string } | undefined)?.name
      : (promptSetsData as { name: string } | null)?.name;

    return {
      id: p.id,
      text: p.text,
      prompt_set_id: p.prompt_set_id,
      set_name: setName,
      total_sims: promptStats[p.id]?.total || 0,
      visible_sims: promptStats[p.id]?.visible || 0,
      last_checked_at: p.last_checked_at,
    };
  });

  // Top sources
  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8) as [string, number][];

  const topSourcesDetailed = topSources.map(([domain, citations]) => ({
    domain,
    citations,
    urls: Array.from(sourceUrls[domain] || []).slice(0, 30),
  }));

  // Overall stats
  const totalSimulations = simulations.length;
  const visibleSimulations = simulations.filter((s) => s.is_visible).length;
  const overallVisibility = totalSimulations > 0
    ? Math.round((visibleSimulations / totalSimulations) * 100)
    : 0;

  // Charts
  const days = Object.keys(byDay).sort((a, b) => a.localeCompare(b));

  const trend = days.map((d) => ({
    date: d,
    overall: byDay[d].total > 0 ? Math.round((byDay[d].visible / byDay[d].total) * 100) : 0,
    chatgpt: byDay[d].byEngine.chatgpt?.total
      ? Math.round((byDay[d].byEngine.chatgpt!.visible / byDay[d].byEngine.chatgpt!.total) * 100)
      : 0,
    perplexity: byDay[d].byEngine.perplexity?.total
      ? Math.round((byDay[d].byEngine.perplexity!.visible / byDay[d].byEngine.perplexity!.total) * 100)
      : 0,
    gemini: byDay[d].byEngine.gemini?.total
      ? Math.round((byDay[d].byEngine.gemini!.visible / byDay[d].byEngine.gemini!.total) * 100)
      : 0,
    grok: byDay[d].byEngine.grok?.total
      ? Math.round((byDay[d].byEngine.grok!.visible / byDay[d].byEngine.grok!.total) * 100)
      : 0,
  }));

  const volume = days.map((d) => ({ date: d, total: byDay[d].total }));

  const engineMixAgg: Record<SupportedEngine, number> = { chatgpt: 0, perplexity: 0, gemini: 0, grok: 0 };
  simulations.forEach((s) => {
    const eng = s.engine as SupportedEngine;
    engineMixAgg[eng] = (engineMixAgg[eng] || 0) + 1;
  });

  const engineMix = [
    { name: "ChatGPT", value: engineMixAgg.chatgpt, color: "#10B981" },
    { name: "Perplexity", value: engineMixAgg.perplexity, color: "#8B5CF6" },
    { name: "Gemini", value: engineMixAgg.gemini, color: "#3B82F6" },
    { name: "Grok", value: engineMixAgg.grok, color: "#6B7280" },
  ].filter((x) => x.value > 0);

  return {
    promptsWithStats,
    stats: {
      totalSimulations,
      visibleSimulations,
      overallVisibility,
      engineStats,
      topSources,
      topSourcesDetailed,
    },
    charts: { trend, volume, engineMix },
  };
}
