"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertCircle, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
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
  _simStages?: SimStage[]; // UI-only derived field
}

type SimStage = {
  analysis_batch_id: string;
  engine: SupportedEngine;
  status: string | null;
  analysis_stage: string | null;
  enrichment_status: string | null;
  is_visible: boolean | null;
  prompt_text: string | null;
};

interface AnalysisProgressProps {
  brandId: string;
}

// Engine names for display
const engineNames: Record<SupportedEngine, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
};

export function AnalysisProgress({ brandId }: AnalysisProgressProps) {
  const router = useRouter();
  const [batches, setBatches] = useState<RunningBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [batchToCancel, setBatchToCancel] = useState<RunningBatch | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  // Smooth timer (decoupled from Supabase updates)
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
          ? (async () => {
              // During rollout, new columns may not exist yet. Try extended select, fallback to minimal select.
              const extended = await supabase
                .from("simulations")
                .select("analysis_batch_id, engine, status, analysis_stage, enrichment_status, is_visible, prompt_text")
                .in("analysis_batch_id", batchIds);

              if (!extended.error) return extended;

              const msg = extended.error.message || "";
              const isSchemaCacheMissing =
                msg.includes("schema cache") &&
                (msg.includes("analysis_stage") || msg.includes("enrichment_status"));

              if (!isSchemaCacheMissing) return extended;

              return await supabase
                .from("simulations")
                .select("analysis_batch_id, engine, status, is_visible, prompt_text")
                .in("analysis_batch_id", batchIds);
            })()
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

      const fallbackPromptMap = new Map<string, string>();
      const stageMap = new Map<string, SimStage[]>();
      for (const sim of simulationsResult.data || []) {
        const s = sim as unknown as SimStage;
        if (!stageMap.has(s.analysis_batch_id)) stageMap.set(s.analysis_batch_id, []);
        stageMap.get(s.analysis_batch_id)!.push(s);

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
          _simStages: stageMap.get(b.id) || [],
        };
      });

      setBatches(batchesWithPrompt);
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

  const orderedBatches = useMemo(() => {
    const list = [...batches];
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, [batches]);

  function formatElapsed(seconds: number) {
    const s = Math.max(0, Math.floor(seconds));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return mm > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : `${ss}s`;
  }

  function deriveStage(batch: RunningBatch) {
    if ((batch.status || "") === "awaiting_rpa") {
      return { label: "Awaiting RPA…", step: "rpa" as const, engine: undefined as SupportedEngine | undefined };
    }

    const sims: SimStage[] = batch._simStages || [];
    const simulating = sims.filter((s) => (s.analysis_stage || "").startsWith("simulating"));
    const enriching = sims.filter(
      (s) => (s.enrichment_status || "") === "processing" || (s.analysis_stage || "").startsWith("enriching")
    );
    const queuedEnrich = sims.filter((s) => (s.enrichment_status || "") === "queued");

    if (enriching.length > 0) return { label: `Generating detailed report of ${engineNames[enriching[0].engine]}…`, step: "enriching" as const, engine: enriching[0].engine };
    if (queuedEnrich.length > 0 && batch.completed_simulations >= batch.total_simulations) return { label: "Generating detailed reports…", step: "enriching" as const, engine: undefined };
    if (simulating.length > 0) return { label: `Querying ${engineNames[simulating[0].engine]}…`, step: "simulating" as const, engine: simulating[0].engine };
    if (batch.completed_simulations >= batch.total_simulations) return { label: "Finalizing analysis…", step: "finalizing" as const, engine: undefined };
    return { label: "Running analysis…", step: "simulating" as const, engine: undefined };
  }

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
        description: "The analysis has been stopped.",
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

  if (isLoading || orderedBatches.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className="absolute w-4 h-4 rounded-full bg-primary/20 animate-ping" />
            </div>
            <span className="font-medium text-sm">
              {orderedBatches.length === 1 ? "Analysis Running" : `${orderedBatches.length} Analyses Running`}
            </span>
          </div>
        </div>

        {/* Batches */}
        <div className="p-2 space-y-2">
          <AnimatePresence initial={false} mode="popLayout">
          {orderedBatches.map((batch) => {
            const createdAt = new Date(batch.created_at).getTime();
            const elapsedSeconds = Math.round((nowTs - createdAt) / 1000);
            const elapsedFormatted = formatElapsed(elapsedSeconds);

            const stage = deriveStage(batch);
            const simPct =
              batch.total_simulations > 0
                ? Math.round((batch.completed_simulations / batch.total_simulations) * 100)
                : 0;

            const enginesText = batch.engines.map(e => engineNames[e]).join(", ");

            return (
              <motion.div
                key={batch.id}
                layout
                layoutId={`batch-${batch.id}`}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  {/* Left: status badge + timer */}
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={[
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 border font-medium",
                        stage.step === "enriching"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : stage.step === "finalizing"
                            ? "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                            : stage.step === "rpa"
                              ? "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                              : "border-primary/20 bg-primary/5 text-primary",
                      ].join(" ")}
                    >
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>{stage.label}</span>
                    </span>
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      {elapsedFormatted}
                    </span>
                  </div>

                  {/* Right: cancel */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground hover:text-destructive"
                    onClick={() => handleCancelClick(batch)}
                    disabled={cancellingBatchId === batch.id}
                  >
                    {cancellingBatchId === batch.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>

                {/* Prompt text */}
                <p className="text-sm font-medium truncate mb-1" title={batch.prompt_text}>
                  {batch.prompt_text}
                </p>

                {/* Meta info */}
                <p className="text-xs text-muted-foreground mb-2">
                  {enginesText} • {batch.completed_simulations}/{batch.total_simulations} simulations
                </p>

                {/* Progress bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={[
                        "h-full rounded-full transition-all duration-500",
                        stage.step === "enriching"
                          ? "bg-amber-500"
                          : stage.step === "finalizing"
                            ? "bg-violet-500"
                            : "bg-primary",
                      ].join(" ")}
                      style={{ width: `${Math.min(99, Math.max(0, simPct))}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-8">
                    {Math.min(99, Math.max(0, simPct))}%
                  </span>
                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
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
              This will stop the running analysis. Credits already used will not be refunded.
              <br /><br />
              <span className="text-foreground font-medium">
                {batchToCancel && (
                  <>
                    {batchToCancel.completed_simulations} of {batchToCancel.total_simulations} simulations completed.
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
