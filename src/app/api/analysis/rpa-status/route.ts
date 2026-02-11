/**
 * RPA Status API
 * 
 * Returns the status of the RPA queue and worker health.
 * Used by the UI to show if RPA worker is active and how many jobs are queued.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role for status checks
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  
  try {
    // Get optional brand_id filter
    const { searchParams } = new URL(request.url);
    const brandId = searchParams.get("brand_id");
    
    // Count jobs awaiting RPA
    let awaitingQuery = supabase
      .from("simulations")
      .select("id", { count: "exact", head: true })
      .eq("status", "awaiting_rpa");
    
    if (brandId) {
      awaitingQuery = awaitingQuery.eq("brand_id", brandId);
    }
    
    const { count: awaitingCount } = await awaitingQuery;
    
    // Count jobs currently processing (picked up by RPA)
    let processingQuery = supabase
      .from("simulations")
      .select("id, updated_at", { count: "exact" })
      .eq("status", "processing")
      .order("updated_at", { ascending: false })
      .limit(1);
    
    if (brandId) {
      processingQuery = processingQuery.eq("brand_id", brandId);
    }
    
    const { count: processingCount, data: processingJobs } = await processingQuery;
    
    // Check if worker is active (has updated a job in the last 5 minutes)
    let isWorkerActive = false;
    let lastActivityAt: string | null = null;
    
    if (processingJobs && processingJobs.length > 0) {
      const lastUpdate = new Date(processingJobs[0].updated_at);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      isWorkerActive = lastUpdate > fiveMinutesAgo;
      lastActivityAt = processingJobs[0].updated_at;
    }
    
    // If no processing jobs, check for recently completed ones
    if (!isWorkerActive) {
      let recentQuery = supabase
        .from("simulations")
        .select("updated_at")
        .eq("status", "completed")
        .gte("updated_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .order("updated_at", { ascending: false })
        .limit(1);
      
      if (brandId) {
        recentQuery = recentQuery.eq("brand_id", brandId);
      }
      
      const { data: recentJobs } = await recentQuery;
      
      if (recentJobs && recentJobs.length > 0) {
        isWorkerActive = true;
        lastActivityAt = recentJobs[0].updated_at;
      }
    }
    
    // Count stale jobs (awaiting_rpa for more than 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    let staleQuery = supabase
      .from("simulations")
      .select("id", { count: "exact", head: true })
      .eq("status", "awaiting_rpa")
      .lt("created_at", thirtyMinutesAgo);
    
    if (brandId) {
      staleQuery = staleQuery.eq("brand_id", brandId);
    }
    
    const { count: staleCount } = await staleQuery;
    
    return NextResponse.json({
      success: true,
      queue: {
        awaiting_rpa: awaitingCount || 0,
        processing: processingCount || 0,
        stale: staleCount || 0,
        total_pending: (awaitingCount || 0) + (processingCount || 0),
      },
      worker: {
        is_active: isWorkerActive,
        last_activity_at: lastActivityAt,
        status: isWorkerActive ? "active" : (awaitingCount || 0) > 0 ? "idle_with_queue" : "idle",
      },
      // Guidance for user
      message: isWorkerActive 
        ? "RPA worker is actively processing jobs"
        : (awaitingCount || 0) > 0 
          ? "Jobs are queued but RPA worker appears offline. Start the worker with: cd rpa && python worker.py"
          : "No pending RPA jobs",
    });
    
  } catch (error) {
    console.error("[RPA Status] Error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * Heartbeat endpoint for RPA worker to call periodically
 * Updates the rpa_workers table so isRpaAvailable() knows the worker is online
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  
  try {
    // Verify RPA webhook secret
    const authHeader = request.headers.get("authorization");
    const webhookSecret = process.env.RPA_WEBHOOK_SECRET;
    
    if (webhookSecret) {
      const providedSecret = authHeader?.replace("Bearer ", "");
      if (providedSecret !== webhookSecret) {
        return NextResponse.json(
          { error: "Invalid webhook secret" },
          { status: 401 }
        );
      }
    }
    
    // Heartbeats come from a Python worker; occasionally we can get an empty/partial body
    // (client timeout / connection reset). Never throw a 500 here; return a clean 400.
    const raw = await request.text();
    if (!raw || raw.trim().length === 0) {
      return NextResponse.json({ error: "Empty heartbeat body" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON heartbeat body" }, { status: 400 });
    }
    const { 
      worker_id, 
      chrome_connected = true, 
      engines_ready = ["chatgpt"],
      jobs_processed, 
      jobs_failed 
    } = body;
    
    if (!worker_id) {
      return NextResponse.json(
        { error: "worker_id is required" },
        { status: 400 }
      );
    }
    
    // Update the rpa_workers table with heartbeat
    const { error: upsertError } = await supabase
      .from("rpa_workers")
      .upsert({
        id: worker_id,
        last_heartbeat: new Date().toISOString(),
        chrome_connected: chrome_connected,
        engines_ready: engines_ready,
      }, { onConflict: "id" });
    
    if (upsertError) {
      console.error("[RPA Heartbeat] Failed to update worker:", upsertError);
      return NextResponse.json(
        { error: "Failed to update worker status" },
        { status: 500 }
      );
    }
    
    console.log(`[RPA Heartbeat] Worker ${worker_id}: chrome=${chrome_connected}, engines=${engines_ready.join(",")}, processed=${jobs_processed || 0}, failed=${jobs_failed || 0}`);
    
    return NextResponse.json({
      success: true,
      message: "Heartbeat received and worker registered",
      worker_id,
    });
    
  } catch (error) {
    console.error("[RPA Heartbeat] Error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE endpoint to remove a worker (when it shuts down)
 */
export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  
  try {
    // Verify RPA webhook secret
    const authHeader = request.headers.get("authorization");
    const webhookSecret = process.env.RPA_WEBHOOK_SECRET;
    
    if (webhookSecret) {
      const providedSecret = authHeader?.replace("Bearer ", "");
      if (providedSecret !== webhookSecret) {
        return NextResponse.json(
          { error: "Invalid webhook secret" },
          { status: 401 }
        );
      }
    }
    
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get("worker_id");
    
    if (!workerId) {
      return NextResponse.json(
        { error: "worker_id is required" },
        { status: 400 }
      );
    }
    
    await supabase
      .from("rpa_workers")
      .delete()
      .eq("id", workerId);
    
    console.log(`[RPA Heartbeat] Worker ${workerId} removed`);
    
    return NextResponse.json({
      success: true,
      message: "Worker removed",
    });
    
  } catch (error) {
    console.error("[RPA Heartbeat] Error:", error);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
