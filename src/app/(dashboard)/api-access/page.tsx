import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { ArrowRight, KeyRound, ShieldCheck, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export default function ApiAccessPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <KeyRound className="w-4 h-4" />
          API Access
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Programmatic API</h1>
        <p className="text-muted-foreground max-w-2xl">
          Trigger prompt-set analyses and automate reporting. All endpoints are authenticated and scoped
          by your organization.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Auth</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Use a Supabase <span className="font-medium text-foreground">access token</span> as a Bearer token
            in the Authorization header.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Async</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            API calls enqueue Trigger.dev jobs and return immediately with a batch id.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <ArrowRight className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Next steps</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Prefer UI? Run analyses from the brand dashboard.
          </p>
          <Link href="/brands">
            <Button variant="outline" className="gap-2">
              Go to Brands <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">1) Get an access token</h2>
          <p className="text-sm text-muted-foreground">
            Use a normal Supabase sign-in and take the returned <span className="font-medium text-foreground">access_token</span>.
          </p>
        </div>

        <CodeBlock
          language="bash"
          code={`curl -s https://<YOUR_SUPABASE_PROJECT>.supabase.co/auth/v1/token?grant_type=password \\
  -H "apikey: <SUPABASE_ANON_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","password":"your-password"}' | jq -r .access_token
`}
        />

        <p className="text-xs text-muted-foreground">
          Tip: from inside the app you can also read the session token via <span className="font-mono">supabase.auth.getSession()</span>.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">2) Trigger an analysis</h2>
          <p className="text-sm text-muted-foreground">
            Starts a batch run for a prompt set across one or more engines.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Endpoint</p>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="font-mono text-sm">
                POST <span className="text-primary">/api/analysis/run</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Auth: <span className="font-mono">Authorization: Bearer &lt;SUPABASE_ACCESS_TOKEN&gt;</span>
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Payload</p>
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
              <p>
                <span className="font-mono">brand_id</span>, <span className="font-mono">keyword_set_id</span>,{" "}
                <span className="font-mono">engines</span>, <span className="font-mono">language</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Engines: <span className="font-mono">chatgpt | perplexity | gemini | grok</span>
              </p>
            </div>
          </div>
        </div>

        <CodeBlock
          language="bash"
          code={`curl -X POST http://localhost:3000/api/analysis/run \\
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "brand_id": "<BRAND_ID>",
    "keyword_set_id": "<KEYWORD_SET_ID>",
    "engines": ["chatgpt", "perplexity"],
    "language": "en"
  }'
`}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold mb-2">Need more endpoints?</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Tell me which workflows you want (list batches, export CSV, webhooks, etc.) and I’ll implement them cleanly.
        </p>
        <Link href="/support">
          <Button variant="outline" className="gap-2">
            Contact support <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}


