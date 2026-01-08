"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface KeywordSet {
  id: string;
  name: string;
  description: string | null;
  brand_id: string;
}

interface Keyword {
  id: string;
  text: string;
}

export default function EditKeywordSetPage() {
  const params = useParams();
  const brandId = params.brandId as string;
  const keywordSetId = params.keywordSetId as string;
  const router = useRouter();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [keywordSet, setKeywordSet] = useState<KeywordSet | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [keywordsToDelete, setKeywordsToDelete] = useState<string[]>([]);
  const [keywordsToAdd, setKeywordsToAdd] = useState<string[]>([]);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();

      // Fetch keyword set
      const { data: set, error: setError } = await supabase
        .from("keyword_sets")
        .select("*")
        .eq("id", keywordSetId)
        .single();

      if (setError || !set) {
        toast.error("Keyword set not found");
        router.push(`/brands/${brandId}/keyword-sets`);
        return;
      }

      setKeywordSet(set);
      setFormData({
        name: set.name,
        description: set.description || "",
      });

      // Fetch keywords
      const { data: kws } = await supabase
        .from("keywords")
        .select("id, text")
        .eq("keyword_set_id", keywordSetId)
        .order("created_at", { ascending: true });

      setKeywords(kws || []);
      setIsLoading(false);
    }

    loadData();
  }, [keywordSetId, brandId, router]);

  const addKeyword = () => {
    const trimmed = newKeyword.trim();
    if (trimmed && !keywords.some(k => k.text === trimmed) && !keywordsToAdd.includes(trimmed)) {
      setKeywordsToAdd([...keywordsToAdd, trimmed]);
      setNewKeyword("");
    }
  };

  const removeExistingKeyword = (keyword: Keyword) => {
    setKeywordsToDelete([...keywordsToDelete, keyword.id]);
    setKeywords(keywords.filter(k => k.id !== keyword.id));
  };

  const removeNewKeyword = (text: string) => {
    setKeywordsToAdd(keywordsToAdd.filter(k => k !== text));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const supabase = createClient();

      // Update keyword set
      const { error: updateError } = await supabase
        .from("keyword_sets")
        .update({
          name: formData.name,
          description: formData.description || null,
        })
        .eq("id", keywordSetId);

      if (updateError) {
        toast.error(updateError.message);
        return;
      }

      // Delete removed keywords
      if (keywordsToDelete.length > 0) {
        await supabase
          .from("keywords")
          .delete()
          .in("id", keywordsToDelete);
      }

      // Add new keywords
      if (keywordsToAdd.length > 0) {
        const newKeywordRows = keywordsToAdd.map(text => ({
          keyword_set_id: keywordSetId,
          brand_id: brandId,
          text,
        }));

        const { error: insertError } = await supabase
          .from("keywords")
          .insert(newKeywordRows);

        if (insertError) {
          toast.error(insertError.message);
          return;
        }
      }

      toast.success("Prompt set updated successfully!");
      router.push(`/brands/${brandId}/keyword-sets/${keywordSetId}`);
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("keyword_sets")
        .delete()
        .eq("id", keywordSetId);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Prompt set deleted");
      router.push(`/brands/${brandId}/keyword-sets`);
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back Button */}
      <Button variant="ghost" asChild className="-ml-4">
        <Link href={`/brands/${brandId}/keyword-sets/${keywordSetId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Prompt Set
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Edit Prompt Set</h1>
          <p className="text-muted-foreground mt-1">
            Update {keywordSet?.name}
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Prompt Set?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &quot;{keywordSet?.name}&quot; and all its prompts.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Set Details</CardTitle>
            <CardDescription>
              Update the name and description
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                disabled={isSaving}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Prompts</CardTitle>
                <CardDescription>
                  Manage the search queries in this set
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {/* Add prompt */}
            <div className="flex gap-2">
              <Input
                placeholder="Add a new prompt..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                disabled={isSaving}
                className="h-11"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addKeyword}
                disabled={isSaving}
                className="h-11 px-4"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>

            {/* Current prompts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">
                  {keywords.length + keywordsToAdd.length} {(keywords.length + keywordsToAdd.length) === 1 ? 'Prompt' : 'Prompts'}
                </Label>
                {keywordsToDelete.length > 0 && (
                  <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full">
                    {keywordsToDelete.length} will be removed
                  </span>
                )}
              </div>
              <div className="space-y-2 p-4 rounded-xl border bg-muted/20 min-h-[120px] max-h-72 overflow-y-auto">
                {keywords.length === 0 && keywordsToAdd.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">No prompts yet</p>
                    <p className="text-xs mt-1">Add prompts above to get started</p>
                  </div>
                ) : (
                  <>
                    {keywords.map((keyword, index) => (
                      <div
                        key={keyword.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-background border group hover:border-border transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground flex-shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-sm truncate">{keyword.text}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeExistingKeyword(keyword)}
                          className="p-1.5 hover:bg-red-500/10 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                        </button>
                      </div>
                    ))}
                    {keywordsToAdd.map((text, index) => (
                      <div
                        key={text}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-green-500/5 border border-green-500/30 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-md bg-green-500/20 flex items-center justify-center text-xs font-medium text-green-500 flex-shrink-0">
                            {keywords.length + index + 1}
                          </span>
                          <span className="text-sm truncate">{text}</span>
                          <span className="text-xs text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">new</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeNewKeyword(text)}
                          className="p-1.5 hover:bg-red-500/10 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href={`/brands/${brandId}/keyword-sets/${keywordSetId}`}>
              Cancel
            </Link>
          </Button>
        </div>
      </form>
    </div>
  );
}




