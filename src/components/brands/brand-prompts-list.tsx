"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  Play, 
  Search, 
  Eye, 
  Loader2,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  BarChart3,
  ShieldAlert,
  Crown,
  Lock,
  Coins,
  AlertTriangle,
  Globe,
  ArrowUp,
  CheckCircle,
  Trash2,
  MoreVertical,
  Calendar,
  Repeat,
  ChevronDown,
} from "lucide-react";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SupportedEngine, BillingTier, TIER_LIMITS, SupportedRegion, REGIONS } from "@/types";
import { createClient } from "@/lib/supabase/client";

interface PromptWithStats {
  id: string;
  text: string;
  prompt_set_id: string | null;
  set_name?: string;
  total_sims: number;
  visible_sims: number;
  last_checked_at: string | null;
}

interface BrandPromptsListProps {
  brandId: string;
  prompts: PromptWithStats[];
}

const engines: { id: SupportedEngine; name: string; icon: React.ReactNode }[] = [
  { id: "chatgpt", name: "ChatGPT", icon: <ChatGPTIcon className="w-4 h-4" /> },
  { id: "perplexity", name: "Perplexity", icon: <PerplexityIcon className="w-4 h-4" /> },
  { id: "gemini", name: "Gemini", icon: <GeminiIcon className="w-4 h-4" /> },
  { id: "grok", name: "Grok", icon: <GrokIcon className="w-4 h-4" /> },
];

const SCHEDULE_OPTIONS = [
  { value: "none", label: "One-time analysis" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

export function BrandPromptsList({ brandId, prompts }: BrandPromptsListProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [recentlyStartedIds, setRecentlyStartedIds] = useState<string[]>([]);
  const [runningPromptIds, setRunningPromptIds] = useState<string[]>([]);
  const [justRanIds, setJustRanIds] = useState<Set<string>>(new Set());
  const [isCrawling, setIsCrawling] = useState(false);
  const [showAnalyzeDialog, setShowAnalyzeDialog] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedEngines, setSelectedEngines] = useState<SupportedEngine[]>(["chatgpt", "perplexity", "gemini", "grok"]);
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [region, setRegion] = useState<SupportedRegion>("global");
  const [enableWatchdog, setEnableWatchdog] = useState(false);
  const [userTier, setUserTier] = useState<BillingTier>("free");
  const [hasCrawledData, setHasCrawledData] = useState(false);
  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const [brandDomain, setBrandDomain] = useState<string>("");
  const [promptToDelete, setPromptToDelete] = useState<PromptWithStats | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [schedule, setSchedule] = useState<string>("none");
  const [ensembleRunCount, setEnsembleRunCount] = useState<number>(3);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [enableVarianceMetrics, setEnableVarianceMetrics] = useState(false);

  // Fetch running prompt IDs and track completions
  useEffect(() => {
    const supabase = createClient();
    let previousRunningIds = new Set<string>();
    let isMounted = true;
    
    const fetchRunning = async () => {
      if (!isMounted) return;
      
      const { data: batches } = await supabase
        .from("analysis_batches")
        .select("id, prompt_set_id, prompt_id")
        .eq("brand_id", brandId)
        .in("status", ["queued", "processing", "awaiting_rpa"]);

      if (!isMounted) return;

      if (!batches || batches.length === 0) {
        if (previousRunningIds.size > 0) {
          setJustRanIds(prev => {
            const newSet = new Set(prev);
            previousRunningIds.forEach(id => newSet.add(id));
            return newSet;
          });
          setTimeout(() => {
            if (!isMounted) return;
            setJustRanIds(prev => {
              const newSet = new Set(prev);
              previousRunningIds.forEach(id => newSet.delete(id));
              return newSet;
            });
          }, 120000);
        }
        previousRunningIds = new Set();
        setRunningPromptIds([]);
        return;
      }

      const promptIds = new Set<string>();
      
      // First check if batch has a direct prompt_id
      batches.forEach(batch => {
        if (batch.prompt_id) {
          promptIds.add(batch.prompt_id);
        }
      });
      
      // Then check simulations for each batch
      const batchIds = batches.map(b => b.id);
      const promptSetIds = Array.from(
        new Set(batches.map(b => b.prompt_set_id).filter(Boolean))
      ) as string[];
      const [simsResult, setPromptsResult] = await Promise.all([
        supabase
          .from("simulations")
          .select("prompt_id")
          .in("analysis_batch_id", batchIds),
        promptSetIds.length > 0
          ? supabase
              .from("prompts")
              .select("id, prompt_set_id")
              .in("prompt_set_id", promptSetIds)
          : Promise.resolve({ data: [] }),
      ]);

      if (!isMounted) return;
      (simsResult.data || []).forEach(s => {
        if (s.prompt_id) promptIds.add(s.prompt_id);
      });

      (setPromptsResult.data || []).forEach(p => {
        if (p.id) promptIds.add(p.id);
      });

      if (!isMounted) return;

      Array.from(previousRunningIds).forEach(id => {
        if (!promptIds.has(id)) {
          setJustRanIds(prev => new Set([...Array.from(prev), id]));
          setTimeout(() => {
            if (!isMounted) return;
            setJustRanIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
            });
          }, 120000);
        }
      });

      previousRunningIds = promptIds;
      setRunningPromptIds(Array.from(promptIds));
    };

    fetchRunning();

    const batchesChannel = supabase
      .channel(`running-batches-${brandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analysis_batches", filter: `brand_id=eq.${brandId}` },
        () => fetchRunning()
      )
      .subscribe();

    const simulationsChannel = supabase
      .channel(`running-simulations-${brandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "simulations", filter: `brand_id=eq.${brandId}` },
        () => fetchRunning()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(batchesChannel);
      supabase.removeChannel(simulationsChannel);
    };
  }, [brandId]);

  useEffect(() => {
    const checkRecentlyCompleted = async () => {
      const supabase = createClient();
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: recentBatches } = await supabase
        .from("analysis_batches")
        .select("prompt_id")
        .eq("brand_id", brandId)
        .eq("status", "completed")
        .gte("completed_at", fiveMinutesAgo);

      if (recentBatches && recentBatches.length > 0) {
        const recentIds = new Set(
          recentBatches
            .filter(b => b.prompt_id)
            .map(b => b.prompt_id as string)
        );
        setJustRanIds(recentIds);
        
        setTimeout(() => {
          setJustRanIds(new Set());
        }, 120000);
      }
    };
    
    checkRecentlyCompleted();
  }, [brandId]);

  const stableRunningIds = useMemo(() => {
    return new Set([...runningPromptIds, ...recentlyStartedIds]);
  }, [runningPromptIds, recentlyStartedIds]);

  const sortedPrompts = useMemo(() => {
    return [...prompts].sort((a, b) => {
      const aIsRunning = stableRunningIds.has(a.id);
      const bIsRunning = stableRunningIds.has(b.id);
      
      if (aIsRunning && !bIsRunning) return -1;
      if (!aIsRunning && bIsRunning) return 1;
      
      const aIsNew = a.total_sims === 0;
      const bIsNew = b.total_sims === 0;
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;
      
      if (aIsNew && bIsNew) {
        return prompts.indexOf(a) - prompts.indexOf(b);
      }
      
      const aDate = a.last_checked_at ? new Date(a.last_checked_at).getTime() : 0;
      const bDate = b.last_checked_at ? new Date(b.last_checked_at).getTime() : 0;
      return bDate - aDate;
    });
  }, [prompts, stableRunningIds]);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .single();
        
        if (profile?.organization_id) {
          const { data: org } = await supabase
            .from("organizations")
            .select("tier, credits_balance")
            .eq("id", profile.organization_id)
            .single();
          
          if (org) {
            setUserTier(org.tier as BillingTier);
            setCreditsBalance(org.credits_balance || 0);
          }
        }
      }

      const { data: brand } = await supabase
        .from("brands")
        .select("last_crawled_at, domain")
        .eq("id", brandId)
        .single();
      
      setHasCrawledData(!!brand?.last_crawled_at);
      setBrandDomain(brand?.domain || "");
    }
    
    if (showAnalyzeDialog) {
      fetchData();
    }
  }, [showAnalyzeDialog, brandId]);

  // Fetch user tier on component mount (not just when dialog opens)
  useEffect(() => {
    async function fetchUserTier() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .single();
        
        if (profile?.organization_id) {
          const { data: org } = await supabase
            .from("organizations")
            .select("tier, credits_balance")
            .eq("id", profile.organization_id)
            .single();
          
          if (org) {
            setUserTier(org.tier as BillingTier);
            setCreditsBalance(org.credits_balance || 0);
          }
        }
      }
    }
    fetchUserTier();
  }, []);

  const tierLimits = TIER_LIMITS[userTier];
  const canUseWatchdog = tierLimits.hallucination_watchdog;
  const estimatedCredits = selectedEngines.length;
  const hasEnoughCredits = creditsBalance >= estimatedCredits;

  const toggleEngine = (engine: SupportedEngine) => {
    setSelectedEngines(prev => {
      if (prev.includes(engine)) {
        if (prev.length === 1) return prev;
        return prev.filter(e => e !== engine);
      }
      return [...prev, engine];
    });
  };

  const handleToggleWatchdog = async () => {
    if (!canUseWatchdog) return;
    
    if (!enableWatchdog && !hasCrawledData) {
      setIsCrawling(true);
      try {
        const response = await fetch("/api/brands/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand_id: brandId,
            start_url: `https://${brandDomain}`,
            max_pages: 20,
            max_depth: 2,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to start crawl");
        }

        toast.success("Website crawl started!", {
          description: "Scanning your website to build ground truth data.",
        });
        
        pollCrawlStatus();
      } catch {
        toast.error("Failed to start website crawl");
        setIsCrawling(false);
        return;
      }
    }
    
    setEnableWatchdog(!enableWatchdog);
  };

  const pollCrawlStatus = useCallback(async () => {
    const supabase = createClient();
    let finished = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const handleComplete = () => {
      if (finished) return;
      finished = true;
      setHasCrawledData(true);
      setIsCrawling(false);
      toast.success("Website crawl complete!");
      if (channel) {
        supabase.removeChannel(channel);
      }
    };

    const finalize = () => {
      if (finished) return;
      finished = true;
      setIsCrawling(false);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };

    const { data: brand } = await supabase
      .from("brands")
      .select("last_crawled_at")
      .eq("id", brandId)
      .single();

    if (brand?.last_crawled_at) {
      handleComplete();
      return;
    }

    channel = supabase
      .channel(`brand-crawl-${brandId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "brands", filter: `id=eq.${brandId}` },
        (payload) => {
          const updated = payload.new as { last_crawled_at?: string | null };
          if (updated?.last_crawled_at) {
            handleComplete();
          }
        }
      )
      .subscribe();

    setTimeout(finalize, 5 * 60 * 1000);
  }, [brandId]);

  const handleRunAnalysis = async (promptId: string) => {
    if (!hasEnoughCredits) {
      toast.error("Insufficient credits", {
        description: `You need ${estimatedCredits} credits but only have ${creditsBalance}.`,
      });
      return;
    }

    setIsAnalyzing(promptId);

    try {
      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          prompt_ids: [promptId],
          engines: selectedEngines,
          language,
          region,
          enable_hallucination_watchdog: canUseWatchdog && enableWatchdog,
          schedule: schedule !== "none" ? schedule : undefined,
          ensemble_run_count: ensembleRunCount,
          enable_variance_metrics: enableVarianceMetrics,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start analysis");
      }

      setRecentlyStartedIds(prev => Array.from(new Set([promptId, ...prev])));

      const watchdogMessage = enableWatchdog && canUseWatchdog && hasCrawledData
        ? " Hallucination detection enabled." 
        : "";
      
      const regionInfo = REGIONS.find(r => r.id === region);
      const regionMessage = region !== "global" ? ` Region: ${regionInfo?.flag} ${regionInfo?.name}.` : "";
      
      const scheduleMessage = schedule !== "none" 
        ? ` Scheduled to repeat ${SCHEDULE_OPTIONS.find(s => s.value === schedule)?.label.toLowerCase()}.` 
        : "";

      toast.success("Analysis started!", {
        description: `Running ${selectedEngines.length} simulations.${regionMessage}${watchdogMessage}${scheduleMessage}`,
      });

      setShowAnalyzeDialog(false);
      setSchedule("none");
      router.refresh();
    } catch (error) {
      console.error("Failed to start analysis:", error);
      toast.error("Failed to start analysis", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsAnalyzing(null);
    }
  };

  const handleDeletePrompt = async () => {
    if (!promptToDelete) return;
    
    setIsDeleting(true);
    try {
      const supabase = createClient();
      
      // Delete simulations first (foreign key constraint)
      await supabase
        .from("simulations")
        .delete()
        .eq("prompt_id", promptToDelete.id);
      
      // Delete the prompt
      const { error } = await supabase
        .from("prompts")
        .delete()
        .eq("id", promptToDelete.id);
      
      if (error) throw error;
      
      toast.success("Prompt deleted", {
        description: "The prompt and its analysis history have been removed.",
      });
      
      setPromptToDelete(null);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete prompt:", error);
      toast.error("Failed to delete prompt", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const openAnalyzeDialog = (promptId: string) => {
    setSelectedPromptId(promptId);
    setShowAnalyzeDialog(true);
  };

  const allRunningIds = useMemo(() => 
    new Set([...runningPromptIds, ...recentlyStartedIds.filter(id => runningPromptIds.includes(id))]),
    [runningPromptIds, recentlyStartedIds]
  );

  useEffect(() => {
    if (runningPromptIds.length === 0 && recentlyStartedIds.length > 0) {
      const timeout = setTimeout(() => {
        setRecentlyStartedIds([]);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [runningPromptIds, recentlyStartedIds]);

  if (prompts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-4">
          <Search className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No prompts yet</h3>
        <p className="text-muted-foreground max-w-sm mx-auto mb-6">
          Add prompts to track how AI engines respond to questions about your brand.
        </p>
        
        <div className="max-w-lg mx-auto">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Try prompts like</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              "best [product category] 2025",
              "top alternatives to [competitor]",
              "[industry] software comparison",
              "how to choose [product type]",
            ].map((example, i) => (
              <span 
                key={i}
                className="px-3 py-1.5 text-sm rounded-full bg-muted/50 text-muted-foreground border border-border"
              >
                {example}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sortedPrompts.map((prompt, index) => {
        const visibility = prompt.total_sims > 0 
          ? Math.round((prompt.visible_sims / prompt.total_sims) * 100) 
          : null;
        
        const isRunning = allRunningIds.has(prompt.id) || recentlyStartedIds.includes(prompt.id);
        const wasJustStarted = recentlyStartedIds.includes(prompt.id) && index === 0;
        const hasJustRan = justRanIds.has(prompt.id) && !isRunning;
        
        const getVisibilityColor = (v: number | null) => {
          if (isRunning) return "bg-primary/10 text-primary";
          if (v === null) return "bg-muted text-muted-foreground";
          if (v >= 70) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
          if (v >= 40) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
          return "bg-red-500/10 text-red-600 dark:text-red-400";
        };

        const getVisibilityIcon = (v: number | null) => {
          if (isRunning) return <Loader2 className="w-4 h-4 animate-spin" />;
          if (v === null) return <Clock className="w-4 h-4" />;
          if (v >= 70) return <TrendingUp className="w-4 h-4" />;
          if (v >= 40) return <Minus className="w-4 h-4" />;
          return <TrendingDown className="w-4 h-4" />;
        };

        const hasAnalysis = prompt.total_sims > 0;

        return (
          <div
            key={prompt.id}
            className={`group relative transition-all duration-300 ${hasJustRan ? 'ring-2 ring-emerald-500/30 ring-offset-2 ring-offset-background rounded-xl' : ''}`}
          >
            {wasJustStarted && (
              <div className="absolute -top-2 left-4 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium shadow-sm">
                <ArrowUp className="w-3 h-3" />
                Running
              </div>
            )}
            
            {hasJustRan && !wasJustStarted && (
              <div className="absolute -top-2 left-4 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-medium shadow-sm">
                <CheckCircle className="w-3 h-3" />
                Just Ran
              </div>
            )}
            
            <div className={`flex items-center gap-4 p-4 rounded-xl border bg-card transition-all ${
              isRunning
                ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                : hasJustRan
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : hasAnalysis 
                    ? "hover:border-primary/40 hover:bg-primary/5 cursor-pointer hover:shadow-md" 
                    : "border-border"
            }`}>
              {/* Visibility Badge */}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold min-w-[80px] justify-center ${getVisibilityColor(visibility)}`}>
                {getVisibilityIcon(visibility)}
                {isRunning ? "Running" : visibility !== null ? `${visibility}%` : "New"}
              </div>
              
              {/* Prompt Text - Clickable if has analysis */}
              <Link 
                href={hasAnalysis && !isRunning ? `/brands/${brandId}/prompts/${prompt.id}` : "#"}
                className={`flex-1 min-w-0 ${hasAnalysis && !isRunning ? "" : "pointer-events-none"}`}
                onClick={(e) => {
                  if (!hasAnalysis || isRunning) {
                    e.preventDefault();
                  }
                }}
              >
                <p className="font-medium text-foreground leading-snug truncate pr-32">
                  {prompt.text}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {prompt.set_name && (
                    <span className="px-2 py-0.5 rounded-full bg-muted border border-border">
                      {prompt.set_name}
                    </span>
                  )}
                  {isRunning ? (
                    <span className="flex items-center gap-1 text-primary">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Analysis in progress...
                    </span>
                  ) : (
                    <>
                      {prompt.total_sims > 0 && (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {prompt.visible_sims}/{prompt.total_sims} visible
                        </span>
                      )}
                      {prompt.last_checked_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(prompt.last_checked_at).toLocaleDateString()}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </Link>

              {/* Actions */}
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {hasAnalysis && !isRunning && (
                  <Link href={`/brands/${brandId}/prompts/${prompt.id}`}>
                    <Button size="sm" variant="secondary" className="gap-1.5 h-8 shadow-sm">
                      <BarChart3 className="w-3.5 h-3.5" />
                      View
                    </Button>
                  </Link>
                )}
                {isRunning ? (
                  <Button size="sm" variant="secondary" className="gap-1.5 h-8 shadow-sm" disabled>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Analyzing...
                  </Button>
                ) : (
                  <Button 
                    size="sm" 
                    className="gap-1.5 h-8 shadow-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openAnalyzeDialog(prompt.id);
                    }}
                    disabled={isAnalyzing === prompt.id}
                  >
                    {isAnalyzing === prompt.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    {hasAnalysis ? "Re-run" : "Analyze"}
                  </Button>
                )}
                
                {/* More Options Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {hasAnalysis && (
                      <>
                        <DropdownMenuItem onClick={() => window.open(`/brands/${brandId}/prompts/${prompt.id}`, '_blank')}>
                          <BarChart3 className="w-4 h-4 mr-2" />
                          View Results
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem 
                      onClick={() => setPromptToDelete(prompt)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Prompt
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Chevron for clickable cards */}
              {hasAnalysis && !isRunning && (
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
              )}
            </div>
          </div>
        );
      })}

      {/* Analyze Dialog */}
      <Dialog open={showAnalyzeDialog} onOpenChange={setShowAnalyzeDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Run AI Analysis</DialogTitle>
            <DialogDescription>
              Check how AI engines respond to this prompt
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Prompt Preview */}
            {selectedPromptId && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-sm font-medium">
                  {prompts.find(p => p.id === selectedPromptId)?.text}
                </p>
              </div>
            )}

            {/* Engine Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">AI Engines</Label>
              <div className="grid grid-cols-2 gap-2">
                {engines.map((engine) => {
                  const isSelected = selectedEngines.includes(engine.id);
                  return (
                    <button
                      key={engine.id}
                      onClick={() => toggleEngine(engine.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all text-left text-sm ${
                        isSelected
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${isSelected ? "bg-primary/10" : "bg-muted"}`}>
                        {engine.icon}
                      </div>
                      <span className="font-medium">{engine.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Language</Label>
              <RadioGroup 
                value={language} 
                onValueChange={(v) => setLanguage(v as "en" | "ar")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="en" id="dialog-en" />
                  <Label htmlFor="dialog-en" className="cursor-pointer text-sm">English</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ar" id="dialog-ar" />
                  <Label htmlFor="dialog-ar" className="cursor-pointer text-sm">العربية</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Region Selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Search Region</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                AI search results will be localized to this region
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-[140px] overflow-y-auto p-1 rounded-lg border border-border bg-muted/30">
                {REGIONS.map((r) => {
                  const isSelected = region === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRegion(r.id)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-left text-xs transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 font-medium"
                          : "border-transparent hover:border-muted-foreground/30 hover:bg-muted/50"
                      }`}
                    >
                      <span>{r.flag}</span>
                      <span className="truncate">{r.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schedule Selection - NEW */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Run Schedule</Label>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">NEW</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Automatically re-run this analysis on a schedule
              </p>
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select schedule" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        {option.value !== "none" && <Calendar className="w-3.5 h-3.5" />}
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Advanced Options - Ensemble Frequency */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <BarChart3 className="w-4 h-4" />
                Advanced Options
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`} />
              </button>
              
              {showAdvancedOptions && (
                <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                  {/* Ensemble Frequency */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-medium">Ensemble Simulations</Label>
                        <p className="text-[10px] text-muted-foreground">
                          Multiple runs improve accuracy
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {ensembleRunCount} runs
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={ensembleRunCount}
                        onChange={(e) => setEnsembleRunCount(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <div className="flex gap-1 text-[10px] text-muted-foreground">
                        <span>1</span>
                        <span>—</span>
                        <span>10</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {ensembleRunCount === 1 && "Single run - fastest"}
                      {ensembleRunCount >= 2 && ensembleRunCount <= 3 && "Standard - good balance"}
                      {ensembleRunCount >= 4 && ensembleRunCount <= 6 && "High accuracy"}
                      {ensembleRunCount >= 7 && "Maximum accuracy"}
                    </p>
                  </div>

                  {/* Enable Variance Metrics */}
                  {ensembleRunCount >= 3 && (
                    <button
                      type="button"
                      onClick={() => setEnableVarianceMetrics(!enableVarianceMetrics)}
                      className={`w-full flex items-center gap-3 p-2 rounded-md border transition-all text-left ${
                        enableVarianceMetrics
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className={`p-1.5 rounded-md ${enableVarianceMetrics ? "bg-primary/20" : "bg-muted"}`}>
                        <BarChart3 className={`w-3.5 h-3.5 ${enableVarianceMetrics ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">Statistical Significance</p>
                        <p className="text-[10px] text-muted-foreground">
                          Show confidence intervals & p-values
                        </p>
                      </div>
                      <div className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
                        enableVarianceMetrics ? "bg-primary" : "bg-muted"
                      }`}>
                        <div className={`w-3 h-3 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${
                          enableVarianceMetrics ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                        }`} />
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Hallucination Watchdog Toggle */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">AI Hallucination Detection</Label>
                <span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5" />
                  PRO
                </span>
              </div>
              
              {canUseWatchdog ? (
                <button
                  onClick={handleToggleWatchdog}
                  disabled={isCrawling}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                    enableWatchdog
                      ? "border-amber-500 bg-gradient-to-br from-amber-500/10 to-orange-500/10"
                      : "border-border hover:border-amber-500/50"
                  } ${isCrawling ? "opacity-70" : ""}`}
                >
                  <div className={`p-2 rounded-lg ${
                    enableWatchdog
                      ? "bg-gradient-to-br from-amber-500/30 to-orange-500/30" 
                      : "bg-muted"
                  }`}>
                    {isCrawling ? (
                      <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                    ) : (
                      <ShieldAlert className={`w-4 h-4 ${enableWatchdog ? "text-amber-500" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">Detect AI Hallucinations</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {isCrawling 
                        ? "Scanning website..."
                        : hasCrawledData
                          ? "Find when AI lies about your brand"
                          : "We'll scan your website first"
                      }
                    </p>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                    enableWatchdog ? "bg-amber-500" : "bg-muted"
                  }`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${
                      enableWatchdog ? "translate-x-5 ml-0.5" : "translate-x-0.5"
                    }`} />
                  </div>
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-amber-500/30 bg-amber-500/5">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Lock className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-amber-600 dark:text-amber-400">Upgrade to Pro</p>
                    <p className="text-xs text-muted-foreground">Detect AI lies about your brand</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-amber-500 text-amber-600 hover:bg-amber-500/10 h-7 text-xs"
                    onClick={() => router.push("/billing")}
                  >
                    Upgrade
                  </Button>
                </div>
              )}
            </div>

            {/* Disclaimer - Only shown here */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-amber-700 dark:text-amber-300 mb-0.5">Results may vary</p>
                <p>AI responses change between queries. Use as directional guidance.</p>
              </div>
            </div>

            {/* Credits Summary */}
            <div className="rounded-lg bg-gradient-to-br from-muted/50 to-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between p-2 rounded-md bg-background/50 border border-border">
                <div className="flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium">Your Credits</span>
                </div>
                <span className={`text-sm font-bold ${hasEnoughCredits ? "text-green-500" : "text-red-500"}`}>
                  {creditsBalance.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Credit Cost</span>
                <span className={`font-bold ${hasEnoughCredits ? "text-primary" : "text-red-500"}`}>
                  {estimatedCredits} credits
                </span>
              </div>

              {enableWatchdog && canUseWatchdog && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    Hallucination Detection
                  </span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">Enabled</span>
                </div>
              )}

              {!hasEnoughCredits && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">Insufficient credits</p>
                    <button 
                      onClick={() => router.push("/billing")}
                      className="text-xs text-primary hover:underline"
                    >
                      Upgrade plan
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAnalyzeDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedPromptId && handleRunAnalysis(selectedPromptId)} 
              disabled={isAnalyzing !== null || !hasEnoughCredits}
              className="gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Analysis
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!promptToDelete} onOpenChange={(open) => !open && setPromptToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Delete Prompt?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this prompt and all its analysis history.
              <br /><br />
              <span className="font-medium text-foreground">
                &ldquo;{promptToDelete?.text}&rdquo;
              </span>
              {promptToDelete?.total_sims ? (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  This will delete {promptToDelete.total_sims} simulation{promptToDelete.total_sims > 1 ? 's' : ''}.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePrompt}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Prompt"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
