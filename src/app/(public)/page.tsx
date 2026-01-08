import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  BarChart3,
  Eye,
  Globe,
  Languages,
  Lightbulb,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
  ShieldAlert,
  Crown,
  AlertTriangle,
  DollarSign,
  Box,
} from "lucide-react";

const engines = [
  { name: "ChatGPT", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { name: "Perplexity", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { name: "Gemini", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { name: "Grok", color: "bg-neutral-500/20 text-neutral-300 border-neutral-500/30" },
];

const features = [
  {
    icon: Eye,
    title: "AI Visibility Tracking",
    description:
      "See exactly when and how AI engines mention your clients. Track visibility across ChatGPT, Perplexity, Gemini, and Grok.",
  },
  {
    icon: Lightbulb,
    title: "Selection Signal Analysis",
    description:
      "Understand WHY AI chose competitors over your client. Get specific signals like structure, data density, and directness.",
  },
  {
    icon: Target,
    title: "Gap Analysis",
    description:
      "Compare your client's content against winning sources. See exactly what's missing and why it matters.",
  },
  {
    icon: Sparkles,
    title: "Actionable Recommendations",
    description:
      "Get specific, technical fixes for each prompt. Transform insights into content improvements that work.",
  },
  {
    icon: Languages,
    title: "Arabic + English Support",
    description:
      "Full RTL support for Arabic content. Track prompts in both languages for complete GCC market coverage.",
  },
  {
    icon: BarChart3,
    title: "Agency Dashboard",
    description:
      "Multi-tenant design built for agencies. Manage all your clients' AI visibility from one powerful dashboard.",
  },
];

// Example hallucinations for the demo
const hallucinationExamples = [
  {
    type: "Pricing",
    icon: DollarSign,
    aiSaid: "Emaar Properties offers apartments starting at $150,000",
    reality: "Actual starting price is $280,000 based on current listings",
    impact: "Lost leads from budget-conscious buyers who never inquire",
  },
  {
    type: "Feature",
    icon: Box,
    aiSaid: "The app includes a built-in video editor",
    reality: "Video editing is a premium add-on, not included in base product",
    impact: "User disappointment and support tickets",
  },
  {
    type: "Availability",
    icon: AlertTriangle,
    aiSaid: "Currently not available in the UAE market",
    reality: "Launched in UAE in January 2025 with full support",
    impact: "Missing entire market due to outdated AI information",
  },
];

const steps = [
  {
    number: "01",
    title: "Add Your Brands",
    description:
      "Set up your client brands with their domains, prompts, and target languages.",
  },
  {
    number: "02",
    title: "Run Simulations",
    description:
      "We query AI engines with your prompts and analyze how they respond—who they cite and why.",
  },
  {
    number: "03",
    title: "Get Insights",
    description:
      "See gap analysis, selection signals, and specific recommendations to improve AI visibility.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/60 bg-card/50 backdrop-blur mb-8 fade-in">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-sm font-medium">
                Now tracking AI selection across 4 major engines
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 fade-in stagger-1">
              See How AI Engines{" "}
              <span className="text-primary">Select</span> Your Clients
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-8 fade-in stagger-2">
              Track and optimize how{" "}
              <span className="text-foreground font-medium">ChatGPT</span>,{" "}
              <span className="text-foreground font-medium">Perplexity</span>,{" "}
              <span className="text-foreground font-medium">Gemini</span>, and{" "}
              <span className="text-foreground font-medium">Grok</span> cite
              and recommend your clients&apos; brands.
            </p>

            {/* Engine Badges */}
            <div className="flex flex-wrap justify-center gap-2 mb-10 fade-in stagger-3">
              {engines.map((engine) => (
                <Badge
                  key={engine.name}
                  variant="outline"
                  className={`${engine.color} px-4 py-1.5`}
                >
                  {engine.name}
                </Badge>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center fade-in stagger-4">
              <Button size="lg" asChild className="text-lg px-8 shine">
                <Link href="/signup">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-lg px-8">
                <Link href="#how-it-works">See How It Works</Link>
              </Button>
            </div>

            {/* Social Proof */}
            <p className="mt-10 text-sm text-muted-foreground fade-in stagger-5">
              Built for digital agencies in Dubai & the GCC region
            </p>
          </div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="py-20 bg-card/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <Badge variant="outline" className="mb-4">The Problem</Badge>
                <h2 className="text-3xl font-bold mb-4">
                  Traditional SEO Doesn&apos;t Track AI
                </h2>
                <p className="text-muted-foreground text-lg">
                  Your clients rank #1 on Google, but when customers ask ChatGPT
                  or Perplexity, they recommend competitors. You have no
                  visibility into this new channel—until now.
                </p>
              </div>
              <div>
                <Badge variant="outline" className="mb-4 border-primary text-primary">
                  The Solution
                </Badge>
                <h2 className="text-3xl font-bold mb-4">
                  AI Selection Intelligence
                </h2>
                <p className="text-muted-foreground text-lg">
                  We simulate real queries across all major AI engines, analyze
                  why they select certain sources, and give you specific fixes
                  to help your clients get chosen.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">Features</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need for AI Visibility
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Purpose-built tools for agencies who want to sell AI visibility
              services to their clients.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors"
              >
                <CardContent className="pt-6">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Hallucination Watchdog Section - FEATURED */}
      <section id="watchdog" className="py-24 bg-gradient-to-br from-sky-950/20 via-background to-cyan-950/10 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-sky-500/20 to-cyan-500/20 border border-sky-500/30 mb-6">
                <ShieldAlert className="h-5 w-5 text-sky-500" />
                <span className="text-sm font-semibold text-sky-400">NEW FEATURE</span>
                <Badge className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-xs font-bold">
                  <Crown className="w-3 h-3 mr-1" />
                  PRO
                </Badge>
              </div>
              
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                <span className="bg-gradient-to-r from-sky-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                  Hallucination Watchdog
                </span>
              </h2>
              
              <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-4">
                Don&apos;t just track if AI talks about you.{" "}
                <span className="text-foreground font-semibold">Track what it says.</span>
              </p>
              
              <p className="text-lg text-sky-400/80 max-w-2xl mx-auto">
                We show you when ChatGPT lies about your pricing, features, or availability—
                so you can fix it before you lose sales.
              </p>
            </div>

            {/* Demo Cards */}
            <div className="grid md:grid-cols-3 gap-6 mb-12">
              {hallucinationExamples.map((example, index) => (
                <Card
                  key={index}
                  className="bg-card/80 backdrop-blur border-2 border-red-500/20 hover:border-red-500/40 transition-all hover:scale-[1.02]"
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-2 rounded-lg bg-red-500/10">
                        <example.icon className="h-5 w-5 text-red-500" />
                      </div>
                      <Badge variant="outline" className="text-red-400 border-red-500/30">
                        {example.type} Error
                      </Badge>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-xs text-red-400 font-medium mb-1">What AI Said:</p>
                        <p className="text-sm">&quot;{example.aiSaid}&quot;</p>
                      </div>
                      
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <p className="text-xs text-green-400 font-medium mb-1">The Reality:</p>
                        <p className="text-sm">{example.reality}</p>
                      </div>
                      
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">
                          <span className="text-sky-400 font-medium">Impact:</span> {example.impact}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Value Props */}
            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <div className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-sky-500/20 flex items-center justify-center mx-auto mb-4">
                  <ShieldAlert className="h-8 w-8 text-sky-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Website Crawler</h3>
                <p className="text-sm text-muted-foreground">
                  We scan your website to build a &quot;Ground Truth&quot; database of your actual pricing, features, and facts.
                </p>
              </div>
              
              <div className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-cyan-500/20 flex items-center justify-center mx-auto mb-4">
                  <Target className="h-8 w-8 text-cyan-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Accuracy Detection</h3>
                <p className="text-sm text-muted-foreground">
                  Compare AI responses against your ground truth. Catch lies before your customers do.
                </p>
              </div>
              
              <div className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-teal-500/20 flex items-center justify-center mx-auto mb-4">
                  <Lightbulb className="h-8 w-8 text-teal-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Fix Recommendations</h3>
                <p className="text-sm text-muted-foreground">
                  Get specific fixes to improve your content and correct AI&apos;s understanding of your brand.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center">
              <Button size="lg" asChild className="text-lg px-8 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 text-white shine">
                <Link href="/signup">
                  Get Hallucination Watchdog
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <p className="mt-4 text-sm text-muted-foreground">
                Included with Pro and Agency plans
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 bg-card/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">How It Works</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Three Steps to AI Visibility
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Get started in minutes. See results that matter.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              {steps.map((step, index) => (
                <div key={step.number} className="relative">
                  {/* Connector line */}
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-primary/50 to-transparent -translate-x-1/2" />
                  )}
                  
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 border border-primary/30 mb-4">
                      <span className="text-2xl font-bold text-primary">
                        {step.number}
                      </span>
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* For Agencies Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <Badge variant="outline" className="mb-4">For Agencies</Badge>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">
                  Add AEO Services to Your Retainers
                </h2>
                <p className="text-muted-foreground text-lg mb-6">
                  Differentiate your agency with AI Visibility Optimization. Sell
                  this as an add-on to existing SEO clients or as a standalone
                  service.
                </p>
                
                <ul className="space-y-4">
                  {[
                    "White-label reports for your clients",
                    "Multi-brand management from one dashboard",
                    "Track performance across all major AI engines",
                    "Specific, actionable recommendations",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Button size="lg" asChild>
                    <Link href="/signup">
                      Start Your Free Trial
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="relative">
                {/* Decorative card stack */}
                <div className="absolute -top-4 -left-4 w-full h-full bg-primary/5 rounded-2xl" />
                <Card className="relative bg-card border-border/50">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <p className="text-sm text-muted-foreground">Brand</p>
                        <p className="text-xl font-semibold">Emaar Properties</p>
                      </div>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        Active
                      </Badge>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                            <span className="text-sm">🟢</span>
                          </div>
                          <span>ChatGPT</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-400">72%</p>
                          <p className="text-xs text-muted-foreground">Visibility</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                            <span className="text-sm">🟣</span>
                          </div>
                          <span>Perplexity</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-yellow-400">45%</p>
                          <p className="text-xs text-muted-foreground">Visibility</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <span className="text-sm">🔵</span>
                          </div>
                          <span>Gemini</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-400">68%</p>
                          <p className="text-xs text-muted-foreground">Visibility</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-border/50">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <TrendingUp className="h-4 w-4 text-green-400" />
                        <span>+12% visibility this month</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GCC Focus Section */}
      <section className="py-24 bg-card/30">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="outline" className="mb-4">Dubai & GCC</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Built for the GCC Market
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              We understand the unique needs of agencies operating in Dubai,
              UAE, and the broader GCC region.
            </p>

            <div className="grid sm:grid-cols-3 gap-6">
              <Card className="bg-card/50 border-border/50">
                <CardContent className="pt-6 text-center">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Languages className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">Arabic Support</h3>
                  <p className="text-sm text-muted-foreground">
                    Full RTL support for Arabic prompts and content analysis
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-card/50 border-border/50">
                <CardContent className="pt-6 text-center">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Globe className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">Local Focus</h3>
                  <p className="text-sm text-muted-foreground">
                    Optimized for local market queries and regional brands
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-card/50 border-border/50">
                <CardContent className="pt-6 text-center">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Search className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">Multi-Engine</h3>
                  <p className="text-sm text-muted-foreground">
                    Track visibility across all major AI search platforms
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-blue-500/5" />
              <CardContent className="relative p-12 text-center">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Ready to Optimize AI Visibility?
                </h2>
                <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
                  Join agencies across Dubai and the GCC who are already winning
                  the AI search game.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" asChild className="text-lg px-8 shine">
                    <Link href="/signup">
                      Start Free Trial
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild className="text-lg px-8">
                    <Link href="/pricing">View Pricing</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

