"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MessageSquare,
  Plus,
  Trash2,
  Loader2,
  Search,
  Eye,
  EyeOff,
  Clock,
  AlertCircle,
  Folder,
  ChevronDown,
  Globe,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SupportedEngine, SupportedRegion, REGIONS } from "@/types";

interface PromptSet {
  id: string;
  name: string;
  description: string | null;
}

interface Prompt {
  id: string;
  text: string;
  created_at: string;
  prompt_set_id: string | null;
  is_active: boolean;
  analysis_regions: SupportedRegion[];
  total_simulations: number;
  visible_simulations: number;
  last_analyzed_at: string | null;
}

export default function BrandPromptsPage() {
  const params = useParams();
  const router = useRouter();
  const brandId = params.brandId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [promptSets, setPromptSets] = useState<PromptSet[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [deletePromptId, setDeletePromptId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["ungrouped"]));
  
  // Add prompts dialog state
  const [promptsToAdd, setPromptsToAdd] = useState<string[]>([]);
  const [newPromptInput, setNewPromptInput] = useState("");
  const [selectedSetId, setSelectedSetId] = useState<string>("none");
  const [newSetName, setNewSetName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [runAnalysisAfterAdd, setRunAnalysisAfterAdd] = useState(true);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId]);

  async function fetchData() {
    setIsLoading(true);
    const supabase = createClient();

    // Fetch prompt sets
    const { data: setsData } = await supabase
      .from("prompt_sets")
      .select("id, name, description")
      .eq("brand_id", brandId)
      .order("name");

    if (setsData) {
      setPromptSets(setsData);
    }

    // Fetch prompts with simulation counts
    const { data: promptsData, error: promptsError } = await supabase
      .from("prompts")
      .select(`
        id,
        text,
        created_at,
        prompt_set_id,
        simulations:simulations(id, is_visible, created_at)
      `)
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });

    if (promptsError) {
      console.error("Error fetching prompts:", promptsError);
    }

    if (promptsData) {
      const enrichedPrompts: Prompt[] = promptsData.map((p) => {
        const sims = (p.simulations as Array<{ id: string; is_visible: boolean; created_at: string }>) || [];
        const lastSim = sims.length > 0 ? sims.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0] : null;
        
        return {
          id: p.id,
          text: p.text,
          created_at: p.created_at,
          prompt_set_id: p.prompt_set_id,
          is_active: true, // Default until migration is run
          analysis_regions: ["ae"], // Default until migration is run
          total_simulations: sims.length,
          visible_simulations: sims.filter((s) => s.is_visible).length,
          last_analyzed_at: lastSim?.created_at || null,
        };
      });
      setPrompts(enrichedPrompts);
    }

    setIsLoading(false);
  }

  // Add prompt to queue (not to database yet)
  function handleAddToQueue() {
    if (!newPromptInput.trim()) return;
    
    // Split by newlines or commas for bulk add
    const newPrompts = newPromptInput
      .split(/[\n,]/)
      .map(p => p.trim())
      .filter(p => p && !promptsToAdd.includes(p));
    
    if (newPrompts.length > 0) {
      setPromptsToAdd(prev => [...prev, ...newPrompts]);
      setNewPromptInput("");
    }
  }

  // Remove prompt from queue
  function handleRemoveFromQueue(prompt: string) {
    setPromptsToAdd(prev => prev.filter(p => p !== prompt));
  }

  // Handle Enter key in input
  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddToQueue();
    }
  }

  // Submit all prompts to database
  async function handleSubmitPrompts() {
    if (promptsToAdd.length === 0) {
      toast.error("Add at least one prompt");
      return;
    }

    if (selectedSetId === "new" && !newSetName.trim()) {
      toast.error("Enter a name for the new prompt set");
      return;
    }

    setIsAdding(true);
    const supabase = createClient();

    try {
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

      // Add all prompts (select ids so we can trigger analysis for newly added prompts)
      const { data: insertedPrompts, error: promptsError } = await supabase
        .from("prompts")
        .insert(
          promptsToAdd.map(text => ({
            prompt_set_id: setId,
            brand_id: brandId,
            text,
          }))
        )
        .select("id");

      if (promptsError) throw promptsError;

      const addedCount = promptsToAdd.length;
      
      // Reset state first
      setIsAddDialogOpen(false);
      setPromptsToAdd([]);
      setNewPromptInput("");
      setNewSetName("");
      setSelectedSetId("none");
      
      // Trigger analysis after add:
      // - If user opted-in, run immediately
      // - If auto-analysis is enabled for the brand, ALWAYS run once for the newly added prompt(s)
      const { data: activeSchedules } = await supabase
        .from("scheduled_analyses")
        .select("engines, region, is_active")
        .eq("brand_id", brandId)
        .eq("is_active", true)
        .limit(1);
      const activeSchedule = activeSchedules?.[0] || null;
      const scheduleEngines = (Array.isArray(activeSchedule?.engines)
        ? (activeSchedule?.engines as SupportedEngine[])
        : (["chatgpt", "perplexity", "gemini", "grok"] as SupportedEngine[]));
      const scheduleRegion = (typeof activeSchedule?.region === "string"
        ? (activeSchedule.region as SupportedRegion)
        : ("ae" as SupportedRegion));
      const scheduleActive = Boolean(activeSchedule);

      // If schedule is missing due to DB enum/policy issues, fall back to brand.settings.auto_analysis_enabled
      let brandAutoEnabled = false;
      if (!scheduleActive) {
        const { data: brandRow } = await supabase
          .from("brands")
          .select("settings")
          .eq("id", brandId)
          .single();
        const settingsObj = (brandRow?.settings || {}) as Record<string, unknown>;
        brandAutoEnabled = Boolean(settingsObj.auto_analysis_enabled);
      }

      const shouldAutoRun = runAnalysisAfterAdd || scheduleActive || brandAutoEnabled;
      const newlyAddedIds = (insertedPrompts as Array<{ id: string }> | null)?.map(p => p.id) || [];
      const promptIdToRun = newlyAddedIds[0];

      if (shouldAutoRun && promptIdToRun) {
        toast.success(`Added ${addedCount} prompt${addedCount > 1 ? "s" : ""}! Starting analysis...`);

        try {
          // Important: run analysis for ONE prompt (1 prompt × N engines) to avoid load spikes.
          const response = await fetch("/api/analysis/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              brand_id: brandId,
              prompt_ids: [promptIdToRun],
              engines: scheduleEngines,
              region: scheduleRegion,
            }),
          });

          if (response.ok) {
            toast.success("Analysis started", { description: "Results will appear shortly." });
          }
        } catch (error) {
          console.error("Failed to trigger analysis:", error);
          // Don't show error - prompts were still added successfully
        }
      } else {
        toast.success(`Added ${addedCount} prompt${addedCount > 1 ? 's' : ''}!`);
      }
      
      fetchData();
    } catch (error) {
      console.error("Error adding prompts:", error);
      toast.error("Failed to add prompts", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsAdding(false);
    }
  }

  // Reset dialog state when closing
  function handleDialogOpenChange(open: boolean) {
    setIsAddDialogOpen(open);
    if (!open) {
      setPromptsToAdd([]);
      setNewPromptInput("");
      setNewSetName("");
      setSelectedSetId("none");
    }
  }


  async function handleDeletePrompt() {
    if (!deletePromptId) return;

    setIsDeleting(true);
    const supabase = createClient();

    await supabase.from("prompts").delete().eq("id", deletePromptId);

    setDeletePromptId(null);
    setIsDeleting(false);
    fetchData();
  }

  async function handleToggleActive(promptId: string, isActive: boolean) {
    const supabase = createClient();
    await supabase
      .from("prompts")
      .update({ is_active: isActive })
      .eq("id", promptId);
    
    setPrompts(prev => prev.map(p => 
      p.id === promptId ? { ...p, is_active: isActive } : p
    ));
  }

  async function handleUpdateRegions(promptId: string, regions: SupportedRegion[]) {
    const supabase = createClient();
    await supabase
      .from("prompts")
      .update({ analysis_regions: regions })
      .eq("id", promptId);
    
    setPrompts(prev => prev.map(p => 
      p.id === promptId ? { ...p, analysis_regions: regions } : p
    ));
  }

  function handleOpenResults(prompt: Prompt) {
    // Navigate to the full prompt analysis page
    router.push(`/brands/${brandId}/prompts/${prompt.id}`);
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  const filteredPrompts = prompts.filter((p) =>
    p.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group prompts by set
  const groupedPrompts = promptSets.map((set) => ({
    set,
    prompts: filteredPrompts.filter((p) => p.prompt_set_id === set.id),
  })).filter(g => g.prompts.length > 0);

  const ungroupedPrompts = filteredPrompts.filter((p) => !p.prompt_set_id);

  const totalPrompts = prompts.length;
  const activePrompts = prompts.filter(p => p.is_active).length;
  const totalAnalyses = prompts.reduce((sum, p) => sum + p.total_simulations, 0);
  const avgVisibility = totalAnalyses > 0
    ? Math.round(
        (prompts.reduce((sum, p) => sum + p.visible_simulations, 0) / totalAnalyses) * 100
      )
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Prompts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the search queries used to track your brand visibility
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Prompts
            </Button>
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
                    value={newPromptInput}
                    onChange={(e) => setNewPromptInput(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                  />
                  <Button type="button" onClick={handleAddToQueue} variant="outline">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tip: Paste multiple prompts separated by commas or new lines
                </p>
                
                {/* Sample prompts - only show when queue is empty */}
                {promptsToAdd.length === 0 && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground mb-2">Click to add examples:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "best alternatives to [competitor]",
                        "top [product category] in 2025",
                        "how to choose [product type]",
                        "best [your industry] software UAE",
                      ].map((example, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPromptsToAdd(prev => [...prev, example])}
                          className="px-2 py-1 text-xs rounded-md bg-background border hover:border-primary transition-colors"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Prompts Queue List */}
              {promptsToAdd.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/20 p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium mb-2">
                    {promptsToAdd.length} prompt{promptsToAdd.length > 1 ? 's' : ''} to add:
                  </p>
                  <div className="space-y-1.5">
                    {promptsToAdd.map((prompt, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-background border text-sm group"
                      >
                        <span className="truncate">{prompt}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromQueue(prompt)}
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
                        <span className="flex items-center gap-2">
                          <Folder className="w-4 h-4" />
                          {set.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* New Set Name - only show when "Create new set" is selected */}
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

              {/* Run analysis checkbox */}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Run analysis immediately</Label>
                  <p className="text-xs text-muted-foreground">
                    Analyze new prompts across all AI engines (~{promptsToAdd.length * 4} credits)
                  </p>
                </div>
                <Switch
                  checked={runAnalysisAfterAdd}
                  onCheckedChange={setRunAnalysisAfterAdd}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitPrompts} disabled={isAdding || promptsToAdd.length === 0}>
                {isAdding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    Add {promptsToAdd.length > 0 ? `${promptsToAdd.length} Prompt${promptsToAdd.length > 1 ? 's' : ''}` : 'Prompts'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="metric-card">
          <p className="data-label">Total Prompts</p>
          <p className="metric-card-value mt-1">{totalPrompts}</p>
        </div>
        <div className="metric-card">
          <p className="data-label">Active Prompts</p>
          <p className={cn(
            "metric-card-value mt-1",
            activePrompts > 0 ? "text-success" : "text-muted-foreground"
          )}>
            {activePrompts}
          </p>
        </div>
        <div className="metric-card">
          <p className="data-label">Total Analyses</p>
          <p className="metric-card-value mt-1">{totalAnalyses}</p>
        </div>
        <div className="metric-card">
          <p className="data-label">Avg. Visibility</p>
          <p className={cn(
            "metric-card-value mt-1",
            avgVisibility >= 50 ? "text-success" : avgVisibility >= 25 ? "text-warning" : "text-destructive"
          )}>
            {avgVisibility}%
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filteredPrompts.length} of {totalPrompts} prompts
        </p>
      </div>

      {/* Prompts List */}
      {filteredPrompts.length === 0 ? (
        <div className="enterprise-card">
          <div className="enterprise-card-body py-12 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-2">
              {prompts.length === 0 ? "No prompts yet" : "No matching prompts"}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {prompts.length === 0
                ? "Add search prompts to start tracking your brand visibility across AI engines"
                : "Try adjusting your search query"}
            </p>
            {prompts.length === 0 && (
              <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Your First Prompt
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Grouped Prompts */}
          {groupedPrompts.map(({ set, prompts: groupPrompts }) => (
            <Collapsible
              key={set.id}
              open={expandedGroups.has(set.id)}
              onOpenChange={() => toggleGroup(set.id)}
            >
              <div className="enterprise-card">
                <CollapsibleTrigger asChild>
                  <button className="w-full enterprise-card-header flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Folder className="w-4 h-4 text-primary" />
                      <div className="text-left">
                        <h3 className="font-semibold">{set.name}</h3>
                        {set.description && (
                          <p className="text-xs text-muted-foreground">{set.description}</p>
                        )}
                      </div>
                      <Badge variant="secondary">{groupPrompts.length}</Badge>
                    </div>
                    <ChevronDown className={cn(
                      "w-4 h-4 text-muted-foreground transition-transform",
                      expandedGroups.has(set.id) && "rotate-180"
                    )} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="divide-y divide-border">
                    {groupPrompts.map((prompt) => (
                      <PromptRow
                        key={prompt.id}
                        prompt={prompt}
                        onToggleActive={handleToggleActive}
                        onUpdateRegions={handleUpdateRegions}
                        onDelete={() => setDeletePromptId(prompt.id)}
                        onViewResults={() => handleOpenResults(prompt)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}

          {/* Ungrouped Prompts */}
          {ungroupedPrompts.length > 0 && (
            <Collapsible
              open={expandedGroups.has("ungrouped")}
              onOpenChange={() => toggleGroup("ungrouped")}
            >
              <div className="enterprise-card">
                <CollapsibleTrigger asChild>
                  <button className="w-full enterprise-card-header flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <h3 className="font-semibold">Ungrouped Prompts</h3>
                      <Badge variant="secondary">{ungroupedPrompts.length}</Badge>
                    </div>
                    <ChevronDown className={cn(
                      "w-4 h-4 text-muted-foreground transition-transform",
                      expandedGroups.has("ungrouped") && "rotate-180"
                    )} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="divide-y divide-border">
                    {ungroupedPrompts.map((prompt) => (
                      <PromptRow
                        key={prompt.id}
                        prompt={prompt}
                        onToggleActive={handleToggleActive}
                        onUpdateRegions={handleUpdateRegions}
                        onDelete={() => setDeletePromptId(prompt.id)}
                        onViewResults={() => handleOpenResults(prompt)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletePromptId} onOpenChange={() => setDeletePromptId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Prompt</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this prompt? This will also delete all associated analysis data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePrompt}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Separate component for prompt row
function PromptRow({ 
  prompt, 
  onToggleActive,
  onUpdateRegions,
  onDelete,
  onViewResults,
}: { 
  prompt: Prompt;
  onToggleActive: (id: string, isActive: boolean) => void;
  onUpdateRegions: (id: string, regions: SupportedRegion[]) => void;
  onDelete: () => void;
  onViewResults: () => void;
}) {
  const visibility = prompt.total_simulations > 0
    ? Math.round((prompt.visible_simulations / prompt.total_simulations) * 100)
    : null;

  const selectedRegion = REGIONS.find(r => prompt.analysis_regions.includes(r.id)) || REGIONS[0];

  return (
    <div 
      className={cn(
        "p-4 transition-colors group",
        !prompt.is_active && "opacity-60"
      )}
    >
      <div className="flex items-start gap-4">
        {/* Active Toggle */}
        <div className="pt-1">
          <Switch
            checked={prompt.is_active}
            onCheckedChange={(checked) => onToggleActive(prompt.id, checked)}
            className="data-[state=checked]:bg-success"
          />
        </div>

        {/* Main Content - Clickable */}
        <button 
          className="flex-1 min-w-0 text-left hover:bg-muted/30 -m-2 p-2 rounded-lg transition-colors"
          onClick={onViewResults}
        >
          <p className="font-medium text-sm line-clamp-2">{prompt.text}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            {prompt.total_simulations > 0 ? (
              <>
                <div className="flex items-center gap-1">
                  {visibility !== null && visibility >= 50 ? (
                    <Eye className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span>{visibility ?? 0}% visibility</span>
                </div>
                <span>•</span>
                <span>{prompt.total_simulations} analyses</span>
              </>
            ) : (
              <div className="flex items-center gap-1 text-amber-600">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Not analyzed yet</span>
              </div>
            )}
            {prompt.last_analyzed_at && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Last {new Date(prompt.last_analyzed_at).toLocaleDateString()}</span>
                </div>
              </>
            )}
          </div>
        </button>

        {/* Region Selector */}
        <Select
          value={prompt.analysis_regions[0] || "global"}
          onValueChange={(value) => onUpdateRegions(prompt.id, [value as SupportedRegion])}
        >
          <SelectTrigger className="w-32 h-8 text-xs">
            <Globe className="w-3 h-3 mr-1" />
            <span>{selectedRegion.flag} {selectedRegion.name}</span>
          </SelectTrigger>
          <SelectContent>
            {REGIONS.map((region) => (
              <SelectItem key={region.id} value={region.id}>
                <span className="flex items-center gap-2">
                  <span>{region.flag}</span>
                  <span>{region.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
