"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface PromptSet {
  id: string;
  name: string;
}

interface AddPromptDialogProps {
  brandId: string;
  promptSets: PromptSet[];
  defaultSetId?: string;
  trigger?: React.ReactNode;
}

export function AddPromptDialog({ 
  brandId, 
  promptSets, 
  defaultSetId,
  trigger 
}: AddPromptDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [newPrompt, setNewPrompt] = useState("");
  const [selectedSetId, setSelectedSetId] = useState<string>(defaultSetId || "none");
  const [newSetName, setNewSetName] = useState("");

  const handleAddPrompt = () => {
    if (!newPrompt.trim()) return;
    
    // Split by newlines or commas for bulk add
    const newPrompts = newPrompt
      .split(/[\n,]/)
      .map(p => p.trim())
      .filter(p => p && !prompts.includes(p));
    
    if (newPrompts.length > 0) {
      setPrompts(prev => [...prev, ...newPrompts]);
      setNewPrompt("");
    }
  };

  const handleRemovePrompt = (prompt: string) => {
    setPrompts(prev => prev.filter(p => p !== prompt));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddPrompt();
    }
  };

  const handleSubmit = async () => {
    if (prompts.length === 0) {
      toast.error("Add at least one prompt");
      return;
    }

    if (selectedSetId === "new" && !newSetName.trim()) {
      toast.error("Enter a name for the new prompt set");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      let setId: string | null = selectedSetId === "none" ? null : selectedSetId;

      // Create new set if needed
      if (selectedSetId === "new") {
        const { data: { user } } = await supabase.auth.getUser();
        
        const { data: newSet, error: setError } = await supabase
          .from("prompt_sets")
          .insert({
            brand_id: brandId,
            name: newSetName.trim(),
            created_by: user?.id,
          })
          .select()
          .single();

        if (setError) throw setError;
        setId = newSet.id;
      }

      // Add prompts (prompt_set_id can be null for ungrouped prompts)
      const { error: promptsError } = await supabase
        .from("prompts")
        .insert(
          prompts.map(text => ({
            prompt_set_id: setId,
            brand_id: brandId,
            text,
          }))
        );

      if (promptsError) throw promptsError;

      toast.success(`Added ${prompts.length} prompt${prompts.length > 1 ? 's' : ''}!`);
      setOpen(false);
      setPrompts([]);
      setNewPrompt("");
      setNewSetName("");
      setSelectedSetId("none");
      router.refresh();
    } catch (error) {
      console.error("Error adding prompts:", error);
      toast.error("Failed to add prompts", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Prompt
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Add Prompts
          </DialogTitle>
          <DialogDescription>
            Add search queries to analyze across AI engines
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Prompt Input - First, most important */}
          <div className="space-y-3">
            <Label>Prompt(s)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter a prompt (e.g., 'best CRM for startups')..."
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button type="button" onClick={handleAddPrompt} variant="outline">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: Paste multiple prompts separated by commas or new lines
            </p>
            
            {/* Sample prompts */}
            {prompts.length === 0 && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-2">Click to add examples:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "best alternatives to [competitor]",
                    "top [product category] in 2025",
                    "how to choose [product type]",
                  ].map((example, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPrompts(prev => [...prev, example])}
                      className="px-2 py-1 text-xs rounded-md bg-background border hover:border-primary transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Prompts List */}
          {prompts.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 max-h-48 overflow-y-auto">
              <p className="text-sm font-medium mb-2">
                {prompts.length} prompt{prompts.length > 1 ? 's' : ''} to add:
              </p>
              <div className="space-y-1.5">
                {prompts.map((prompt, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-background border text-sm group"
                  >
                    <span className="truncate">{prompt}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePrompt(prompt)}
                      className="p-1 rounded hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional: Prompt Set Selection */}
          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              Add to Prompt Set (optional)
            </Label>
            <Select value={selectedSetId} onValueChange={setSelectedSetId}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="No set - keep ungrouped" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">No set - keep ungrouped</span>
                </SelectItem>
                <SelectItem value="new">
                  <span className="flex items-center gap-2">
                    <Plus className="w-3 h-3" />
                    Create new set
                  </span>
                </SelectItem>
                {promptSets.map(set => (
                  <SelectItem key={set.id} value={set.id}>
                    {set.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* New Set Name */}
          {selectedSetId === "new" && (
            <div className="space-y-2">
              <Label>New Set Name</Label>
              <Input
                placeholder="e.g., Product Comparisons"
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || prompts.length === 0}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                Add {prompts.length > 0 ? `${prompts.length} Prompt${prompts.length > 1 ? 's' : ''}` : 'Prompts'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

