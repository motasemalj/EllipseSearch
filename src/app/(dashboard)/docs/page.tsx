import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { ArrowRight, BookOpen, KeyRound, LifeBuoy, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="w-4 h-4" />
          Documentation
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Ellipse Docs</h1>
        <p className="text-muted-foreground max-w-2xl">
          Everything you need to run analyses, interpret results, and compare prompt sets with confidence.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Quickstart</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Create a brand → add a prompt set → run analysis → review simulations and signals.
          </p>
          <Link href="/brands">
            <Button className="gap-2">
              Go to Brands <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">API Access</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Trigger analyses programmatically and automate reporting workflows.
          </p>
          <Link href="/api-access">
            <Button variant="outline" className="gap-2">
              View API docs <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <LifeBuoy className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Help & Support</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Troubleshooting, FAQs, and best practices for stronger AI visibility.
          </p>
          <Link href="/support">
            <Button variant="outline" className="gap-2">
              Get help <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Core concepts</h2>
          <p className="text-sm text-muted-foreground">
            Ellipse runs prompt simulations across AI engines and measures visibility + selection signals for your brand.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="font-medium">Brands</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your client entity (domain, aliases, geo/language).
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="font-medium">Prompt Sets</p>
            <p className="text-sm text-muted-foreground mt-1">
              The topics/queries you want to win in AI answers.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="font-medium">Batches</p>
            <p className="text-sm text-muted-foreground mt-1">
              A run across prompts × engines, stored as simulations.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Model configuration</h2>
          <p className="text-sm text-muted-foreground">
            OpenAI model selection is centralized. Set an env var to switch all ChatGPT + analysis calls.
          </p>
        </div>

        <CodeBlock
          language="env"
          code={`# OpenAI model used by Ellipse for ChatGPT simulations + selection signal analysis
OPENAI_CHAT_MODEL=gpt-4o-mini
`}
        />
      </div>
    </div>
  );
}


