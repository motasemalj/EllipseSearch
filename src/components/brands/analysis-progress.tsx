"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Eye, EyeOff, Clock, BarChart3, AlertCircle, Info, Timer, StopCircle } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface RunningBatch {
  id: string;
  total_simulations: number;
  completed_simulations: number;
  created_at: string;
  prompt_text?: string;
}

interface AnalysisProgressProps {
  brandId: string;
}

// Estimate time based on simulations remaining (roughly 15-30 seconds per simulation)
function estimateTimeRemaining(remaining: number): string {
  if (remaining === 0) return "Finishing up...";
  const minSeconds = remaining * 15;
  const maxSeconds = remaining * 30;
  
  if (minSeconds < 60) return "Less than 1 minute";
  if (maxSeconds < 120) return "~1-2 minutes";
  
  const minMinutes = Math.ceil(minSeconds / 60);
  const maxMinutes = Math.ceil(maxSeconds / 60);
  
  if (maxMinutes <= 5) return `~${minMinutes}-${maxMinutes} minutes`;
  return `~${minMinutes}-${maxMinutes} minutes`;
}

export function AnalysisProgress({ brandId }: AnalysisProgressProps) {
  const router = useRouter();
  const [batches, setBatches] = useState<RunningBatch[]>([]);
  const [batchVisibility, setBatchVisibility] = useState<Record<string, { visible: number; notVisible: number }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [batchToCancel, setBatchToCancel] = useState<RunningBatch | null>(null);

  useEffect(() => {
    const fetchProgress = async () => {
      const supabase = createClient();

      // Get running batches with prompt info
      const { data: fetchedBatches } = await supabase
        .from("analysis_batches")
        .select(`
          id, 
          total_simulations, 
          completed_simulations, 
          created_at,
          prompts(text)
        `)
        .eq("brand_id", brandId)
        .in("status", ["queued", "processing"])
        .order("created_at", { ascending: false });

      if (!fetchedBatches || fetchedBatches.length === 0) {
        setBatches([]);
        setIsLoading(false);
        return;
      }

      // Map batches with prompt text
      const batchesWithPrompt = fetchedBatches.map(b => ({
        ...b,
        prompt_text: (b.prompts as { text: string } | null)?.text || "Multiple prompts",
      }));

      setBatches(batchesWithPrompt);

      // Get simulations for each batch's visibility counts
      const visibilityMap: Record<string, { visible: number; notVisible: number }> = {};
      
      for (const batch of fetchedBatches) {
        const { data: sims } = await supabase
          .from("simulations")
          .select("is_visible")
          .eq("analysis_batch_id", batch.id);

        if (sims) {
          visibilityMap[batch.id] = {
            visible: sims.filter(s => s.is_visible === true).length,
            notVisible: sims.filter(s => s.is_visible === false).length,
          };
        }
      }
      
      setBatchVisibility(visibilityMap);
      setIsLoading(false);
    };

    fetchProgress();
    const interval = setInterval(fetchProgress, 2000);
    return () => clearInterval(interval);
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

      // Remove from local state immediately
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
    <TooltipProvider>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Running Analyses</h3>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                {batches.length} {batches.length === 1 ? 'analysis' : 'analyses'} in progress
              </p>
            </div>
          </div>
          
          {/* Disclaimer tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1.5 rounded-lg cursor-help">
                <Info className="w-3.5 h-3.5" />
                <span>May take a few minutes</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p>Each AI engine simulation takes 15-30 seconds. Total time depends on the number of engines and prompts being analyzed.</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Individual Analysis Cards - Each batch gets its own row */}
        {batches.map((batch) => {
          const progress = batch.total_simulations > 0 
            ? Math.round((batch.completed_simulations / batch.total_simulations) * 100) 
            : 0;
          const remaining = batch.total_simulations - batch.completed_simulations;
          const visibility = batchVisibility[batch.id] || { visible: 0, notVisible: 0 };
          const elapsedSeconds = Math.round((Date.now() - new Date(batch.created_at).getTime()) / 1000);

          return (
            <div 
              key={batch.id}
              className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent p-4"
            >
              {/* Batch Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={batch.prompt_text}>
                    &ldquo;{batch.prompt_text?.substring(0, 50)}{(batch.prompt_text?.length || 0) > 50 ? "..." : ""}&rdquo;
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      {elapsedSeconds < 60 ? `${elapsedSeconds}s` : `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`} elapsed
                    </span>
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <Clock className="w-3 h-3" />
                      {estimateTimeRemaining(remaining)}
                    </span>
                  </div>
                </div>
                
                {/* Enhanced Cancel Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950/50 hover:text-red-700 hover:border-red-300 shadow-sm transition-all"
                  onClick={() => handleCancelClick(batch)}
                  disabled={cancellingBatchId === batch.id}
                >
                  {cancellingBatchId === batch.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <StopCircle className="w-3.5 h-3.5" />
                  )}
                  <span className="font-medium">Cancel</span>
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{batch.completed_simulations} of {batch.total_simulations} simulations</span>
                  <span className="font-semibold text-primary">{progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Results Preview */}
              {(visibility.visible > 0 || visibility.notVisible > 0) && (
                <div className="flex items-center gap-3 mt-3 text-xs">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Eye className="w-3 h-3" />
                    {visibility.visible} visible
                  </span>
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <EyeOff className="w-3 h-3" />
                    {visibility.notVisible} not visible
                  </span>
                </div>
              )}
            </div>
          );
        })}
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
    </TooltipProvider>
  );
}
