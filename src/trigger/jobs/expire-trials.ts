import { schedules } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";

// Create admin Supabase client for scheduled job
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const getAdminClient = () => createClient(supabaseUrl, supabaseServiceKey);

/**
 * Scheduled task to expire trial subscriptions
 * Runs every hour to check for and expire trials
 */
export const expireTrialsTask = schedules.task({
  id: "expire-trials",
  cron: "0 * * * *", // Every hour at minute 0
  run: async () => {
    const supabase = getAdminClient();
    
    console.log("[Trial Expiry] Checking for expired trials...");
    
    // Find all trial organizations that have expired
    const { data: expiredTrials, error: fetchError } = await supabase
      .from("organizations")
      .select("id, name, trial_expires_at")
      .eq("tier", "trial")
      .eq("trial_converted", false)
      .lt("trial_expires_at", new Date().toISOString());
    
    if (fetchError) {
      console.error("[Trial Expiry] Failed to fetch expired trials:", fetchError);
      return { success: false, error: fetchError.message };
    }
    
    if (!expiredTrials || expiredTrials.length === 0) {
      console.log("[Trial Expiry] No expired trials found");
      return { success: true, expired: 0 };
    }
    
    console.log(`[Trial Expiry] Found ${expiredTrials.length} expired trials`);
    
    let expiredCount = 0;
    const errors: string[] = [];
    
    for (const org of expiredTrials) {
      try {
        // Downgrade to free tier
        const { error: updateError } = await supabase
          .from("organizations")
          .update({
            tier: "free",
            updated_at: new Date().toISOString(),
          })
          .eq("id", org.id);
        
        if (updateError) {
          console.error(`[Trial Expiry] Failed to expire org ${org.id}:`, updateError);
          errors.push(`${org.name}: ${updateError.message}`);
        } else {
          console.log(`[Trial Expiry] Expired trial for: ${org.name} (${org.id})`);
          expiredCount++;
        }
      } catch (err) {
        console.error(`[Trial Expiry] Exception for org ${org.id}:`, err);
        errors.push(`${org.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    
    console.log(`[Trial Expiry] Completed. Expired: ${expiredCount}, Errors: ${errors.length}`);
    
    return {
      success: errors.length === 0,
      expired: expiredCount,
      total: expiredTrials.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});

