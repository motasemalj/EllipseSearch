import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, BookOpen, CheckCircle2, Layers, Search } from "lucide-react";

const guideSections = [
  {
    title: "Define the questions you want to own",
    description:
      "AEO starts with real questions people ask in AI assistants. Map intents by role, market, and decision stage, then prioritize the questions that influence buying decisions.",
  },
  {
    title: "Publish direct, structured answers",
    description:
      "Create pages that answer one question clearly. Use headings, short paragraphs, and tables where needed. The goal is easy extraction and citation.",
  },
  {
    title: "Use structured data to clarify meaning",
    description:
      "Schema markup (like FAQPage, HowTo, Product, Organization) provides explicit signals that machines can parse.",
  },
  {
    title: "Strengthen entity consistency",
    description:
      "Ensure your brand name, description, and attributes are consistent across your site and trusted third-party sources.",
  },
  {
    title: "Prove expertise and freshness",
    description:
      "Show author credentials, cite reliable sources, and keep important pages updated with visible change notes.",
  },
];

const detectionSignals = [
  {
    title: "Crawl and indexability",
    description:
      "Answer engines depend on search infrastructure. If content cannot be crawled and indexed, it cannot be cited.",
  },
  {
    title: "Entity understanding",
    description:
      "Many systems organize information around entities and relationships. Clear naming and consistent references make your brand easier to recognize.",
  },
  {
    title: "Structured data",
    description:
      "Schema markup helps machines interpret what a page is about and which facts are authoritative.",
  },
  {
    title: "Content quality signals",
    description:
      "Quality frameworks emphasize trust, expertise, and helpfulness—factors that influence which sources are surfaced.",
  },
  {
    title: "Semantic relevance",
    description:
      "Embeddings and vector similarity allow systems to match meaning, not just keywords. Precise language improves match quality.",
  },
  {
    title: "Authority and citations",
    description:
      "Consistent citations from reputable sources reinforce that your brand is a trusted answer.",
  },
];

const checklist = [
  "Create answer-first pages for your highest-value questions",
  "Implement FAQPage, HowTo, Product, and Organization schema where relevant",
  "Add expert bylines and cite primary sources",
  "Unify brand descriptions, logos, and NAP data across platforms",
  "Publish comparison and decision-support content",
  "Track AI citations and accuracy over time",
];

export default function BlogPage() {
  return (
    <div className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto space-y-16">
          <section className="text-center space-y-6">
            <Badge variant="outline">EllipseSearch Blog</Badge>
            <h1 className="text-4xl md:text-5xl font-bold">
              A Complete Guide to AEO and How AI Detects Brands
            </h1>
            <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
              Answer Engine Optimization (AEO) is the practice of making your
              content easy for AI systems to understand, trust, and cite. This
              guide covers how AEO works, how AI systems identify brands, and
              the practical steps agencies can take to win visibility.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="shine">
                <Link href="/signup">
                  Start Tracking AI Visibility <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/pricing">See Pricing</Link>
              </Button>
            </div>
          </section>

          <section className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "AEO basics",
                description: "Understand how answer engines select sources.",
                icon: BookOpen,
              },
              {
                title: "Brand detection",
                description: "Learn the signals AI uses to recognize brands.",
                icon: Search,
              },
              {
                title: "Execution",
                description: "Build a repeatable workflow for agencies.",
                icon: Layers,
              },
            ].map((item) => (
              <Card key={item.title} className="bg-card/60 border-border/60">
                <CardContent className="pt-6 space-y-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold">{item.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-bold">What is AEO?</h2>
            <p className="text-muted-foreground text-lg">
              AEO focuses on making your information easy to extract and cite in
              AI-generated answers. Instead of optimizing only for search engine
              rankings, you optimize for being referenced when a user asks a
              question in an AI assistant. That means clear answers, structured
              content, and strong brand authority signals.
            </p>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-bold">How AEO works</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {guideSections.map((section) => (
                <Card key={section.title} className="bg-card/60 border-border/60">
                  <CardContent className="pt-6 space-y-2">
                    <h3 className="font-semibold">{section.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {section.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-bold">How AI detects brands</h2>
            <p className="text-muted-foreground text-lg">
              AI assistants and search systems rely on a combination of crawl
              access, structured data, entity understanding, and quality signals
              to decide which sources to trust. These are the most consistent
              detection signals across major platforms.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              {detectionSignals.map((signal) => (
                <Card key={signal.title} className="bg-card/60 border-border/60">
                  <CardContent className="pt-6 space-y-2">
                    <h3 className="font-semibold">{signal.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {signal.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-bold">AEO vs. traditional SEO</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="bg-card/60 border-border/60">
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold">Traditional SEO focuses on</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>Ranking for keyword queries</li>
                    <li>Backlinks and technical site health</li>
                    <li>Clicks from search result pages</li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="bg-card/60 border-border/60">
                <CardContent className="pt-6 space-y-2">
                  <h3 className="font-semibold">AEO focuses on</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>Direct answers for conversational prompts</li>
                    <li>Entity clarity and structured data</li>
                    <li>Citations and brand mentions in AI responses</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-bold">AEO execution checklist</h2>
            <div className="grid gap-3">
              {checklist.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card/60 px-4 py-3"
                >
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                  <span className="text-sm text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-3xl font-bold">Further reading</h2>
            <p className="text-muted-foreground text-lg">
              The sources below explain how search systems crawl, structure, and
              evaluate information. They are the foundation for AEO best
              practices.
            </p>
            <div className="grid gap-3 text-sm text-muted-foreground">
              <a
                href="https://developers.google.com/search/docs/fundamentals/how-search-works"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Google Search Central — How Search Works
              </a>
              <a
                href="https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Google Search Central — Structured Data Introduction
              </a>
              <a
                href="https://schema.org/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Schema.org — Vocabulary for structured data
              </a>
              <a
                href="https://developers.google.com/search/docs/appearance/page-experience"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Google Search Central — Page Experience and quality signals
              </a>
              <a
                href="https://developers.google.com/search/blog/2012/05/introducing-knowledge-graph-things-not"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Google Search Blog — Introducing the Knowledge Graph
              </a>
              <a
                href="https://platform.openai.com/docs/guides/embeddings"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors"
              >
                OpenAI — Embeddings and semantic similarity
              </a>
              <a
                href="https://www.bing.com/webmasters/help/webmasters-guidelines-30fba23a"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Bing Webmaster Guidelines — Quality content and site signals
              </a>
              <a
                href="https://developers.google.com/search/blog/2022/12/introducing-e-e-a-t"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Google Search — Understanding E-E-A-T in quality guidelines
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

