"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Plus, X, ListChecks, Lightbulb } from "lucide-react";
import { toast } from "sonner";

export default function NewKeywordSetPage() {
  const router = useRouter();
  const params = useParams();
  const brandId = params.brandId as string;
  const supabase = createClient();
  
  const [isLoading, setIsLoading] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");

  useEffect(() => {
    const fetchBrand = async () => {
      const { data: brand } = await supabase
        .from("brands")
        .select("name")
        .eq("id", brandId)
        .single();
      
      if (brand) {
        setBrandName(brand.name);
      }
    };
    fetchBrand();
  }, [brandId, supabase]);

  const handleAddKeyword = () => {
    if (!newKeyword.trim()) return;
    
    // Split by newlines or commas for bulk add
    const newKeywords = newKeyword
      .split(/[\n,]/)
      .map(k => k.trim())
      .filter(k => k && !keywords.includes(k));
    
    if (newKeywords.length > 0) {
      setKeywords(prev => [...prev, ...newKeywords]);
      setNewKeyword("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(prev => prev.filter(k => k !== keyword));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Please enter a name for the keyword set");
      return;
    }

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      // Create keyword set
      const { data: keywordSet, error: setError } = await supabase
        .from("keyword_sets")
        .insert({
          brand_id: brandId,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          created_by: profile?.id,
        })
        .select()
        .single();

      if (setError) throw setError;

      // Create keywords
      if (keywords.length > 0) {
        const { error: keywordsError } = await supabase
          .from("keywords")
          .insert(
            keywords.map(text => ({
              keyword_set_id: keywordSet.id,
              brand_id: brandId,
              text,
            }))
          );

        if (keywordsError) throw keywordsError;
      }

      toast.success("Keyword set created!", {
        description: `Added ${keywords.length} keywords.`,
      });

      router.push(`/brands/${brandId}/keyword-sets/${keywordSet.id}`);
      router.refresh();
    } catch (error) {
      console.error("Error creating keyword set:", error);
      toast.error("Failed to create keyword set", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sampleKeywords = [
    "best real estate developers in dubai",
    "luxury apartments dubai marina",
    "off-plan properties dubai 2024",
    "dubai waterfront living",
    "investment properties uae",
  ];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href={`/brands/${brandId}/keyword-sets`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <div className="text-sm text-muted-foreground mb-1">
            <Link href={`/brands/${brandId}`} className="hover:text-foreground">
              {brandName}
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Create Keyword Set</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="p-2 rounded-lg bg-primary/10">
              <ListChecks className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Set Details</h2>
              <p className="text-sm text-muted-foreground">Name and description</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Luxury Real Estate Keywords"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description for this keyword set..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Prompts */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ListChecks className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Prompts</h2>
                <p className="text-sm text-muted-foreground">
                  Add the search queries you want to analyze
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter a prompt (e.g., 'best CRM software for startups')..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-11"
              />
              <Button type="button" onClick={handleAddKeyword} variant="outline" className="h-11 px-4">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 Tip: Paste multiple prompts separated by commas or new lines
            </p>

            {/* Prompts list */}
            {keywords.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">
                    {keywords.length} {keywords.length === 1 ? 'prompt' : 'prompts'} added
                  </p>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {keywords.map((keyword, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-background border group hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-sm truncate">{keyword}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(keyword)}
                        className="p-1.5 hover:bg-red-500/10 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sample prompts */}
            {keywords.length === 0 && (
              <div className="rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/20 p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Need inspiration?</p>
                    <p className="text-sm text-muted-foreground">Click any example to add it as a prompt</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {sampleKeywords.map((keyword, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        if (!keywords.includes(keyword)) {
                          setKeywords(prev => [...prev, keyword]);
                        }
                      }}
                      className="w-full text-left px-4 py-2.5 rounded-lg bg-background/80 border border-transparent text-sm hover:border-primary/50 hover:bg-background transition-all"
                    >
                      {keyword}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Link href={`/brands/${brandId}/keyword-sets`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isLoading} className="gap-2">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Create Prompt Set
                {keywords.length > 0 && ` (${keywords.length} prompts)`}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
