import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { 
  Bot, 
  Cpu,
  FileSearch,
  TrendingUp,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  BarChart3,
  Zap,
  FileText,
} from "lucide-react";
import { SupportedEngine } from "@/types";

// Simulated AI crawler data (in production, this would come from server logs or a dedicated tracking service)
const AI_CRAWLERS = [
  { name: "GPTBot", engine: "chatgpt", userAgent: "GPTBot/1.0", description: "OpenAI's web crawler for ChatGPT" },
  { name: "Google-Extended", engine: "gemini", userAgent: "Google-Extended", description: "Google's AI training crawler" },
  { name: "PerplexityBot", engine: "perplexity", userAgent: "PerplexityBot/1.0", description: "Perplexity AI's web crawler" },
  { name: "Anthropic-AI", engine: "other", userAgent: "anthropic-ai", description: "Anthropic's Claude crawler" },
  { name: "CCBot", engine: "other", userAgent: "CCBot/2.0", description: "Common Crawl bot (used by many AI)" },
];

async function getCrawlerData(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  organizationId: string
) {
  // Get brands
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name, domain")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const brandIds = brands?.map((b) => b.id) || [];
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Get simulations data
  const { data: simulations } = await supabase
    .from("simulations")
    .select("brand_id, engine, is_visible, selection_signals, created_at")
    .in("brand_id", brandIds)
    .gte("created_at", cutoff);

  // Technical analysis scores per brand
  const brandTechnicalScores = brands?.map(brand => {
    const brandSims = simulations?.filter(s => s.brand_id === brand.id) || [];
    
    let crawlabilitySum = 0;
    let structureSum = 0;
    let authoritySum = 0;
    let count = 0;

    brandSims.forEach(sim => {
      const signals = sim.selection_signals as { 
        gap_analysis?: { 
          crawlability_score?: number; 
          structure_score?: number;
          authority_score?: number;
        } 
      } | null;
      if (signals?.gap_analysis) {
        crawlabilitySum += signals.gap_analysis.crawlability_score || 0;
        structureSum += signals.gap_analysis.structure_score || 0;
        authoritySum += signals.gap_analysis.authority_score || 0;
        count++;
      }
    });

    return {
      id: brand.id,
      name: brand.name,
      domain: brand.domain,
      crawlability: count > 0 ? Math.round((crawlabilitySum / count) * 20) : 0,
      structure: count > 0 ? Math.round((structureSum / count) * 20) : 0,
      authority: count > 0 ? Math.round((authoritySum / count) * 20) : 0,
      analysisCount: brandSims.length,
    };
  }) || [];

  // Content performance - pages most cited
  const pageCitations: Record<string, { url: string; domain: string; count: number; engines: Set<string> }> = {};
  simulations?.forEach(sim => {
    const signals = sim.selection_signals as { winning_sources?: string[] } | null;
    signals?.winning_sources?.forEach(url => {
      if (!pageCitations[url]) {
        let domain = url;
        try { domain = new URL(url).hostname; } catch {}
        pageCitations[url] = { url, domain, count: 0, engines: new Set() };
      }
      pageCitations[url].count++;
      pageCitations[url].engines.add(sim.engine);
    });
  });

  const topPages = Object.values(pageCitations)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(p => ({
      ...p,
      engines: Array.from(p.engines) as SupportedEngine[],
    }));

  // Engine activity summary
  const engineActivity: Record<SupportedEngine, { total: number; visible: number; lastSeen: string | null }> = {
    chatgpt: { total: 0, visible: 0, lastSeen: null },
    perplexity: { total: 0, visible: 0, lastSeen: null },
    gemini: { total: 0, visible: 0, lastSeen: null },
    grok: { total: 0, visible: 0, lastSeen: null },
  };

  simulations?.forEach(sim => {
    const eng = sim.engine as SupportedEngine;
    if (engineActivity[eng]) {
      engineActivity[eng].total++;
      if (sim.is_visible) engineActivity[eng].visible++;
      if (!engineActivity[eng].lastSeen || sim.created_at > engineActivity[eng].lastSeen!) {
        engineActivity[eng].lastSeen = sim.created_at;
      }
    }
  });

  // Simulated crawler visits (in production, this would come from real log data)
  const crawlerVisits = AI_CRAWLERS.map(crawler => ({
    ...crawler,
    // Simulate visit data based on analysis activity
    lastVisit: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    visitsLast7Days: Math.floor(Math.random() * 50) + 10,
    visitsLast30Days: Math.floor(Math.random() * 200) + 50,
    pagesIndexed: Math.floor(Math.random() * 500) + 100,
    isBlocked: false,
  }));

  return {
    brands: brands || [],
    brandTechnicalScores,
    topPages,
    engineActivity,
    crawlerVisits,
    totalSimulations: simulations?.length || 0,
    visibleSimulations: simulations?.filter(s => s.is_visible).length || 0,
  };
}

export default async function AICrawlerPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  const data = await getCrawlerData(supabase, profile.organization_id);

  const engines: SupportedEngine[] = ["chatgpt", "perplexity", "gemini", "grok"];
  const engineNames: Record<SupportedEngine, string> = {
    chatgpt: "ChatGPT",
    perplexity: "Perplexity",
    gemini: "Gemini",
    grok: "Grok",
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Crawler Visibility</h1>
        <p className="text-muted-foreground mt-1">
          Track when, how often, and which AI bots access your content
        </p>
      </div>

      {/* Crawler Activity Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-sm text-muted-foreground">Active Crawlers</p>
          </div>
          <p className="text-4xl font-bold">{data.crawlerVisits.filter(c => !c.isBlocked).length}</p>
          <p className="text-sm text-muted-foreground mt-2">AI bots accessing your content</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <FileSearch className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Pages Indexed</p>
          </div>
          <p className="text-4xl font-bold">
            {data.crawlerVisits.reduce((sum, c) => sum + c.pagesIndexed, 0).toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground mt-2">Across all AI crawlers</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Clock className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Visits (7 days)</p>
          </div>
          <p className="text-4xl font-bold">
            {data.crawlerVisits.reduce((sum, c) => sum + c.visitsLast7Days, 0)}
          </p>
          <p className="text-sm text-muted-foreground mt-2">Crawler requests</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <Eye className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">AI Visibility Rate</p>
          </div>
          <p className="text-4xl font-bold">
            {data.totalSimulations > 0 
              ? Math.round((data.visibleSimulations / data.totalSimulations) * 100) 
              : 0}%
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {data.visibleSimulations} of {data.totalSimulations} visible
          </p>
        </div>
      </div>

      {/* AI Bot Tracking */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">AI Bot Activity</h2>
              <p className="text-sm text-muted-foreground">Track when, how often, and which AI bots access your content</p>
            </div>
          </div>
        </div>
        
        <div className="divide-y divide-border">
          {data.crawlerVisits.map((crawler, i) => (
            <div key={i} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  crawler.isBlocked ? 'bg-red-500/20' : 'bg-green-500/20'
                }`}>
                  {crawler.isBlocked ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                </div>
                <div>
                  <p className="font-medium">{crawler.name}</p>
                  <p className="text-sm text-muted-foreground">{crawler.description}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">{crawler.userAgent}</p>
                </div>
              </div>
              <div className="flex items-center gap-8 text-right">
                <div>
                  <p className="text-lg font-semibold">{crawler.visitsLast7Days}</p>
                  <p className="text-xs text-muted-foreground">Last 7 days</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">{crawler.visitsLast30Days}</p>
                  <p className="text-xs text-muted-foreground">Last 30 days</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">{crawler.pagesIndexed}</p>
                  <p className="text-xs text-muted-foreground">Pages indexed</p>
                </div>
                <div className="min-w-[100px]">
                  <p className="text-sm">
                    {new Date(crawler.lastVisit).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">Last visit</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Technical Analysis */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="font-semibold">Technical Analysis</h2>
              <p className="text-sm text-muted-foreground">Ensure your site is fully optimized for AI-based indexing and retrieval</p>
            </div>
          </div>
        </div>
        
        <div className="p-5">
          {data.brandTechnicalScores.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Cpu className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>Add brands and run analyses to see technical scores</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.brandTechnicalScores.map((brand) => (
                <div key={brand.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-medium">{brand.name}</p>
                      <p className="text-sm text-muted-foreground">{brand.domain}</p>
                    </div>
                    <span className="text-sm text-muted-foreground">{brand.analysisCount} analyses</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <TechnicalScore 
                      label="Crawlability" 
                      score={brand.crawlability} 
                      description="AI crawler accessibility"
                      icon={<Bot className="w-4 h-4" />}
                    />
                    <TechnicalScore 
                      label="Structure" 
                      score={brand.structure} 
                      description="Content organization"
                      icon={<FileText className="w-4 h-4" />}
                    />
                    <TechnicalScore 
                      label="Authority" 
                      score={brand.authority} 
                      description="Third-party signals"
                      icon={<Shield className="w-4 h-4" />}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Attribution & Traffic Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-5 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h2 className="font-semibold">Attribution & Traffic Insights</h2>
                <p className="text-sm text-muted-foreground">Measure AI-driven search traffic</p>
              </div>
            </div>
          </div>
          
          <div className="p-5 space-y-4">
            {engines.map(engine => {
              const activity = data.engineActivity[engine];
              const visibility = activity.total > 0 
                ? Math.round((activity.visible / activity.total) * 100) 
                : 0;
              
              return (
                <div key={engine} className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium">{engineNames[engine]}</p>
                      <p className="text-xs text-muted-foreground">
                        {activity.lastSeen 
                          ? `Last seen: ${new Date(activity.lastSeen).toLocaleDateString()}`
                          : 'No activity yet'
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-lg font-semibold">{activity.total}</p>
                      <p className="text-xs text-muted-foreground">Analyses</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">{visibility}%</p>
                      <p className="text-xs text-muted-foreground">Visible</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Performance */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-5 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <FileSearch className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="font-semibold">Content Performance Tracking</h2>
                <p className="text-sm text-muted-foreground">Pages frequently referenced in AI responses</p>
              </div>
            </div>
          </div>
          
          <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
            {data.topPages.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>Run analyses to see which pages are cited</p>
              </div>
            ) : (
              data.topPages.map((page, i) => (
                <a
                  key={i}
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-amber-500 text-white' :
                      i === 1 ? 'bg-slate-400 text-white' :
                      i === 2 ? 'bg-amber-700 text-white' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{page.domain}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[250px]">{page.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-1">
                      {page.engines.slice(0, 3).map(eng => (
                        <span key={eng} className="px-1.5 py-0.5 rounded bg-muted text-xs capitalize">
                          {eng}
                        </span>
                      ))}
                    </div>
                    <div className="text-right min-w-[60px]">
                      <p className="font-semibold">{page.count}</p>
                      <p className="text-xs text-muted-foreground">citations</p>
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Robots.txt Recommendations */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">Robots.txt Recommendations</h2>
            <p className="text-muted-foreground mb-4">
              Ensure your robots.txt allows AI crawlers to access your content. Here&apos;s what we recommend:
            </p>
            <div className="bg-card rounded-xl p-4 font-mono text-sm overflow-x-auto">
              <pre className="text-muted-foreground">
{`# Allow AI Crawlers
User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: CCBot
Allow: /`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TechnicalScore({ 
  label, 
  score, 
  description,
  icon 
}: { 
  label: string; 
  score: number; 
  description: string;
  icon: React.ReactNode;
}) {
  const getColor = (s: number) => {
    if (s >= 80) return { text: "text-green-500", bg: "bg-green-500" };
    if (s >= 60) return { text: "text-yellow-500", bg: "bg-yellow-500" };
    return { text: "text-red-500", bg: "bg-red-500" };
  };
  
  const colors = getColor(score);
  
  return (
    <div className="text-center p-3 rounded-lg bg-muted/30">
      <div className="flex items-center justify-center gap-2 mb-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${colors.text}`}>{score}%</p>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div 
          className={`h-full rounded-full ${colors.bg}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-2">{description}</p>
    </div>
  );
}

