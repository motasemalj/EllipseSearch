import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  CheckCircle2,
  Eye,
  EyeOff,
  ChevronRight,
  Clock,
  Loader2,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { EngineBadge } from "@/components/ui/engine-badge";
import { VisibilityGauge, MiniGauge } from "@/components/ui/visibility-gauge";
import { BatchActions } from "@/components/batches/batch-actions";
import { SupportedEngine, SelectionSignals, SupportedRegion, getRegionInfo } from "@/types";
import { ShieldAlert, ShieldCheck, Lock } from "lucide-react";

// Watchdog Badge Component
function WatchdogBadge({ data }: { 
  data?: { 
    enabled: boolean; 
    result: { 
      has_hallucinations: boolean; 
      accuracy_score: number;
      hallucinations: unknown[];
    } | null 
  } 
}) {
  // Not enabled for this analysis
  if (!data || !data.enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Lock className="w-3 h-3" />
        <span className="text-xs">Pro</span>
      </span>
    );
  }

  // Enabled but no result (no ground truth)
  if (!data.result) {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-500">
        <ShieldAlert className="w-4 h-4" />
        <span className="text-xs">No data</span>
      </span>
    );
  }

  // Has results
  if (data.result.has_hallucinations) {
    const count = data.result.hallucinations?.length || 0;
    return (
      <span className="inline-flex items-center gap-1.5 text-red-500">
        <ShieldAlert className="w-4 h-4" />
        <span className="text-sm font-medium">{count} issue{count !== 1 ? "s" : ""}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-green-500">
      <ShieldCheck className="w-4 h-4" />
      <span className="text-sm font-medium">{data.result.accuracy_score}%</span>
    </span>
  );
}

interface BatchPageProps {
  params: { brandId: string; keywordSetId: string; batchId: string };
}

export default async function BatchPage({ params }: BatchPageProps) {
  const { brandId, keywordSetId, batchId } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  // Get brand
  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!brand) notFound();

  // Get keyword set
  const { data: keywordSet } = await supabase
    .from("keyword_sets")
    .select("*")
    .eq("id", keywordSetId)
    .single();

  if (!keywordSet) notFound();

  // Get batch with simulations
  const { data: batch } = await supabase
    .from("analysis_batches")
    .select("*")
    .eq("id", batchId)
    .single();

  if (!batch) notFound();

  const { data: simulations } = await supabase
    .from("simulations")
    .select("*, keywords(text)")
    .eq("analysis_batch_id", batchId)
    .order("created_at", { ascending: true });

  const progress = batch.total_simulations > 0
    ? Math.round((batch.completed_simulations / batch.total_simulations) * 100)
    : 0;

  const visibleCount = simulations?.filter(s => s.is_visible).length || 0;
  const visibility = simulations && simulations.length > 0
    ? Math.round((visibleCount / simulations.length) * 100)
    : 0;

  // Group by engine
  const byEngine: Partial<Record<SupportedEngine, { visible: number; total: number }>> = {};
  simulations?.forEach(sim => {
    const engine = sim.engine as SupportedEngine;
    if (!byEngine[engine]) byEngine[engine] = { visible: 0, total: 0 };
    byEngine[engine]!.total++;
    if (sim.is_visible) byEngine[engine]!.visible++;
  });

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
    completed: { icon: <CheckCircle2 className="w-5 h-5" />, color: "text-green-500", bg: "bg-green-500/10", label: "Completed" },
    processing: { icon: <Loader2 className="w-5 h-5 animate-spin" />, color: "text-blue-500", bg: "bg-blue-500/10", label: "Processing" },
    queued: { icon: <Clock className="w-5 h-5" />, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Queued" },
    failed: { icon: <AlertTriangle className="w-5 h-5" />, color: "text-red-500", bg: "bg-red-500/10", label: "Failed" },
  };

  const config = statusConfig[batch.status] || statusConfig.queued;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href={`/brands/${brandId}/keyword-sets/${keywordSetId}`}>
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="text-sm text-muted-foreground mb-1">
              <Link href={`/brands/${brandId}`} className="hover:text-foreground">
                {brand.name}
              </Link>
              <span className="mx-2">/</span>
              <Link href={`/brands/${brandId}/keyword-sets/${keywordSetId}`} className="hover:text-foreground">
                {keywordSet.name}
              </Link>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Analysis Results</h1>
            <p className="text-muted-foreground mt-1">
              {new Date(batch.created_at).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
        <BatchActions 
          batchId={batchId}
          brandId={brandId}
          keywordSetId={keywordSetId}
          status={batch.status}
        />
      </div>

      {/* Status Card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${config.bg}`}>
              <span className={config.color}>{config.icon}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-semibold ${config.color}`}>{config.label}</span>
                {batch.status === 'processing' && (
                  <span className="text-sm text-muted-foreground">({progress}%)</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {batch.completed_simulations} of {batch.total_simulations} simulations completed
              </p>
              {/* Region Info */}
              {(() => {
                const regionInfo = getRegionInfo((batch.region || 'global') as SupportedRegion);
                return (
                  <div className="flex items-center gap-1.5 mt-1.5 text-sm text-muted-foreground">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Region: {regionInfo.flag} {regionInfo.name}</span>
                  </div>
                );
              })()}
            </div>
          </div>
          
          {batch.status === 'completed' && (
            <VisibilityGauge value={visibility} size="md" label="AI Visibility" />
          )}
        </div>

        {/* Progress bar for processing */}
        {batch.status === 'processing' && (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500 animate-pulse"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Engine Breakdown */}
      {Object.keys(byEngine).length > 0 && batch.status === 'completed' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(Object.entries(byEngine) as [SupportedEngine, { visible: number; total: number }][]).map(([engine, stats]) => {
            const engineVis = stats.total > 0 ? Math.round((stats.visible / stats.total) * 100) : 0;
            return (
              <div key={engine} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <EngineBadge engine={engine} showLabel size="sm" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{engineVis}%</p>
                    <p className="text-xs text-muted-foreground">{stats.visible}/{stats.total} visible</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Simulations Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Simulation Results</h2>
        </div>
        
        {!simulations || simulations.length === 0 ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-3 animate-spin" />
            <p className="text-muted-foreground">Waiting for simulations...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Prompt</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Engine</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Language</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Visibility</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                      Watchdog
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">AEO Score</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {simulations.map((sim) => {
                  const keyword = sim.keywords as { text: string } | null;
                  const signals = sim.selection_signals as SelectionSignals | null;
                  
                  // Extract hallucination watchdog data (new format)
                  const watchdogData = (signals as Record<string, unknown> | null)?.hallucination_watchdog as {
                    enabled: boolean;
                    result: {
                      has_hallucinations: boolean;
                      accuracy_score: number;
                      hallucinations: unknown[];
                    } | null;
                  } | undefined;
                  
                  const avgScore = signals?.gap_analysis 
                    ? Math.round(((signals.gap_analysis.structure_score || 0) + 
                        (signals.gap_analysis.data_density_score || 0) + 
                        (signals.gap_analysis.directness_score || 0)) / 3 * 20)
                    : 0;

                  return (
                    <tr key={sim.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium">{keyword?.text || sim.prompt_text}</span>
                      </td>
                      <td className="px-4 py-3">
                        <EngineBadge engine={sim.engine as SupportedEngine} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium w-fit">
                            {sim.language?.toUpperCase() || "EN"}
                          </span>
                          {(() => {
                            const simRegion = getRegionInfo((sim.region || 'global') as SupportedRegion);
                            return sim.region && sim.region !== 'global' ? (
                              <span className="text-xs text-muted-foreground">
                                {simRegion.flag} {simRegion.name}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {sim.is_visible ? (
                          <span className="inline-flex items-center gap-1.5 text-green-500">
                            <Eye className="w-4 h-4" />
                            <span className="text-sm font-medium">Visible</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-red-500">
                            <EyeOff className="w-4 h-4" />
                            <span className="text-sm font-medium">Not Visible</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <WatchdogBadge data={watchdogData} />
                      </td>
                      <td className="px-4 py-3">
                        <MiniGauge value={avgScore} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/brands/${brandId}/keyword-sets/${keywordSetId}/batches/${batchId}/simulations/${sim.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1">
                            View
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
