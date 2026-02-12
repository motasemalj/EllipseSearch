/**
 * Simple in-memory client-side data cache (stale-while-revalidate pattern).
 *
 * When a user navigates away and back, the cached data shows instantly
 * while a background refetch keeps it fresh. This eliminates the blank
 * loading state on repeated visits during the same session.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** Default stale time: 2 minutes */
const DEFAULT_STALE_MS = 2 * 60 * 1000;

/**
 * Get cached data if it exists and isn't expired.
 */
export function getCached<T>(key: string, maxAgeMs: number = DEFAULT_STALE_MS): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Set data in the cache.
 */
export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all keys matching a prefix.
 */
export function invalidateCachePrefix(prefix: string): void {
  const keysToDelete: string[] = [];
  cache.forEach((_, key) => {
    if (key.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => cache.delete(key));
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  cache.clear();
}
