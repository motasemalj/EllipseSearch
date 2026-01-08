import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupportedEngine } from "@/types";
import { CompareView } from "@/components/compare/compare-view";

export const dynamic = "force-dynamic";

type Mode = "sets" | "prompts";

const ENGINES: SupportedEngine[] = ["chatgpt", "perplexity", "gemini", "grok"];

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toDateKey(iso: string) {
  return iso.slice(0, 10);
}

function engineLabel(e: SupportedEngine) {
  if (e === "chatgpt") return "ChatGPT";
  if (e === "perplexity") return "Perplexity";
  if (e === "gemini") return "Gemini";
  return "Grok";
}

function buildEmptyStats() {
  const byEngine = Object.fromEntries(
    ENGINES.map((e) => [e, { total: 0, visible: 0, visibilityPct: 0 }])
  ) as Record<SupportedEngine, { total: number; visible: number; visibilityPct: number }>;

  return {
    total: 0,
    visible: 0,
    visibilityPct: 0,
    byEngine,
    avgScores: { structure: 0, dataDensity: 0, directness: 0 },
  };
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: { brandId: string };
  searchParams?: { mode?: string; a?: string; b?: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("id", params.brandId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!brand) notFound();

  const requestedMode = (searchParams?.mode === "prompts" ? "prompts" : "sets") as Mode;

  // Get prompt sets for this brand
  const { data: promptSets } = await supabase
    .from("prompt_sets")
    .select("id, name")
    .eq("brand_id", params.brandId)
    .order("created_at", { ascending: false });

  // Get all prompts for this brand with their set info
  const { data: prompts } = await supabase
    .from("prompts")
    .select("id, text, prompt_set_id")
    .eq("brand_id", params.brandId)
    .order("created_at", { ascending: false });

  const setsOptions =
    (promptSets || []).map((s) => ({
      id: s.id as string,
      label: s.name as string,
    })) || [];

  const promptSetNameById = new Map<string, string>(
    (promptSets || []).map((s) => [s.id as string, s.name as string])
  );

  const promptOptions =
    (prompts || []).map((p) => ({
      id: p.id as string,
      label: p.text as string,
      secondary: promptSetNameById.get(p.prompt_set_id as string) || "",
    })) || [];

  const defaultASet = setsOptions[0]?.id;
  const defaultBSet = setsOptions[1]?.id || setsOptions[0]?.id;

  const defaultAPrompt = promptOptions[0]?.id;
  const defaultBPrompt = promptOptions[1]?.id || promptOptions[0]?.id;

  const aId =
    (requestedMode === "sets" ? searchParams?.a || defaultASet : searchParams?.a || defaultAPrompt) || "";
  const bId =
    (requestedMode === "sets" ? searchParams?.b || defaultBSet : searchParams?.b || defaultBPrompt) || "";

  // Map prompt_id -> group (A/B) based on mode
  const promptIdToGroup = new Map<string, "a" | "b">();

  if (requestedMode === "sets") {
    const aPromptIds = new Set(
      (prompts || []).filter((p) => p.prompt_set_id === aId).map((p) => p.id as string)
    );
    const bPromptIds = new Set(
      (prompts || []).filter((p) => p.prompt_set_id === bId).map((p) => p.id as string)
    );

    aPromptIds.forEach((id) => promptIdToGroup.set(id, "a"));
    bPromptIds.forEach((id) => promptIdToGroup.set(id, "b"));
  } else {
    if (aId) promptIdToGroup.set(aId, "a");
    if (bId) promptIdToGroup.set(bId, "b");
  }

  const promptIds = Array.from(promptIdToGroup.keys());
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const simsQuery = promptIds.length
    ? supabase
        .from("simulations")
        .select("prompt_id, engine, is_visible, created_at, selection_signals")
        .in("prompt_id", promptIds)
        .gte("created_at", cutoff)
    : null;

  type SimulationRow = {
    prompt_id: string;
    engine: SupportedEngine;
    is_visible: boolean;
    created_at: string;
    selection_signals: unknown;
  };

  const { data: simulations } = simsQuery ? await simsQuery : { data: [] as SimulationRow[] };

  const statsA = buildEmptyStats();
  const statsB = buildEmptyStats();

  const scoreAgg = {
    a: { count: 0, structure: 0, dataDensity: 0, directness: 0 },
    b: { count: 0, structure: 0, dataDensity: 0, directness: 0 },
  };

  const trendAgg: Record<
    string,
    { aTotal: number; aVisible: number; bTotal: number; bVisible: number }
  > = {};

  for (const sim of simulations || []) {
    const group = promptIdToGroup.get(sim.prompt_id as string);
    if (!group) continue;

    const engine = sim.engine as SupportedEngine;
    const isVisible = Boolean(sim.is_visible);
    const dateKey = toDateKey(sim.created_at as string);

    const signals = sim.selection_signals as { gap_analysis?: unknown } | null;
    const gap = (signals?.gap_analysis as { structure_score?: unknown; data_density_score?: unknown; directness_score?: unknown } | null) || null;
    const s = Number(gap?.structure_score ?? 0);
    const d = Number(gap?.data_density_score ?? 0);
    const r = Number(gap?.directness_score ?? 0);

    if (!trendAgg[dateKey]) trendAgg[dateKey] = { aTotal: 0, aVisible: 0, bTotal: 0, bVisible: 0 };

    if (group === "a") {
      statsA.total++;
      if (isVisible) statsA.visible++;
      statsA.byEngine[engine].total++;
      if (isVisible) statsA.byEngine[engine].visible++;

      if (Number.isFinite(s + d + r) && (s || d || r)) {
        scoreAgg.a.count++;
        scoreAgg.a.structure += s;
        scoreAgg.a.dataDensity += d;
        scoreAgg.a.directness += r;
      }

      trendAgg[dateKey].aTotal++;
      if (isVisible) trendAgg[dateKey].aVisible++;
    } else {
      statsB.total++;
      if (isVisible) statsB.visible++;
      statsB.byEngine[engine].total++;
      if (isVisible) statsB.byEngine[engine].visible++;

      if (Number.isFinite(s + d + r) && (s || d || r)) {
        scoreAgg.b.count++;
        scoreAgg.b.structure += s;
        scoreAgg.b.dataDensity += d;
        scoreAgg.b.directness += r;
      }

      trendAgg[dateKey].bTotal++;
      if (isVisible) trendAgg[dateKey].bVisible++;
    }
  }

  statsA.visibilityPct = statsA.total > 0 ? clampPct((statsA.visible / statsA.total) * 100) : 0;
  statsB.visibilityPct = statsB.total > 0 ? clampPct((statsB.visible / statsB.total) * 100) : 0;

  for (const e of ENGINES) {
    const a = statsA.byEngine[e];
    const b = statsB.byEngine[e];
    a.visibilityPct = a.total > 0 ? clampPct((a.visible / a.total) * 100) : 0;
    b.visibilityPct = b.total > 0 ? clampPct((b.visible / b.total) * 100) : 0;
  }

  if (scoreAgg.a.count > 0) {
    statsA.avgScores = {
      structure: Math.round((scoreAgg.a.structure / scoreAgg.a.count) * 10) / 10,
      dataDensity: Math.round((scoreAgg.a.dataDensity / scoreAgg.a.count) * 10) / 10,
      directness: Math.round((scoreAgg.a.directness / scoreAgg.a.count) * 10) / 10,
    };
  }
  if (scoreAgg.b.count > 0) {
    statsB.avgScores = {
      structure: Math.round((scoreAgg.b.structure / scoreAgg.b.count) * 10) / 10,
      dataDensity: Math.round((scoreAgg.b.dataDensity / scoreAgg.b.count) * 10) / 10,
      directness: Math.round((scoreAgg.b.directness / scoreAgg.b.count) * 10) / 10,
    };
  }

  const byEngine = ENGINES.map((e) => ({
    label: engineLabel(e),
    a: statsA.byEngine[e].visibilityPct,
    b: statsB.byEngine[e].visibilityPct,
  }));

  const trend = Object.entries(trendAgg)
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([date, v]) => ({
      date,
      a: v.aTotal > 0 ? clampPct((v.aVisible / v.aTotal) * 100) : 0,
      b: v.bTotal > 0 ? clampPct((v.bVisible / v.bTotal) * 100) : 0,
    }));

  const setName = (id: string) => setsOptions.find((s) => s.id === id)?.label || "—";
  const promptLabel = (id: string) => {
    const opt = promptOptions.find((p) => p.id === id);
    if (!opt) return "—";
    return opt.secondary ? `${opt.label} • ${opt.secondary}` : opt.label;
  };

  const aLabel = requestedMode === "sets" ? setName(aId) : promptLabel(aId);
  const bLabel = requestedMode === "sets" ? setName(bId) : promptLabel(bId);

  return (
    <CompareView
      payload={{
        brandId: params.brandId,
        brandName: brand.name,
        brandDomain: brand.domain,
        mode: requestedMode,
        aId,
        bId,
        options: { sets: setsOptions, prompts: promptOptions },
        label: { a: aLabel, b: bLabel },
        stats: { a: statsA, b: statsB },
        charts: { byEngine, trend },
      }}
    />
  );
}
