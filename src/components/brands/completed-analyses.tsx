"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  ChevronRight,
  History,
  Search,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  first_simulation_prompt_id?: string;
}

interface CompletedAnalysesProps {
  brandId: string;
  onNewCompletion?: (promptId: string) => void;
}

const engineIcons: Record<SupportedEngine, React.ReactNode> = {
  chatgpt: <ChatGPTIcon className="w-4 h-4" />,
  perplexity: <PerplexityIcon className="w-4 h-4" />,
  gemini: <GeminiIcon className="w-4 h-4" />,
  grok: <GrokIcon className="w-4 h-4" />,
};

export function CompletedAnalyses({ brandId, onNewCompletion }: CompletedAnalysesProps) {
  const [batches, setBatches] = useState<CompletedBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [recentlyCompleted, setRecentlyCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();

    const fetchCompleted = async () => {
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
          prompt_set_id
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

      const batchesWithStats = await Promise.all(
        fetchedBatches.map(async (batch) => {
          const { data: sims } = await supabase
            .from("simulations")
            .select("is_visible, engine, prompt_text, prompt_id")
            .eq("analysis_batch_id", batch.id);

          const visibleCount = sims?.filter(s => s.is_visible === true).length || 0;
          const notVisibleCount = sims?.filter(s => s.is_visible === false).length || 0;
          const engines = Array.from(new Set(sims?.map(s => s.engine) || [])) as SupportedEngine[];
          
          const firstSimulationPromptId = sims?.[0]?.prompt_id || null;

          let promptText = "Multiple prompts";
          
          if (batch.prompt_id) {
            const { data: prompt } = await supabase
              .from("prompts")
              .select("text")
              .eq("id", batch.prompt_id)
              .single();
            promptText = prompt?.text || "Analysis completed";
          } else if (batch.prompt_set_id) {
            const { data: setPrompts } = await supabase
              .from("prompts")
              .select("text")
              .eq("prompt_set_id", batch.prompt_set_id)
              .limit(1);
            if (setPrompts && setPrompts.length > 0) {
              promptText = setPrompts[0].text;
            }
          } else if (sims && sims.length > 0) {
            promptText = sims[0].prompt_text || "Analysis completed";
          }
          
          return {
            ...batch,
            prompt_text: promptText,
            visible_count: visibleCount,
            not_visible_count: notVisibleCount,
            engines,
            first_simulation_prompt_id: firstSimulationPromptId,
          };
        })
      );

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

    const batchesChannel = supabase
      .channel(`completed-batches-${brandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analysis_batches", filter: `brand_id=eq.${brandId}` },
        () => fetchCompleted()
      )
      .subscribe();

    const simulationsChannel = supabase
      .channel(`completed-simulations-${brandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "simulations", filter: `brand_id=eq.${brandId}` },
        () => fetchCompleted()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(batchesChannel);
      supabase.removeChannel(simulationsChannel);
    };
  }, [brandId, onNewCompletion]);

  const router = useRouter();
  const displayedBatches = showAll ? batches : batches.slice(0, 5);

  const getPromptIdForNavigation = (batch: CompletedBatch) => {
    return batch.prompt_id || batch.first_simulation_prompt_id;
  };

  const handleRowClick = (batch: CompletedBatch) => {
    const promptId = getPromptIdForNavigation(batch);
    if (promptId) {
      router.push(`/brands/${brandId}/prompts/${promptId}`);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium text-sm">
            Recent Analyses
            {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground inline ml-2" />}
          </span>
          {batches.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({batches.length})
            </span>
          )}
        </div>
        {batches.length > 5 && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)} className="h-6 px-2 text-xs">
            {showAll ? "Less" : "All"}
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : batches.length === 0 ? (
        <div className="py-8 px-4 text-center">
          <Search className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No analyses in the last 24 hours</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {displayedBatches.map((batch) => {
            const isRecent = recentlyCompleted.has(batch.id);
            const hasNavigation = !!getPromptIdForNavigation(batch);
            
            return (
              <div 
                key={batch.id}
                onClick={() => handleRowClick(batch)}
                className={`group flex items-center gap-3 px-4 py-3 transition-colors ${
                  isRecent ? 'bg-emerald-500/5' : 'hover:bg-muted/30'
                } ${hasNavigation ? 'cursor-pointer' : ''}`}
              >
                {/* Completed icon */}
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isRecent && (
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors" title={batch.prompt_text}>
                      {batch.prompt_text}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {/* Engines - compact */}
                    <div className="flex items-center gap-0.5">
                      {batch.engines.map(engine => (
                        <span key={engine} className="w-4 h-4">{engineIcons[engine]}</span>
                      ))}
                    </div>
                    <span>{batch.completed_at ? formatDistanceToNow(new Date(batch.completed_at), { addSuffix: true }) : 'Recently'}</span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3 text-emerald-500" />{batch.visible_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <EyeOff className="w-3 h-3 text-red-500" />{batch.not_visible_count}
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                {hasNavigation && (
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
