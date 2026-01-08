import { cache } from "react";
import { SupportedEngine } from "@/types";
import {
  getCachedBrands,
  getCachedSimulations,
  getCachedBatches,
} from "@/lib/cache";

// =============================================================================
// DASHBOARD DATA FETCHING
// Optimized with parallel fetching and caching
// =============================================================================

export interface DashboardStats {
  totalBrands: number;
  totalSimulations: number;
  overallVisibility: number;
  engineStats: Partial<Record<SupportedEngine, { total: number; visible: number }>>;
}

export interface BrandVisibilityData {
  overall: number;
  byEngine: Partial<Record<SupportedEngine, number>>;
  count: number;
}

export interface ChartData {
  trend: Array<{
    date: string;
    overall: number;
    chatgpt: number;
    perplexity: number;
    gemini: number;
    grok: number;
  }>;
  volume: Array<{ date: string; total: number }>;
  engineMix: Array<{ name: string; value: number; color: string }>;
}

/**
 * Get all dashboard data in parallel - cached and optimized
 */
export const getDashboardData = cache(async (organizationId: string) => {
  // Fetch brands first (needed for other queries)
  const brands = await getCachedBrands(organizationId);
  const brandIds = brands.map((b) => b.id);

  // Fetch simulations and batches in parallel
  const [simulations, recentBatches] = await Promise.all([
    getCachedSimulations(brandIds, 90),
    getCachedBatches(brandIds, 8),
  ]);

  // Process data
  const { brandVisibility, stats, charts } = processSimulationData(simulations, brands);

  return {
    brands,
    brandVisibility,
    recentBatches,
    stats,
    charts,
  };
});

/**
 * Process simulation data into visibility stats and charts
 * This is a pure function - memoized in React
 */
function processSimulationData(
  simulations: Array<{
    brand_id: string;
    engine: string;
    is_visible: boolean;
    created_at: string;
  }>,
  brands: Array<{ id: string }>
) {
  const brandVisibility: Record<string, BrandVisibilityData> = {};
  const engineStats: Partial<Record<SupportedEngine, { total: number; visible: number }>> = {};
  const byDay: Record<string, {
    total: number;
    visible: number;
    byEngine: Partial<Record<SupportedEngine, { total: number; visible: number }>>;
  }> = {};

  // Single pass through simulations for all calculations
  simulations.forEach((sim) => {
    const engine = sim.engine as SupportedEngine;
    const day = String(sim.created_at).slice(0, 10);

    // Brand visibility
    if (!brandVisibility[sim.brand_id]) {
      brandVisibility[sim.brand_id] = { overall: 0, byEngine: {}, count: 0 };
    }
    if (!brandVisibility[sim.brand_id].byEngine[engine]) {
      brandVisibility[sim.brand_id].byEngine[engine] = 0;
    }
    brandVisibility[sim.brand_id].count++;
    if (sim.is_visible) {
      brandVisibility[sim.brand_id].overall++;
      brandVisibility[sim.brand_id].byEngine[engine]! += 1;
    }

    // Engine stats
    if (!engineStats[engine]) {
      engineStats[engine] = { total: 0, visible: 0 };
    }
    engineStats[engine]!.total++;
    if (sim.is_visible) {
      engineStats[engine]!.visible++;
    }

    // Daily stats for charts
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

  // Calculate overall stats
  const totalSimulations = simulations.length;
  const visibleSimulations = simulations.filter((s) => s.is_visible).length;
  const overallVisibility = totalSimulations > 0
    ? Math.round((visibleSimulations / totalSimulations) * 100)
    : 0;

  // Build chart data
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

  // Engine mix for pie chart
  const engineMixAgg: Record<SupportedEngine, number> = { chatgpt: 0, perplexity: 0, gemini: 0, grok: 0 };
  simulations.forEach((s) => {
    const eng = s.engine as SupportedEngine;
    engineMixAgg[eng] = (engineMixAgg[eng] || 0) + 1;
  });

  const engineMix = [
    { name: "ChatGPT", value: engineMixAgg.chatgpt, color: "hsl(var(--primary))" },
    { name: "Perplexity", value: engineMixAgg.perplexity, color: "hsl(270 76% 55%)" },
    { name: "Gemini", value: engineMixAgg.gemini, color: "hsl(217 91% 60%)" },
    { name: "Grok", value: engineMixAgg.grok, color: "hsl(0 0% 45%)" },
  ].filter((x) => x.value > 0);

  return {
    brandVisibility,
    stats: {
      totalBrands: brands.length,
      totalSimulations,
      overallVisibility,
      engineStats,
    },
    charts: { trend, volume, engineMix },
  };
}

/**
 * Get visibility data for a specific brand
 */
export function getBrandVisibilityData(
  brandVisibility: Record<string, BrandVisibilityData>,
  brandId: string,
  engineStats: Partial<Record<SupportedEngine, { total: number; visible: number }>>
) {
  const vis = brandVisibility[brandId];
  if (!vis) return undefined;

  return {
    overall: vis.count > 0 ? Math.round((vis.overall / vis.count) * 100) : 0,
    byEngine: Object.fromEntries(
      Object.entries(vis.byEngine).map(([eng, count]) => {
        const totalForEngine = engineStats[eng as SupportedEngine]?.total || 1;
        return [eng, Math.round((count / totalForEngine) * 100)];
      })
    ) as Partial<Record<SupportedEngine, number>>,
  };
}

