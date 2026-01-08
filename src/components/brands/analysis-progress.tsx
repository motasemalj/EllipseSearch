"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Eye, EyeOff, Clock, BarChart3, X, AlertCircle } from "lucide-react";
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
import { toast } from "sonner";

interface RunningBatch {
  id: string;
  total_simulations: number;
  completed_simulations: number;
  created_at: string;
}

interface AnalysisProgressProps {
  brandId: string;
}

export function AnalysisProgress({ brandId }: AnalysisProgressProps) {
  const router = useRouter();
  const [batches, setBatches] = useState<RunningBatch[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [notVisibleCount, setNotVisibleCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [batchToCancel, setBatchToCancel] = useState<RunningBatch | null>(null);

  useEffect(() => {
    const fetchProgress = async () => {
      const supabase = createClient();

      // Get running batches
      const { data: fetchedBatches } = await supabase
        .from("analysis_batches")
        .select("id, total_simulations, completed_simulations, created_at")
        .eq("brand_id", brandId)
        .in("status", ["queued", "processing"])
        .order("created_at", { ascending: false });

      if (!fetchedBatches || fetchedBatches.length === 0) {
        setBatches([]);
        setIsLoading(false);
        return;
      }

      setBatches(fetchedBatches);

      // Get simulations for visibility counts
      const batchIds = fetchedBatches.map(b => b.id);
      const { data: sims } = await supabase
        .from("simulations")
        .select("is_visible")
        .in("analysis_batch_id", batchIds);

      if (sims) {
        setVisibleCount(sims.filter(s => s.is_visible === true).length);
        setNotVisibleCount(sims.filter(s => s.is_visible === false).length);
      }

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

  const totalSimulations = batches.reduce((acc, b) => acc + b.total_simulations, 0);
  const completedSimulations = batches.reduce((acc, b) => acc + b.completed_simulations, 0);
  const progress = totalSimulations > 0 ? Math.round((completedSimulations / totalSimulations) * 100) : 0;

  return (
    <>
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
        <div className="flex items-center justify-between mb-4">
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
          
          {/* Cancel Button */}
          {batches.length === 1 ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
              onClick={() => handleCancelClick(batches[0])}
              disabled={cancellingBatchId === batches[0].id}
            >
              {cancellingBatchId === batches[0].id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              Cancel
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
              onClick={() => handleCancelClick(batches[0])}
              disabled={cancellingBatchId !== null}
            >
              <X className="w-3.5 h-3.5" />
              Cancel All
            </Button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold text-primary">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div 
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{completedSimulations} of {totalSimulations} simulations</span>
            <span>
              {Math.round((Date.now() - new Date(batches[0].created_at).getTime()) / 1000)}s elapsed
            </span>
          </div>
        </div>

        {/* Results Preview */}
        {(visibleCount > 0 || notVisibleCount > 0) && (
          <div className="flex items-center gap-4 mt-4 text-sm">
            <span className="flex items-center gap-1.5 text-emerald-500">
              <Eye className="w-4 h-4" />
              {visibleCount} visible
            </span>
            <span className="flex items-center gap-1.5 text-red-500">
              <EyeOff className="w-4 h-4" />
              {notVisibleCount} not visible
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-4 h-4" />
              {totalSimulations - completedSimulations} remaining
            </span>
          </div>
        )}
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
