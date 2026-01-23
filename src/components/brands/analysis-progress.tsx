"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Eye, EyeOff, AlertCircle, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import { toast } from "sonner";
import { SupportedEngine } from "@/types";

interface RunningBatch {
  id: string;
  total_simulations: number;
  completed_simulations: number;
  created_at: string;
  prompt_text?: string;
  prompt_id?: string | null;
  engines: SupportedEngine[];
  status?: string;
}


interface AnalysisProgressProps {
  brandId: string;
}

const engineIcons: Record<SupportedEngine, React.ReactNode> = {
  chatgpt: <ChatGPTIcon className="w-4 h-4" />,
  perplexity: <PerplexityIcon className="w-4 h-4" />,
  gemini: <GeminiIcon className="w-4 h-4" />,
  grok: <GrokIcon className="w-4 h-4" />,
};

export function AnalysisProgress({ brandId }: AnalysisProgressProps) {
  const router = useRouter();
  const [batches, setBatches] = useState<RunningBatch[]>([]);
  const [batchVisibility, setBatchVisibility] = useState<Record<string, { visible: number; notVisible: number }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [batchToCancel, setBatchToCancel] = useState<RunningBatch | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const fetchProgress = async () => {
      const { data: fetchedBatches } = await supabase
        .from("analysis_batches")
        .select(`
          id, 
          total_simulations, 
          completed_simulations, 
          created_at,
          prompt_id,
          prompt_set_id,
          engines,
          status
        `)
        .eq("brand_id", brandId)
        .in("status", ["queued", "processing", "awaiting_rpa"])
        .order("created_at", { ascending: false });

      if (!fetchedBatches || fetchedBatches.length === 0) {
        setBatches([]);
        setBatchVisibility({});
        setIsLoading(false);
        return;
      }

      const promptIds = Array.from(
        new Set(fetchedBatches.map((b) => b.prompt_id).filter(Boolean))
      ) as string[];
      const promptSetIds = Array.from(
        new Set(fetchedBatches.map((b) => b.prompt_set_id).filter(Boolean))
      ) as string[];
      const batchIds = fetchedBatches.map((b) => b.id);

      const [promptResult, promptSetResult, simulationsResult] = await Promise.all([
        promptIds.length > 0
          ? supabase.from("prompts").select("id, text").in("id", promptIds)
          : Promise.resolve({ data: [] }),
        promptSetIds.length > 0
          ? supabase
              .from("prompts")
              .select("prompt_set_id, text, created_at")
              .in("prompt_set_id", promptSetIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [] }),
        batchIds.length > 0
          ? supabase
              .from("simulations")
              .select("analysis_batch_id, is_visible, prompt_text")
              .in("analysis_batch_id", batchIds)
          : Promise.resolve({ data: [] }),
      ]);

      const promptMap = new Map(
        (promptResult.data || []).map((p) => [p.id, p.text])
      );
      const promptSetMap = new Map<string, string>();
      for (const prompt of promptSetResult.data || []) {
        if (!promptSetMap.has(prompt.prompt_set_id)) {
          promptSetMap.set(prompt.prompt_set_id, prompt.text);
        }
      }

      const visibilityMap: Record<string, { visible: number; notVisible: number }> = {};
      const fallbackPromptMap = new Map<string, string>();
      for (const sim of simulationsResult.data || []) {
        if (!visibilityMap[sim.analysis_batch_id]) {
          visibilityMap[sim.analysis_batch_id] = { visible: 0, notVisible: 0 };
        }
        if (sim.is_visible === true) {
          visibilityMap[sim.analysis_batch_id].visible += 1;
        } else if (sim.is_visible === false) {
          visibilityMap[sim.analysis_batch_id].notVisible += 1;
        }
        if (!fallbackPromptMap.has(sim.analysis_batch_id) && sim.prompt_text) {
          fallbackPromptMap.set(sim.analysis_batch_id, sim.prompt_text);
        }
      }

      const batchesWithPrompt = fetchedBatches.map((b) => {
        const promptText =
          (b.prompt_id ? promptMap.get(b.prompt_id) : undefined) ||
          (b.prompt_set_id ? promptSetMap.get(b.prompt_set_id) : undefined) ||
          fallbackPromptMap.get(b.id) ||
          "Analysis in progress";

        return {
          ...b,
          prompt_text: promptText,
          prompt_id: b.prompt_id,
          engines: (b.engines as SupportedEngine[]) || [],
          status: b.status,
        };
      });

      setBatches(batchesWithPrompt);
      setBatchVisibility(visibilityMap);
      setIsLoading(false);
    };

    fetchProgress();

    const batchesChannel = supabase
      .channel(`analysis-batches-${brandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analysis_batches", filter: `brand_id=eq.${brandId}` },
        () => fetchProgress()
      )
      .subscribe();

    const simulationsChannel = supabase
      .channel(`analysis-batches-simulations-${brandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "simulations", filter: `brand_id=eq.${brandId}` },
        () => fetchProgress()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(batchesChannel);
      supabase.removeChannel(simulationsChannel);
    };
  }, [brandId]);

  const handleCancelClick = (batch: RunningBatch) => {
    setBatchToCancel(batch);
    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    if (!batchToCancel) return;

    setCancellingBatchId(batchToCancel.id);
    setShowCancelDialog(false);

    try {
      const response = await fetch("/api/analysis/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchToCancel.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel analysis");
      }

      toast.success("Analysis cancelled", {
        description: data.refunded_credits > 0 
          ? `${data.refunded_credits} credits have been refunded.`
          : "The analysis has been stopped.",
      });

      setBatches(prev => prev.filter(b => b.id !== batchToCancel.id));
      router.refresh();
    } catch (error) {
      console.error("Failed to cancel analysis:", error);
      toast.error("Failed to cancel analysis", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setCancellingBatchId(null);
      setBatchToCancel(null);
    }
  };

  if (isLoading || batches.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Compact Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className="absolute w-4 h-4 rounded-full bg-primary/20 animate-ping" />
            </div>
            <span className="font-medium text-sm">
              {batches.length === 1 ? 'Analysis Running' : `${batches.length} Analyses Running`}
            </span>
          </div>
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>

        {/* Batches - Compact Single-Row List */}
        <div className="divide-y divide-border">
          {batches.map((batch) => {
            const visibility = batchVisibility[batch.id] || { visible: 0, notVisible: 0 };
            const elapsedSeconds = Math.round((Date.now() - new Date(batch.created_at).getTime()) / 1000);
            const elapsedFormatted = elapsedSeconds < 60 
              ? `${elapsedSeconds}s` 
              : `${Math.floor(elapsedSeconds / 60)}m`;

            return (
              <div key={batch.id} className="flex items-center gap-3 px-4 py-3">
                {/* Progress indicator - no percentage, just animated loader */}
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={batch.prompt_text}>
                    {batch.prompt_text}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {/* Engines - inline */}
                    <div className="flex items-center gap-0.5">
                      {batch.engines.map(engine => (
                        <span key={engine} className="w-4 h-4">{engineIcons[engine]}</span>
                      ))}
                    </div>
                    <span>{batch.completed_simulations}/{batch.total_simulations}</span>
                    <span className="flex items-center gap-0.5">
                      <Timer className="w-3 h-3" />{elapsedFormatted}
                    </span>
                    {visibility.visible > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                        <Eye className="w-3 h-3" />{visibility.visible}
                      </span>
                    )}
                    {visibility.notVisible > 0 && (
                      <span className="text-red-500 flex items-center gap-0.5">
                        <EyeOff className="w-3 h-3" />{visibility.notVisible}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Cancel Button - Larger */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:border-red-800 dark:hover:bg-red-950 shrink-0"
                  onClick={() => handleCancelClick(batch)}
                  disabled={cancellingBatchId === batch.id}
                >
                  {cancellingBatchId === batch.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Cancel Analysis?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will stop the running analysis. Any incomplete simulations will not be charged, and credits will be refunded.
              <br /><br />
              <span className="text-foreground font-medium">
                {batchToCancel && (
                  <>
                    {batchToCancel.completed_simulations} of {batchToCancel.total_simulations} simulations completed.
                    {batchToCancel.total_simulations - batchToCancel.completed_simulations > 0 && (
                      <> {batchToCancel.total_simulations - batchToCancel.completed_simulations} credits will be refunded.</>
                    )}
                  </>
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Running</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancel Analysis
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
