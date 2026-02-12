"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCached, setCache } from "@/lib/client-cache";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Calendar,
  Play,
  Settings,
  RefreshCw,
  Zap,
  Coins,
  Globe,
  ShieldAlert,
  Lock,
  Crown,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SupportedEngine, SupportedRegion, REGIONS, BillingTier, TIER_LIMITS } from "@/types";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import { ActivityPageSkeleton } from "@/components/loading/dashboard-skeleton";
import { AnalysisProgress } from "@/components/brands/analysis-progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AnalysisBatch {
  id: string;
  status: string;
  engines: SupportedEngine[];
  region: SupportedRegion;
  total_simulations: number;
  completed_simulations: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  prompt_id?: string | null;
  // Additional details for activity display
  prompt_text?: string;
  visible_count?: number;
  not_visible_count?: number;
}

interface ScheduledAnalysis {
  id: string;
  is_active: boolean;
  frequency: string;
  next_run_at: string;
  run_count: number;
}

type ScheduleFrequency = "1x_daily" | "3x_daily" | "6x_daily" | "daily" | "weekly" | "biweekly" | "monthly";

interface AnalysisConfig {
  enabled: boolean;
  frequency: ScheduleFrequency;
  engines: SupportedEngine[];
  regions: SupportedRegion[];
}

interface RunAnalysisSettings {
  engines: SupportedEngine[];
  regions: SupportedRegion[];
  selectedPromptId: string | null;
  language: "en" | "ar";
  enableWatchdog: boolean;
}

const engineIcons: Record<SupportedEngine, React.ReactNode> = {
  chatgpt: <ChatGPTIcon className="w-3.5 h-3.5" />,
  perplexity: <PerplexityIcon className="w-3.5 h-3.5" />,
  gemini: <GeminiIcon className="w-3.5 h-3.5" />,
  grok: <GrokIcon className="w-3.5 h-3.5" />,
};

const engineNames: Record<SupportedEngine, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
};

function getRegionInfo(region: SupportedRegion) {
  return REGIONS.find((r) => r.id === region) || REGIONS[0];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatRelativeTime(date: string) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

// Credit cost per prompt per engine (1 credit each)
const CREDIT_PER_ANALYSIS = 1;

export default function ActivityPage() {
  const params = useParams();
  const router = useRouter();
  const brandId = params.brandId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [batches, setBatches] = useState<AnalysisBatch[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [schedules, setSchedules] = useState<ScheduledAnalysis[]>([]);
  const [autoAnalysisEnabled, setAutoAnalysisEnabled] = useState(false);
  const [promptCount, setPromptCount] = useState(0);
  const [prompts, setPrompts] = useState<{ id: string; text: string }[]>([]);
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  
  // Configure dialog state
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<AnalysisConfig>({
    enabled: false,
    frequency: "3x_daily",
    engines: ["chatgpt", "perplexity", "gemini", "grok"],
    regions: ["ae"],
  });
  
  // Run Analysis dialog state
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [runSettings, setRunSettings] = useState<RunAnalysisSettings>({
    engines: ["chatgpt", "perplexity", "gemini", "grok"],
    regions: ["ae"],
    selectedPromptId: null,
    language: "en",
    enableWatchdog: false,
  });
  const [userTier, setUserTier] = useState<BillingTier>("free");
  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const [hasCrawledData, setHasCrawledData] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [brandDomain, setBrandDomain] = useState<string>("");

  useEffect(() => {
    const cached = getCached<{
      batches: AnalysisBatch[];
      prompts: { id: string; text: string }[];
      promptCount: number;
      autoAnalysisEnabled: boolean;
    }>(`activity-${brandId}`);

    if (cached) {
      setBatches(cached.batches);
      setPrompts(cached.prompts);
      setPromptCount(cached.promptCount);
      setAutoAnalysisEnabled(cached.autoAnalysisEnabled);
      setIsLoading(false);
      hasLoadedOnceRef.current = true;
      fetchActivity({ silent: true, background: true });
    } else {
      fetchActivity({ silent: false });
    }
    fetchUserData();
    
    // Set up real-time subscription for analysis batches
    const supabase = createClient();
    const batchesChannel = supabase
      .channel(`activity-batches-${brandId}`)
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: "analysis_batches", 
          filter: `brand_id=eq.${brandId}` 
        },
        (payload) => {
          // Avoid disruptive full-screen loading spinners during realtime updates.
          // Throttle refreshes because analysis batches can update frequently.
          const status = (payload.new as { status?: string } | null)?.status;
          const shouldRefresh =
            payload.eventType === "INSERT" ||
            payload.eventType === "UPDATE" ||
            payload.eventType === "DELETE" ||
            status === "completed" ||
            status === "failed";

          if (!shouldRefresh) return;

          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = setTimeout(() => {
            fetchActivity({ silent: true });
            if (status === "completed" || status === "failed") fetchUserData();
          }, 350);
        }
      )
      .subscribe();
    
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(batchesChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  // Fetch user tier and credits
  async function fetchUserData() {
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
          const tier = org.tier as BillingTier;
          setUserTier(tier);
          setCreditsBalance(org.credits_balance || 0);
          // Auto-enable hallucination detection for pro accounts
          if (TIER_LIMITS[tier].hallucination_watchdog) {
            setRunSettings(prev => ({ ...prev, enableWatchdog: true }));
          }
        }
      }
    }

    // Fetch brand crawl data
    const { data: brand } = await supabase
      .from("brands")
      .select("last_crawled_at, domain")
      .eq("id", brandId)
      .single();
    
    setHasCrawledData(!!brand?.last_crawled_at);
    setBrandDomain(brand?.domain || "");
  }

  async function fetchActivity(opts?: { silent?: boolean; background?: boolean }) {
    const silent = Boolean(opts?.silent);
    const background = Boolean(opts?.background);
    if (!background) {
      if (!hasLoadedOnceRef.current && !silent) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
    }
    const supabase = createClient();

    // Fetch all data in parallel
    const [batchResult, scheduleResult, promptsResult] = await Promise.all([
      supabase
        .from("analysis_batches")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("scheduled_analyses")
        .select("*")
        .eq("brand_id", brandId),
      supabase
        .from("prompts")
        .select("id, text")
        .eq("brand_id", brandId)
        .eq("is_active", true),
    ]);

    let finalBatches: AnalysisBatch[] = [];
    if (batchResult.data && batchResult.data.length > 0) {
      // Fetch visibility data for completed batches
      const batchIds = batchResult.data.map(b => b.id);
      const { data: simulations } = await supabase
        .from("simulations")
        .select("analysis_batch_id, is_visible, prompt_text, prompt_id")
        .in("analysis_batch_id", batchIds);
      
      // Group simulations by batch and calculate visibility
      const batchSimData: Record<string, { visible: number; notVisible: number; promptText: string | null; promptId: string | null }> = {};
      if (simulations) {
        for (const sim of simulations) {
          if (!batchSimData[sim.analysis_batch_id]) {
            batchSimData[sim.analysis_batch_id] = { visible: 0, notVisible: 0, promptText: null, promptId: null };
          }
          if (sim.is_visible === true) {
            batchSimData[sim.analysis_batch_id].visible++;
          } else if (sim.is_visible === false) {
            batchSimData[sim.analysis_batch_id].notVisible++;
          }
          if (!batchSimData[sim.analysis_batch_id].promptText && sim.prompt_text) {
            batchSimData[sim.analysis_batch_id].promptText = sim.prompt_text;
          }
          if (!batchSimData[sim.analysis_batch_id].promptId && sim.prompt_id) {
            batchSimData[sim.analysis_batch_id].promptId = sim.prompt_id;
          }
        }
      }
      
      // Enrich batches with visibility data
      const enrichedBatches = batchResult.data.map(batch => ({
        ...batch,
        visible_count: batchSimData[batch.id]?.visible || 0,
        not_visible_count: batchSimData[batch.id]?.notVisible || 0,
        prompt_text: batchSimData[batch.id]?.promptText || undefined,
        prompt_id: batch.prompt_id || batchSimData[batch.id]?.promptId || undefined,
      }));
      
      finalBatches = enrichedBatches;
      setBatches(enrichedBatches);
    } else {
      setBatches([]);
    }

    // Set prompts and count for credit calculations
    if (promptsResult.data) {
      setPrompts(promptsResult.data);
      setPromptCount(promptsResult.data.length);
      // Default to first prompt if available
      if (promptsResult.data.length > 0 && !runSettings.selectedPromptId) {
        setRunSettings(prev => ({ ...prev, selectedPromptId: promptsResult.data[0].id }));
      }
    }

    // Handle scheduled analyses - properly sync state
    if (scheduleResult.data && scheduleResult.data.length > 0) {
      setSchedules(scheduleResult.data);
      const activeSchedule = scheduleResult.data.find(s => s.is_active);
      const isEnabled = !!activeSchedule;
      setAutoAnalysisEnabled(isEnabled);
      setConfig(prev => ({
        ...prev,
        enabled: isEnabled,
        frequency: activeSchedule?.frequency || "daily",
      }));
    } else {
      setAutoAnalysisEnabled(false);
      setConfig(prev => ({ ...prev, enabled: false }));
    }

    // Save to client-side cache
    setCache(`activity-${brandId}`, {
      batches: finalBatches,
      prompts: promptsResult.data || [],
      promptCount: promptsResult.data?.length || 0,
      autoAnalysisEnabled: !!scheduleResult.data?.some(s => s.is_active),
    });

    setIsLoading(false);
    setIsRefreshing(false);
    hasLoadedOnceRef.current = true;
  }


  // Run analysis now (called from dialog) - runs ONE prompt at a time to avoid rate limits
  async function handleRunAnalysis() {
    if (promptCount === 0) {
      toast.error("No prompts to analyze", {
        description: "Add prompts first before running an analysis.",
      });
      return;
    }

    if (!runSettings.selectedPromptId) {
      toast.error("Select a prompt to analyze");
      return;
    }

    if (runSettings.engines.length === 0) {
      toast.error("Select at least one engine");
      return;
    }

    if (runSettings.regions.length === 0) {
      toast.error("Select at least one region");
      return;
    }

    if (!hasEnoughCredits) {
      toast.error("Insufficient credits", {
        description: `You need ${estimatedCredits} credits but only have ${creditsBalance}.`,
      });
      return;
    }

    setIsRunningAnalysis(true);
    setIsRunDialogOpen(false);
    
    try {
      // Run only the selected prompt (1 prompt × N engines × N regions)
      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          prompt_ids: [runSettings.selectedPromptId],
          engines: runSettings.engines,
          language: runSettings.language,
          region: runSettings.regions[0], // Primary region
          enable_hallucination_watchdog: canUseWatchdog && runSettings.enableWatchdog,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || "Failed to start analysis");
      }

      const selectedPrompt = prompts.find(p => p.id === runSettings.selectedPromptId);
      const watchdogMessage = runSettings.enableWatchdog && canUseWatchdog && hasCrawledData
        ? " Hallucination Watchdog enabled." 
        : "";
      const regionMessage = runSettings.regions.length > 1 
        ? ` Analyzing ${runSettings.regions.length} regions.`
        : "";

      toast.success("Analysis started!", {
        description: `Analyzing "${selectedPrompt?.text.slice(0, 40)}..." across ${runSettings.engines.length} engine${runSettings.engines.length !== 1 ? "s" : ""}.${regionMessage}${watchdogMessage}`,
      });
      
      // Refresh the activity list and user data
      fetchActivity();
      fetchUserData();
    } catch (error) {
      console.error("Failed to run analysis:", error);
      toast.error("Failed to start analysis", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsRunningAnalysis(false);
    }
  }

  // Toggle engine for run settings
  function toggleRunEngine(engine: SupportedEngine) {
    setRunSettings(prev => {
      const engines = prev.engines.includes(engine)
        ? prev.engines.filter(e => e !== engine)
        : [...prev.engines, engine];
      return { ...prev, engines: engines.length > 0 ? engines : [engine] };
    });
  }

  // Toggle region for run settings
  function toggleRunRegion(region: SupportedRegion) {
    setRunSettings(prev => {
      const regions = prev.regions.includes(region)
        ? prev.regions.filter(r => r !== region)
        : [...prev.regions, region];
      return { ...prev, regions: regions.length > 0 ? regions : [region] };
    });
  }

  // Select all engines
  function handleSelectAllEngines() {
    const allEngines: SupportedEngine[] = ["chatgpt", "perplexity", "gemini", "grok"];
    if (runSettings.engines.length === allEngines.length) {
      setRunSettings(prev => ({ ...prev, engines: ["chatgpt"] }));
    } else {
      setRunSettings(prev => ({ ...prev, engines: allEngines }));
    }
  }

  // Toggle watchdog - kept for potential future use with toggle option
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleToggleWatchdog() {
    const tierLimits = TIER_LIMITS[userTier];
    if (!tierLimits.hallucination_watchdog) return;
    
    if (!runSettings.enableWatchdog && !hasCrawledData) {
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
        toast.success("Website crawl started!");
        setHasCrawledData(true);
      } catch {
        toast.error("Failed to start website crawl");
        setIsCrawling(false);
        return;
      } finally {
        setIsCrawling(false);
      }
    }
    
    setRunSettings(prev => ({ ...prev, enableWatchdog: !prev.enableWatchdog }));
  }

  // Calculate run credits (1 prompt × engines × regions)
  function calculateRunCredits(): number {
    return 1 * runSettings.engines.length * runSettings.regions.length * CREDIT_PER_ANALYSIS;
  }

  // Check if user has enough credits
  const estimatedCredits = calculateRunCredits();
  const hasEnoughCredits = creditsBalance >= estimatedCredits;
  const tierLimits = TIER_LIMITS[userTier];
  const canUseWatchdog = tierLimits.hallucination_watchdog;

  async function handleSaveConfig() {
    setIsSaving(true);
    const supabase = createClient();

    try {
      // Handle scheduled analysis
      if (config.enabled) {
        // Get first prompt set or prompt for the schedule
        const { data: promptSets } = await supabase
          .from("prompt_sets")
          .select("id")
          .eq("brand_id", brandId)
          .limit(1);
        
        const { data: prompts } = await supabase
          .from("prompts")
          .select("id")
          .eq("brand_id", brandId)
          .limit(1);

        const promptSetId = promptSets?.[0]?.id || null;
        const promptId = !promptSetId && prompts?.[0]?.id ? prompts[0].id : null;

        if (!promptSetId && !promptId) {
          toast.error("Cannot enable auto-analysis without prompts");
          setIsSaving(false);
          return;
        }

        // Map UI frequency to database enum
        // The schedule enum supports: daily, weekly, biweekly, monthly, 1x_daily, 3x_daily, 6x_daily
        const dbFrequency = config.frequency;

        // Check if schedule exists
        if (schedules.length > 0) {
          // Update existing schedule
          const { error } = await supabase
            .from("scheduled_analyses")
            .update({
              is_active: true,
              frequency: dbFrequency,
              engines: config.engines,
              region: config.regions[0] || "ae",
            })
            .eq("brand_id", brandId);
          
          if (error) {
            console.error("Failed to update schedule:", error);
            toast.error("Failed to update schedule");
          }
        } else {
          // Create new schedule
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            // Calculate next run time (tomorrow)
            const nextRunAt = new Date();
            nextRunAt.setDate(nextRunAt.getDate() + 1);
            nextRunAt.setHours(8, 0, 0, 0); // 8:00 AM

            const { error } = await supabase.from("scheduled_analyses").insert({
              brand_id: brandId,
              prompt_set_id: promptSetId,
              prompt_id: promptId,
              is_active: true,
              frequency: dbFrequency,
              engines: config.engines,
              language: "en",
              region: config.regions[0] || "ae",
              next_run_at: nextRunAt.toISOString(),
              created_by: user.id,
            });
            
            if (error) {
              console.error("Failed to create schedule:", error);
              toast.error("Failed to create schedule");
            }
          }
        }
        toast.success("Auto-analysis enabled");
      } else {
        // Deactivate all schedules
        await supabase
          .from("scheduled_analyses")
          .update({ is_active: false })
          .eq("brand_id", brandId);
        toast.success("Auto-analysis disabled");
      }

      setAutoAnalysisEnabled(config.enabled);
      setIsConfigureOpen(false);
      fetchActivity();
    } catch (error) {
      console.error("Failed to save config:", error);
      toast.error("Failed to save configuration");
    }

    setIsSaving(false);
  }

  function toggleEngine(engine: SupportedEngine) {
    setConfig(prev => {
      const engines = prev.engines.includes(engine)
        ? prev.engines.filter(e => e !== engine)
        : [...prev.engines, engine];
      return { ...prev, engines: engines.length > 0 ? engines : [engine] };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const runningBatches = batches.filter(b => b.status === "processing" || b.status === "queued");
  const completedBatches = batches.filter(b => b.status === "completed" || b.status === "failed");

  if (isLoading) {
    return <ActivityPageSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Activity</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Analysis history and scheduled runs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => fetchActivity({ silent: true })}
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {isRefreshing ? "Updating…" : "Refresh"}
          </Button>
          <Button 
            size="sm" 
            className="gap-2"
            onClick={() => setIsRunDialogOpen(true)}
            disabled={isRunningAnalysis || promptCount === 0}
          >
            {isRunningAnalysis ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Analysis
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Auto-Analysis Status */}
      <div className="enterprise-card">
        <div className="enterprise-card-body">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-3 rounded-lg",
                autoAnalysisEnabled ? "bg-success/10" : "bg-muted"
              )}>
                <Clock className={cn(
                  "w-5 h-5",
                  autoAnalysisEnabled ? "text-success" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Automatic Analysis</h3>
                  <Badge variant={autoAnalysisEnabled ? "default" : "secondary"}>
                    {autoAnalysisEnabled ? "Active" : "Paused"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {autoAnalysisEnabled 
                    ? "Running 3 times daily at 8:00, 14:00, and 20:00 UTC"
                    : "Enable to automatically track visibility throughout the day"
                  }
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setIsConfigureOpen(true)}
            >
              <Settings className="w-4 h-4" />
              Configure
            </Button>
          </div>
        </div>
        
        {/* Analysis Running - Nested under Automatic Analysis */}
        <AnalysisProgress brandId={brandId} />
      </div>

      {/* Recent Activity */}
      <div className="enterprise-card">
        <div className="enterprise-card-header">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold">Recent Activity</h3>
          </div>
        </div>
        
        {completedBatches.length === 0 ? (
          <div className="empty-state py-12">
            <Activity className="empty-state-icon" />
            <h3 className="empty-state-title">No activity yet</h3>
            <p className="empty-state-description">
              Run your first analysis to see activity here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {completedBatches.map((batch) => {
              const regionInfo = getRegionInfo(batch.region);
              const isSuccess = batch.status === "completed";
              const totalChecked = (batch.visible_count || 0) + (batch.not_visible_count || 0);
              const visibilityPct = totalChecked > 0 
                ? Math.round(((batch.visible_count || 0) / totalChecked) * 100) 
                : 0;
              const enginesList = batch.engines.map(e => engineNames[e]).join(", ");
              const timestamp = batch.completed_at || batch.created_at;

              return (
                <button
                  key={batch.id}
                  className="w-full p-4 hover:bg-muted/30 transition-colors text-left"
                  onClick={() => {
                    // Redirect to prompt analysis if prompt_id available, otherwise to analytics
                    if (batch.prompt_id) {
                      router.push(`/brands/${brandId}/prompts/${batch.prompt_id}`);
                    } else {
                      router.push(`/brands/${brandId}/analytics`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={cn(
                        "p-2 rounded-lg mt-0.5",
                        isSuccess ? "bg-success/10" : "bg-destructive/10"
                      )}>
                        {isSuccess ? (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {/* Prompt text if available */}
                        {batch.prompt_text && (
                          <p className="font-medium text-sm truncate mb-1" title={batch.prompt_text}>
                            &ldquo;{batch.prompt_text}&rdquo;
                          </p>
                        )}
                        
                        {/* Result summary */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          {isSuccess ? (
                            <span className={cn(
                              "font-medium",
                              visibilityPct >= 50 ? "text-success" : visibilityPct > 0 ? "text-warning" : "text-destructive"
                            )}>
                              {visibilityPct}% visible
                            </span>
                          ) : (
                            <span className="font-medium text-destructive">
                              Analysis failed
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            {batch.visible_count || 0}/{totalChecked} engines
                          </span>
                        </div>
                        
                        {/* Meta details */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mt-1.5">
                          <span>{enginesList}</span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            {regionInfo.flag} {regionInfo.name}
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(timestamp).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-2" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Configure Dialog */}
      <Dialog open={isConfigureOpen} onOpenChange={setIsConfigureOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Automatic Analysis</DialogTitle>
            <DialogDescription>
              Set up automated visibility tracking for your brand
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Enable/Disable Switch */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Enable Automatic Analysis</Label>
                <p className="text-sm text-muted-foreground">
                  Run analyses automatically on a schedule
                </p>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
              />
            </div>

            {config.enabled && (
              <>
                {/* Frequency Selection */}
                <div className="space-y-2">
                  <Label>Analysis Frequency</Label>
                  <Select 
                    value={config.frequency} 
                    onValueChange={(value) => setConfig(prev => ({ ...prev, frequency: value as ScheduleFrequency }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1x_daily">Once daily (8:00 UTC)</SelectItem>
                      <SelectItem value="3x_daily">3 times daily (8:00, 14:00, 20:00 UTC)</SelectItem>
                      <SelectItem value="6x_daily">6 times daily (every 4 hours)</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Engine Selection */}
                <div className="space-y-3">
                  <Label>AI Engines</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["chatgpt", "perplexity", "gemini", "grok"] as SupportedEngine[]).map((engine) => (
                      <button
                        key={engine}
                        type="button"
                        onClick={() => toggleEngine(engine)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                          config.engines.includes(engine)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        )}
                      >
                        <div className={cn(
                          "p-1.5 rounded",
                          config.engines.includes(engine) ? "bg-primary/10" : "bg-muted"
                        )}>
                          {engineIcons[engine]}
                        </div>
                        <span className="font-medium text-sm">{engineNames[engine]}</span>
                        {config.engines.includes(engine) && (
                          <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Region Selection */}
                <div className="space-y-2">
                  <Label>Primary Region</Label>
                  <Select 
                    value={config.regions[0] || "ae"} 
                    onValueChange={(value) => setConfig(prev => ({ ...prev, regions: [value as SupportedRegion] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((region) => (
                        <SelectItem key={region.id} value={region.id}>
                          <span className="flex items-center gap-2">
                            <span>{region.flag}</span>
                            <span>{region.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Summary with Credit Costs */}
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-primary mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">Analysis Summary</p>
                      <p className="text-muted-foreground mt-1">
                        {config.frequency === "1x_daily" ? "1 analysis/day" : 
                         config.frequency === "3x_daily" ? "3 analyses/day" :
                         config.frequency === "6x_daily" ? "6 analyses/day" :
                         config.frequency === "daily" ? "1 analysis/day" : 
                         config.frequency === "weekly" ? "1 analysis/week" :
                         config.frequency === "biweekly" ? "1 analysis every 2 weeks" : "1 analysis/month"}
                        {" "}with {config.engines.length} engine{config.engines.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 pt-2 border-t border-border">
                    <Coins className="w-5 h-5 text-warning mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">Estimated Credit Usage</p>
                      <p className="text-muted-foreground mt-1">
                        ~{(() => {
                          const runsPerDay = config.frequency === "1x_daily" ? 1 :
                            config.frequency === "3x_daily" ? 3 :
                            config.frequency === "6x_daily" ? 6 :
                            config.frequency === "daily" ? 1 : 0;
                          const creditsPerRun = promptCount * config.engines.length;
                          return runsPerDay > 0 ? `${creditsPerRun * runsPerDay} credits/day` : `${creditsPerRun} credits/run`;
                        })()}
                        <span className="text-xs ml-1">
                          ({promptCount} prompt{promptCount !== 1 ? "s" : ""} × {config.engines.length} engine{config.engines.length !== 1 ? "s" : ""})
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigureOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Configuration"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Analysis Dialog - Full Featured */}
      <Dialog open={isRunDialogOpen} onOpenChange={setIsRunDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Run AI Visibility Analysis</DialogTitle>
            <DialogDescription>
              Check how your brand appears across AI search engines
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            {/* Prompt Selection */}
            <div className="space-y-2">
              <Label className="font-medium">Select Prompt</Label>
              <p className="text-xs text-muted-foreground">
                Analyses run one prompt at a time for reliability
              </p>
              <Select 
                value={runSettings.selectedPromptId || ""} 
                onValueChange={(value) => setRunSettings(prev => ({ ...prev, selectedPromptId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a prompt to analyze" />
                </SelectTrigger>
                <SelectContent>
                  {prompts.map((prompt) => (
                    <SelectItem key={prompt.id} value={prompt.id}>
                      <span className="truncate max-w-[350px] block">
                        {prompt.text.length > 60 ? `${prompt.text.slice(0, 60)}...` : prompt.text}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {prompts.length === 0 && (
                <p className="text-xs text-destructive">No active prompts available. Add prompts first.</p>
              )}
            </div>

            {/* Engine Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium">AI Engines</Label>
                <Button variant="ghost" size="sm" onClick={handleSelectAllEngines}>
                  {runSettings.engines.length === 4 ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["chatgpt", "perplexity", "gemini", "grok"] as SupportedEngine[]).map((engine) => (
                  <button
                    key={engine}
                    type="button"
                    onClick={() => toggleRunEngine(engine)}
                    className={cn(
                      "flex items-center gap-2.5 p-3 rounded-lg border transition-all text-left",
                      runSettings.engines.includes(engine)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    <div className={cn(
                      "p-1.5 rounded",
                      runSettings.engines.includes(engine) ? "bg-primary/10" : "bg-muted"
                    )}>
                      {engineIcons[engine]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{engineNames[engine]}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <Label className="font-medium">Language</Label>
              <RadioGroup 
                value={runSettings.language} 
                onValueChange={(v) => setRunSettings(prev => ({ ...prev, language: v as "en" | "ar" }))}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="en" id="run-en" />
                  <Label htmlFor="run-en" className="cursor-pointer text-sm">English</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ar" id="run-ar" />
                  <Label htmlFor="run-ar" className="cursor-pointer text-sm">العربية</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Multi-Region Selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <Label className="font-medium">Target Regions</Label>
                <span className="text-xs text-muted-foreground">
                  (Select multiple for comparison)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto p-1">
                {REGIONS.map((r) => {
                  const isSelected = runSettings.regions.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRunRegion(r.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1.5 rounded border text-left text-xs transition-all",
                        isSelected
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:border-muted-foreground/30"
                      )}
                    >
                      <span>{r.flag}</span>
                      <span className="truncate">{r.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hallucination Watchdog */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="font-medium">AI Hallucination Detection</Label>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 text-[10px] font-bold flex items-center gap-0.5">
                  <Crown className="w-2.5 h-2.5" />
                  PRO
                </span>
              </div>
              
              {canUseWatchdog ? (
                // Pro users - always enabled, shown as active state
                <div className="w-full flex items-center gap-3 p-3 rounded-lg border border-amber-500/50 bg-amber-500/5">
                  <div className="p-2 rounded bg-amber-500/10">
                    {isCrawling ? (
                      <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-600">Always Enabled</p>
                    <p className="text-xs text-muted-foreground">
                      {isCrawling 
                        ? "Scanning website for ground truth data..."
                        : "Automatically detects when AI makes false claims about your brand"
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Active</span>
                  </div>
                </div>
              ) : (
                // Non-pro users - locked with upgrade prompt
                <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30">
                  <div className="p-2 rounded bg-muted">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Pro Feature</p>
                    <p className="text-xs text-muted-foreground">
                      Detects when AI search engines make false claims about your brand&apos;s pricing, features, or availability
                    </p>
                  </div>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="bg-amber-500 hover:bg-amber-600 text-white"
                    onClick={() => router.push("/billing")}
                  >
                    <Crown className="w-3.5 h-3.5 mr-1.5" />
                    Upgrade
                  </Button>
                </div>
              )}
            </div>

            {/* Credits Summary */}
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded bg-background border border-border">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Your Credits</span>
                </div>
                <span className={cn(
                  "text-lg font-bold",
                  hasEnoughCredits ? "text-success" : "text-destructive"
                )}>
                  {creditsBalance.toLocaleString()}
                </span>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prompt × Engines × Regions</span>
                  <span className="font-medium">1 × {runSettings.engines.length} × {runSettings.regions.length}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-border">
                  <span className="font-medium">Total Cost</span>
                  <span className={cn(
                    "font-bold",
                    hasEnoughCredits ? "text-primary" : "text-destructive"
                  )}>
                    {estimatedCredits} credits
                  </span>
                </div>
              </div>

              {!hasEnoughCredits && (
                <div className="flex items-start gap-2 p-2.5 rounded bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Insufficient credits</p>
                    <p className="text-xs text-muted-foreground">
                      You need {estimatedCredits - creditsBalance} more credits.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRunDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRunAnalysis} 
              disabled={isRunningAnalysis || runSettings.engines.length === 0 || !runSettings.selectedPromptId || !hasEnoughCredits}
              className="gap-2"
            >
              {isRunningAnalysis ? (
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
    </div>
  );
}
