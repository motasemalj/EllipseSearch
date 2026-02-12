import { schedules } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { tasks } from "@trigger.dev/sdk/v3";
import type { SupportedEngine, SupportedLanguage, SupportedRegion, RunAnalysisInput } from "@/types";
import { isRpaAvailable } from "@/lib/rpa/status";

// Create admin Supabase client for scheduled job
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const getAdminClient = () => createClient(supabaseUrl, supabaseServiceKey);

interface ScheduledAnalysis {
  id: string;
  brand_id: string;
  prompt_id: string | null;
  prompt_set_id: string | null;
  engines: SupportedEngine[];
  language: SupportedLanguage;
  region: SupportedRegion;
  enable_hallucination_watchdog: boolean;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | '1x_daily' | '3x_daily' | '6x_daily';
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string;
  run_count: number;
}

// Calculate next run time based on frequency
function calculateNextRunTime(frequency: string, fromTime: Date = new Date()): Date {
  const now = new Date(fromTime);

  // For daily multi-run schedules, align to fixed UTC slots.
  // 1x_daily: 08:00 UTC
  // 3x_daily: 08:00, 14:00, 20:00 UTC
  // 6x_daily: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC
  const slotHours =
    frequency === "6x_daily" ? [0, 4, 8, 12, 16, 20] :
    frequency === "3x_daily" ? [8, 14, 20] :
    frequency === "1x_daily" ? [8] :
    null;

  if (slotHours) {
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    const currentHour = now.getUTCHours();
    const nextHour = slotHours.find((h) => h > currentHour) ?? slotHours[0];
    next.setUTCHours(nextHour, 0, 0, 0);
    if (nextHour <= currentHour) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  const next = new Date(now);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }
  return next;
}

/**
 * Scheduled task that runs every hour to check for due scheduled analyses.
 * This is a centralized scheduler that processes all user-defined recurring analyses.
 */
export const runScheduledAnalysesTask = schedules.task({
  id: "run-scheduled-analyses",
  cron: "0 * * * *", // Every hour at minute 0
  run: async (payload) => {
    const supabase = getAdminClient();
    const now = new Date();
    
    console.log(`[Scheduler] Checking for due scheduled analyses at ${now.toISOString()}`);
    
    // Fetch all active schedules that are due (next_run_at <= now)
    const { data: dueSchedules, error: fetchError } = await supabase
      .from("scheduled_analyses")
      .select(`
        *,
        brands (
          id,
          name,
          domain,
          organization_id,
          organizations (
            id,
            tier
          )
        )
      `)
      .eq("is_active", true)
      .lte("next_run_at", now.toISOString())
      .order("next_run_at", { ascending: true })
      .limit(50); // Process max 50 per run to avoid timeout
    
    if (fetchError) {
      console.error("[Scheduler] Failed to fetch scheduled analyses:", fetchError);
      throw new Error(`Failed to fetch scheduled analyses: ${fetchError.message}`);
    }
    
    if (!dueSchedules || dueSchedules.length === 0) {
      console.log("[Scheduler] No scheduled analyses due");
      return { processed: 0, skipped: 0, failed: 0 };
    }
    
    console.log(`[Scheduler] Found ${dueSchedules.length} scheduled analyses to run`);
    
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const schedule of dueSchedules as (ScheduledAnalysis & { brands: { organizations: { tier: string } } })[]) {
      try {
        // Get prompts (brand-level schedules run all active prompts for the brand)
        let promptsToProcess: { id: string; text: string }[] = [];

        if (schedule.prompt_id) {
          const { data: prompt } = await supabase
            .from("prompts")
            .select("id, text")
            .eq("id", schedule.prompt_id)
            .single();
          if (prompt) promptsToProcess = [prompt];
        } else if (schedule.prompt_set_id) {
          const { data: prompts } = await supabase
            .from("prompts")
            .select("id, text")
            .eq("prompt_set_id", schedule.prompt_set_id);
          promptsToProcess = prompts || [];
        } else {
          const { data: prompts } = await supabase
            .from("prompts")
            .select("id, text")
            .eq("brand_id", schedule.brand_id)
            .eq("is_active", true);
          promptsToProcess = prompts || [];
        }

        const promptCount = promptsToProcess.length;
        if (promptCount === 0) {
          // Keep schedule active, but don't run empty analyses.
          const nextRunAt = calculateNextRunTime(schedule.frequency, now);
          await supabase
            .from("scheduled_analyses")
            .update({ next_run_at: nextRunAt.toISOString() })
            .eq("id", schedule.id);
          console.log(`[Scheduler] Skipping schedule ${schedule.id} - no active prompts (next: ${nextRunAt.toISOString()})`);
          skipped++;
          continue;
        }
        
        const totalSimulations = promptCount * schedule.engines.length;
        
        // Determine RPA vs API routing
        const rpaStatus = await isRpaAvailable();
        const rpaAvailableForChatGPT = rpaStatus.available && rpaStatus.engines.includes('chatgpt');
        
        const rpaEngines: SupportedEngine[] = [];
        const apiEngines: SupportedEngine[] = [];
        
        for (const engine of schedule.engines) {
          if (engine === 'chatgpt' && rpaAvailableForChatGPT) {
            rpaEngines.push(engine);
          } else {
            apiEngines.push(engine);
          }
        }
        
        const hasRpaWork = rpaEngines.length > 0;
        const hasApiWork = apiEngines.length > 0;
        const batchStatus = hasRpaWork && !hasApiWork ? "awaiting_rpa" : "processing";
        
        // Create analysis batch
        const { data: batch, error: batchError } = await supabase
          .from("analysis_batches")
          .insert({
            brand_id: schedule.brand_id,
            prompt_set_id: schedule.prompt_set_id,
            prompt_id: schedule.prompt_id,
            scheduled_analysis_id: schedule.id,
            status: batchStatus,
            engines: schedule.engines,
            language: schedule.language,
            region: schedule.region,
            total_simulations: totalSimulations,
            completed_simulations: 0,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();
        
        if (batchError) {
          console.error(`[Scheduler] Failed to create batch for schedule ${schedule.id}:`, batchError);
          failed++;
          continue;
        }
        
        // Create RPA simulations if needed
        if (hasRpaWork && promptsToProcess.length > 0) {
          const rpaSimulations = promptsToProcess.flatMap(prompt =>
            rpaEngines.map(engine => ({
              brand_id: schedule.brand_id,
              prompt_id: prompt.id,
              prompt_text: prompt.text,
              analysis_batch_id: batch.id,
              engine,
              language: schedule.language,
              region: schedule.region,
              status: "awaiting_rpa",
            }))
          );
          
          await supabase.from("simulations").insert(rpaSimulations);
        }
        
        // Trigger API jobs if needed
        if (hasApiWork) {
          const payload: RunAnalysisInput = {
            brand_id: schedule.brand_id,
            prompt_set_id: schedule.prompt_set_id || undefined,
            prompt_ids: schedule.prompt_id
              ? [schedule.prompt_id]
              : schedule.prompt_set_id
                ? undefined
                : promptsToProcess.map((p) => p.id),
            engines: apiEngines,
            language: schedule.language,
            region: schedule.region,
            enable_hallucination_watchdog: schedule.enable_hallucination_watchdog,
            simulation_mode: 'api',
          };
          
          await tasks.trigger("run-keyword-set-analysis", payload);
        }
        
        // Update schedule with new run time and count
        const nextRunAt = calculateNextRunTime(schedule.frequency, now);
        
        await supabase
          .from("scheduled_analyses")
          .update({
            last_run_at: now.toISOString(),
            next_run_at: nextRunAt.toISOString(),
            run_count: (schedule.run_count || 0) + 1,
          })
          .eq("id", schedule.id);
        
        console.log(`[Scheduler] Started analysis for schedule ${schedule.id}, next run: ${nextRunAt.toISOString()}`);
        processed++;
        
      } catch (error) {
        console.error(`[Scheduler] Error processing schedule ${schedule.id}:`, error);
        failed++;
      }
    }
    
    console.log(`[Scheduler] Completed: ${processed} processed, ${skipped} skipped, ${failed} failed`);
    
    return { 
      processed, 
      skipped, 
      failed,
      timestamp: payload.timestamp.toISOString(),
    };
  },
});

