"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, XCircle, RefreshCw } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

interface BatchActionsProps {
  batchId: string;
  brandId: string;
  keywordSetId: string;
  status: string;
}

export function BatchActions({ batchId, brandId, keywordSetId, status }: BatchActionsProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const canCancel = status === "queued" || status === "processing";
  const canDelete = status === "completed" || status === "failed" || status === "cancelled";

  async function handleCancel() {
    setIsCancelling(true);

    try {
      const supabase = createClient();

      // Update batch status to cancelled
      const { error: batchError } = await supabase
        .from("analysis_batches")
        .update({
          status: "failed",
          error_message: "Cancelled by user",
          completed_at: new Date().toISOString(),
        })
        .eq("id", batchId);

      if (batchError) {
        toast.error(batchError.message);
        return;
      }

      // Update pending simulations to failed
      await supabase
        .from("simulations")
        .update({
          status: "failed",
          error_message: "Batch cancelled by user",
        })
        .eq("analysis_batch_id", batchId)
        .in("status", ["pending", "processing"]);

      toast.success("Batch cancelled");
      router.refresh();
    } catch {
      toast.error("Failed to cancel batch");
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);

    try {
      const supabase = createClient();

      // Delete will cascade to simulations due to FK constraint
      const { error } = await supabase
        .from("analysis_batches")
        .delete()
        .eq("id", batchId);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Batch deleted");
      router.push(`/brands/${brandId}/keyword-sets/${keywordSetId}`);
    } catch {
      toast.error("Failed to delete batch");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => router.refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </DropdownMenuItem>

        {canCancel && (
          <>
            <DropdownMenuSeparator />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="text-yellow-500"
                >
                  {isCancelling ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="mr-2 h-4 w-4" />
                  )}
                  Cancel Batch
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this batch?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will stop all pending simulations. Completed simulations will be kept.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Running</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancel}
                    className="bg-yellow-600 hover:bg-yellow-700"
                  >
                    Cancel Batch
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}

        <DropdownMenuSeparator />
        
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="text-destructive"
              disabled={!canDelete && canCancel}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete Batch
            </DropdownMenuItem>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this batch?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this batch and all its simulation results.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}




