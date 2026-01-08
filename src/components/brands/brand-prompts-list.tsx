"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  Play, 
  Search, 
  Eye, 
  Loader2,
  Bot,
  Sparkles,
  Zap,
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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
  { id: "chatgpt", name: "ChatGPT", icon: <Bot className="w-4 h-4" /> },
  { id: "perplexity", name: "Perplexity", icon: <Search className="w-4 h-4" /> },
  { id: "gemini", name: "Gemini", icon: <Sparkles className="w-4 h-4" /> },
  { id: "grok", name: "Grok", icon: <Zap className="w-4 h-4" /> },
];

export function BrandPromptsList({ brandId, prompts }: BrandPromptsListProps) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [recentlyStartedIds, setRecentlyStartedIds] = useState<string[]>([]);
  const [runningPromptIds, setRunningPromptIds] = useState<string[]>([]);
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

  // Fetch running prompt IDs
  useEffect(() => {
    const supabase = createClient();
    
    const fetchRunning = async () => {
      // Get running batches
      const { data: batches } = await supabase
        .from("analysis_batches")
        .select("id, prompt_set_id")
        .eq("brand_id", brandId)
        .in("status", ["queued", "processing"]);

      if (!batches || batches.length === 0) {
        setRunningPromptIds([]);
        return;
      }

      const promptIds = new Set<string>();

      // Get simulations for running batches
      const batchIds = batches.map(b => b.id);
      const { data: sims } = await supabase
        .from("simulations")
        .select("prompt_id")
        .in("analysis_batch_id", batchIds);

      (sims || []).forEach(s => promptIds.add(s.prompt_id));

      // Get prompts from prompt sets
      for (const batch of batches) {
        if (batch.prompt_set_id) {
          const { data: setPrompts } = await supabase
            .from("prompts")
            .select("id")
            .eq("prompt_set_id", batch.prompt_set_id);
          (setPrompts || []).forEach(p => promptIds.add(p.id));
        }
      }

      setRunningPromptIds(Array.from(promptIds));
    };

    fetchRunning();
    const interval = setInterval(fetchRunning, 2000);
    return () => clearInterval(interval);
  }, [brandId]);

  // Sort prompts: running/recently started first, then by last_checked_at
  const sortedPrompts = useMemo(() => {
    const allRunningIds = new Set([...runningPromptIds, ...recentlyStartedIds]);
    
    return [...prompts].sort((a, b) => {
      const aIsRunning = allRunningIds.has(a.id);
      const bIsRunning = allRunningIds.has(b.id);
      
      // Running prompts first
      if (aIsRunning && !bIsRunning) return -1;
      if (!aIsRunning && bIsRunning) return 1;
      
      // Then by last_checked_at (most recent first)
      const aDate = a.last_checked_at ? new Date(a.last_checked_at).getTime() : 0;
      const bDate = b.last_checked_at ? new Date(b.last_checked_at).getTime() : 0;
      return bDate - aDate;
    });
  }, [prompts, runningPromptIds, recentlyStartedIds]);

  // Fetch user tier, credits, and brand crawl status when dialog opens
  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      
      // Get user's organization tier and credits
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

      // Check if brand has been crawled
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

  // Trigger crawl when enabling watchdog if no crawl data exists
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

  const pollCrawlStatus = async () => {
    const supabase = createClient();
    let attempts = 0;
    const maxAttempts = 60;

    const checkStatus = async () => {
      const { data: brand } = await supabase
        .from("brands")
        .select("last_crawled_at")
        .eq("id", brandId)
        .single();

      if (brand?.last_crawled_at) {
        setHasCrawledData(true);
        setIsCrawling(false);
        toast.success("Website crawl complete!");
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkStatus, 5000);
      } else {
        setIsCrawling(false);
      }
    };

    checkStatus();
  };

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
          enable_hallucination_watchdog: canUseWatchdog && enableWatchdog && hasCrawledData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start analysis");
      }

      // Add to recently started to move to top of list
      setRecentlyStartedIds(prev => [...new Set([promptId, ...prev])]);

      const watchdogMessage = enableWatchdog && canUseWatchdog && hasCrawledData
        ? " Hallucination detection enabled." 
        : "";
      
      const regionInfo = REGIONS.find(r => r.id === region);
      const regionMessage = region !== "global" ? ` Region: ${regionInfo?.flag} ${regionInfo?.name}.` : "";

      toast.success("Analysis started!", {
        description: `Running ${selectedEngines.length} simulations. Check the Analyses section below.${regionMessage}${watchdogMessage}`,
      });

      setShowAnalyzeDialog(false);
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

  const openAnalyzeDialog = (promptId: string) => {
    setSelectedPromptId(promptId);
    setShowAnalyzeDialog(true);
  };

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

  // Combine external running IDs with locally tracked ones
  const allRunningIds = useMemo(() => 
    new Set([...runningPromptIds, ...recentlyStartedIds.filter(id => runningPromptIds.includes(id))]),
    [runningPromptIds, recentlyStartedIds]
  );

  // Clear recently started IDs that are no longer running (analysis completed)
  useEffect(() => {
    if (runningPromptIds.length === 0 && recentlyStartedIds.length > 0) {
      // Clear after a delay to allow UI to update
      const timeout = setTimeout(() => {
        setRecentlyStartedIds([]);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [runningPromptIds, recentlyStartedIds]);

  return (
    <div className="space-y-2">
      {sortedPrompts.map((prompt, index) => {
        const visibility = prompt.total_sims > 0 
          ? Math.round((prompt.visible_sims / prompt.total_sims) * 100) 
          : null;
        
        const isRunning = allRunningIds.has(prompt.id) || recentlyStartedIds.includes(prompt.id);
        const wasJustStarted = recentlyStartedIds.includes(prompt.id) && index === 0;
        
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
            className={`group relative transition-all duration-300 ${wasJustStarted ? 'animate-pulse' : ''}`}
          >
            {/* "Moved to top" indicator */}
            {wasJustStarted && (
              <div className="absolute -top-2 left-4 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium shadow-sm">
                <ArrowUp className="w-3 h-3" />
                Running
              </div>
            )}
            
            {/* Main Card - Clickable if has analysis and not running */}
            {hasAnalysis && !isRunning ? (
              <Link
                href={`/brands/${brandId}/prompts/${prompt.id}`}
                className="block"
              >
                <PromptCard
                  prompt={prompt}
                  visibility={visibility}
                  getVisibilityColor={getVisibilityColor}
                  getVisibilityIcon={getVisibilityIcon}
                  isClickable={true}
                  isRunning={isRunning}
                />
              </Link>
            ) : (
              <PromptCard
                prompt={prompt}
                visibility={visibility}
                getVisibilityColor={getVisibilityColor}
                getVisibilityIcon={getVisibilityIcon}
                isClickable={false}
                isRunning={isRunning}
              />
            )}

            {/* Quick Actions Overlay */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {hasAnalysis && !isRunning && (
                <Link href={`/brands/${brandId}/prompts/${prompt.id}`}>
                  <Button size="sm" variant="secondary" className="gap-1.5 h-8 shadow-sm">
                    <BarChart3 className="w-3.5 h-3.5" />
                    View Results
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
                  {hasAnalysis ? "Re-analyze" : "Analyze"}
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {/* Analyze Dialog - UPDATED with Hallucination Watchdog and Credits */}
      <Dialog open={showAnalyzeDialog} onOpenChange={setShowAnalyzeDialog}>
        <DialogContent className="sm:max-w-lg">
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
                AI search results will be localized to this region for accuracy
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

            {/* Hallucination Watchdog Toggle - PRO FEATURE */}
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

            {/* Credits Summary */}
            <div className="rounded-lg bg-gradient-to-br from-muted/50 to-muted/30 p-3 space-y-2">
              {/* Credit Balance */}
              <div className="flex items-center justify-between p-2 rounded-md bg-background/50 border border-border">
                <div className="flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium">Your Credits</span>
                </div>
                <span className={`text-sm font-bold ${hasEnoughCredits ? "text-green-500" : "text-red-500"}`}>
                  {creditsBalance.toLocaleString()}
                </span>
              </div>

              {/* Cost */}
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
    </div>
  );
}

// Extracted card component for cleaner code
function PromptCard({ 
  prompt, 
  visibility, 
  getVisibilityColor, 
  getVisibilityIcon,
  isClickable,
  isRunning = false,
}: {
  prompt: PromptWithStats;
  visibility: number | null;
  getVisibilityColor: (v: number | null) => string;
  getVisibilityIcon: (v: number | null) => React.ReactNode;
  isClickable: boolean;
  isRunning?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border bg-card transition-all ${
        isRunning
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
          : isClickable 
            ? "hover:border-primary/40 hover:bg-primary/5 cursor-pointer hover:shadow-md" 
            : "border-border"
      }`}
    >
      {/* Visibility Badge */}
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold min-w-[80px] justify-center ${getVisibilityColor(visibility)}`}>
        {getVisibilityIcon(visibility)}
        {isRunning ? "Running" : visibility !== null ? `${visibility}%` : "New"}
      </div>
      
      {/* Prompt Text */}
      <div className="flex-1 min-w-0">
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
      </div>

      {/* Chevron for clickable cards */}
      {isClickable && !isRunning && (
        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
      )}
    </div>
  );
}
