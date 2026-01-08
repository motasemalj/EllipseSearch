"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  Clock, 
  ChevronRight,
  Sparkles,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import { SupportedEngine } from "@/types";

interface CompletedBatch {
  id: string;
  total_simulations: number;
  completed_simulations: number;
  created_at: string;
  completed_at: string | null;
  prompt_id: string | null;
  prompt_text?: string;
  visible_count: number;
  not_visible_count: number;
  engines: SupportedEngine[];
}

interface CompletedAnalysesProps {
  brandId: string;
  onNewCompletion?: (promptId: string) => void;
}

const engineIcons: Record<SupportedEngine, React.ReactNode> = {
  chatgpt: <ChatGPTIcon className="w-3.5 h-3.5" />,
  perplexity: <PerplexityIcon className="w-3.5 h-3.5" />,
  gemini: <GeminiIcon className="w-3.5 h-3.5" />,
  grok: <GrokIcon className="w-3.5 h-3.5" />,
};

export function CompletedAnalyses({ brandId, onNewCompletion }: CompletedAnalysesProps) {
  const [batches, setBatches] = useState<CompletedBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchCompleted = async () => {
      const supabase = createClient();

      // Get completed batches from the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: fetchedBatches } = await supabase
        .from("analysis_batches")
        .select(`
          id, 
          total_simulations, 
          completed_simulations, 
          created_at,
          completed_at,
          prompt_id,
          prompts(text)
        `)
        .eq("brand_id", brandId)
        .eq("status", "completed")
        .gte("completed_at", oneDayAgo)
        .order("completed_at", { ascending: false })
        .limit(10);

      if (!fetchedBatches || fetchedBatches.length === 0) {
        setBatches([]);
        setIsLoading(false);
        return;
      }

      // Get simulations for each batch to calculate visibility
      const batchesWithStats = await Promise.all(
        fetchedBatches.map(async (batch) => {
          const { data: sims } = await supabase
            .from("simulations")
            .select("is_visible, engine")
            .eq("analysis_batch_id", batch.id);

          const visibleCount = sims?.filter(s => s.is_visible === true).length || 0;
          const notVisibleCount = sims?.filter(s => s.is_visible === false).length || 0;
          const engines = Array.from(new Set(sims?.map(s => s.engine) || [])) as SupportedEngine[];

          return {
            ...batch,
            prompt_text: (batch.prompts as { text: string } | null)?.text || "Multiple prompts",
            visible_count: visibleCount,
            not_visible_count: notVisibleCount,
            engines,
          };
        })
      );

      // Track recently completed (completed in last 5 minutes)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const newlyCompleted = new Set<string>();
      
      batchesWithStats.forEach(batch => {
        if (batch.completed_at && new Date(batch.completed_at).getTime() > fiveMinutesAgo) {
          newlyCompleted.add(batch.id);
          if (batch.prompt_id && onNewCompletion) {
            onNewCompletion(batch.prompt_id);
          }
        }
      });
      
      setRecentlyCompleted(newlyCompleted);
      setBatches(batchesWithStats);
      setIsLoading(false);
    };

    fetchCompleted();
    // Refresh every 30 seconds to catch new completions
    const interval = setInterval(fetchCompleted, 30000);
    return () => clearInterval(interval);
  }, [brandId, onNewCompletion]);

  if (isLoading || batches.length === 0) return null;

  const displayedBatches = showAll ? batches : batches.slice(0, 3);

  return (
    <div className="rounded-2xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-emerald-500/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10">
            <History className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Recent Analyses</h2>
            <p className="text-sm text-muted-foreground">
              {batches.length} completed in the last 24 hours
            </p>
          </div>
        </div>
        {batches.length > 3 && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show Less" : `View All (${batches.length})`}
          </Button>
        )}
      </div>

      {/* Completed Analyses List */}
      <div className="divide-y divide-border">
        {displayedBatches.map((batch) => {
          const isRecent = recentlyCompleted.has(batch.id);
          const visibility = batch.total_simulations > 0
            ? Math.round((batch.visible_count / batch.total_simulations) * 100)
            : 0;
          
          return (
            <div 
              key={batch.id}
              className={`p-4 hover:bg-muted/30 transition-colors ${isRecent ? 'bg-emerald-500/5' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isRecent && (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 gap-1">
                        <Sparkles className="w-3 h-3" />
                        Just completed
                      </Badge>
                    )}
                    <p className="text-sm font-medium truncate" title={batch.prompt_text}>
                      &ldquo;{batch.prompt_text?.substring(0, 40)}{(batch.prompt_text?.length || 0) > 40 ? "..." : ""}&rdquo;
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {batch.completed_at 
                        ? formatDistanceToNow(new Date(batch.completed_at), { addSuffix: true })
                        : 'Recently'
                      }
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <Eye className="w-3 h-3" />
                      {batch.visible_count} visible
                    </span>
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                      <EyeOff className="w-3 h-3" />
                      {batch.not_visible_count} not visible
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {batch.total_simulations} total
                    </span>
                  </div>

                  {/* Engine icons */}
                  <div className="flex items-center gap-1.5 mt-2">
                    {batch.engines.map(engine => (
                      <span key={engine} className="opacity-60">
                        {engineIcons[engine]}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Visibility indicator */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={`text-lg font-bold ${
                      visibility >= 70 ? 'text-emerald-600 dark:text-emerald-400' :
                      visibility >= 40 ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                      {visibility}%
                    </p>
                    <p className="text-xs text-muted-foreground">visibility</p>
                  </div>
                  
                  {batch.prompt_id && (
                    <Link href={`/brands/${brandId}/prompts/${batch.prompt_id}`}>
                      <Button variant="ghost" size="sm" className="gap-1">
                        View
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

