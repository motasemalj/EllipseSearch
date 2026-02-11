import { task, tasks } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const finalizeAnalysisBatch = task({
  id: "finalize-analysis-batch",
  maxDuration: 120,
  run: async (payload: { analysis_batch_id: string }, { ctx }) => {
    const supabase = getSupabase();

    const batchId = payload.analysis_batch_id;

    // If batch was already marked completed/failed, don't touch it
    const { data: batch } = await supabase
      .from("analysis_batches")
      .select("id, brand_id, status, total_simulations, completed_simulations, started_at, created_at")
      .eq("id", batchId)
      .maybeSingle();

    if (!batch) return { ok: true };
    if (batch.status === "completed" || batch.status === "failed") return { ok: true };

    const { data: sims, error } = await supabase
      .from("simulations")
      .select("id, enrichment_status, status, error_message")
      .eq("analysis_batch_id", batchId);

    if (error) throw new Error(`Failed to list simulations for batch ${batchId}: ${error.message}`);

    const simulations = sims || [];
    if (simulations.length === 0) return { ok: true };

    const pendingEnrichment = simulations.filter(s => (s as { enrichment_status?: string }).enrichment_status !== "completed" && (s as { enrichment_status?: string }).enrichment_status !== "failed");
    if (pendingEnrichment.length > 0) {
      // Check if the batch has been in processing for too long (stale detection).
      // If more than 10 minutes have passed since the batch started, mark stuck simulations as failed.
      const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
      const batchCreatedAt = (batch as Record<string, unknown>).created_at as string | undefined;
      const batchAgeMs = batchCreatedAt ? Date.now() - new Date(batchCreatedAt).getTime() : 0;

      if (batchAgeMs > STALE_THRESHOLD_MS) {
        console.log(`[finalize-analysis-batch] Batch ${batchId} is stale (${Math.round(batchAgeMs / 1000 / 60)}m old). Marking ${pendingEnrichment.length} stuck simulations as failed.`);
        
        // Mark all pending simulations as failed
        const pendingIds = pendingEnrichment.map(s => (s as { id: string }).id);
        await supabase
          .from("simulations")
          .update({
            enrichment_status: "failed",
            enrichment_error: "Timeout: enrichment did not complete within 10 minutes",
            enrichment_completed_at: new Date().toISOString(),
            analysis_stage: "timeout",
          })
          .in("id", pendingIds);
        
        // Fall through to finalization logic (simulations are now marked failed)
      } else {
        // keep processing
        await supabase
          .from("analysis_batches")
          .update({ status: "processing" })
          .eq("id", batchId);

        // IMPORTANT: Re-schedule finalization so we don't get stuck when enrichment is pending.
        // This handles cases where analyze-rpa-simulation hasn't run yet or is still running.
        const childVersion = ctx.run.version ?? ctx.deployment?.version;
        await tasks.trigger(
          "finalize-analysis-batch",
          { analysis_batch_id: batchId },
          {
            debounce: { key: `finalize-${batchId}`, delay: "15s", mode: "trailing" },
            ...(childVersion ? { version: childVersion } : {}),
          }
        );

        return { ok: true, pending: pendingEnrichment.length };
      }
    }

    // If a brand crawl is currently running (triggered around the same time), keep the batch "processing"
    // so the UI doesn't show "finished" while crawl-trigger jobs are still running.
    //
    // We only consider crawls created after this batch started (or batch created_at as fallback).
    const batchStartIso = (batch as Record<string, unknown>).started_at || (batch as Record<string, unknown>).created_at;
    const batchStartMs = batchStartIso ? new Date(batchStartIso as string).getTime() : Date.now();
    const crawlWindowStartIso = new Date(batchStartMs - 5 * 60 * 1000).toISOString(); // 5m grace window

    const { data: activeCrawl } = await supabase
      .from("crawl_jobs")
      .select("id, status, created_at")
      .eq("brand_id", (batch as Record<string, unknown>).brand_id as string)
      .in("status", ["pending", "crawling"])
      .gte("created_at", crawlWindowStartIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeCrawl?.id) {
      await supabase.from("analysis_batches").update({ status: "processing" }).eq("id", batchId);

      // Re-run finalization after a short delay (self-reschedule) until crawl completes.
      const childVersion = ctx.run.version ?? ctx.deployment?.version;
      await tasks.trigger(
        "finalize-analysis-batch",
        { analysis_batch_id: batchId },
        {
          debounce: { key: `finalize-${batchId}`, delay: "15s", mode: "trailing" },
          ...(childVersion ? { version: childVersion } : {}),
        }
      );

      return { ok: true, pending_crawl: true, crawl_job_id: activeCrawl.id };
    }

    const failedCount = simulations.filter(s => (s as { status?: string }).status === "failed").length;
    const finalStatus = failedCount === simulations.length ? "failed" : "completed";

    await supabase
      .from("analysis_batches")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        error_message: failedCount > 0 ? `${failedCount} simulations failed` : null,
      })
      .eq("id", batchId);

    return { ok: true, status: finalStatus };
  },
});


