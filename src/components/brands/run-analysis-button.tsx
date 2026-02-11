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
import { cn } from "@/lib/utils";

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
  const [selectedRegions, setSelectedRegions] = useState<SupportedRegion[]>(["global"]);
  const [enableWatchdog, setEnableWatchdog] = useState(false);
  const [userTier, setUserTier] = useState<BillingTier>("free");
  const [hasCrawledData, setHasCrawledData] = useState(false);
  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const [brandDomain, setBrandDomain] = useState<string>("");

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
    
    if (open) {
      fetchData();
    }
  }, [open, brandId]);

  const tierLimits = TIER_LIMITS[userTier];
  const canUseWatchdog = tierLimits.hallucination_watchdog;

  const totalSimulations = keywordsCount * selectedEngines.length * selectedRegions.length;
  const estimatedCredits = totalSimulations;
  const hasEnoughCredits = creditsBalance >= estimatedCredits;

  const handleToggleEngine = (engine: SupportedEngine) => {
    setSelectedEngines(prev => {
      if (prev.includes(engine)) {
        if (prev.length === 1) return prev;
        return prev.filter(e => e !== engine);
      }
      return [...prev, engine];
    });
  };

  const handleToggleRegion = (region: SupportedRegion) => {
    setSelectedRegions(prev => {
      if (prev.includes(region)) {
        if (prev.length === 1) return prev;
        return prev.filter(r => r !== region);
      }
      return [...prev, region];
    });
  };

  const handleSelectAllEngines = () => {
    if (selectedEngines.length === engines.length) {
      setSelectedEngines(["chatgpt"]);
    } else {
      setSelectedEngines(engines.map(e => e.id));
    }
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

        toast.success("Website crawl started!");
      } catch {
        toast.error("Failed to start website crawl");
        setIsCrawling(false);
        return;
      }
    }
    
    setEnableWatchdog(!enableWatchdog);
  };

  const handleRun = async () => {
    if (keywordsCount === 0) {
      toast.error("No prompts to analyze");
      return;
    }

    if (selectedEngines.length === 0) {
      toast.error("Select at least one engine");
      return;
    }

    if (selectedRegions.length === 0) {
      toast.error("Select at least one region");
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
          regions: selectedRegions,
          enable_hallucination_watchdog: canUseWatchdog && enableWatchdog,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start analysis");
      }

      const watchdogMessage = enableWatchdog && canUseWatchdog && hasCrawledData
        ? " Hallucination Watchdog enabled." 
        : "";
      
      const regionMessage = selectedRegions.length > 1 
        ? ` Analyzing ${selectedRegions.length} regions.`
        : "";

      toast.success("Analysis started!", {
        description: `Running ${totalSimulations} simulations.${regionMessage}${watchdogMessage}`,
      });

      setOpen(false);
      router.push(`/brands/${brandId}/keyword-sets/${keywordSetId}/batches/${data.batch_id}`);
      router.refresh();
    } catch (error) {
      console.error("Failed to start analysis:", error);
      toast.error("Failed to start analysis");
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

        <div className="space-y-5 py-4">
          {/* Engine Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-medium">AI Engines</Label>
              <Button variant="ghost" size="sm" onClick={handleSelectAllEngines}>
                {selectedEngines.length === engines.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {engines.map((engine) => {
                const isSelected = selectedEngines.includes(engine.id);
                return (
                  <button
                    key={engine.id}
                    onClick={() => handleToggleEngine(engine.id)}
                    className={cn(
                      "flex items-center gap-2.5 p-3 rounded-lg border transition-all text-left",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    <div className={cn(
                      "p-1.5 rounded",
                      isSelected ? "bg-primary/10" : "bg-muted"
                    )}>
                      {engine.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{engine.name}</p>
                      <p className="text-xs text-muted-foreground">{engine.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language Selection */}
          <div className="space-y-2">
            <Label className="font-medium">Language</Label>
            <RadioGroup 
              value={language} 
              onValueChange={(v) => setLanguage(v as "en" | "ar")}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="en" id="en" />
                <Label htmlFor="en" className="cursor-pointer text-sm">English</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ar" id="ar" />
                <Label htmlFor="ar" className="cursor-pointer text-sm">العربية</Label>
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
                const isSelected = selectedRegions.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => handleToggleRegion(r.id)}
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
              <button
                onClick={handleToggleWatchdog}
                disabled={isCrawling}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                  enableWatchdog
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-border hover:border-amber-500/30"
                )}
              >
                <div className={cn(
                  "p-2 rounded",
                  enableWatchdog ? "bg-amber-500/10" : "bg-muted"
                )}>
                  {isCrawling ? (
                    <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                  ) : (
                    <ShieldAlert className={cn(
                      "w-4 h-4",
                      enableWatchdog ? "text-amber-500" : "text-muted-foreground"
                    )} />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Detect AI Hallucinations</p>
                  <p className="text-xs text-muted-foreground">
                    {isCrawling 
                      ? "Scanning website..."
                      : "Find when AI lies about your brand"
                    }
                  </p>
                </div>
                <div className={cn(
                  "w-10 h-5 rounded-full transition-colors",
                  enableWatchdog ? "bg-amber-500" : "bg-muted"
                )}>
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-0.5",
                    enableWatchdog ? "translate-x-5" : "translate-x-0.5"
                  )} />
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5">
                <div className="p-2 rounded bg-amber-500/10">
                  <Lock className="w-4 h-4 text-amber-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-600">Upgrade to Pro</p>
                  <p className="text-xs text-muted-foreground">
                    Detect hallucinations about your brand
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="border-amber-500 text-amber-600"
                  onClick={() => router.push("/billing")}
                >
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
                <span className="text-muted-foreground">Prompts × Engines × Regions</span>
                <span className="font-medium">{keywordsCount} × {selectedEngines.length} × {selectedRegions.length}</span>
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

          {keywordsCount === 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 text-warning">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                Add prompts before running an analysis.
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
