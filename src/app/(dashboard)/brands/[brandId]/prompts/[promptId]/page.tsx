import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Bot,
  Search,
  Sparkles,
  Zap,
  Eye,
  EyeOff,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Trophy,
  BarChart3,
  ListChecks,
  Globe,
  FileText,
  Users,
  Shield,
  Target,
  TrendingUp,
  Play,
  Info,
  HeartPulse,
  Link2,
  ShieldAlert,
  ChevronRight,
  History,
  ChevronDown,
  Loader2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { VisibilityGauge } from "@/components/ui/visibility-gauge";
import { EngineBadge } from "@/components/ui/engine-badge";
import { BrandFavicon } from "@/components/ui/brand-favicon";
import { HallucinationWatchdogSection } from "@/components/brands/hallucination-watchdog-section";
import { SentimentAnalysisCard } from "@/components/brands/sentiment-analysis-card";
import { CitationAuthorityPanel } from "@/components/brands/citation-authority-panel";
import { SupportedEngine, SelectionSignals, ActionItem, SentimentAnalysis, CitationAuthority, GroundingMetadata, SupportedRegion, getRegionInfo } from "@/types";
import { textToSafeHtml } from "@/lib/ai/text-to-html";
import { CopyButtonClient } from "@/components/ui/copy-button";

interface PromptPageProps {
  params: { brandId: string; promptId: string };
}

const engineConfig: Record<SupportedEngine, { name: string; icon: React.ReactNode; color: string }> = {
  chatgpt: { name: "ChatGPT", icon: <Bot className="w-4 h-4" />, color: "text-emerald-500" },
  perplexity: { name: "Perplexity", icon: <Search className="w-4 h-4" />, color: "text-purple-500" },
  gemini: { name: "Gemini", icon: <Sparkles className="w-4 h-4" />, color: "text-blue-500" },
  grok: { name: "Grok", icon: <Zap className="w-4 h-4" />, color: "text-gray-500" },
};

// Helper functions for converting winning_sources to CitationAuthority
const AUTHORITATIVE_DOMAINS = ['wikipedia.org', 'britannica.com', 'reuters.com', 'bbc.com', 'nytimes.com', 'forbes.com', 'bloomberg.com', 'techcrunch.com', 'wired.com', 'theguardian.com', 'wsj.com', 'gulfnews.com', 'khaleejtimes.com'];
const HIGH_AUTHORITY_DOMAINS = ['linkedin.com', 'crunchbase.com', 'g2.com', 'capterra.com', 'trustpilot.com', 'clutch.co', 'yelp.com', 'medium.com', 'hubspot.com'];
const LOWER_AUTHORITY_DOMAINS = ['reddit.com', 'quora.com', 'pinterest.com', 'tumblr.com', 'blogspot.com', 'wordpress.com'];

function getAuthorityScoreForDomain(domain: string): number {
  const d = domain.toLowerCase();
  if (d.endsWith('.gov') || d.endsWith('.edu')) return 95;
  if (d.endsWith('.org')) return 80;
  if (AUTHORITATIVE_DOMAINS.some(a => d.includes(a))) return 90;
  if (HIGH_AUTHORITY_DOMAINS.some(h => d.includes(h))) return 75;
  if (LOWER_AUTHORITY_DOMAINS.some(l => d.includes(l))) return 35;
  if (d.includes('news') || d.includes('times')) return 70;
  return 50;
}

function getAuthorityTierForDomain(domain: string): 'authoritative' | 'high' | 'medium' | 'low' {
  const score = getAuthorityScoreForDomain(domain);
  if (score >= 85) return 'authoritative';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function getSourceTypeForDomain(domain: string): 'editorial' | 'directory' | 'social' | 'blog' | 'official' | 'forum' | 'news' {
  const d = domain.toLowerCase();
  if (['linkedin.com', 'twitter.com', 'x.com', 'facebook.com'].some(s => d.includes(s))) return 'social';
  if (['clutch.co', 'g2.com', 'capterra.com', 'yelp.com', 'tripadvisor.com', 'crunchbase.com'].some(s => d.includes(s))) return 'directory';
  if (['medium.com', 'substack.com', 'wordpress.com', 'blogger.com'].some(s => d.includes(s))) return 'blog';
  if (['reddit.com', 'quora.com', 'stackoverflow.com'].some(s => d.includes(s))) return 'forum';
  if (['news', 'times', 'post', 'bbc', 'cnn', 'reuters'].some(s => d.includes(s))) return 'news';
  if (d.endsWith('.gov') || d.endsWith('.edu')) return 'official';
  return 'editorial';
}

const priorityConfig: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  high: { color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30", icon: <Zap className="w-4 h-4" /> },
  medium: { color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: <Target className="w-4 h-4" /> },
  foundational: { color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: <Shield className="w-4 h-4" /> },
  "nice-to-have": { color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/30", icon: <Clock className="w-4 h-4" /> },
};

const categoryIcons: Record<string, React.ReactNode> = {
  technical: <BarChart3 className="w-4 h-4" />,
  content: <FileText className="w-4 h-4" />,
  "third-party": <Users className="w-4 h-4" />,
  entity: <Globe className="w-4 h-4" />,
  measurement: <TrendingUp className="w-4 h-4" />,
  local: <Target className="w-4 h-4" />,
  ymyl: <Shield className="w-4 h-4" />,
};

export default async function PromptPage({ params }: PromptPageProps) {
  const { brandId, promptId } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  // Get organization tier
  const { data: org } = await supabase
    .from("organizations")
    .select("tier")
    .eq("id", profile.organization_id)
    .single();

  const userTier = org?.tier || "free";

  // Get the prompt
  const { data: prompt } = await supabase
    .from("prompts")
    .select("*, prompt_sets(name), brands(name, domain)")
    .eq("id", promptId)
    .single();

  if (!prompt) notFound();

  // Verify brand belongs to organization
  const { data: brand } = await supabase
    .from("brands")
    .select("name, domain")
    .eq("id", brandId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!brand) notFound();

  // Check if there are any running analyses for this prompt
  const { data: runningBatches } = await supabase
    .from("analysis_batches")
    .select("id, status, total_simulations, completed_simulations, engines, created_at, started_at")
    .eq("brand_id", brandId)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false });

  // Get all simulations for this prompt
  const { data: simulations } = await supabase
    .from("simulations")
    .select("*")
    .eq("prompt_id", promptId)
    .order("created_at", { ascending: false });

  const allSims = simulations || [];
  const totalSims = allSims.length;
  const visibleSims = allSims.filter(s => s.is_visible).length;
  const visibility = totalSims > 0 ? Math.round((visibleSims / totalSims) * 100) : 0;

  // Check if this prompt has a running analysis
  // We need to check if any running batch includes this prompt
  const hasRunningAnalysis = runningBatches && runningBatches.length > 0;

  // If there are no completed simulations AND there's a running analysis, show the "in progress" view
  if (totalSims === 0 && hasRunningAnalysis) {
    const currentBatch = runningBatches[0];
    const progress = currentBatch.total_simulations > 0 
      ? Math.round((currentBatch.completed_simulations / currentBatch.total_simulations) * 100)
      : 0;
    
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Link href={`/brands/${brandId}`}>
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <BrandFavicon domain={brand.domain} size="lg" className="mt-1" />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">
              <Link href={`/brands/${brandId}`} className="hover:underline">
                {brand.name}
              </Link>
            </p>
            <h1 className="text-2xl font-bold tracking-tight">{prompt.text}</h1>
          </div>
        </div>

        {/* Analysis In Progress Card */}
        <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
          <div className="flex flex-col items-center text-center max-w-md mx-auto">
            <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Analysis In Progress</h2>
            <p className="text-muted-foreground mb-6">
              We&apos;re analyzing this prompt across AI engines. Results will be available once the analysis completes.
            </p>
            
            {/* Progress indicator */}
            <div className="w-full space-y-3 mb-6">
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
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span>{currentBatch.completed_simulations} of {currentBatch.total_simulations} simulations</span>
              </div>
            </div>

            {/* Engine badges */}
            <div className="flex items-center gap-2 mb-6">
              {(currentBatch.engines as string[]).map((engine: string) => (
                <span 
                  key={engine}
                  className="px-3 py-1.5 rounded-full bg-muted text-sm font-medium capitalize"
                >
                  {engine === "chatgpt" ? "ChatGPT" : engine}
                </span>
              ))}
            </div>

            <Link href={`/brands/${brandId}`}>
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Brand
              </Button>
            </Link>
          </div>
        </div>

        {/* Helpful tips while waiting */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            While You Wait
          </h3>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <p>• Analysis typically takes 30-60 seconds per engine</p>
            <p>• Results include visibility status, sentiment analysis, and actionable recommendations</p>
            <p>• You can safely navigate away - we&apos;ll save your results</p>
            <p>• Refresh this page to check for updates</p>
          </div>
        </div>
      </div>
    );
  }

  // Group by engine
  const byEngine: Record<SupportedEngine, typeof allSims> = {
    chatgpt: [],
    perplexity: [],
    gemini: [],
    grok: [],
  };

  allSims.forEach(sim => {
    const engine = sim.engine as SupportedEngine;
    if (byEngine[engine]) {
      byEngine[engine].push(sim);
    }
  });

  // Calculate engine stats
  const engineStats: Record<SupportedEngine, { total: number; visible: number; rate: number }> = {
    chatgpt: { total: 0, visible: 0, rate: 0 },
    perplexity: { total: 0, visible: 0, rate: 0 },
    gemini: { total: 0, visible: 0, rate: 0 },
    grok: { total: 0, visible: 0, rate: 0 },
  };

  Object.entries(byEngine).forEach(([engine, sims]) => {
    const visible = sims.filter(s => s.is_visible).length;
    engineStats[engine as SupportedEngine] = {
      total: sims.length,
      visible,
      rate: sims.length > 0 ? Math.round((visible / sims.length) * 100) : 0,
    };
  });

  const enginesWithData = (Object.keys(byEngine) as SupportedEngine[]).filter(e => byEngine[e].length > 0);

  // Get the latest simulation for overall metrics
  const latestSim = allSims[0];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const latestSignals = latestSim?.selection_signals as SelectionSignals | null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href={`/brands/${brandId}`}>
          <Button variant="ghost" size="icon" className="mt-1">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <BrandFavicon domain={brand.domain} size="lg" className="mt-1" />
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">
            <Link href={`/brands/${brandId}`} className="hover:underline">
              {brand.name}
            </Link>
            {prompt.prompt_sets && (
              <>
                {" / "}
                <span>{(prompt.prompt_sets as { name: string }).name}</span>
              </>
            )}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{prompt.text}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {totalSims} analyses
            </span>
            {prompt.last_checked_at && (
              <span>
                Last checked: {new Date(prompt.last_checked_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Main Visibility */}
        <div className="md:col-span-1 rounded-2xl border border-border bg-card p-6 flex flex-col items-center justify-center">
          <VisibilityGauge value={visibility} size="md" label="Overall" />
          <p className="text-sm text-muted-foreground mt-2 text-center">
            {visibleSims} of {totalSims}
          </p>
        </div>

        {/* Per-Engine Stats */}
        {(["chatgpt", "perplexity", "gemini", "grok"] as SupportedEngine[]).map(engine => {
          const stat = engineStats[engine];
          const config = engineConfig[engine];
          
          return (
            <div key={engine} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-1.5 rounded-lg bg-muted ${config.color}`}>
                  {config.icon}
                </div>
                <span className="font-medium text-sm">{config.name}</span>
              </div>
              
              {stat.total > 0 ? (
                <div className="space-y-1">
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-bold ${stat.rate >= 50 ? "text-emerald-500" : stat.rate > 0 ? "text-amber-500" : "text-red-500"}`}>
                      {stat.rate}%
                    </span>
                    <span className="text-xs text-muted-foreground">visible</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stat.visible}/{stat.total} responses
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Analysis Results by Engine */}
      {enginesWithData.length > 0 ? (
        <Tabs defaultValue={enginesWithData[0]} className="space-y-4">
          <TabsList className="bg-muted/50">
            {enginesWithData.map(engine => {
              const config = engineConfig[engine];
              const stat = engineStats[engine];
              return (
                <TabsTrigger key={engine} value={engine} className="gap-2">
                  <span className={config.color}>{config.icon}</span>
                  {config.name}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    stat.rate >= 50 ? "bg-emerald-500/10 text-emerald-600" : 
                    stat.rate > 0 ? "bg-amber-500/10 text-amber-600" : 
                    "bg-red-500/10 text-red-600"
                  }`}>
                    {stat.rate}%
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {enginesWithData.map(engine => {
            const engineSims = byEngine[engine];
            const latestSim = engineSims[0]; // Already sorted by created_at desc
            const olderSims = engineSims.slice(1);
            
            return (
              <TabsContent key={engine} value={engine} className="space-y-6">
                {/* Latest Analysis */}
                <SimulationCard 
                  key={latestSim.id} 
                  simulation={latestSim} 
                  brandName={brand.name} 
                  brandDomain={brand.domain} 
                  userTier={userTier} 
                />
                
                {/* Previous Analyses (collapsed by default) */}
                {olderSims.length > 0 && (
                  <Collapsible>
                    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between h-auto py-3 px-4 hover:bg-muted/50">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                              <History className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div className="text-left">
                              <p className="font-medium">Previous Analyses</p>
                              <p className="text-sm text-muted-foreground">
                                {olderSims.length} older {olderSims.length === 1 ? 'analysis' : 'analyses'} available
                              </p>
                            </div>
                          </div>
                          <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4 space-y-6">
                        {olderSims.map((sim, idx) => (
                          <div key={sim.id} className="relative">
                            <div className="absolute -top-2 left-4 px-2 py-0.5 bg-muted rounded-full text-xs text-muted-foreground">
                              {new Date(sim.created_at).toLocaleDateString()} at {new Date(sim.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="pt-4">
                              <SimulationCard 
                                simulation={sim} 
                                index={idx + 1}
                                brandName={brand.name} 
                                brandDomain={brand.domain} 
                                userTier={userTier} 
                              />
                            </div>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No analysis results yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Run an analysis on this prompt to see how AI engines respond.
          </p>
          <Link href={`/brands/${brandId}`}>
            <Button className="gap-2">
              <Play className="w-4 h-4" />
              Run Analysis
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

// Section Info Tooltip Component
function SectionInfo({ title, description }: { title: string; description: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="p-1 rounded-full hover:bg-muted/50 transition-colors">
            <Info className="w-4 h-4 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Section definitions for navigation
const sectionDefinitions = {
  overview: { id: "overview", label: "Overview", icon: Eye, description: "Visibility status, AEO score, and overall sentiment for this analysis." },
  gapAnalysis: { id: "gap-analysis", label: "Gap Analysis", icon: BarChart3, description: "How well your content performs on key AI selection criteria (1-5 scale). Higher scores mean better optimization." },
  aiResponse: { id: "ai-response", label: "AI Response", icon: MessageSquare, description: "The actual response generated by the AI engine for this prompt. This is what users see." },
  competitorInsights: { id: "competitor-insights", label: "Competitor Insights", icon: Trophy, description: "Analysis of what top-ranking competitors are doing right that helps them appear in AI responses." },
  quickWins: { id: "quick-wins", label: "Quick Wins", icon: Zap, description: "Fast, high-impact actions you can take this week to improve your AI visibility." },
  actionItems: { id: "action-items", label: "Action Items", icon: ListChecks, description: "Prioritized recommendations to improve your brand's visibility in AI-generated responses." },
  citationAuthority: { id: "citation-authority", label: "Citation Authority", icon: Link2, description: "Analysis of the sources cited by AI, their authority scores, and whether your domain is among them." },
  sentiment: { id: "sentiment", label: "Sentiment Analysis", icon: HeartPulse, description: "Net Sentiment Score (NSS) measures how positively or negatively AI talks about your brand (-1 to +1 scale)." },
  hallucination: { id: "hallucination", label: "Hallucination Detection", icon: ShieldAlert, description: "Detects when AI generates inaccurate information about your brand (pricing, features, claims)." },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SimulationCard({ simulation, brandName, brandDomain, userTier }: { simulation: any; index?: number; brandName: string; brandDomain: string; userTier: string }) {
  const signals = simulation.selection_signals as SelectionSignals | null;
  const gapAnalysis = signals?.gap_analysis;
  const isArabic = simulation.language === 'ar';
  
  // Extract hallucination watchdog data (Pro feature)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hallucinationWatchdog = (signals as Record<string, unknown> | null)?.hallucination_watchdog as any;

  // Extract enhanced sentiment analysis data
  const sentimentAnalysis = signals?.sentiment_analysis as SentimentAnalysis | undefined;
  
  // Extract citation authorities - fall back to converting winning_sources if needed
  const rawCitationAuthorities = signals?.citation_authorities as CitationAuthority[] | undefined;
  
  // Convert winning_sources to CitationAuthority format if citationAuthorities is empty
  const citationAuthorities: CitationAuthority[] | undefined = rawCitationAuthorities && rawCitationAuthorities.length > 0 
    ? rawCitationAuthorities 
    : signals?.winning_sources && signals.winning_sources.length > 0
      ? signals.winning_sources.map(source => {
          let domain = source;
          try {
            domain = new URL(source).hostname.replace('www.', '');
          } catch {
            // Keep original if URL parsing fails
          }
          const isBrandDomain = domain.toLowerCase().includes(brandDomain.toLowerCase().replace('www.', '').split('.')[0]);
          return {
            domain,
            authority_score: getAuthorityScoreForDomain(domain),
            tier: getAuthorityTierForDomain(domain),
            source_type: getSourceTypeForDomain(domain),
            is_brand_domain: isBrandDomain,
          } as CitationAuthority;
        })
      : undefined;
  
  // Extract grounding metadata (Gemini search queries, Grok X posts, etc.)
  const groundingMetadata = signals?.grounding_metadata as GroundingMetadata | undefined;
  
  // Get region info
  const region = simulation.region as SupportedRegion || 'global';
  const regionInfo = getRegionInfo(region);

  // Calculate Net Sentiment Score from enhanced analysis
  const netSentimentScore = sentimentAnalysis?.polarity 
    ? Math.round((sentimentAnalysis.polarity + 1) * 50) // Convert -1 to 1 scale to 0-100
    : (signals?.sentiment === 'positive' ? 70 : signals?.sentiment === 'negative' ? 30 : 50);

  // Calculate overall AEO score
  const scores = gapAnalysis ? [
    gapAnalysis.structure_score || 0,
    gapAnalysis.data_density_score || 0,
    gapAnalysis.directness_score || 0,
    gapAnalysis.authority_score || 0,
    gapAnalysis.crawlability_score || 0,
  ].filter(s => s > 0) : [];
  
  const overallScore = scores.length > 0 
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 20)
    : 0;

  // Determine which sections are available
  const availableSections = [
    { ...sectionDefinitions.overview, available: true },
    { ...sectionDefinitions.gapAnalysis, available: !!gapAnalysis },
    { ...sectionDefinitions.aiResponse, available: true },
    { ...sectionDefinitions.competitorInsights, available: !!signals?.competitor_insights },
    { ...sectionDefinitions.quickWins, available: !!(signals?.quick_wins && signals.quick_wins.length > 0) },
    { ...sectionDefinitions.actionItems, available: !!(signals?.action_items && signals.action_items.length > 0) },
    { ...sectionDefinitions.citationAuthority, available: !!(citationAuthorities?.length || signals?.winning_sources?.length) },
    { ...sectionDefinitions.sentiment, available: true },
    { ...sectionDefinitions.hallucination, available: !!hallucinationWatchdog || userTier === 'pro' },
  ].filter(s => s.available);

  return (
    <div className="space-y-8" dir={isArabic ? "rtl" : "ltr"}>
      {/* Section Navigation Bar */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin">
          {availableSections.map((section, idx) => (
            <a
              key={section.id}
              href={`#${section.id}-${simulation.id}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted border border-transparent hover:border-border"
            >
              <section.icon className="w-3.5 h-3.5 text-muted-foreground" />
              {section.label}
              {idx < availableSections.length - 1 && (
                <ChevronRight className="w-3 h-3 text-muted-foreground/50 ml-1" />
              )}
            </a>
          ))}
        </div>
      </div>

      {/* ====== SECTION 1: OVERVIEW ====== */}
      <section id={`overview-${simulation.id}`} className="scroll-mt-20">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-semibold">Overview</h3>
          <SectionInfo 
            title="Overview" 
            description="Visibility status, AEO score, and overall sentiment for this analysis."
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Visibility Status */}
          <div className={`rounded-2xl border-2 p-5 ${simulation.is_visible 
            ? "border-green-500/40 bg-gradient-to-br from-green-500/15 via-green-500/5 to-transparent" 
            : "border-red-500/40 bg-gradient-to-br from-red-500/15 via-red-500/5 to-transparent"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Visibility</span>
              <SectionInfo title="Visibility" description="Whether your brand was mentioned in the AI response. Visible = brand appears in the answer." />
            </div>
            {simulation.is_visible ? (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <Eye className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <span className="text-xl font-bold text-green-500">Visible</span>
                  <p className="text-sm text-muted-foreground">{brandName} mentioned</p>
                  {regionInfo && regionInfo.id !== 'global' && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Globe className="w-3 h-3" />
                      {regionInfo.flag} {regionInfo.name}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                  <EyeOff className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <span className="text-xl font-bold text-red-500">Not Visible</span>
                  <p className="text-sm text-muted-foreground">{brandName} not mentioned</p>
                  {regionInfo && regionInfo.id !== 'global' && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Globe className="w-3 h-3" />
                      {regionInfo.flag} {regionInfo.name}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* AEO Score */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">AEO Score</span>
              <SectionInfo title="AEO Score" description="Answer Engine Optimization score (0-100). Measures how well your website content is optimized for AI engines." />
            </div>
            <div className="flex items-center justify-center">
              <VisibilityGauge value={overallScore} size="md" label="" />
            </div>
          </div>

          {/* Net Sentiment Score */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Net Sentiment Score</span>
              <SectionInfo title="Net Sentiment Score (NSS)" description="Measures sentiment on 0-100 scale. 50=Neutral, <40=Negative, >60=Positive. Shows how favorably AI talks about your brand." />
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                netSentimentScore >= 60 ? 'bg-green-500/20' :
                netSentimentScore < 40 ? 'bg-red-500/20' : 'bg-yellow-500/20'
              }`}>
                {netSentimentScore >= 60 && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                {netSentimentScore >= 40 && netSentimentScore < 60 && <AlertCircle className="w-5 h-5 text-yellow-500" />}
                {netSentimentScore < 40 && <AlertCircle className="w-5 h-5 text-red-500" />}
            </div>
            <div>
              <span className={`text-2xl font-bold ${
                netSentimentScore >= 60 ? 'text-green-500' 
                  : netSentimentScore >= 40 ? 'text-yellow-500' 
                  : 'text-red-500'
              }`}>
                {netSentimentScore}
              </span>
              <p className="text-sm text-muted-foreground capitalize">
                {netSentimentScore >= 60 ? 'Positive' : netSentimentScore >= 40 ? 'Neutral' : 'Negative'} tone
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Grounding Metadata Banner - Shows engine-specific data */}
      {groundingMetadata && (groundingMetadata.web_search_queries?.length || groundingMetadata.x_posts?.length) && (
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 p-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <div className="flex-1">
              {groundingMetadata.web_search_queries?.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Gemini searched:</span>
                  {groundingMetadata.web_search_queries.slice(0, 3).map((q, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                      &ldquo;{q}&rdquo;
                    </span>
                  ))}
                  {groundingMetadata.grounding_coverage && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {groundingMetadata.grounding_coverage}% grounded
                    </span>
                  )}
                </div>
              ) : groundingMetadata.x_posts?.length ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Grok used {groundingMetadata.x_posts.length} X posts</span>
                  <span className="text-xs text-muted-foreground">
                    from @{groundingMetadata.x_posts.slice(0, 2).map(p => p.author).join(", @")}
                  </span>
                </div>
              ) : null}
            </div>
            <SectionInfo title="Grounding Metadata" description="Shows what real-time sources the AI engine used to generate its response." />
          </div>
        </div>
      )}
      </section>

      {/* ====== SECTION 2: GAP ANALYSIS ====== */}
      {gapAnalysis && (
        <section id={`gap-analysis-${simulation.id}`} className="scroll-mt-20">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Gap Analysis</h2>
                  <p className="text-sm text-muted-foreground">How well your content performs on key AI selection criteria (1-5 scale)</p>
                </div>
              </div>
              <SectionInfo title="Gap Analysis" description="Measures 5 key factors AI engines use to select content: Structure (organized content), Data Density (facts & stats), Directness (answers quickly), Authority (citations & trust signals), Crawlability (AI can access)." />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <SignalScoreWithInfo 
                label="Structure" 
                value={gapAnalysis.structure_score || 0}
                description="Headers, lists, tables"
                tooltip="How well your content uses headers (H1-H6), bullet points, numbered lists, and tables. AI prefers structured, scannable content."
              />
              <SignalScoreWithInfo 
                label="Data Density" 
                value={gapAnalysis.data_density_score || 0}
                description="Stats, facts, proof"
                tooltip="Amount of concrete data points: statistics, numbers, dates, percentages. AI favors content with verifiable facts."
              />
              <SignalScoreWithInfo 
                label="Directness" 
                value={gapAnalysis.directness_score || 0}
                description="Answers immediately"
                tooltip="How quickly your content answers the query. AI prefers pages that provide the answer in the first paragraph."
              />
              <SignalScoreWithInfo 
                label="Authority" 
                value={gapAnalysis.authority_score || 0}
                description="Citations, E-E-A-T"
                tooltip="Trust signals: author credentials, citations to authoritative sources, reviews, awards. Demonstrates Experience, Expertise, Authoritativeness, Trustworthiness."
              />
              <SignalScoreWithInfo 
                label="Crawlability" 
                value={gapAnalysis.crawlability_score || 0}
                description="AI crawler access"
                tooltip="Whether AI crawlers can access your content. Check robots.txt allows GPTBot, Google-Extended, PerplexityBot, etc."
              />
            </div>

            {/* Recommendations from gap analysis */}
            {(gapAnalysis as { recommendations?: string[] }).recommendations && 
             (gapAnalysis as { recommendations?: string[] }).recommendations!.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-medium">Improvement Recommendations</h3>
                  <SectionInfo title="Recommendations" description="Specific actions to improve your scores based on the gap analysis." />
                </div>
                <ul className="space-y-2">
                  {(gapAnalysis as { recommendations?: string[] }).recommendations!.map((rec: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-primary mt-0.5">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ====== SECTION 3: AI RESPONSE ====== */}
      <section id={`ai-response-${simulation.id}`} className="scroll-mt-20">
        <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-transparent overflow-hidden">
          <div className="p-4 border-b border-primary/20 bg-primary/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  AI Response
                  <EngineBadge engine={simulation.engine as SupportedEngine} size="sm" showLabel={false} />
                </h2>
                <p className="text-sm text-muted-foreground">What the AI said about this query</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SectionInfo title="AI Response" description="The actual response generated by the AI engine. This is exactly what users see when they ask this question." />
              <CopyButtonClient text={simulation.ai_response_html?.replace(/<[^>]*>/g, '') || simulation.response_text || ''} />
            </div>
          </div>
          <div className="p-4 max-h-[400px] overflow-y-auto">
            <div 
              className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: simulation.ai_response_html || textToSafeHtml(simulation.response_text || "") }}
            />
          </div>
        </div>
      </section>

      {/* ====== SECTION 4: COMPETITOR INSIGHTS ====== */}
      {signals?.competitor_insights && (
        <section id={`competitor-insights-${simulation.id}`} className="scroll-mt-20">
          <div className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-6 h-6 text-amber-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-lg font-semibold">What Winners Are Doing</h2>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-xs font-medium">Competitive Intel</span>
                  <SectionInfo title="Competitor Insights" description="Analysis of what the sources that DO appear in AI responses are doing right. Learn from their strategies." />
                </div>
                <p className="text-muted-foreground leading-relaxed">{signals.competitor_insights}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ====== SECTION 5: QUICK WINS ====== */}
      {signals?.quick_wins && signals.quick_wins.length > 0 && (
        <section id={`quick-wins-${simulation.id}`} className="scroll-mt-20">
          <div className="rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Quick Wins</h2>
                  <p className="text-sm text-muted-foreground">Do these this week for fast results</p>
                </div>
              </div>
              <SectionInfo title="Quick Wins" description="High-impact, low-effort actions you can implement immediately. These typically show results within 1-2 weeks." />
            </div>
            <div className="grid gap-3">
              {signals.quick_wins.map((win, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-card/80 border border-green-500/20">
                  <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <p className="text-sm leading-relaxed">{win}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ====== SECTION 6: ACTION ITEMS ====== */}
      {signals?.action_items && signals.action_items.length > 0 && (
        <section id={`action-items-${simulation.id}`} className="scroll-mt-20">
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-5 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <ListChecks className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Actionable Recommendations</h2>
                  <p className="text-sm text-muted-foreground">Prioritized steps to improve your AI visibility</p>
                </div>
              </div>
              <SectionInfo title="Action Items" description="Comprehensive recommendations organized by priority. High priority items have the biggest impact on visibility." />
            </div>
            
            <div className="p-5 space-y-6">
              {(['high', 'medium', 'foundational', 'nice-to-have'] as const).map(priority => {
                const items = signals.action_items?.filter(item => item.priority === priority) || [];
                if (items.length === 0) return null;
                
                const config = priorityConfig[priority];
                const priorityLabels: Record<string, { label: string; description: string }> = {
                  high: { label: "High Priority", description: "Critical for visibility" },
                  medium: { label: "Medium Priority", description: "Important improvements" },
                  foundational: { label: "Foundational", description: "Build a strong base" },
                  "nice-to-have": { label: "Nice to Have", description: "Polish and refine" },
                };
                
                return (
                  <div key={priority}>
                    <div className={`flex items-center gap-2 mb-3 ${config.color}`}>
                      {config.icon}
                      <h3 className="font-semibold">{priorityLabels[priority].label}</h3>
                      <span className="text-sm text-muted-foreground font-normal">— {priorityLabels[priority].description}</span>
                    </div>
                    <div className="grid gap-3">
                      {items.map((item, i) => (
                        <ActionItemCard key={i} item={item} config={config} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ====== SECTION 7: CITATION AUTHORITY MAP ====== */}
      <section id={`citation-authority-${simulation.id}`} className="scroll-mt-20">
        {citationAuthorities && citationAuthorities.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Citation Authority Map</h3>
              <SectionInfo title="Citation Authority Map" description="Shows all sources the AI cited, their authority scores (0-100), and whether your domain was included. Higher authority sources are more trusted by AI." />
            </div>
            <CitationAuthorityPanel
              sources={citationAuthorities}
              brandDomain={brandDomain}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Citation Authority Map</h3>
              <SectionInfo title="Citation Authority Map" description="Shows all sources the AI cited, their authority scores (0-100), and whether your domain was included. Higher authority sources are more trusted by AI." />
            </div>
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted mx-auto mb-3 flex items-center justify-center">
                <Link2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-1">No Citations Found</h3>
              <p className="text-sm text-muted-foreground">This AI response didn&apos;t include external source citations.</p>
            </div>
          </div>
        )}
      </section>

      {/* ====== SECTION 8: SENTIMENT ANALYSIS ====== */}
      <section id={`sentiment-${simulation.id}`} className="scroll-mt-20">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Sentiment Analysis</h3>
            <SectionInfo title="Sentiment Analysis" description="Deep analysis of how AI talks about your brand. Includes polarity score, key phrases, concerns, and praises extracted from the response." />
          </div>
          <SentimentAnalysisCard
            data={sentimentAnalysis}
            simpleSentiment={signals?.sentiment}
            brandMentioned={simulation.is_visible}
          />
        </div>
      </section>

      {/* ====== SECTION 9: HALLUCINATION DETECTION (at bottom) ====== */}
      <section id={`hallucination-${simulation.id}`} className="scroll-mt-20">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Hallucination Detection</h3>
            <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">PRO</span>
            <SectionInfo title="Hallucination Detection" description="Detects when AI generates inaccurate information about your brand - wrong pricing, invented features, false claims. Uses your crawled website data as ground truth." />
          </div>
          <HallucinationWatchdogSection 
            data={hallucinationWatchdog} 
            userTier={userTier}
          />
        </div>
      </section>
    </div>
  );
}

function SignalScoreWithInfo({ label, value, description, tooltip }: { label: string; value: number; description: string; tooltip: string }) {
  const getColor = (v: number) => {
    if (v >= 4) return { text: "text-green-500", bg: "bg-green-500", ring: "ring-green-500/30" };
    if (v >= 3) return { text: "text-yellow-500", bg: "bg-yellow-500", ring: "ring-yellow-500/30" };
    if (v > 0) return { text: "text-red-500", bg: "bg-red-500", ring: "ring-red-500/30" };
    return { text: "text-muted-foreground", bg: "bg-muted", ring: "ring-muted" };
  };
  
  const colors = getColor(value);
  
  return (
    <div className={`text-center p-4 rounded-xl bg-muted/30 ring-1 ${colors.ring} relative`}>
      <div className="absolute top-2 right-2">
        <SectionInfo title={label} description={tooltip} />
      </div>
      <div className={`text-3xl font-bold ${colors.text}`}>{value || "—"}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      {value > 0 && (
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
          <div 
            className={`h-full rounded-full ${colors.bg} transition-all`}
            style={{ width: `${(value / 5) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ActionItemCard({ 
  item, 
  config, 
}: { 
  item: ActionItem; 
  config: { color: string; bg: string; border: string; icon: React.ReactNode };
}) {
  // Clean title (remove emoji prefix if present)
  const cleanTitle = item.title.replace(/^[⚡💡]\s*/, '');
  
  return (
    <div className={`rounded-xl border p-4 ${config.border} ${config.bg}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-background/60 ${config.color}`}>
          {categoryIcons[item.category] || <ListChecks className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            {/* Source badge - Actionable vs Suggestion */}
            {item.isActionable !== undefined && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                item.isActionable 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
              }`}>
                {item.isActionable ? (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Verified
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Tip
                  </>
                )}
              </span>
            )}
            <h4 className="font-semibold">{cleanTitle}</h4>
            <span className="px-2 py-0.5 rounded-full bg-background/60 text-xs capitalize text-muted-foreground">
              {item.category}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
          
          {item.steps && item.steps.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              {item.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-background/60 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
