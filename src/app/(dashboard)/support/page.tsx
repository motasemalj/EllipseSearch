import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { LifeBuoy, Mail, MessageCircleQuestion, ShieldCheck, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default function SupportPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LifeBuoy className="w-4 h-4" />
          Help & Support
        </div>
        <h1 className="text-3xl font-bold tracking-tight">We’ve got you</h1>
        <p className="text-muted-foreground max-w-2xl">
          Quick fixes, FAQs, and best practices to improve visibility across ChatGPT, Perplexity, Gemini, and Grok.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Email</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Prefer async? Send a quick bug report or feature request.
          </p>
          <a href="mailto:support@ellipse.ai?subject=Ellipse%20Support">
            <Button variant="outline" className="gap-2">
              Email support <ArrowRight className="w-4 h-4" />
            </Button>
          </a>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircleQuestion className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">FAQ</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Most issues are configuration, credits, or access-token related—see below.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Security</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Your data is scoped by org via Supabase RLS. Never share service role keys client-side.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
        <h2 className="text-xl font-semibold">FAQs</h2>

        <div className="space-y-2">
          <p className="font-medium">Why do I get “Unauthorized” from the API?</p>
          <p className="text-sm text-muted-foreground">
            Use a Supabase <span className="font-medium text-foreground">access token</span> as a Bearer token, or call from a browser
            session where you’re logged in.
          </p>
          <CodeBlock
            language="bash"
            code={`curl -X POST http://localhost:3000/api/analysis/run \\
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{ "brand_id":"...", "keyword_set_id":"...", "engines":["chatgpt"], "language":"en" }'
`}
          />
        </div>

        <div className="space-y-2">
          <p className="font-medium">Why does an analysis fail or stall?</p>
          <p className="text-sm text-muted-foreground">
            Common causes: missing engine API keys, network/provider rate limits, or insufficient credits.
          </p>
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>Check your org credits in the header.</li>
            <li>Ensure env vars are set for the engines you selected.</li>
            <li>Re-run with fewer engines to isolate the provider causing failures.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-medium">Where can I learn how to use the platform?</p>
          <p className="text-sm text-muted-foreground">
            Start with the docs, then head to Brands to run your first batch.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Link href="/docs">
              <Button variant="outline">Docs</Button>
            </Link>
            <Link href="/brands">
              <Button>Brands</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold mb-2">Tell me what you want next</h2>
        <p className="text-sm text-muted-foreground mb-4">
          If you share your ideal workflow (exports, alerts, automated reporting, competitor tracking), I’ll implement it end-to-end.
        </p>
        <Link href="/api-access">
          <Button variant="outline">API Access</Button>
        </Link>
      </div>
    </div>
  );
}



