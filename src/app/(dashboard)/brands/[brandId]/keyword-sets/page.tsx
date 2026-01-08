import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Plus, 
  ListChecks, 
  ChevronRight,
  Search,
  Clock,
} from "lucide-react";

interface KeywordSetsPageProps {
  params: { brandId: string };
}

export default async function KeywordSetsPage({ params }: KeywordSetsPageProps) {
  const { brandId } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) redirect("/login");

  // Get brand
  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!brand) notFound();

  // Get keyword sets with keyword counts
  const { data: keywordSets } = await supabase
    .from("keyword_sets")
    .select("*, keywords(count)")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  // Get latest batch for each keyword set
  const batchesMap: Record<string, { status: string; created_at: string }> = {};
  if (keywordSets && keywordSets.length > 0) {
    const { data: batches } = await supabase
      .from("analysis_batches")
      .select("keyword_set_id, status, created_at")
      .in("keyword_set_id", keywordSets.map(ks => ks.id))
      .order("created_at", { ascending: false });
    
    batches?.forEach(batch => {
      if (!batchesMap[batch.keyword_set_id]) {
        batchesMap[batch.keyword_set_id] = { status: batch.status, created_at: batch.created_at };
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href={`/brands/${brandId}`}>
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="text-sm text-muted-foreground mb-1">
              <Link href={`/brands/${brandId}`} className="hover:text-foreground">
                {brand.name}
              </Link>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Prompt Sets</h1>
            <p className="text-muted-foreground mt-1">
              Organize your prompts into groups for analysis
            </p>
          </div>
        </div>
        <Link href={`/brands/${brandId}/keyword-sets/new`}>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Prompt Set
          </Button>
        </Link>
      </div>

      {/* Prompt Sets Grid */}
      {!keywordSets || keywordSets.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ListChecks className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No prompt sets yet</h3>
          <p className="text-muted-foreground max-w-sm mx-auto mb-6">
            Create your first prompt set to start analyzing AI visibility for {brand.name}.
          </p>
          <Link href={`/brands/${brandId}/keyword-sets/new`}>
            <Button size="lg" className="gap-2">
              <Plus className="w-4 h-4" />
              Create Your First Set
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {keywordSets.map((set) => {
            const keywordCount = (set.keywords as { count: number }[])?.[0]?.count || 0;
            const lastBatch = batchesMap[set.id];
            
            return (
              <Link
                key={set.id}
                href={`/brands/${brandId}/keyword-sets/${set.id}`}
                className="group rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <ListChecks className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                        {set.name}
                      </h3>
                      {set.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {set.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Search className="w-4 h-4" />
                          {keywordCount} prompts
                        </span>
                        {lastBatch && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            Last run: {new Date(lastBatch.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
