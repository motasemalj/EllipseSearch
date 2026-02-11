import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Zap,
  Target,
  TrendingUp,
  BarChart3,
  ListChecks,
  Globe,
  FileText,
  Users,
  Shield,
  Clock,
  MessageSquare,
  Trophy,
  Sparkles,
  Award,
} from "lucide-react";
import { EngineBadge } from "@/components/ui/engine-badge";
import { VisibilityGauge } from "@/components/ui/visibility-gauge";
import { HallucinationWatchdogSection } from "@/components/brands/hallucination-watchdog-section";
import { SentimentAnalysisCard } from "@/components/brands/sentiment-analysis-card";
import { CitationAuthorityPanel } from "@/components/brands/citation-authority-panel";
import { HighlightedHtml } from "@/components/ui/highlighted-html";
import { 
  SupportedEngine, 
  SelectionSignals, 
  ActionItem, 
  SupportedRegion, 
  getRegionInfo, 
  SentimentAnalysis, 
  CitationAuthority, 
  GroundingMetadata,
  EnsembleSimulationData,
  EnsembleVarianceMetrics,
  PRESENCE_LEVEL_LABELS,
  PRESENCE_LEVEL_DESCRIPTIONS,
  PRESENCE_LEVEL_COLORS,
  BrandPresenceLevel,
} from "@/types";
import { SimulationNavBar } from "./simulation-nav-bar";

interface SimulationPageProps {
  params: { brandId: string; keywordSetId: string; batchId: string; simulationId: string };
}

export default async function SimulationPage({ params }: SimulationPageProps) {
  const { brandId, keywordSetId, batchId, simulationId } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  // Get organization for tier info
  const { data: org } = await supabase
    .from("organizations")
    .select("tier")
    .eq("id", profile.organization_id)
    .single();

  const userTier = org?.tier || "free";

  // Get brand
  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!brand) notFound();

  // Get simulation with keyword
  const { data: simulation } = await supabase
    .from("simulations")
    .select("*, keywords(text)")
    .eq("id", simulationId)
    .single();

  if (!simulation) notFound();

  const keyword = simulation.keywords as { text: string } | null;
  const signals = simulation.selection_signals as SelectionSignals | null;
  // Extract hallucination watchdog data (Pro feature) - cast to any for flexibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hallucinationWatchdog = (signals as Record<string, unknown> | null)?.hallucination_watchdog as any;
  const isArabic = simulation.language === 'ar';
  
  // Extract new enhanced data
  const sentimentAnalysis = (simulation.sentiment_analysis || signals?.sentiment_analysis) as SentimentAnalysis | null;
  const rawNetSentimentScore = simulation.net_sentiment_score as number | null;
  // Convert legacy -1 to +1 format to 0-100 scale if needed
  const netSentimentScore = rawNetSentimentScore !== null
    ? (rawNetSentimentScore >= -1 && rawNetSentimentScore <= 1
        ? Math.round(((rawNetSentimentScore + 1) / 2) * 100)
        : Math.round(rawNetSentimentScore))
    : null;
  const citationAuthorities = (simulation.citation_authorities || signals?.citation_authorities) as CitationAuthority[] | null;
  const groundingMetadata = (simulation.grounding_metadata || signals?.grounding_metadata) as GroundingMetadata | null;
  
  // Extract ensemble and statistical data
  const ensembleData = signals?.ensemble_data as EnsembleSimulationData | null;
  const varianceMetrics = ensembleData?.variance_metrics as EnsembleVarianceMetrics | undefined;
  const presenceLevel = (signals?.presence_level || "likely_absent") as BrandPresenceLevel;
  const visibilityFrequency = signals?.visibility_frequency as number | undefined;

  // Calculate overall AEO score
  const gapAnalysis = signals?.gap_analysis;
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

  // Determine which sections exist for navigation
  const hasWatchdog = true; // Always show
  const hasAIResponse = !!simulation.ai_response_html;
  const hasCompetitorInsights = !!signals?.competitor_insights;
  const hasQuickWins = !!(signals?.quick_wins && signals.quick_wins.length > 0);
  const hasActionItems = !!(signals?.action_items && signals.action_items.length > 0);
  const hasSignals = !!gapAnalysis;
  const hasSources = !!(signals?.winning_sources && signals.winning_sources.length > 0);

  return (
    <div className="space-y-8" dir={isArabic ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href={`/brands/${brandId}/keyword-sets/${keywordSetId}/batches/${batchId}`}>
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="text-sm text-muted-foreground mb-1">
              <Link href={`/brands/${brandId}`} className="hover:text-foreground">
                {brand.name}
              </Link>
              <span className="mx-2">/</span>
              <span>Analysis Result</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{keyword?.text || simulation.prompt_text}</h1>
            <div className="flex items-center gap-3 mt-2">
              <EngineBadge engine={simulation.engine as SupportedEngine} size="md" />
              <span className="px-2.5 py-1 rounded-full bg-muted text-xs font-medium">
                {simulation.language?.toUpperCase() || "EN"}
              </span>
              {(() => {
                const regionInfo = getRegionInfo((simulation.region || 'global') as SupportedRegion);
                return simulation.region && simulation.region !== 'global' ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs font-medium">
                    <Globe className="w-3 h-3" />
                    {regionInfo.flag} {regionInfo.name}
                  </span>
                ) : null;
              })()}
              <span className="text-sm text-muted-foreground">
                {new Date(simulation.created_at).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric', 
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Bar */}
      <SimulationNavBar 
        hasWatchdog={hasWatchdog}
        hasAIResponse={hasAIResponse}
        hasCompetitorInsights={hasCompetitorInsights}
        hasQuickWins={hasQuickWins}
        hasActionItems={hasActionItems}
        hasSignals={hasSignals}
        hasSources={hasSources}
      />

      {/* Hero Stats Row */}
      <div id="stats" className="grid grid-cols-1 md:grid-cols-3 gap-4 scroll-mt-20">
        {/* Visibility Status */}
        <div className={`rounded-2xl border-2 p-6 transition-all ${simulation.is_visible 
          ? "border-green-500/40 bg-gradient-to-br from-green-500/15 via-green-500/5 to-transparent" 
          : "border-red-500/40 bg-gradient-to-br from-red-500/15 via-red-500/5 to-transparent"
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Visibility Status</p>
              {simulation.is_visible ? (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <Eye className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-green-500">Visible</span>
                    <p className="text-sm text-muted-foreground">Brand mentioned</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                    <EyeOff className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-red-500">Not Visible</span>
                    <p className="text-sm text-muted-foreground">Brand not mentioned</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AEO Score */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/20 p-6 flex items-center justify-center">
          <VisibilityGauge value={overallScore} size="lg" label="AEO Score" />
        </div>

        {/* Net Sentiment Score - Shows "No brand mention" when brand not visible */}
        <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/20 p-6">
          <p className="text-sm text-muted-foreground mb-3">Net Sentiment Score</p>
          {simulation.is_visible ? (
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                (netSentimentScore ?? 50) >= 60 ? 'bg-green-500/20' :
                (netSentimentScore ?? 50) <= 40 ? 'bg-red-500/20' : 'bg-yellow-500/20'
              }`}>
                {(netSentimentScore ?? 50) >= 60 && <CheckCircle2 className="w-6 h-6 text-green-500" />}
                {(netSentimentScore ?? 50) > 40 && (netSentimentScore ?? 50) < 60 && <AlertCircle className="w-6 h-6 text-yellow-500" />}
                {(netSentimentScore ?? 50) <= 40 && <AlertCircle className="w-6 h-6 text-red-500" />}
              </div>
              <div>
                <span className={`text-2xl font-bold ${
                  (netSentimentScore ?? 50) >= 60 ? 'text-green-500' :
                  (netSentimentScore ?? 50) <= 40 ? 'text-red-500' : 'text-yellow-500'
                }`}>
                  {netSentimentScore ?? "—"}
                </span>
                <p className="text-sm text-muted-foreground capitalize">
                  {signals?.sentiment || "Unknown"} tone
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-muted">
                <MessageSquare className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <span className="text-2xl font-bold text-muted-foreground">—</span>
                <p className="text-sm text-muted-foreground">No brand mention</p>
              </div>
            </div>
          )}
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
          </div>
        </div>
      )}

      {/* Ensemble Statistics & Statistical Significance - Shows when ensemble was used */}
      {ensembleData && ensembleData.enabled && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Ensemble Analysis</h2>
                <p className="text-sm text-muted-foreground">
                  Based on {ensembleData.successful_runs} of {ensembleData.run_count} simulations
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 space-y-4">
            {/* Presence Level */}
            <div className={`p-4 rounded-xl border ${PRESENCE_LEVEL_COLORS[presenceLevel]}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{PRESENCE_LEVEL_LABELS[presenceLevel]}</span>
                {typeof visibilityFrequency === 'number' && (
                  <span className="text-lg font-bold">
                    {Math.round(visibilityFrequency * 100)}%
                  </span>
                )}
              </div>
              <p className="text-sm opacity-80">
                {PRESENCE_LEVEL_DESCRIPTIONS[presenceLevel]}
              </p>
            </div>

            {/* Statistical Metrics - Only shown when variance metrics are available */}
            {varianceMetrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Confidence Interval */}
                {varianceMetrics.confidence_interval && (
                  <div className="p-3 rounded-xl bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">95% Confidence Interval</p>
                    <p className="font-semibold">
                      {Math.round(varianceMetrics.confidence_interval.lower_bound * 100)}% - {Math.round(varianceMetrics.confidence_interval.upper_bound * 100)}%
                    </p>
                  </div>
                )}
                
                {/* Statistical Significance */}
                <div className="p-3 rounded-xl bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">Statistical Significance</p>
                  <p className={`font-semibold ${varianceMetrics.statistical_significance ? 'text-green-500' : 'text-yellow-500'}`}>
                    {varianceMetrics.statistical_significance ? 'Yes ✓' : 'Not Significant'}
                  </p>
                </div>
                
                {/* P-Value */}
                {typeof varianceMetrics.p_value === 'number' && (
                  <div className="p-3 rounded-xl bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">P-Value</p>
                    <p className="font-semibold">
                      {varianceMetrics.p_value < 0.001 ? '< 0.001' : varianceMetrics.p_value.toFixed(3)}
                    </p>
                  </div>
                )}
                
                {/* Standard Error */}
                {typeof varianceMetrics.standard_error === 'number' && (
                  <div className="p-3 rounded-xl bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Standard Error</p>
                    <p className="font-semibold">±{(varianceMetrics.standard_error * 100).toFixed(1)}%</p>
                  </div>
                )}
              </div>
            )}

            {/* Brand Variance */}
            {typeof ensembleData.brand_variance === 'number' && ensembleData.brand_variance > 0 && (
              <div className="p-3 rounded-xl bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Brand Detection Variance</span>
                  <span className={`text-sm font-semibold ${
                    ensembleData.brand_variance < 0.2 ? 'text-green-500' :
                    ensembleData.brand_variance < 0.4 ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {Math.round(ensembleData.brand_variance * 100)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      ensembleData.brand_variance < 0.2 ? 'bg-green-500' :
                      ensembleData.brand_variance < 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(ensembleData.brand_variance * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {ensembleData.brand_variance < 0.2 ? 'Low variance - results are consistent across runs' :
                   ensembleData.brand_variance < 0.4 ? 'Moderate variance - some inconsistency in results' :
                   'High variance - results vary significantly between runs'}
                </p>
              </div>
            )}

            {/* Notes/Warnings */}
            {ensembleData.notes && ensembleData.notes.length > 0 && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">
                    {ensembleData.notes.map((note, i) => (
                      <p key={i}>{note}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hallucination Watchdog Section - PRO FEATURE */}
      <HallucinationWatchdogSection 
        data={hallucinationWatchdog} 
        brandId={brandId}
        userTier={userTier}
      />

      {/* AI Response - FIRST AND PROMINENT */}
      <div id="response" className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-transparent overflow-hidden scroll-mt-20">
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
          <CopyButtonClient text={simulation.ai_response_html?.replace(/<[^>]*>/g, '') || ''} />
        </div>
        <div 
          className="p-4 max-h-[400px] overflow-y-auto bg-gradient-to-b from-transparent to-muted/10"
          dir={isArabic ? "rtl" : "ltr"}
        >
          {(() => {
            const brandDomain = (brand.domain as string) || "";
            const brandCore = brandDomain.replace(/^www\./, "").split(".")[0];
            // Always provide brand terms; HighlightedHtml will only mark matches if present.
            const terms = [
              brand.name as string,
              brandDomain,
              brandCore,
              ...(((brand.brand_aliases as string[]) || []).slice(0, 10)),
              ...((((signals as unknown as { brand_mentions?: string[] } | null)?.brand_mentions) || []).slice(0, 10)),
            ];

            return (
              <HighlightedHtml
                className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed prose-p:my-2 prose-p:text-foreground prose-strong:font-semibold prose-strong:text-foreground prose-em:text-foreground/90 prose-code:text-xs prose-code:font-mono prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-a:text-primary prose-a:underline hover:prose-a:text-primary/80 prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2 prose-h4:text-base prose-h4:font-semibold prose-h4:mt-3 prose-h4:mb-1 prose-h5:text-sm prose-h5:font-semibold prose-h6:text-sm prose-h6:font-semibold"
                html={simulation.ai_response_html || "<p class='text-muted-foreground'>No response recorded</p>"}
                terms={terms}
              />
            );
          })()}
        </div>
      </div>

      {/* What Winners Are Doing - PROMINENT */}
      {signals?.competitor_insights && (
        <div id="competitors" className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-6 scroll-mt-20">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <Trophy className="w-6 h-6 text-amber-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                What Winners Are Doing
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-xs font-medium">Competitive Intel</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed">{signals.competitor_insights}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Wins */}
      {signals?.quick_wins && signals.quick_wins.length > 0 && (
        <div id="quickwins" className="rounded-2xl border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent p-6 scroll-mt-20">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Quick Wins</h2>
              <p className="text-sm text-muted-foreground">Do these this week for fast results</p>
            </div>
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
      )}

      {/* Actionable Recommendations - PROMINENT */}
      {signals?.action_items && signals.action_items.length > 0 && (
        <div id="actions" className="rounded-2xl border border-border bg-card overflow-hidden scroll-mt-20">
          <div className="p-5 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <ListChecks className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Actionable Recommendations</h2>
                <p className="text-sm text-muted-foreground">Prioritized steps to improve your AI visibility</p>
              </div>
            </div>
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
                      <ActionItemCard key={i} item={item} config={config} categoryIcons={categoryIcons} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selection Signals */}
      <div id="signals" className="rounded-2xl border border-border bg-card p-6 scroll-mt-20">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Selection Signals</h2>
            <p className="text-sm text-muted-foreground">How well your content performs on key AI selection criteria (1-5 scale)</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <SignalScore 
            label="Structure" 
            value={gapAnalysis?.structure_score || 0}
            description="Headers, lists, tables"
          />
          <SignalScore 
            label="Data Density" 
            value={gapAnalysis?.data_density_score || 0}
            description="Stats, facts, proof"
          />
          <SignalScore 
            label="Directness" 
            value={gapAnalysis?.directness_score || 0}
            description="Answers immediately"
          />
          <SignalScore 
            label="Authority" 
            value={gapAnalysis?.authority_score || 0}
            description="Citations, E-E-A-T"
          />
          <SignalScore 
            label="Crawlability" 
            value={gapAnalysis?.crawlability_score || 0}
            description="AI crawler access"
          />
        </div>
      </div>

      {/* Citation Authority Panel - NEW ENHANCED VERSION */}
      {citationAuthorities && citationAuthorities.length > 0 ? (
        <div id="sources" className="scroll-mt-20">
          <CitationAuthorityPanel
            sources={citationAuthorities}
            brandDomain={brand.domain}
          />
        </div>
      ) : signals?.winning_sources && signals.winning_sources.length > 0 && (
        <div id="sources" className="rounded-2xl border border-border bg-card p-6 scroll-mt-20">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Award className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Sources Cited by AI</h2>
              <p className="text-sm text-muted-foreground">Study what makes these sources successful</p>
            </div>
          </div>
          <div className="grid gap-2">
            {signals.winning_sources.map((source, i) => {
              let domain = source;
              try {
                domain = new URL(source).hostname;
              } catch {}
              return (
                <a 
                  key={i}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-all hover:scale-[1.01] group border border-transparent hover:border-border"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="font-medium">{domain}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Enhanced Sentiment Analysis Card */}
      <SentimentAnalysisCard
        data={sentimentAnalysis}
        simpleSentiment={signals?.sentiment}
        brandMentioned={signals?.is_visible ?? simulation.is_visible}
      />
    </div>
  );
}

function SignalScore({ label, value, description }: { label: string; value: number; description: string }) {
  const getColor = (v: number) => {
    if (v >= 4) return { text: "text-green-500", bg: "bg-green-500", ring: "ring-green-500/30" };
    if (v >= 3) return { text: "text-yellow-500", bg: "bg-yellow-500", ring: "ring-yellow-500/30" };
    if (v > 0) return { text: "text-red-500", bg: "bg-red-500", ring: "ring-red-500/30" };
    return { text: "text-muted-foreground", bg: "bg-muted", ring: "ring-muted" };
  };
  
  const colors = getColor(value);
  
  return (
    <div className={`text-center p-4 rounded-xl bg-muted/30 ring-1 ${colors.ring}`}>
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
  categoryIcons 
}: { 
  item: ActionItem; 
  config: { color: string; bg: string; border: string; icon: React.ReactNode };
  categoryIcons: Record<string, React.ReactNode>;
}) {
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
            <h4 className="font-semibold">{item.title}</h4>
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

import { CopyButtonClient } from "@/components/ui/copy-button";
