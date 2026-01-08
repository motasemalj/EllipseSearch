import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// =============================================================================
// CACHING UTILITIES FOR ELLIPSE SEARCH
// Uses React cache() for request deduplication within the same request
// =============================================================================

// Cache tags for invalidation
export const CACHE_TAGS = {
  USER: "user",
  PROFILE: "profile",
  BRANDS: "brands",
  SIMULATIONS: "simulations",
  PROMPTS: "prompts",
  BATCHES: "batches",
  ORGANIZATION: "organization",
} as const;

// =============================================================================
// REQUEST-SCOPED CACHE (React cache)
// Deduplicates identical calls within the same request
// This is the recommended approach for dynamic data with cookies/auth
// =============================================================================

/**
 * Get supabase client - deduplicated per request
 * This ensures we don't create multiple clients per request
 */
export const getSupabaseClient = cache(async () => {
  return createClient();
});

/**
 * Get current user - deduplicated per request
 */
export const getCurrentUser = cache(async () => {
  const supabase = await getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Get user profile with organization - deduplicated per request
 */
export const getUserProfile = cache(async (userId: string) => {
  const supabase = await getSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*, organizations(*)")
    .eq("id", userId)
    .single();
  return profile;
});

/**
 * Get brands for an organization - deduplicated per request
 */
export const getCachedBrands = cache(async (organizationId: string) => {
  const supabase = await getSupabaseClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return brands || [];
});

/**
 * Get simulations for brands - deduplicated per request
 */
export const getCachedSimulations = cache(async (brandIds: string[], cutoffDays: number = 90) => {
  if (brandIds.length === 0) return [];
  
  const supabase = await getSupabaseClient();
  const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: simulations } = await supabase
    .from("simulations")
    .select("brand_id, prompt_id, engine, is_visible, selection_signals, created_at")
    .in("brand_id", brandIds)
    .gte("created_at", cutoff);
  
  return simulations || [];
});

/**
 * Get recent batches for brands - deduplicated per request
 */
export const getCachedBatches = cache(async (brandIds: string[], limit: number = 8) => {
  if (brandIds.length === 0) return [];
  
  const supabase = await getSupabaseClient();
  const { data: batches } = await supabase
    .from("analysis_batches")
    .select("*, brands(name)")
    .in("brand_id", brandIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  
  return batches || [];
});

/**
 * Get prompt sets for a brand - deduplicated per request
 */
export const getCachedPromptSets = cache(async (brandId: string) => {
  const supabase = await getSupabaseClient();
  const { data: promptSets } = await supabase
    .from("prompt_sets")
    .select("id, name")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  
  return promptSets || [];
});

/**
 * Get prompts for a brand - deduplicated per request
 */
export const getCachedPrompts = cache(async (brandId: string) => {
  const supabase = await getSupabaseClient();
  const { data: prompts } = await supabase
    .from("prompts")
    .select("id, text, prompt_set_id, last_checked_at, prompt_sets(name)")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  
  return prompts || [];
});

/**
 * Get a single brand - deduplicated per request
 */
export const getCachedBrand = cache(async (brandId: string, organizationId: string) => {
  const supabase = await getSupabaseClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .eq("organization_id", organizationId)
    .single();
  
  return brand;
});

/**
 * Get brand simulations - deduplicated per request
 */
export const getCachedBrandSimulations = cache(async (brandId: string, cutoffDays: number = 90) => {
  const supabase = await getSupabaseClient();
  const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: simulations } = await supabase
    .from("simulations")
    .select("prompt_id, engine, is_visible, selection_signals, created_at")
    .eq("brand_id", brandId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });
  
  return simulations || [];
});

// =============================================================================
// CACHE INVALIDATION HELPERS
// =============================================================================

import { revalidatePath } from "next/cache";

/**
 * Invalidate all caches for a specific path
 */
export function invalidatePath(path: string) {
  revalidatePath(path);
}

/**
 * Invalidate dashboard related paths
 */
export function invalidateDashboard() {
  revalidatePath("/dashboard");
  revalidatePath("/brands");
}

/**
 * Invalidate brand related paths
 */
export function invalidateBrand(brandId: string) {
  revalidatePath(`/brands/${brandId}`);
  revalidatePath("/brands");
  revalidatePath("/dashboard");
}
