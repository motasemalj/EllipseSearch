/**
 * API: /api/analysis/rpa-queue
 * 
 * Manages the RPA job queue for intelligent job distribution.
 * 
 * Features:
 * - Claims jobs from rpa_job_queue table
 * - Respects per-engine rate limits
 * - Supports job priorities
 * - Handles job completion/failure
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Create admin Supabase client
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Verify webhook authentication
function verifyAuth(request: NextRequest): { ok: boolean; error?: string } {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.RPA_WEBHOOK_SECRET;
  
  if (!secret) {
    return { ok: false, error: "RPA_WEBHOOK_SECRET not configured" };
  }
  
  if (!authHeader) {
    return { ok: false, error: "Missing authorization header" };
  }
  
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    return { ok: false, error: "Invalid authorization token" };
  }
  
  return { ok: true };
}

/**
 * GET /api/analysis/rpa-queue
 * Fetch and claim pending jobs for a worker
 * 
 * Query params:
 * - worker_id: string (required)
 * - limit: number (default: 5)
 * - engines: comma-separated list of engines to fetch
 */
export async function GET(request: NextRequest) {
  const auth = verifyAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  
  const supabase = getSupabase();
  const searchParams = request.nextUrl.searchParams;
  
  const workerId = searchParams.get("worker_id");
  const limit = parseInt(searchParams.get("limit") || "5");
  const enginesParam = searchParams.get("engines");
  
  if (!workerId) {
    return NextResponse.json({ error: "worker_id is required" }, { status: 400 });
  }
  
  const engines = enginesParam 
    ? enginesParam.split(",").map(e => e.trim())
    : ["chatgpt", "perplexity", "gemini", "grok"];
  
  const now = new Date();
  
  try {
    // First, check if rpa_job_queue table exists by querying it
    // If it doesn't exist, fall back to simulations with awaiting_rpa status
    const { data: queueJobs, error: queueError } = await supabase
      .from("rpa_job_queue")
      .select(`
        *,
        prompts (text),
        brands (name, domain, brand_aliases)
      `)
      .eq("status", "pending")
      .in("engine", engines)
      .lte("earliest_start_at", now.toISOString())
      .order("priority", { ascending: false })
      .order("scheduled_at", { ascending: true })
      .limit(limit);
    
    if (queueError) {
      // Table might not exist yet, fall back to simulations
      console.log("[RPA Queue] Queue table error, falling back to simulations:", queueError.message);
      return fallbackToSimulations(supabase, engines, limit);
    }
    
    if (!queueJobs || queueJobs.length === 0) {
      // No queue jobs, check for legacy simulations
      return fallbackToSimulations(supabase, engines, limit);
    }
    
    // Check engine rate limits
    const { data: limits } = await supabase
      .from("rpa_engine_limits")
      .select("*");
    
    const limitMap: Record<string, { current_cooldown_until?: string; error_backoff_until?: string }> = {};
    for (const limit of limits || []) {
      limitMap[limit.engine] = limit;
    }
    
    // Filter jobs by engine availability
    const availableJobs = queueJobs.filter(job => {
      const engineLimit = limitMap[job.engine];
      if (!engineLimit) return true;
      
      if (engineLimit.current_cooldown_until && new Date(engineLimit.current_cooldown_until) > now) {
        return false;
      }
      if (engineLimit.error_backoff_until && new Date(engineLimit.error_backoff_until) > now) {
        return false;
      }
      return true;
    });
    
    // Format response
    const jobs = availableJobs.slice(0, limit).map(job => ({
      id: job.id,
      brand_id: job.brand_id,
      prompt_id: job.prompt_id,
      prompt_text: job.prompts?.text || "",
      analysis_batch_id: job.analysis_batch_id,
      engine: job.engine,
      language: job.language,
      region: job.region,
      brand_domain: job.brands?.domain || "",
      brand_name: job.brands?.name || "",
      brand_aliases: job.brands?.brand_aliases || [],
      priority: job.priority,
    }));
    
    return NextResponse.json({
      jobs,
      queue_type: "rpa_job_queue",
      total_pending: queueJobs.length,
    });
    
  } catch (error) {
    console.error("[RPA Queue] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}

/**
 * Fallback to legacy simulations table
 */
async function fallbackToSimulations(
  supabase: ReturnType<typeof getSupabase>,
  engines: string[],
  limit: number
) {
  const { data: simulations, error } = await supabase
    .from("simulations")
    .select(`
      *,
      prompts (text),
      brands (name, domain, brand_aliases)
    `)
    .eq("status", "awaiting_rpa")
    .in("engine", engines)
    .order("created_at", { ascending: true })
    .limit(limit);
  
  if (error || !simulations || simulations.length === 0) {
    return NextResponse.json({
      jobs: [],
      queue_type: "simulations",
      total_pending: 0,
    });
  }
  
  const jobs = simulations.map(sim => ({
    id: sim.id,
    brand_id: sim.brand_id,
    prompt_id: sim.prompt_id,
    prompt_text: sim.prompt_text || sim.prompts?.text || "",
    analysis_batch_id: sim.analysis_batch_id,
    engine: sim.engine,
    language: sim.language || "en",
    region: sim.region || "global",
    brand_domain: sim.brands?.domain || "",
    brand_name: sim.brands?.name || "",
    brand_aliases: sim.brands?.brand_aliases || [],
    priority: "normal",
  }));
  
  return NextResponse.json({
    jobs,
    queue_type: "simulations",
    total_pending: simulations.length,
  });
}

/**
 * POST /api/analysis/rpa-queue
 * Mark jobs as claimed/processing
 * 
 * Body: { job_ids: string[], worker_id: string }
 */
export async function POST(request: NextRequest) {
  const auth = verifyAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  
  const supabase = getSupabase();
  const body = await request.json();
  const { job_ids, worker_id } = body;
  
  if (!job_ids || !worker_id) {
    return NextResponse.json(
      { error: "job_ids and worker_id are required" },
      { status: 400 }
    );
  }
  
  const now = new Date();
  
  try {
    // Try to claim in rpa_job_queue first
    const { error: queueError } = await supabase
      .from("rpa_job_queue")
      .update({
        status: "processing",
        claimed_by_worker_id: worker_id,
        claimed_at: now.toISOString(),
        started_at: now.toISOString(),
      })
      .in("id", job_ids)
      .eq("status", "pending");
    
    if (queueError) {
      // Fallback to simulations
      await supabase
        .from("simulations")
        .update({ status: "processing" })
        .in("id", job_ids)
        .eq("status", "awaiting_rpa");
    }
    
    return NextResponse.json({ success: true, claimed: job_ids.length });
    
  } catch (error) {
    console.error("[RPA Queue] Claim error:", error);
    return NextResponse.json(
      { error: "Failed to claim jobs" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/analysis/rpa-queue
 * Complete a job (success or failure)
 * 
 * Body: {
 *   job_id: string,
 *   success: boolean,
 *   error_message?: string,
 *   engine: string
 * }
 */
export async function PATCH(request: NextRequest) {
  const auth = verifyAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  
  const supabase = getSupabase();
  const body = await request.json();
  const { job_id, success, error_message, engine } = body;
  
  if (!job_id || success === undefined) {
    return NextResponse.json(
      { error: "job_id and success are required" },
      { status: 400 }
    );
  }
  
  const now = new Date();
  
  try {
    if (success) {
      // Mark as completed
      await supabase
        .from("rpa_job_queue")
        .update({
          status: "completed",
          completed_at: now.toISOString(),
        })
        .eq("id", job_id);
      
      // Reset engine error count
      if (engine) {
        await supabase
          .from("rpa_engine_limits")
          .update({
            consecutive_errors: 0,
            error_backoff_until: null,
          })
          .eq("engine", engine);
      }
    } else {
      // Get current attempt count
      const { data: job } = await supabase
        .from("rpa_job_queue")
        .select("attempt_count, max_attempts")
        .eq("id", job_id)
        .single();
      
      if (job && job.attempt_count < job.max_attempts) {
        // Schedule retry with exponential backoff
        const retryDelay = Math.pow(2, job.attempt_count) * 60000;
        const nextRetry = new Date(now.getTime() + retryDelay);
        
        await supabase
          .from("rpa_job_queue")
          .update({
            status: "pending",
            claimed_by_worker_id: null,
            claimed_at: null,
            started_at: null,
            last_error: error_message,
            next_retry_at: nextRetry.toISOString(),
          })
          .eq("id", job_id);
      } else {
        // Max retries reached
        await supabase
          .from("rpa_job_queue")
          .update({
            status: "failed",
            completed_at: now.toISOString(),
            last_error: error_message,
          })
          .eq("id", job_id);
      }
      
      // Update engine error tracking
      if (engine) {
        const { data: currentLimit } = await supabase
          .from("rpa_engine_limits")
          .select("consecutive_errors")
          .eq("engine", engine)
          .single();
        
        const errors = (currentLimit?.consecutive_errors || 0) + 1;
        let backoffUntil = null;
        
        if (errors >= 5) {
          backoffUntil = new Date(now.getTime() + 15 * 60000).toISOString(); // 15 min
        } else if (errors >= 3) {
          backoffUntil = new Date(now.getTime() + 5 * 60000).toISOString(); // 5 min
        }
        
        await supabase
          .from("rpa_engine_limits")
          .update({
            consecutive_errors: errors,
            last_error_at: now.toISOString(),
            error_backoff_until: backoffUntil,
          })
          .eq("engine", engine);
      }
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error("[RPA Queue] Complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete job" },
      { status: 500 }
    );
  }
}

