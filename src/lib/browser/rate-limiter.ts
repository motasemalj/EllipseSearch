/**
 * Distributed Rate Limiter
 * 
 * Implements intelligent rate limiting to avoid detection:
 * - Per-IP rate tracking
 * - Per-engine rate limits
 * - Time-of-day aware scheduling
 * - Exponential backoff on errors
 * - Global and per-profile limits
 */

import type { SupportedEngine } from '@/types';

// ===========================================
// Types
// ===========================================

export interface RateLimitConfig {
  // Global limits
  globalRequestsPerHour: number;
  globalRequestsPerDay: number;
  
  // Per-engine limits
  engineLimits: {
    [engine in SupportedEngine]: {
      requestsPerHour: number;
      requestsPerDay: number;
      minIntervalMs: number;
      maxConcurrent: number;
    };
  };
  
  // Backoff settings
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
  
  // Time-of-day adjustments
  peakHours: { start: number; end: number };
  peakMultiplier: number;  // Slow down during peak
  
  // Request spacing
  baseIntervalMs: number;
  intervalVariance: number;
}

export interface RateLimitState {
  globalHourlyCount: number;
  globalDailyCount: number;
  hourResetTime: number;
  dayResetTime: number;
  
  engineState: {
    [engine in SupportedEngine]: {
      hourlyCount: number;
      dailyCount: number;
      lastRequestTime: number;
      consecutiveErrors: number;
      currentBackoffMs: number;
      activeConcurrent: number;
    };
  };
  
  ipState: {
    [ip: string]: {
      requestCount: number;
      lastRequestTime: number;
      errorCount: number;
    };
  };
}

// ===========================================
// Default Configuration
// ===========================================

const DEFAULT_CONFIG: RateLimitConfig = {
  globalRequestsPerHour: 100,
  globalRequestsPerDay: 500,
  
  engineLimits: {
    chatgpt: {
      requestsPerHour: 20,
      requestsPerDay: 100,
      minIntervalMs: 30000,  // 30 seconds
      maxConcurrent: 1,
    },
    perplexity: {
      requestsPerHour: 30,
      requestsPerDay: 150,
      minIntervalMs: 20000,  // 20 seconds
      maxConcurrent: 2,
    },
    gemini: {
      requestsPerHour: 25,
      requestsPerDay: 120,
      minIntervalMs: 25000,  // 25 seconds
      maxConcurrent: 2,
    },
    grok: {
      requestsPerHour: 20,
      requestsPerDay: 80,
      minIntervalMs: 30000,  // 30 seconds
      maxConcurrent: 1,
    },
  },
  
  initialBackoffMs: 5000,
  maxBackoffMs: 300000,  // 5 minutes
  backoffMultiplier: 2,
  
  peakHours: { start: 9, end: 17 },
  peakMultiplier: 1.5,
  
  baseIntervalMs: 5000,
  intervalVariance: 0.5,
};

// ===========================================
// Rate Limiter
// ===========================================

export class RateLimiter {
  private config: RateLimitConfig;
  private state: RateLimitState;
  private waitingQueue: Map<string, { resolve: () => void; priority: number }[]> = new Map();
  
  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    this.state = this.initializeState();
    
    // Start cleanup interval
    setInterval(() => this.cleanup(), 60000);
  }
  
  /**
   * Merge configuration with defaults
   */
  private mergeConfig(defaults: RateLimitConfig, overrides: Partial<RateLimitConfig>): RateLimitConfig {
    return {
      ...defaults,
      ...overrides,
      engineLimits: {
        ...defaults.engineLimits,
        ...(overrides.engineLimits || {}),
      },
    };
  }
  
  /**
   * Initialize state
   */
  private initializeState(): RateLimitState {
    const now = Date.now();
    
    return {
      globalHourlyCount: 0,
      globalDailyCount: 0,
      hourResetTime: now + 3600000,
      dayResetTime: now + 86400000,
      engineState: {
        chatgpt: this.createEngineState(),
        perplexity: this.createEngineState(),
        gemini: this.createEngineState(),
        grok: this.createEngineState(),
      },
      ipState: {},
    };
  }
  
  private createEngineState() {
    return {
      hourlyCount: 0,
      dailyCount: 0,
      lastRequestTime: 0,
      consecutiveErrors: 0,
      currentBackoffMs: 0,
      activeConcurrent: 0,
    };
  }
  
  // ===========================================
  // Main API
  // ===========================================
  
  /**
   * Acquire permission to make a request
   * Blocks until request is allowed
   */
  async acquire(engine: SupportedEngine, ipAddress?: string, priority: number = 0): Promise<void> {
    // Check and reset counters
    this.checkResets();
    
    // Wait for rate limit
    await this.waitForAvailability(engine, ipAddress, priority);
    
    // Update counters
    this.recordRequest(engine, ipAddress);
  }
  
  /**
   * Release a slot (for concurrent tracking)
   */
  release(engine: SupportedEngine): void {
    const engineState = this.state.engineState[engine];
    engineState.activeConcurrent = Math.max(0, engineState.activeConcurrent - 1);
    
    // Process waiting queue
    this.processQueue(engine);
  }
  
  /**
   * Report success (reset backoff)
   */
  reportSuccess(engine: SupportedEngine, ipAddress?: string): void {
    const engineState = this.state.engineState[engine];
    engineState.consecutiveErrors = 0;
    engineState.currentBackoffMs = 0;
    
    if (ipAddress && this.state.ipState[ipAddress]) {
      this.state.ipState[ipAddress].errorCount = 0;
    }
  }
  
  /**
   * Report error (increase backoff)
   */
  reportError(engine: SupportedEngine, ipAddress?: string): void {
    const engineState = this.state.engineState[engine];
    engineState.consecutiveErrors++;
    
    // Exponential backoff
    if (engineState.currentBackoffMs === 0) {
      engineState.currentBackoffMs = this.config.initialBackoffMs;
    } else {
      engineState.currentBackoffMs = Math.min(
        engineState.currentBackoffMs * this.config.backoffMultiplier,
        this.config.maxBackoffMs
      );
    }
    
    if (ipAddress) {
      if (!this.state.ipState[ipAddress]) {
        this.state.ipState[ipAddress] = {
          requestCount: 0,
          lastRequestTime: Date.now(),
          errorCount: 0,
        };
      }
      this.state.ipState[ipAddress].errorCount++;
    }
    
    console.log(`[RateLimiter] Error reported for ${engine}, backoff: ${engineState.currentBackoffMs}ms`);
  }
  
  // ===========================================
  // Internal Methods
  // ===========================================
  
  /**
   * Wait until a request can be made
   */
  private async waitForAvailability(
    engine: SupportedEngine, 
    ipAddress?: string,
    priority: number = 0
  ): Promise<void> {
    const engineLimits = this.config.engineLimits[engine];
    const engineState = this.state.engineState[engine];
    
    // Check all limits
    while (true) {
      const waitTime = this.calculateWaitTime(engine, ipAddress);
      
      if (waitTime === 0) {
        // Check concurrent limit
        if (engineState.activeConcurrent >= engineLimits.maxConcurrent) {
          // Add to queue and wait
          await this.addToQueue(engine, priority);
          continue;
        }
        
        // Can proceed
        engineState.activeConcurrent++;
        return;
      }
      
      // Wait with some randomness
      const actualWait = waitTime * (0.8 + Math.random() * 0.4);
      console.log(`[RateLimiter] Waiting ${Math.round(actualWait / 1000)}s for ${engine}`);
      await this.sleep(actualWait);
    }
  }
  
  /**
   * Calculate how long to wait before next request
   */
  private calculateWaitTime(engine: SupportedEngine, ipAddress?: string): number {
    const now = Date.now();
    const engineLimits = this.config.engineLimits[engine];
    const engineState = this.state.engineState[engine];
    
    let maxWait = 0;
    
    // Check global limits
    if (this.state.globalHourlyCount >= this.config.globalRequestsPerHour) {
      maxWait = Math.max(maxWait, this.state.hourResetTime - now);
    }
    
    if (this.state.globalDailyCount >= this.config.globalRequestsPerDay) {
      maxWait = Math.max(maxWait, this.state.dayResetTime - now);
    }
    
    // Check engine limits
    if (engineState.hourlyCount >= engineLimits.requestsPerHour) {
      maxWait = Math.max(maxWait, this.state.hourResetTime - now);
    }
    
    if (engineState.dailyCount >= engineLimits.requestsPerDay) {
      maxWait = Math.max(maxWait, this.state.dayResetTime - now);
    }
    
    // Check minimum interval
    const timeSinceLastRequest = now - engineState.lastRequestTime;
    let minInterval = engineLimits.minIntervalMs;
    
    // Adjust for peak hours
    const hour = new Date().getHours();
    if (hour >= this.config.peakHours.start && hour < this.config.peakHours.end) {
      minInterval *= this.config.peakMultiplier;
    }
    
    // Add variance
    minInterval *= (1 + (Math.random() - 0.5) * this.config.intervalVariance * 2);
    
    if (timeSinceLastRequest < minInterval) {
      maxWait = Math.max(maxWait, minInterval - timeSinceLastRequest);
    }
    
    // Check backoff
    if (engineState.currentBackoffMs > 0) {
      maxWait = Math.max(maxWait, engineState.currentBackoffMs);
    }
    
    // Check IP-specific state
    if (ipAddress && this.state.ipState[ipAddress]) {
      const ipState = this.state.ipState[ipAddress];
      
      // If IP has errors, add extra delay
      if (ipState.errorCount > 0) {
        maxWait = Math.max(maxWait, ipState.errorCount * 10000);
      }
      
      // Minimum interval per IP
      const ipInterval = now - ipState.lastRequestTime;
      if (ipInterval < 10000) {
        maxWait = Math.max(maxWait, 10000 - ipInterval);
      }
    }
    
    return maxWait;
  }
  
  /**
   * Record a request
   */
  private recordRequest(engine: SupportedEngine, ipAddress?: string): void {
    const now = Date.now();
    
    // Global counters
    this.state.globalHourlyCount++;
    this.state.globalDailyCount++;
    
    // Engine counters
    const engineState = this.state.engineState[engine];
    engineState.hourlyCount++;
    engineState.dailyCount++;
    engineState.lastRequestTime = now;
    
    // IP tracking
    if (ipAddress) {
      if (!this.state.ipState[ipAddress]) {
        this.state.ipState[ipAddress] = {
          requestCount: 0,
          lastRequestTime: now,
          errorCount: 0,
        };
      }
      this.state.ipState[ipAddress].requestCount++;
      this.state.ipState[ipAddress].lastRequestTime = now;
    }
  }
  
  /**
   * Check and reset counters
   */
  private checkResets(): void {
    const now = Date.now();
    
    // Hourly reset
    if (now >= this.state.hourResetTime) {
      this.state.globalHourlyCount = 0;
      this.state.hourResetTime = now + 3600000;
      
      for (const engine of Object.keys(this.state.engineState) as SupportedEngine[]) {
        this.state.engineState[engine].hourlyCount = 0;
      }
      
      console.log('[RateLimiter] Hourly counters reset');
    }
    
    // Daily reset
    if (now >= this.state.dayResetTime) {
      this.state.globalDailyCount = 0;
      this.state.dayResetTime = now + 86400000;
      
      for (const engine of Object.keys(this.state.engineState) as SupportedEngine[]) {
        this.state.engineState[engine].dailyCount = 0;
      }
      
      console.log('[RateLimiter] Daily counters reset');
    }
  }
  
  /**
   * Add to waiting queue
   */
  private addToQueue(engine: SupportedEngine, priority: number): Promise<void> {
    return new Promise(resolve => {
      if (!this.waitingQueue.has(engine)) {
        this.waitingQueue.set(engine, []);
      }
      
      this.waitingQueue.get(engine)!.push({ resolve, priority });
      
      // Sort by priority (higher first)
      this.waitingQueue.get(engine)!.sort((a, b) => b.priority - a.priority);
    });
  }
  
  /**
   * Process waiting queue
   */
  private processQueue(engine: SupportedEngine): void {
    const queue = this.waitingQueue.get(engine);
    if (!queue || queue.length === 0) return;
    
    const engineLimits = this.config.engineLimits[engine];
    const engineState = this.state.engineState[engine];
    
    // Release as many as possible
    while (queue.length > 0 && engineState.activeConcurrent < engineLimits.maxConcurrent) {
      const item = queue.shift()!;
      engineState.activeConcurrent++;
      item.resolve();
    }
  }
  
  /**
   * Cleanup old IP tracking data
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [ip, state] of Object.entries(this.state.ipState)) {
      if (now - state.lastRequestTime > maxAge) {
        delete this.state.ipState[ip];
      }
    }
  }
  
  // ===========================================
  // Stats & Monitoring
  // ===========================================
  
  /**
   * Get current statistics
   */
  getStats(): {
    global: { hourly: number; daily: number; hourlyLimit: number; dailyLimit: number };
    engines: {
      [engine in SupportedEngine]: {
        hourly: number;
        daily: number;
        backoff: number;
        concurrent: number;
        waiting: number;
      };
    };
    ips: number;
  } {
    return {
      global: {
        hourly: this.state.globalHourlyCount,
        daily: this.state.globalDailyCount,
        hourlyLimit: this.config.globalRequestsPerHour,
        dailyLimit: this.config.globalRequestsPerDay,
      },
      engines: {
        chatgpt: this.getEngineStats('chatgpt'),
        perplexity: this.getEngineStats('perplexity'),
        gemini: this.getEngineStats('gemini'),
        grok: this.getEngineStats('grok'),
      },
      ips: Object.keys(this.state.ipState).length,
    };
  }
  
  private getEngineStats(engine: SupportedEngine) {
    const state = this.state.engineState[engine];
    const queue = this.waitingQueue.get(engine);
    
    return {
      hourly: state.hourlyCount,
      daily: state.dailyCount,
      backoff: state.currentBackoffMs,
      concurrent: state.activeConcurrent,
      waiting: queue?.length || 0,
    };
  }
  
  /**
   * Check if engine is available (quick check)
   */
  isAvailable(engine: SupportedEngine): boolean {
    const engineLimits = this.config.engineLimits[engine];
    const engineState = this.state.engineState[engine];
    
    return (
      engineState.hourlyCount < engineLimits.requestsPerHour &&
      engineState.dailyCount < engineLimits.requestsPerDay &&
      engineState.activeConcurrent < engineLimits.maxConcurrent
    );
  }
  
  // ===========================================
  // Utilities
  // ===========================================
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===========================================
// Singleton
// ===========================================

let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(config?: Partial<RateLimitConfig>): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(config);
  }
  return rateLimiterInstance;
}

export default RateLimiter;

