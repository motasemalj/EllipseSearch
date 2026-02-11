/**
 * Job: process-daily-analyses
 * 
 * Central scheduler for the daily analyses system.
 * Runs every 15 minutes to process due daily analysis slots.
 * 
 * KEY FEATURES:
 * 1. Users only see "Daily Analyses: On/Off" - no complexity exposed
 * 2. Runs 3x daily at 8-hour intervals from when first prompts were added
 * 3. Intelligent job spacing to prevent rate limits
 * 4. New prompts sync to batch cycles (1-hour window rule)
 * 
 * FLOW:
 * 1. Find brands with due daily_analysis_slots
 * 2. Create analysis batches for each due slot
 * 3. Queue RPA jobs with intelligent spacing
 * 4. Schedule next slots for tomorrow
 */

import { schedules, task, tasks, queue } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import type { SupportedEngine, SupportedLanguage, SupportedRegion } from "@/types";

// Create admin Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const getAdminClient = () => createClient(supabaseUrl, supabaseServiceKey);

// Supported engines for daily analyses
const ALL_ENGINES: SupportedEngine[] = ['chatgpt', 'perplexity', 'gemini', 'grok'];

// RPA-specific processing queue with limited concurrency
const dailyAnalysisQueue = queue({
  name: "daily-analysis-processor",
  concurrencyLimit: 3, // Process max 3 brands at once to avoid overloading
});

interface DailySlot {
  id: string;
  brand_id: string;
  slot_number: number;
  scheduled_time: string;
  status: string;
  brands: {
    id: string;
    name: string;
    domain: string;
    organization_id: string;
    daily_analyses_enabled: boolean;
    organizations: {
      id: string;
      credits_balance: number;
      tier: string;
    };
  };
}

/**
 * Main scheduled task - runs every 15 minutes to check for due slots
 */
export const processDailyAnalysesTask = schedules.task({
  id: "process-daily-analyses",
  cron: "*/15 * * * *", // Every 15 minutes
  run: async (payload) => {
    const supabase = getAdminClient();
    const now = new Date();
    
    console.log(`[Daily Analyses] Checking for due slots at ${now.toISOString()}`);
    
    // Find all due slots (scheduled_time <= now and status = 'scheduled')
    const { data: dueSlots, error: slotsError } = await supabase
      .from("daily_analysis_slots")
      .select(`
        *,
        brands (
          id,
          name,
          domain,
          organization_id,
          daily_analyses_enabled,
          organizations (
            id,
            credits_balance,
            tier
          )
        )
      `)
      .eq("status", "scheduled")
      .lte("scheduled_time", now.toISOString())
      .order("scheduled_time", { ascending: true })
      .limit(20); // Process max 20 slots per run to avoid timeouts
    
    if (slotsError) {
      console.error("[Daily Analyses] Failed to fetch due slots:", slotsError);
      throw new Error(`Failed to fetch due slots: ${slotsError.message}`);
    }
    
    if (!dueSlots || dueSlots.length === 0) {
      console.log("[Daily Analyses] No due slots found");
      return { processed: 0, skipped: 0, failed: 0 };
    }
    
    console.log(`[Daily Analyses] Found ${dueSlots.length} due slots`);
    
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const slot of dueSlots as DailySlot[]) {
      try {
        const brand = slot.brands;
        const org = brand?.organizations;
        
        // Skip if brand disabled daily analyses
        if (!brand?.daily_analyses_enabled) {
          console.log(`[Daily Analyses] Skipping slot ${slot.id} - daily analyses disabled`);
          await supabase
            .from("daily_analysis_slots")
            .update({ status: "skipped" })
            .eq("id", slot.id);
          skipped++;
          continue;
        }
        
        // Skip if no credits
        if (!org || org.credits_balance <= 0) {
          console.log(`[Daily Analyses] Skipping slot ${slot.id} - no credits`);
          await supabase
            .from("daily_analysis_slots")
            .update({ status: "skipped" })
            .eq("id", slot.id);
          skipped++;
          continue;
        }
        
        // Get active prompts count
        const { count: promptCount } = await supabase
          .from("prompts")
          .select("*", { count: "exact", head: true })
          .eq("brand_id", brand.id)
          .eq("is_active", true);
        
        if (!promptCount || promptCount === 0) {
          console.log(`[Daily Analyses] Skipping slot ${slot.id} - no active prompts`);
          await supabase
            .from("daily_analysis_slots")
            .update({ status: "skipped" })
            .eq("id", slot.id);
          skipped++;
          continue;
        }
        
        // Always use all engines for daily analyses
        const engines = ALL_ENGINES;
        
        const totalSimulations = promptCount * engines.length;
        
        // Check if enough credits
        if (org.credits_balance < totalSimulations) {
          console.log(`[Daily Analyses] Skipping slot ${slot.id} - insufficient credits (need ${totalSimulations}, have ${org.credits_balance})`);
          await supabase
            .from("daily_analysis_slots")
            .update({ status: "skipped" })
            .eq("id", slot.id);
          skipped++;
          continue;
        }
        
        // Mark slot as running
        await supabase
          .from("daily_analysis_slots")
          .update({ 
            status: "running",
            started_at: now.toISOString(),
            prompts_count: promptCount,
            simulations_count: totalSimulations,
          })
          .eq("id", slot.id);
        
        // Trigger the processing job for this slot
        await tasks.trigger("process-daily-analysis-slot", {
          slot_id: slot.id,
          brand_id: brand.id,
          brand_name: brand.name,
          brand_domain: brand.domain,
          organization_id: brand.organization_id,
          engines,
          prompt_count: promptCount,
          total_simulations: totalSimulations,
        });
        
        console.log(`[Daily Analyses] Started processing slot ${slot.id} for ${brand.name}`);
        processed++;
        
      } catch (error) {
        console.error(`[Daily Analyses] Error processing slot ${slot.id}:`, error);
        
        // Mark slot as failed
        await supabase
          .from("daily_analysis_slots")
          .update({ status: "failed" })
          .eq("slot.id", slot.id);
        
        failed++;
      }
    }
    
    // Schedule slots for tomorrow for brands that completed all 3 slots today
    await scheduleNextDaySlots(supabase);
    
    console.log(`[Daily Analyses] Completed: ${processed} processed, ${skipped} skipped, ${failed} failed`);
    
    return {
      processed,
      skipped,
      failed,
      timestamp: payload.timestamp.toISOString(),
    };
  },
});

/**
 * Process a single daily analysis slot
 * Creates batch, queues RPA jobs with intelligent spacing
 */
export const processDailyAnalysisSlot = task({
  id: "process-daily-analysis-slot",
  maxDuration: 300, // 5 minutes max
  queue: dailyAnalysisQueue,
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
  },
  
  run: async (payload: {
    slot_id: string;
    brand_id: string;
    brand_name: string;
    brand_domain: string;
    organization_id: string;
    engines: SupportedEngine[];
    prompt_count: number;
    total_simulations: number;
  }) => {
    const supabase = getAdminClient();
    const {
      slot_id,
      brand_id,
      brand_name,
      engines,
      total_simulations,
    } = payload;
    
    console.log(`[Slot ${slot_id}] Processing daily analysis for ${brand_name}`);
    
    try {
      // Get all active prompts
      const { data: prompts, error: promptsError } = await supabase
        .from("prompts")
        .select("id, text")
        .eq("brand_id", brand_id)
        .eq("is_active", true);
      
      if (promptsError || !prompts || prompts.length === 0) {
        throw new Error(`No active prompts found for brand ${brand_id}`);
      }
      
      // Get brand settings for language/region
      const { data: brand } = await supabase
        .from("brands")
        .select("languages, primary_location")
        .eq("id", brand_id)
        .single();
      
      const language: SupportedLanguage = (brand?.languages?.[0] as SupportedLanguage) || 'en';
      const region: SupportedRegion = (brand?.primary_location as SupportedRegion) || 'global';
      
      // Create analysis batch
      const { data: batch, error: batchError } = await supabase
        .from("analysis_batches")
        .insert({
          brand_id,
          status: "processing",
          engines,
          language,
          region,
          total_simulations,
          completed_simulations: 0,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (batchError || !batch) {
        throw new Error(`Failed to create batch: ${batchError?.message}`);
      }
      
      // Update slot with batch reference
      await supabase
        .from("daily_analysis_slots")
        .update({ analysis_batch_id: batch.id })
        .eq("id", slot_id);
      
      // Queue RPA jobs using the database function for intelligent spacing
      const { data: jobCount, error: queueError } = await supabase
        .rpc("queue_daily_analysis_jobs", {
          p_brand_id: brand_id,
          p_analysis_batch_id: batch.id,
          p_engines: engines,
          p_language: language,
          p_region: region,
          p_priority: 'normal',
        });
      
      if (queueError) {
        console.warn(`[Slot ${slot_id}] RPC queue failed, falling back to direct insert:`, queueError);
        
        // Fallback: Create jobs directly
        await createJobsDirectly(supabase, brand_id, batch.id, prompts, engines, language, region);
      } else {
        console.log(`[Slot ${slot_id}] Queued ${jobCount} RPA jobs`);
      }
      
      // Update slot status to completed (jobs are now queued for processing)
      await supabase
        .from("daily_analysis_slots")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", slot_id);
      
      // Update brand's next_daily_run_at
      const { data: nextSlot } = await supabase
        .from("daily_analysis_slots")
        .select("scheduled_time")
        .eq("brand_id", brand_id)
        .eq("status", "scheduled")
        .order("scheduled_time", { ascending: true })
        .limit(1)
        .single();
      
      if (nextSlot) {
        await supabase
          .from("brands")
          .update({ next_daily_run_at: nextSlot.scheduled_time })
          .eq("id", brand_id);
      }
      
      console.log(`[Slot ${slot_id}] Completed - batch ${batch.id} with ${prompts.length} prompts x ${engines.length} engines`);
      
      return {
        slot_id,
        batch_id: batch.id,
        prompts_processed: prompts.length,
        engines: engines.length,
        total_jobs: prompts.length * engines.length,
      };
      
    } catch (error) {
      console.error(`[Slot ${slot_id}] Failed:`, error);
      
      // Mark slot as failed
      await supabase
        .from("daily_analysis_slots")
        .update({ status: "failed" })
        .eq("id", slot_id);
      
      throw error;
    }
  },
});

/**
 * Fallback function to create jobs directly when RPC fails
 */
async function createJobsDirectly(
  supabase: ReturnType<typeof getAdminClient>,
  brandId: string,
  batchId: string,
  prompts: { id: string; text: string }[],
  engines: SupportedEngine[],
  language: SupportedLanguage,
  region: SupportedRegion
) {
  const jobs = [];
  let jobIndex = 0;
  const now = new Date();
  
  // Get engine rate limits
  const { data: limits } = await supabase
    .from("rpa_engine_limits")
    .select("engine, min_delay_seconds");
  
  const delayMap: Record<string, number> = {};
  for (const limit of limits || []) {
    delayMap[limit.engine] = limit.min_delay_seconds || 20;
  }
  
  for (const prompt of prompts) {
    for (const engine of engines) {
      const delay = delayMap[engine] || 20;
      const scheduledAt = new Date(now.getTime() + (jobIndex * delay * 1000));
      
      jobs.push({
        brand_id: brandId,
        prompt_id: prompt.id,
        analysis_batch_id: batchId,
        engine,
        language,
        region,
        priority: 'normal',
        scheduled_at: scheduledAt.toISOString(),
        earliest_start_at: scheduledAt.toISOString(),
        status: 'pending',
      });
      
      jobIndex++;
    }
  }
  
  // Insert in batches of 100
  for (let i = 0; i < jobs.length; i += 100) {
    const batch = jobs.slice(i, i + 100);
    await supabase.from("rpa_job_queue").insert(batch);
  }
  
  console.log(`[Fallback] Created ${jobs.length} RPA jobs directly`);
}

/**
 * Schedule slots for the next day for brands that completed all 3 slots today
 */
async function scheduleNextDaySlots(supabase: ReturnType<typeof getAdminClient>) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().split('T')[0];
  
  // Find brands with daily analyses enabled that don't have tomorrow's slots
  const { data: brandsNeedingSlots } = await supabase
    .from("brands")
    .select("id, daily_schedule_anchor_time")
    .eq("daily_analyses_enabled", true)
    .not("daily_schedule_anchor_time", "is", null);
  
  if (!brandsNeedingSlots || brandsNeedingSlots.length === 0) {
    return;
  }
  
  for (const brand of brandsNeedingSlots) {
    // Check if tomorrow's slots already exist
    const { count: existingCount } = await supabase
      .from("daily_analysis_slots")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brand.id)
      .gte("scheduled_time", tomorrowDate)
      .lt("scheduled_time", `${tomorrowDate}T23:59:59`);
    
    if (existingCount && existingCount >= 3) {
      continue; // Already has tomorrow's slots
    }
    
    // Calculate tomorrow's slots from anchor time
    const anchorTime = new Date(brand.daily_schedule_anchor_time);
    const anchorHour = anchorTime.getUTCHours();
    const anchorMinute = anchorTime.getUTCMinutes();
    
    const slots = [
      { slot_number: 1, hours: anchorHour },
      { slot_number: 2, hours: (anchorHour + 8) % 24 },
      { slot_number: 3, hours: (anchorHour + 16) % 24 },
    ];
    
    for (const slot of slots) {
      const slotTime = new Date(tomorrow);
      slotTime.setUTCHours(slot.hours, anchorMinute, 0, 0);
      
      // If slot time wrapped to next day, adjust
      if (slot.hours < anchorHour && slot.slot_number > 1) {
        slotTime.setDate(slotTime.getDate() + 1);
      }
      
      // Insert slot (ignore conflicts)
      await supabase
        .from("daily_analysis_slots")
        .insert({
          brand_id: brand.id,
          slot_number: slot.slot_number,
          scheduled_time: slotTime.toISOString(),
          status: "scheduled",
        })
        .select()
        .maybeSingle(); // Ignore duplicates
    }
  }
}

/**
 * Task to process the RPA job queue
 * Runs frequently to pick up and process queued jobs
 */
export const processRpaJobQueue = schedules.task({
  id: "process-rpa-job-queue",
  cron: "*/2 * * * *", // Every 2 minutes
  run: async () => {
    const supabase = getAdminClient();
    const now = new Date();
    
    // Find jobs that are ready to process
    const { data: pendingJobs, error: jobsError } = await supabase
      .from("rpa_job_queue")
      .select(`
        *,
        prompts (text),
        brands (name, domain, brand_aliases)
      `)
      .eq("status", "pending")
      .lte("earliest_start_at", now.toISOString())
      .order("priority", { ascending: false })
      .order("scheduled_at", { ascending: true })
      .limit(10); // Process 10 jobs at a time
    
    if (jobsError) {
      console.error("[RPA Queue] Failed to fetch pending jobs:", jobsError);
      return { processed: 0, error: jobsError.message };
    }
    
    if (!pendingJobs || pendingJobs.length === 0) {
      return { processed: 0, message: "No pending jobs" };
    }
    
    console.log(`[RPA Queue] Found ${pendingJobs.length} pending jobs`);
    
    // Group jobs by engine to respect rate limits
    const jobsByEngine: Record<string, typeof pendingJobs> = {};
    for (const job of pendingJobs) {
      if (!jobsByEngine[job.engine]) {
        jobsByEngine[job.engine] = [];
      }
      jobsByEngine[job.engine].push(job);
    }
    
    // Process one job per engine to distribute load
    const jobsToProcess = [];
    for (const engine of Object.keys(jobsByEngine)) {
      // Check engine rate limits
      const { data: limits } = await supabase
        .from("rpa_engine_limits")
        .select("*")
        .eq("engine", engine)
        .single();
      
      if (limits) {
        // Skip if in cooldown
        if (limits.current_cooldown_until && new Date(limits.current_cooldown_until) > now) {
          console.log(`[RPA Queue] Engine ${engine} in cooldown until ${limits.current_cooldown_until}`);
          continue;
        }
        
        // Skip if in error backoff
        if (limits.error_backoff_until && new Date(limits.error_backoff_until) > now) {
          console.log(`[RPA Queue] Engine ${engine} in error backoff until ${limits.error_backoff_until}`);
          continue;
        }
      }
      
      // Take first job for this engine
      const job = jobsByEngine[engine][0];
      if (job) {
        jobsToProcess.push(job);
      }
    }
    
    // Trigger simulation tasks for selected jobs
    let processed = 0;
    for (const job of jobsToProcess) {
      try {
        // Mark job as processing
        await supabase
          .from("rpa_job_queue")
          .update({
            status: "processing",
            started_at: now.toISOString(),
            attempt_count: job.attempt_count + 1,
          })
          .eq("id", job.id);
        
        // Create simulation record
        const { data: simulation, error: simError } = await supabase
          .from("simulations")
          .insert({
            brand_id: job.brand_id,
            prompt_id: job.prompt_id,
            prompt_text: job.prompts?.text || "",
            analysis_batch_id: job.analysis_batch_id,
            engine: job.engine,
            language: job.language,
            region: job.region,
            status: "awaiting_rpa",
            selection_signals: {
              hallucination_watchdog: { enabled: false },
              rpa_job_id: job.id,
            },
          })
          .select()
          .single();
        
        if (simError) {
          console.error(`[RPA Queue] Failed to create simulation for job ${job.id}:`, simError);
          
          // Mark job as failed
          await supabase
            .from("rpa_job_queue")
            .update({
              status: "failed",
              last_error: simError.message,
            })
            .eq("id", job.id);
          
          continue;
        }
        
        // Update job with simulation reference
        await supabase
          .from("rpa_job_queue")
          .update({ status: "completed", completed_at: now.toISOString() })
          .eq("id", job.id);
        
        console.log(`[RPA Queue] Created simulation ${simulation.id} for job ${job.id}`);
        processed++;
        
        // Update engine rate limit tracking
        await supabase
          .from("rpa_engine_limits")
          .update({
            last_request_at: now.toISOString(),
            requests_in_current_minute: supabase.rpc("increment", { x: 1 }),
          })
          .eq("engine", job.engine);
        
      } catch (error) {
        console.error(`[RPA Queue] Error processing job ${job.id}:`, error);
        
        // Mark job for retry
        const retryAt = new Date(now.getTime() + Math.pow(2, job.attempt_count) * 60000);
        await supabase
          .from("rpa_job_queue")
          .update({
            status: "pending",
            started_at: null,
            last_error: String(error),
            next_retry_at: retryAt.toISOString(),
          })
          .eq("id", job.id);
      }
    }
    
    return {
      processed,
      total_pending: pendingJobs.length,
      engines_checked: Object.keys(jobsByEngine),
    };
  },
});

