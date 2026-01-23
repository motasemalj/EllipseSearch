/**
 * RPA Worker Status - Database-backed
 * 
 * Uses Supabase to track RPA worker status so it works
 * across all Next.js routes (which don't share memory in dev).
 */

import { createClient } from "@supabase/supabase-js";

// Create Supabase client with service role for internal access
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// How long before a worker is considered offline (seconds)
const HEARTBEAT_TIMEOUT_SECONDS = 30;

/**
 * Update worker status (called from heartbeat endpoint)
 */
export async function updateWorkerStatus(
  workerId: string,
  chromeConnected: boolean,
  enginesReady: string[]
): Promise<void> {
  const supabase = getSupabase();
  
  await supabase
    .from("rpa_workers")
    .upsert({
      id: workerId,
      last_heartbeat: new Date().toISOString(),
      chrome_connected: chromeConnected,
      engines_ready: enginesReady,
    }, { onConflict: "id" });
  
  console.log(`[RPA Status] Worker ${workerId} updated: chrome=${chromeConnected}, engines=${enginesReady.join(",")}`);
}

/**
 * Remove worker (called when worker goes offline)
 */
export async function removeWorker(workerId: string): Promise<void> {
  const supabase = getSupabase();
  
  await supabase
    .from("rpa_workers")
    .delete()
    .eq("id", workerId);
  
  console.log(`[RPA Status] Worker ${workerId} removed`);
}

/**
 * Check if any RPA worker is available
 */
export async function isRpaAvailable(): Promise<{ 
  available: boolean; 
  workerCount: number;
  engines: string[];
}> {
  const supabase = getSupabase();
  
  // Clean up stale workers first
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_SECONDS * 1000).toISOString();
  await supabase
    .from("rpa_workers")
    .delete()
    .lt("last_heartbeat", cutoff);
  
  // Get active workers
  const { data: workers, error } = await supabase
    .from("rpa_workers")
    .select("*")
    .eq("chrome_connected", true)
    .gte("last_heartbeat", cutoff);
  
  if (error || !workers) {
    console.error("[RPA Status] Error checking workers:", error);
    return { available: false, workerCount: 0, engines: [] };
  }
  
  // Collect all engines
  const allEngines = new Set<string>();
  for (const worker of workers) {
    for (const engine of worker.engines_ready || []) {
      allEngines.add(engine);
    }
  }
  
  return {
    available: workers.length > 0,
    workerCount: workers.length,
    engines: Array.from(allEngines),
  };
}

/**
 * Synchronous check using cached result (for backwards compat)
 * Note: This is now async, callers need to await it
 */
export { isRpaAvailable as checkRpaStatus };
