/**
 * Proxy Manager - Residential Proxy Rotation
 * 
 * Manages rotating residential proxies from multiple providers.
 * Supports sticky sessions, geo-targeting, and health monitoring.
 * 
 * Supported Providers:
 * - Bright Data (Luminati)
 * - Oxylabs
 * - Smartproxy
 * - IPRoyal
 * - Custom/Generic
 */

import type { SupportedEngine, SupportedRegion } from '@/types';

// ===========================================
// Types
// ===========================================

export interface ProxyConfig {
  provider: ProxyProvider;
  
  // Connection
  host: string;
  port: number;
  username?: string;
  password?: string;
  
  // Rotation settings
  rotationType: 'per-request' | 'sticky' | 'session';
  stickyDurationMs?: number;
  
  // Targeting
  country?: string;
  city?: string;
  asn?: string;
  
  // Proxy type
  type: 'residential' | 'datacenter' | 'mobile' | 'isp';
  
  // Health
  isHealthy: boolean;
  lastUsed?: Date;
  failureCount: number;
  successCount: number;
  avgLatencyMs: number;
}

export type ProxyProvider = 
  | 'brightdata' 
  | 'oxylabs' 
  | 'smartproxy' 
  | 'iproyal'
  | 'webshare'
  | 'custom';

export interface ProxyCredentials {
  provider: ProxyProvider;
  username: string;
  password: string;
  zone?: string;  // For Bright Data
  endpoint?: string;  // Custom endpoint
}

export interface ProxyRotationConfig {
  // How many proxies to maintain in the pool
  poolSize: number;
  
  // Retry with different proxy on failure
  retryOnFailure: boolean;
  maxRetries: number;
  
  // Health check interval (ms)
  healthCheckInterval: number;
  
  // Ban proxy after N consecutive failures
  maxConsecutiveFailures: number;
  
  // Minimum time between requests on same proxy (ms)
  minRequestInterval: number;
  
  // Geo-targeting preferences
  preferredCountries: string[];
  
  // Provider priority
  providerPriority: ProxyProvider[];
}

// ===========================================
// Default Configuration
// ===========================================

const DEFAULT_ROTATION_CONFIG: ProxyRotationConfig = {
  poolSize: 10,
  retryOnFailure: true,
  maxRetries: 3,
  healthCheckInterval: 60000,
  maxConsecutiveFailures: 3,
  minRequestInterval: 5000,
  preferredCountries: ['US', 'GB', 'CA', 'AU'],
  providerPriority: ['brightdata', 'oxylabs', 'smartproxy', 'iproyal', 'custom'],
};

// ===========================================
// Provider Endpoints
// ===========================================

// Provider endpoints - can be overridden via environment variables
function getProviderEndpoints(): Record<ProxyProvider, { host: string; port: number }> {
  return {
    brightdata: { 
      host: process.env.BRIGHTDATA_HOST || 'brd.superproxy.io', 
      port: parseInt(process.env.BRIGHTDATA_PORT || '33335', 10) 
    },
    oxylabs: { host: 'pr.oxylabs.io', port: 7777 },
    smartproxy: { host: 'gate.smartproxy.com', port: 7000 },
    iproyal: { host: 'geo.iproyal.com', port: 12321 },
    webshare: { host: 'proxy.webshare.io', port: 80 },
    custom: { host: '', port: 0 },
  };
}

// ===========================================
// Proxy Manager Class
// ===========================================

export class ProxyManager {
  private proxies: Map<string, ProxyConfig> = new Map();
  private credentials: Map<ProxyProvider, ProxyCredentials> = new Map();
  private config: ProxyRotationConfig;
  private lastUsedProxy: Map<SupportedEngine, { proxy: ProxyConfig; usedAt: Date }> = new Map();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  
  constructor(config: Partial<ProxyRotationConfig> = {}) {
    this.config = { ...DEFAULT_ROTATION_CONFIG, ...config };
    this.loadCredentialsFromEnv();
  }
  
  // ===========================================
  // Initialization
  // ===========================================
  
  /**
   * Load proxy credentials from environment variables
   */
  private loadCredentialsFromEnv(): void {
    // Bright Data
    if (process.env.BRIGHTDATA_USERNAME && process.env.BRIGHTDATA_PASSWORD) {
      this.credentials.set('brightdata', {
        provider: 'brightdata',
        username: process.env.BRIGHTDATA_USERNAME,
        password: process.env.BRIGHTDATA_PASSWORD,
        zone: process.env.BRIGHTDATA_ZONE || 'residential',
      });
      console.log('[ProxyManager] Loaded Bright Data credentials');
    }
    
    // Oxylabs
    if (process.env.OXYLABS_USERNAME && process.env.OXYLABS_PASSWORD) {
      this.credentials.set('oxylabs', {
        provider: 'oxylabs',
        username: process.env.OXYLABS_USERNAME,
        password: process.env.OXYLABS_PASSWORD,
      });
      console.log('[ProxyManager] Loaded Oxylabs credentials');
    }
    
    // Smartproxy
    if (process.env.SMARTPROXY_USERNAME && process.env.SMARTPROXY_PASSWORD) {
      this.credentials.set('smartproxy', {
        provider: 'smartproxy',
        username: process.env.SMARTPROXY_USERNAME,
        password: process.env.SMARTPROXY_PASSWORD,
      });
      console.log('[ProxyManager] Loaded Smartproxy credentials');
    }
    
    // IPRoyal
    if (process.env.IPROYAL_USERNAME && process.env.IPROYAL_PASSWORD) {
      this.credentials.set('iproyal', {
        provider: 'iproyal',
        username: process.env.IPROYAL_USERNAME,
        password: process.env.IPROYAL_PASSWORD,
      });
      console.log('[ProxyManager] Loaded IPRoyal credentials');
    }
    
    // Custom proxy list (JSON array)
    if (process.env.CUSTOM_PROXY_LIST) {
      try {
        const customProxies = JSON.parse(process.env.CUSTOM_PROXY_LIST);
        for (const proxy of customProxies) {
          this.addCustomProxy(proxy);
        }
        console.log(`[ProxyManager] Loaded ${customProxies.length} custom proxies`);
      } catch {
        console.warn('[ProxyManager] Failed to parse CUSTOM_PROXY_LIST');
      }
    }
  }
  
  /**
   * Initialize the proxy pool
   */
  async initialize(): Promise<void> {
    // Generate proxy configurations for each provider
    for (const [provider, creds] of Array.from(this.credentials.entries())) {
      const count = Math.ceil(this.config.poolSize / this.credentials.size);
      await this.generateProxiesForProvider(provider, creds, count);
    }
    
    // Start health checks
    this.startHealthChecks();
    
    console.log(`[ProxyManager] Initialized with ${this.proxies.size} proxies`);
  }
  
  /**
   * Generate proxy configurations for a provider
   */
  private async generateProxiesForProvider(
    provider: ProxyProvider,
    creds: ProxyCredentials,
    count: number
  ): Promise<void> {
    const endpoints = getProviderEndpoints();
    const endpoint = endpoints[provider];
    
    for (let i = 0; i < count; i++) {
      for (const country of this.config.preferredCountries) {
        const proxyId = `${provider}-${country}-${i}`;
        
        // Build username with targeting options
        const username = this.buildProxyUsername(provider, creds, country, i);
        
        const proxyConfig: ProxyConfig = {
          provider,
          host: creds.endpoint || endpoint.host,
          port: endpoint.port,
          username,
          password: creds.password,
          rotationType: 'sticky',
          stickyDurationMs: 600000, // 10 minutes
          country,
          type: 'residential',
          isHealthy: true,
          failureCount: 0,
          successCount: 0,
          avgLatencyMs: 0,
        };
        
        this.proxies.set(proxyId, proxyConfig);
      }
    }
  }
  
  /**
   * Build provider-specific username with targeting
   */
  private buildProxyUsername(
    provider: ProxyProvider,
    creds: ProxyCredentials,
    country: string,
    sessionId: number
  ): string {
    switch (provider) {
      case 'brightdata':
        // Format: user-zone-country-session
        return `${creds.username}-zone-${creds.zone || 'residential'}-country-${country.toLowerCase()}-session-${sessionId}`;
      
      case 'oxylabs':
        // Format: user-country-session
        return `customer-${creds.username}-cc-${country.toLowerCase()}-sessid-${sessionId}`;
      
      case 'smartproxy':
        // Format: user-country-session
        return `${creds.username}-country-${country.toLowerCase()}-session-${sessionId}`;
      
      case 'iproyal':
        // Format: user_country_session
        return `${creds.username}_country-${country.toLowerCase()}_session-${sessionId}`;
      
      default:
        return creds.username;
    }
  }
  
  // ===========================================
  // Proxy Selection
  // ===========================================
  
  /**
   * Get the best available proxy for an engine
   */
  async getProxy(engine: SupportedEngine, region?: SupportedRegion): Promise<ProxyConfig | null> {
    // Check if we should reuse the last proxy (sticky session)
    const lastUsed = this.lastUsedProxy.get(engine);
    if (lastUsed) {
      const timeSinceLastUse = Date.now() - lastUsed.usedAt.getTime();
      
      // Reuse if within sticky duration and minimum interval passed
      if (
        lastUsed.proxy.isHealthy &&
        timeSinceLastUse < (lastUsed.proxy.stickyDurationMs || 600000) &&
        timeSinceLastUse > this.config.minRequestInterval
      ) {
        lastUsed.proxy.lastUsed = new Date();
        return lastUsed.proxy;
      }
    }
    
    // Find best available proxy
    const country = this.regionToCountry(region);
    const candidates = Array.from(this.proxies.values())
      .filter(p => p.isHealthy)
      .filter(p => !country || p.country === country)
      .sort((a, b) => {
        // Sort by: provider priority, success rate, latency
        const aPriority = this.config.providerPriority.indexOf(a.provider);
        const bPriority = this.config.providerPriority.indexOf(b.provider);
        
        if (aPriority !== bPriority) return aPriority - bPriority;
        
        const aSuccessRate = a.successCount / (a.successCount + a.failureCount || 1);
        const bSuccessRate = b.successCount / (b.successCount + b.failureCount || 1);
        
        if (aSuccessRate !== bSuccessRate) return bSuccessRate - aSuccessRate;
        
        return a.avgLatencyMs - b.avgLatencyMs;
      });
    
    if (candidates.length === 0) {
      console.warn('[ProxyManager] No healthy proxies available');
      return null;
    }
    
    // Select with some randomness to distribute load
    const topCandidates = candidates.slice(0, Math.min(3, candidates.length));
    const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];
    
    // Track usage
    selected.lastUsed = new Date();
    this.lastUsedProxy.set(engine, { proxy: selected, usedAt: new Date() });
    
    console.log(`[ProxyManager] Selected proxy: ${selected.provider} (${selected.country})`);
    
    return selected;
  }
  
  /**
   * Convert region to country code
   */
  private regionToCountry(region?: SupportedRegion): string | null {
    if (!region || region === 'global') return null;
    
    const regionMap: Record<string, string> = {
      'us': 'US',
      'uk': 'GB',
      'ae': 'AE',
      'sa': 'SA',
      'de': 'DE',
      'fr': 'FR',
      'jp': 'JP',
      'au': 'AU',
      'ca': 'CA',
      'in': 'IN',
    };
    
    return regionMap[region.toLowerCase()] || null;
  }
  
  /**
   * Get Playwright proxy configuration
   */
  getPlaywrightProxy(proxy: ProxyConfig): { server: string; username?: string; password?: string } {
    return {
      server: `http://${proxy.host}:${proxy.port}`,
      username: proxy.username,
      password: proxy.password,
    };
  }
  
  // ===========================================
  // Health Management
  // ===========================================
  
  /**
   * Report proxy success
   */
  reportSuccess(proxy: ProxyConfig, latencyMs: number): void {
    proxy.successCount++;
    proxy.failureCount = 0; // Reset consecutive failures
    proxy.isHealthy = true;
    
    // Update average latency
    proxy.avgLatencyMs = proxy.avgLatencyMs 
      ? (proxy.avgLatencyMs * 0.7 + latencyMs * 0.3)
      : latencyMs;
    
    console.log(`[ProxyManager] Proxy success: ${proxy.provider} (${latencyMs}ms)`);
  }
  
  /**
   * Report proxy failure
   */
  reportFailure(proxy: ProxyConfig, error?: string): void {
    proxy.failureCount++;
    
    if (proxy.failureCount >= this.config.maxConsecutiveFailures) {
      proxy.isHealthy = false;
      console.warn(`[ProxyManager] Proxy marked unhealthy: ${proxy.provider} (${error})`);
    }
  }
  
  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.runHealthChecks();
    }, this.config.healthCheckInterval);
  }
  
  /**
   * Run health checks on all proxies
   */
  private async runHealthChecks(): Promise<void> {
    const unhealthyProxies = Array.from(this.proxies.values()).filter(p => !p.isHealthy);
    
    for (const proxy of unhealthyProxies) {
      // Try to recover unhealthy proxies
      try {
        // Simple connectivity check
        const response = await fetch(`http://httpbin.org/ip`, {
          signal: AbortSignal.timeout(10000),
        });
        
        if (response.ok) {
          proxy.isHealthy = true;
          proxy.failureCount = 0;
          console.log(`[ProxyManager] Proxy recovered: ${proxy.provider}`);
        }
      } catch {
        // Still unhealthy
      }
    }
  }
  
  // ===========================================
  // Custom Proxy Management
  // ===========================================
  
  /**
   * Add a custom proxy to the pool
   */
  addCustomProxy(proxyData: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    country?: string;
    type?: 'residential' | 'datacenter' | 'mobile' | 'isp';
  }): void {
    const proxyId = `custom-${proxyData.host}-${proxyData.port}`;
    
    const proxyConfig: ProxyConfig = {
      provider: 'custom',
      host: proxyData.host,
      port: proxyData.port,
      username: proxyData.username,
      password: proxyData.password,
      rotationType: 'per-request',
      country: proxyData.country || 'US',
      type: proxyData.type || 'residential',
      isHealthy: true,
      failureCount: 0,
      successCount: 0,
      avgLatencyMs: 0,
    };
    
    this.proxies.set(proxyId, proxyConfig);
  }
  
  // ===========================================
  // Cleanup
  // ===========================================
  
  /**
   * Shutdown the proxy manager
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    console.log('[ProxyManager] Shutdown complete');
  }
  
  /**
   * Get stats for monitoring
   */
  getStats(): {
    total: number;
    healthy: number;
    unhealthy: number;
    byProvider: Record<string, number>;
    byCountry: Record<string, number>;
  } {
    const proxies = Array.from(this.proxies.values());
    
    return {
      total: proxies.length,
      healthy: proxies.filter(p => p.isHealthy).length,
      unhealthy: proxies.filter(p => !p.isHealthy).length,
      byProvider: proxies.reduce((acc, p) => {
        acc[p.provider] = (acc[p.provider] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byCountry: proxies.reduce((acc, p) => {
        acc[p.country || 'unknown'] = (acc[p.country || 'unknown'] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

// ===========================================
// Singleton
// ===========================================

let proxyManagerInstance: ProxyManager | null = null;

export async function getProxyManager(): Promise<ProxyManager> {
  if (!proxyManagerInstance) {
    proxyManagerInstance = new ProxyManager();
    await proxyManagerInstance.initialize();
  }
  return proxyManagerInstance;
}

export function hasProxySupport(): boolean {
  return !!(
    process.env.BRIGHTDATA_USERNAME ||
    process.env.OXYLABS_USERNAME ||
    process.env.SMARTPROXY_USERNAME ||
    process.env.IPROYAL_USERNAME ||
    process.env.CUSTOM_PROXY_LIST
  );
}

export default ProxyManager;

