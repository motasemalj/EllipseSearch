"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  Play, 
  Loader2, 
  Info, 
  ShieldAlert, 
  Lock, 
  Crown,
  Coins,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import { toast } from "sonner";
import { SupportedEngine, BillingTier, TIER_LIMITS, SupportedRegion, REGIONS } from "@/types";
import { createClient } from "@/lib/supabase/client";

interface RunAnalysisButtonProps {
  brandId: string;
  keywordSetId: string;
  keywordsCount: number;
}

const engines: { id: SupportedEngine; name: string; icon: React.ReactNode; description: string }[] = [
  { id: "chatgpt", name: "ChatGPT", icon: <ChatGPTIcon className="w-4 h-4" />, description: "OpenAI's ChatGPT" },
  { id: "perplexity", name: "Perplexity", icon: <PerplexityIcon className="w-4 h-4" />, description: "Real-time search" },
  { id: "gemini", name: "Gemini", icon: <GeminiIcon className="w-4 h-4" />, description: "Google's AI" },
  { id: "grok", name: "Grok", icon: <GrokIcon className="w-4 h-4" />, description: "xAI's model" },
];

export function RunAnalysisButton({ brandId, keywordSetId, keywordsCount }: RunAnalysisButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [selectedEngines, setSelectedEngines] = useState<SupportedEngine[]>(["chatgpt"]);
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [region, setRegion] = useState<SupportedRegion>("global");
  const [enableWatchdog, setEnableWatchdog] = useState(false);
  const [userTier, setUserTier] = useState<BillingTier>("free");
  const [hasCrawledData, setHasCrawledData] = useState(false);
  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const [brandDomain, setBrandDomain] = useState<string>("");

  // Fetch user tier, credits, and brand crawl status
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
    
    if (open) {
      fetchData();
    }
  }, [open, brandId]);

  const tierLimits = TIER_LIMITS[userTier];
  const canUseWatchdog = tierLimits.hallucination_watchdog;

  const totalSimulations = keywordsCount * selectedEngines.length;
  const estimatedCredits = totalSimulations;
  const hasEnoughCredits = creditsBalance >= estimatedCredits;

  const handleToggleEngine = (engine: SupportedEngine) => {
    setSelectedEngines(prev => {
      if (prev.includes(engine)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(e => e !== engine);
      }
      return [...prev, engine];
    });
  };

  const handleSelectAll = () => {
    if (selectedEngines.length === engines.length) {
      setSelectedEngines(["chatgpt"]);
    } else {
      setSelectedEngines(engines.map(e => e.id));
    }
  };

  // Trigger crawl when enabling watchdog if no crawl data exists
  const handleToggleWatchdog = async () => {
    if (!canUseWatchdog) return;
    
    if (!enableWatchdog && !hasCrawledData) {
      // User is trying to enable watchdog but no crawl data exists
      // Trigger a crawl automatically
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
          description: "We're scanning your website to build ground truth data. This will take a few minutes.",
        });
        
        // Poll for crawl completion
        pollCrawlStatus();
      } catch {
        toast.error("Failed to start website crawl", {
          description: "Please try again later.",
        });
        setIsCrawling(false);
        return;
      }
    }
    
    setEnableWatchdog(!enableWatchdog);
  };

  const pollCrawlStatus = async () => {
    const supabase = createClient();
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    const checkStatus = async () => {
      const { data: brand } = await supabase
        .from("brands")
        .select("last_crawled_at")
        .eq("id", brandId)
        .single();

      if (brand?.last_crawled_at) {
        setHasCrawledData(true);
        setIsCrawling(false);
        toast.success("Website crawl complete!", {
          description: "Hallucination detection is now ready.",
        });
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkStatus, 5000); // Check every 5 seconds
      } else {
        setIsCrawling(false);
      }
    };

    checkStatus();
  };

  const handleRun = async () => {
    if (keywordsCount === 0) {
      toast.error("No prompts to analyze", {
        description: "Add prompts to this set before running an analysis.",
      });
      return;
    }

    if (selectedEngines.length === 0) {
      toast.error("Select at least one engine");
      return;
    }

    if (!hasEnoughCredits) {
      toast.error("Insufficient credits", {
        description: `You need ${estimatedCredits} credits but only have ${creditsBalance}.`,
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          keyword_set_id: keywordSetId,
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

      const watchdogMessage = enableWatchdog && canUseWatchdog && hasCrawledData
        ? " Hallucination Watchdog enabled." 
        : "";
      
      const regionInfo = REGIONS.find(r => r.id === region);
      const regionMessage = region !== "global" ? ` Region: ${regionInfo?.flag} ${regionInfo?.name}.` : "";

      toast.success("Analysis started!", {
        description: `Running ${totalSimulations} simulations.${regionMessage}${watchdogMessage}`,
      });

      setOpen(false);
      router.push(`/brands/${brandId}/keyword-sets/${keywordSetId}/batches/${data.batch_id}`);
      router.refresh();
    } catch (error) {
      console.error("Failed to start analysis:", error);
      toast.error("Failed to start analysis", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Play className="w-4 h-4" />
          Run Analysis
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Run AI Visibility Analysis</DialogTitle>
          <DialogDescription>
            Check how your brand appears across AI search engines.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Engine Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Select AI Engines</Label>
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                {selectedEngines.length === engines.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {engines.map((engine) => {
                const isSelected = selectedEngines.includes(engine.id);
                return (
                  <button
                    key={engine.id}
                    onClick={() => handleToggleEngine(engine.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${isSelected ? "bg-primary/20" : "bg-muted"}`}>
                      {engine.icon}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{engine.name}</p>
                      <p className="text-xs text-muted-foreground">{engine.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Language</Label>
            <RadioGroup 
              value={language} 
              onValueChange={(v) => setLanguage(v as "en" | "ar")}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="en" id="en" />
                <Label htmlFor="en" className="cursor-pointer">English</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ar" id="ar" />
                <Label htmlFor="ar" className="cursor-pointer">العربية (Arabic)</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Region Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-medium">Search Region</Label>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              AI search results will be localized to this region for accuracy
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[160px] overflow-y-auto p-1">
              {REGIONS.map((r) => {
                const isSelected = region === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRegion(r.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-base">{r.flag}</span>
                    <span className="truncate">{r.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hallucination Watchdog Toggle - PRO FEATURE */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-base font-medium">AI Hallucination Detection</Label>
              <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold flex items-center gap-1">
                <Crown className="w-3 h-3" />
                PRO
              </span>
            </div>
            
            {canUseWatchdog ? (
              <button
                onClick={handleToggleWatchdog}
                disabled={isCrawling}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                  enableWatchdog
                    ? "border-amber-500 bg-gradient-to-br from-amber-500/10 to-orange-500/10"
                    : "border-border hover:border-amber-500/50"
                } ${isCrawling ? "opacity-70" : ""}`}
              >
                <div className={`p-3 rounded-xl ${
                  enableWatchdog
                    ? "bg-gradient-to-br from-amber-500/30 to-orange-500/30" 
                    : "bg-muted"
                }`}>
                  {isCrawling ? (
                    <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                  ) : (
                    <ShieldAlert className={`w-5 h-5 ${enableWatchdog ? "text-amber-500" : "text-muted-foreground"}`} />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium">Detect AI Hallucinations</p>
                  <p className="text-xs text-muted-foreground">
                    {isCrawling 
                      ? "Scanning your website for ground truth data..."
                      : hasCrawledData
                        ? "Find when AI lies about your pricing, features, or availability"
                        : "We'll scan your website to enable detection"
                    }
                  </p>
                  {!hasCrawledData && !isCrawling && enableWatchdog && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      Website crawl will start automatically
                    </p>
                  )}
                </div>
                <div className={`w-12 h-6 rounded-full transition-colors ${
                  enableWatchdog ? "bg-amber-500" : "bg-muted"
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${
                    enableWatchdog ? "translate-x-6 ml-0.5" : "translate-x-0.5"
                  }`} />
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-amber-500/30 bg-amber-500/5">
                <div className="p-3 rounded-xl bg-amber-500/10">
                  <Lock className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-amber-600 dark:text-amber-400">Upgrade to Pro</p>
                  <p className="text-xs text-muted-foreground">
                    Detect when AI hallucinates about your brand
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="border-amber-500 text-amber-600 hover:bg-amber-500/10"
                  onClick={() => router.push("/billing")}
                >
                  Upgrade
                </Button>
              </div>
            )}
          </div>

          {/* Credits Summary */}
          <div className="rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 p-4 space-y-3">
            {/* Credit Balance */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Your Credits</span>
              </div>
              <span className={`text-lg font-bold ${hasEnoughCredits ? "text-green-500" : "text-red-500"}`}>
                {creditsBalance.toLocaleString()}
              </span>
            </div>

            {/* Breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Prompts × Engines</span>
                <span className="font-medium">{keywordsCount} × {selectedEngines.length}</span>
              </div>
              {enableWatchdog && canUseWatchdog && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    Hallucination Detection
                  </span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">Enabled</span>
                </div>
              )}
              <div className="border-t border-border pt-2" />
              <div className="flex items-center justify-between">
                <span className="font-medium">Credit Cost</span>
                <span className={`text-xl font-bold ${hasEnoughCredits ? "text-primary" : "text-red-500"}`}>
                  {estimatedCredits} credits
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">After Analysis</span>
                <span className={`font-medium ${creditsBalance - estimatedCredits >= 0 ? "" : "text-red-500"}`}>
                  {(creditsBalance - estimatedCredits).toLocaleString()} remaining
                </span>
              </div>
            </div>

            {!hasEnoughCredits && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    Insufficient credits
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You need {estimatedCredits - creditsBalance} more credits.{" "}
                    <button 
                      onClick={() => router.push("/billing")}
                      className="text-primary hover:underline"
                    >
                      Upgrade plan
                    </button>
                  </p>
                </div>
              </div>
            )}
          </div>

          {keywordsCount === 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                This prompt set has no prompts. Add prompts before running an analysis.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleRun} 
            disabled={isLoading || keywordsCount === 0 || !hasEnoughCredits}
            className="gap-2"
          >
            {isLoading ? (
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
  );
}
