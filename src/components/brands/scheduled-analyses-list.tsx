"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  Trash2,
  Pause,
  Play,
  Loader2,
  Repeat,
  ChevronRight,
} from "lucide-react";
import { ChatGPTIcon, PerplexityIcon, GeminiIcon, GrokIcon } from "@/components/ui/engine-badge";
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
import { toast } from "sonner";
import type { SupportedEngine } from "@/types";

interface ScheduledAnalysis {
  id: string;
  brand_id: string;
  prompt_id: string | null;
  prompt_set_id: string | null;
  engines: SupportedEngine[];
  language: string;
  region: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string;
  run_count: number;
  created_at: string;
  prompts?: { id: string; text: string } | null;
  prompt_sets?: { id: string; name: string } | null;
}

interface ScheduledAnalysesListProps {
  brandId: string;
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

const engineIcons: Record<SupportedEngine, React.ReactNode> = {
  chatgpt: <ChatGPTIcon className="w-3.5 h-3.5" />,
  perplexity: <PerplexityIcon className="w-3.5 h-3.5" />,
  gemini: <GeminiIcon className="w-3.5 h-3.5" />,
  grok: <GrokIcon className="w-3.5 h-3.5" />,
};

export function ScheduledAnalysesList({ brandId }: ScheduledAnalysesListProps) {
  const [schedules, setSchedules] = useState<ScheduledAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scheduleToDelete, setScheduleToDelete] = useState<ScheduledAnalysis | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/analysis/schedules?brand_id=${brandId}`);
      const data = await response.json();
      
      if (response.ok) {
        setSchedules(data.schedules || []);
      }
    } catch (error) {
      console.error("Failed to fetch schedules:", error);
    } finally {
      setIsLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleToggleActive = async (schedule: ScheduledAnalysis) => {
    setTogglingId(schedule.id);
    try {
      const response = await fetch("/api/analysis/schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: schedule.id,
          is_active: !schedule.is_active,
        }),
      });

      if (response.ok) {
        setSchedules(prev => 
          prev.map(s => 
            s.id === schedule.id ? { ...s, is_active: !s.is_active } : s
          )
        );
        toast.success(schedule.is_active ? "Schedule paused" : "Schedule resumed");
      } else {
        toast.error("Failed to update schedule");
      }
    } catch {
      toast.error("Failed to update schedule");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!scheduleToDelete) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch("/api/analysis/schedules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule_id: scheduleToDelete.id }),
      });

      if (response.ok) {
        setSchedules(prev => prev.filter(s => s.id !== scheduleToDelete.id));
        toast.success("Schedule deleted");
        setScheduleToDelete(null);
      } else {
        toast.error("Failed to delete schedule");
      }
    } catch {
      toast.error("Failed to delete schedule");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatNextRun = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `in ${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      return "soon";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading schedules...
      </div>
    );
  }

  if (schedules.length === 0) {
    return null; // Don't show section if no schedules
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Repeat className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Scheduled Analyses</h3>
        <Badge variant="outline" className="text-[10px]">
          {schedules.filter(s => s.is_active).length} active
        </Badge>
      </div>
      
      <div className="space-y-2">
        {schedules.map((schedule) => {
          const targetText = schedule.prompts?.text || schedule.prompt_sets?.name || "Unknown";
          const truncatedTarget = targetText.length > 50 ? targetText.slice(0, 50) + "..." : targetText;
          
          return (
            <div
              key={schedule.id}
              className={`group flex items-center gap-3 p-3 rounded-lg border transition-all ${
                schedule.is_active 
                  ? "bg-gradient-to-r from-blue-500/5 to-purple-500/5 border-blue-500/20" 
                  : "bg-muted/30 border-border opacity-60"
              }`}
            >
              {/* Frequency Badge */}
              <div className={`flex-shrink-0 p-2 rounded-md ${
                schedule.is_active 
                  ? "bg-gradient-to-br from-blue-500/20 to-purple-500/20" 
                  : "bg-muted"
              }`}>
                <Calendar className={`w-4 h-4 ${
                  schedule.is_active ? "text-blue-500" : "text-muted-foreground"
                }`} />
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                    schedule.is_active
                      ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {FREQUENCY_LABELS[schedule.frequency]}
                  </span>
                  <div className="flex items-center gap-1">
                    {schedule.engines.map(engine => (
                      <span key={engine} className="opacity-60">
                        {engineIcons[engine]}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-sm font-medium truncate">{truncatedTarget}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {schedule.is_active && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Next: {formatNextRun(schedule.next_run_at)}
                    </span>
                  )}
                  <span>
                    {schedule.run_count} run{schedule.run_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => handleToggleActive(schedule)}
                  disabled={togglingId === schedule.id}
                >
                  {togglingId === schedule.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : schedule.is_active ? (
                    <Pause className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-green-500" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={() => setScheduleToDelete(schedule)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-30" />
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!scheduleToDelete} onOpenChange={(open) => !open && setScheduleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Delete Schedule?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will stop recurring analysis for this prompt. Past analysis results will not be deleted.
              {scheduleToDelete && (
                <span className="block mt-2 font-medium text-foreground">
                  {FREQUENCY_LABELS[scheduleToDelete.frequency]} analysis
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
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

