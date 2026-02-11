"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Loader2,
  Globe,
  MapPin,
  Building2,
  Wand2,
  Tags,
  Target,
  AlertTriangle,
  Crown,
  Zap,
  Clock,
  Check,
  Plus,
  X,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SupportedEngine, SupportedRegion, REGIONS } from "@/types";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
import { cn } from "@/lib/utils";

interface BrandContext {
  product_description: string;
  category: string;
  industry: string;
  target_audience: string;
  key_products: string[];
  competitors: string[];
  unique_selling_points: string[];
}

interface SubscriptionStatus {
  tier: string;
  isTrialExpired: boolean;
  trialDaysRemaining: number;
  limits: {
    maxBrands: number;
  };
  usage: {
    currentBrands: number;
  };
  canCreateBrand: boolean;
  needsUpgrade: boolean;
}

const engines: { id: SupportedEngine; name: string; icon: React.ReactNode; description: string }[] = [
  { id: "chatgpt", name: "ChatGPT", icon: <ChatGPTIcon className="w-5 h-5" />, description: "OpenAI's GPT" },
  { id: "perplexity", name: "Perplexity", icon: <PerplexityIcon className="w-5 h-5" />, description: "Real-time search" },
  { id: "gemini", name: "Gemini", icon: <GeminiIcon className="w-5 h-5" />, description: "Google AI" },
  { id: "grok", name: "Grok", icon: <GrokIcon className="w-5 h-5" />, description: "xAI model" },
];

export default function NewBrandPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    primary_location: "",
    languages: ["en"] as string[],
    brand_aliases: "",
  });
  
  const [analysisConfig, setAnalysisConfig] = useState({
    engines: ["chatgpt", "perplexity"] as SupportedEngine[],
    regions: ["global"] as SupportedRegion[],
    autoAnalysisEnabled: true,
  });
  
  // Initial prompts to add with the brand
  const [initialPrompts, setInitialPrompts] = useState<string[]>([]);
  const [newPromptInput, setNewPromptInput] = useState("");
  
  const [brandContext, setBrandContext] = useState<BrandContext>({
    product_description: "",
    category: "",
    industry: "",
    target_audience: "",
    key_products: [],
    competitors: [],
    unique_selling_points: [],
  });

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/subscription/status");
        if (res.ok) {
          const data = await res.json();
          setSubscriptionStatus(data);
        }
      } catch (error) {
        console.error("Failed to fetch subscription status:", error);
      }
    }
    fetchStatus();
  }, []);

  const handleLanguageToggle = (lang: string) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter(l => l !== lang)
        : [...prev.languages, lang],
    }));
  };

  const handleEngineToggle = (engine: SupportedEngine) => {
    setAnalysisConfig(prev => ({
      ...prev,
      engines: prev.engines.includes(engine)
        ? prev.engines.filter(e => e !== engine)
        : [...prev.engines, engine],
    }));
  };

  const handleRegionToggle = (region: SupportedRegion) => {
    setAnalysisConfig(prev => ({
      ...prev,
      regions: prev.regions.includes(region)
        ? prev.regions.filter(r => r !== region)
        : [...prev.regions, region],
    }));
  };

  const handleAddPrompt = () => {
    const trimmed = newPromptInput.trim();
    if (trimmed && !initialPrompts.includes(trimmed)) {
      setInitialPrompts(prev => [...prev, trimmed]);
      setNewPromptInput("");
    }
  };

  const handleRemovePrompt = (prompt: string) => {
    setInitialPrompts(prev => prev.filter(p => p !== prompt));
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddPrompt();
    }
  };

  const handleGenerateContext = async () => {
    if (!formData.domain.trim() || !formData.name.trim()) {
      toast.error("Enter brand name and domain first");
      return;
    }

    setIsGeneratingContext(true);

    try {
      const response = await fetch("/api/brands/generate-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: formData.domain,
          name: formData.name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate context");
      }

      setBrandContext(data.context);
      toast.success("Brand context generated!");
    } catch (error) {
      console.error("Error generating context:", error);
      toast.error("Failed to generate context");
    } finally {
      setIsGeneratingContext(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.domain.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (analysisConfig.engines.length === 0) {
      toast.error("Select at least one AI engine");
      return;
    }

    setIsLoading(true);

    try {
      const settings: Record<string, unknown> = {
        // Analysis configuration
        analysis_engines: analysisConfig.engines,
        analysis_regions: analysisConfig.regions,
        auto_analysis_enabled: analysisConfig.autoAnalysisEnabled,
      };
      
      // Brand context
      if (brandContext.product_description) settings.product_description = brandContext.product_description;
      if (brandContext.category) settings.category = brandContext.category;
      if (brandContext.industry) settings.industry = brandContext.industry;
      if (brandContext.target_audience) settings.target_audience = brandContext.target_audience;
      if (brandContext.key_products.length > 0) settings.key_products = brandContext.key_products;
      if (brandContext.competitors.length > 0) settings.competitors = brandContext.competitors;
      if (brandContext.unique_selling_points.length > 0) settings.unique_selling_points = brandContext.unique_selling_points;

      const response = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          domain: formData.domain,
          primary_location: formData.primary_location.trim() || null,
          languages: formData.languages,
          brand_aliases: formData.brand_aliases
            ? formData.brand_aliases.split(",").map(a => a.trim()).filter(Boolean)
            : [],
          settings,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === "TRIAL_EXPIRED") {
          toast.error("Trial Expired", {
            description: "Your trial has expired. Please upgrade to continue.",
            action: {
              label: "Upgrade",
              onClick: () => router.push("/billing"),
            },
          });
          return;
        }
        if (data.code === "BRAND_LIMIT_REACHED") {
          toast.error("Brand Limit Reached", {
            description: data.message,
            action: {
              label: "Upgrade",
              onClick: () => router.push("/billing"),
            },
          });
          return;
        }
        throw new Error(data.error || "Failed to create brand");
      }

      const brand = data.brand;

      // Auto-trigger website crawl
      try {
        await fetch("/api/brands/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand_id: brand.id,
            max_pages: 50,
            max_depth: 3,
          }),
        });
      } catch {
        // Crawl failed but brand was created
      }

      // Auto-analysis schedule is created server-side in /api/brands when enabled.

      // Add initial prompts if any were provided
      if (initialPrompts.length > 0) {
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user) {
            const promptsToInsert = initialPrompts.map(text => ({
              brand_id: brand.id,
              text,
              is_active: true,
              analysis_regions: analysisConfig.regions,
            }));
            
            const { data: insertedPrompts, error: promptsError } = await supabase
              .from("prompts")
              .insert(promptsToInsert)
              .select("id");
            
            if (promptsError) {
              console.error("Failed to create prompts:", promptsError);
            } else if (insertedPrompts && insertedPrompts.length > 0 && analysisConfig.autoAnalysisEnabled) {
              // Trigger immediate analysis for the new prompts
              try {
                await fetch("/api/analysis/run", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    brand_id: brand.id,
                    prompt_ids: insertedPrompts.map(p => p.id),
                    engines: analysisConfig.engines,
                    region: analysisConfig.regions[0] || "ae",
                  }),
                });
              } catch {
                // Analysis trigger failed but prompts were created
              }
            }
          }
        } catch (promptError) {
          console.error("Failed to create prompts:", promptError);
        }
      }

      toast.success("Brand created successfully!", {
        description: initialPrompts.length > 0 
          ? `Added ${initialPrompts.length} prompt${initialPrompts.length > 1 ? 's' : ''}. ${analysisConfig.autoAnalysisEnabled ? 'Analysis started!' : ''}`
          : analysisConfig.autoAnalysisEnabled 
            ? "Auto-analysis is enabled and will run 3x daily."
            : "You can run analyses manually from the brand dashboard.",
      });

      router.push(`/brands/${brand.id}`);
      router.refresh();
    } catch (error) {
      console.error("Error creating brand:", error);
      toast.error("Failed to create brand", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const canCreateBrand = subscriptionStatus?.canCreateBrand ?? true;
  const reachedLimit = subscriptionStatus !== null && !canCreateBrand;

  const isStep1Valid = formData.name.trim() && formData.domain.trim();
  const isStep2Valid = analysisConfig.engines.length > 0 && analysisConfig.regions.length > 0;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/brands">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add New Brand</h1>
          <p className="text-muted-foreground mt-1">
            Set up a brand to track AI visibility
          </p>
        </div>
      </div>

      {/* Brand Limit Warning */}
      {reachedLimit && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              {subscriptionStatus.isTrialExpired
                ? "Your trial has expired."
                : `You've reached your ${subscriptionStatus.tier} plan limit of ${subscriptionStatus.limits.maxBrands} brand${subscriptionStatus.limits.maxBrands === 1 ? '' : 's'}.`}
            </span>
            <Link href="/billing">
              <Button size="sm" variant="outline" className="ml-4 gap-1">
                <Crown className="w-3 h-3" />
                Upgrade
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Progress Steps */}
      <div className="flex items-center gap-4 mb-8">
        {[
          { step: 1, label: "Brand Info" },
          { step: 2, label: "Analysis Config" },
          { step: 3, label: "Context (Optional)" },
        ].map((item) => (
          <button
            key={item.step}
            onClick={() => setCurrentStep(item.step)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              currentStep === item.step
                ? "bg-primary text-primary-foreground"
                : currentStep > item.step
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {currentStep > item.step ? (
              <Check className="w-4 h-4" />
            ) : (
              <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs">
                {item.step}
              </span>
            )}
            {item.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Brand Information */}
        {currentStep === 1 && (
          <div className="enterprise-card animate-fade-in">
            <div className="enterprise-card-header">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">Brand Information</h2>
                  <p className="text-sm text-muted-foreground">Basic details about the brand</p>
                </div>
              </div>
            </div>
            <div className="enterprise-card-body space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Brand Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Red Bull"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="domain">Website Domain *</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="domain"
                      placeholder="e.g., redbull.com"
                      value={formData.domain}
                      onChange={(e) => setFormData(prev => ({ ...prev, domain: e.target.value }))}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Primary Location</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="location"
                      placeholder="e.g., Dubai, UAE"
                      value={formData.primary_location}
                      onChange={(e) => setFormData(prev => ({ ...prev, primary_location: e.target.value }))}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="aliases">Brand Aliases</Label>
                  <Input
                    id="aliases"
                    placeholder="e.g., RedBull, ريد بول"
                    value={formData.brand_aliases}
                    onChange={(e) => setFormData(prev => ({ ...prev, brand_aliases: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated alternative names
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Languages</Label>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="lang-en"
                      checked={formData.languages.includes("en")}
                      onCheckedChange={() => handleLanguageToggle("en")}
                    />
                    <Label htmlFor="lang-en" className="cursor-pointer">English</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="lang-ar"
                      checked={formData.languages.includes("ar")}
                      onCheckedChange={() => handleLanguageToggle("ar")}
                    />
                    <Label htmlFor="lang-ar" className="cursor-pointer">العربية</Label>
                  </div>
                </div>
              </div>
            </div>
            <div className="enterprise-card-footer flex justify-end">
              <Button 
                type="button" 
                onClick={() => setCurrentStep(2)}
                disabled={!isStep1Valid}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Analysis Configuration */}
        {currentStep === 2 && (
          <div className="enterprise-card animate-fade-in">
            <div className="enterprise-card-header">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold">Analysis Configuration</h2>
                  <p className="text-sm text-muted-foreground">Select AI engines and regions to analyze</p>
                </div>
              </div>
            </div>
            <div className="enterprise-card-body space-y-6">
              {/* Engine Selection */}
              <div className="space-y-3">
                <Label className="text-base font-medium">AI Engines to Monitor *</Label>
                <p className="text-sm text-muted-foreground">
                  Select which AI search engines to analyze for brand visibility
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {engines.map((engine) => {
                    const isSelected = analysisConfig.engines.includes(engine.id);
                    return (
                      <button
                        key={engine.id}
                        type="button"
                        onClick={() => handleEngineToggle(engine.id)}
                        className={cn(
                          "flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/30"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-lg",
                          isSelected ? "bg-primary/10" : "bg-muted"
                        )}>
                          {engine.icon}
                        </div>
                        <div>
                          <p className="font-medium">{engine.name}</p>
                          <p className="text-xs text-muted-foreground">{engine.description}</p>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-primary ml-auto" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Region Selection */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Target Regions *</Label>
                <p className="text-sm text-muted-foreground">
                  Select regions for localized search results
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                  {REGIONS.map((region) => {
                    const isSelected = analysisConfig.regions.includes(region.id);
                    return (
                      <button
                        key={region.id}
                        type="button"
                        onClick={() => handleRegionToggle(region.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 font-medium"
                            : "border-border hover:border-muted-foreground/30"
                        )}
                      >
                        <span className="text-base">{region.flag}</span>
                        <span className="truncate">{region.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Initial Prompts */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-medium flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Initial Prompts (Optional)
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Add search queries to track from the start
                    </p>
                  </div>
                  {initialPrompts.length > 0 && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                      {initialPrompts.length} prompt{initialPrompts.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., best solar panel companies in Dubai"
                    value={newPromptInput}
                    onChange={(e) => setNewPromptInput(e.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddPrompt}
                    disabled={!newPromptInput.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                
                {initialPrompts.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {initialPrompts.map((prompt, index) => (
                      <div 
                        key={index} 
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-background"
                      >
                        <span className="flex-1 text-sm truncate">{prompt}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePrompt(prompt)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {initialPrompts.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    You can also add prompts later from the brand dashboard
                  </p>
                )}
              </div>

              {/* Auto Analysis Toggle */}
              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Clock className="w-5 h-5 text-success" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Automatic Analysis</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Run analysis 3 times daily for consistent monitoring
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAnalysisConfig(prev => ({ 
                          ...prev, 
                          autoAnalysisEnabled: !prev.autoAnalysisEnabled 
                        }))}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative",
                          analysisConfig.autoAnalysisEnabled ? "bg-success" : "bg-muted"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform",
                          analysisConfig.autoAnalysisEnabled ? "translate-x-6" : "translate-x-0.5"
                        )} />
                      </button>
                    </div>
                    {analysisConfig.autoAnalysisEnabled && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="px-2 py-0.5 rounded bg-success/10 text-success font-medium">
                          Runs at 8:00, 14:00, 20:00 UTC
                        </span>
                        {initialPrompts.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                            First analysis starts immediately
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="enterprise-card-footer flex justify-between">
              <Button type="button" variant="outline" onClick={() => setCurrentStep(1)}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setCurrentStep(3)}>
                  Add Context (Optional)
                </Button>
                <Button 
                  type="submit" 
                  disabled={isLoading || reachedLimit || !isStep2Valid}
                  className="gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Brand"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Brand Context (Optional) */}
        {currentStep === 3 && (
          <div className="enterprise-card animate-fade-in">
            <div className="enterprise-card-header">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Tags className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Brand Context</h2>
                    <p className="text-sm text-muted-foreground">Help AI understand your brand better</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateContext}
                  disabled={isGeneratingContext || !formData.name || !formData.domain}
                  className="gap-2"
                >
                  {isGeneratingContext ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Auto-generate
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div className="enterprise-card-body space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="product_description">Product/Service Type</Label>
                  <Input
                    id="product_description"
                    placeholder="e.g., energy drinks, CRM software"
                    value={brandContext.product_description}
                    onChange={(e) => setBrandContext(prev => ({ ...prev, product_description: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    placeholder="e.g., beverages, software"
                    value={brandContext.category}
                    onChange={(e) => setBrandContext(prev => ({ ...prev, category: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    placeholder="e.g., Food & Beverage, Technology"
                    value={brandContext.industry}
                    onChange={(e) => setBrandContext(prev => ({ ...prev, industry: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target_audience" className="flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" />
                    Target Audience
                  </Label>
                  <Input
                    id="target_audience"
                    placeholder="e.g., young professionals, athletes"
                    value={brandContext.target_audience}
                    onChange={(e) => setBrandContext(prev => ({ ...prev, target_audience: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="competitors">Main Competitors</Label>
                <Input
                  id="competitors"
                  placeholder="e.g., Monster, Rockstar, Celsius"
                  value={brandContext.competitors.join(", ")}
                  onChange={(e) => setBrandContext(prev => ({ 
                    ...prev, 
                    competitors: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of competitors
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="usps">Unique Selling Points</Label>
                <Textarea
                  id="usps"
                  placeholder="What makes this brand unique? Enter each point on a new line..."
                  value={brandContext.unique_selling_points.join("\n")}
                  onChange={(e) => setBrandContext(prev => ({ 
                    ...prev, 
                    unique_selling_points: e.target.value.split("\n").map(s => s.trim()).filter(Boolean)
                  }))}
                  rows={3}
                />
              </div>
            </div>
            <div className="enterprise-card-footer flex justify-between">
              <Button type="button" variant="outline" onClick={() => setCurrentStep(2)}>
                Back
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading || reachedLimit || !isStep2Valid}
                className="gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Brand"
                )}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
