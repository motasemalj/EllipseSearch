/**
 * Browser Profile Manager
 * 
 * Manages isolated browser profiles that mimic different real users.
 * Each profile has:
 * - Unique fingerprint
 * - Persistent session data (cookies, localStorage)
 * - Browsing history
 * - Associated proxy
 * - Usage tracking
 * 
 * Profiles are stored encrypted and rotated to avoid detection.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { BrowserContext } from 'playwright';
import type { SupportedEngine } from '@/types';
import { BrowserFingerprint, FingerprintGenerator, getFingerprintGenerator } from './fingerprint-generator';

// ===========================================
// Types
// ===========================================

export interface BrowserProfile {
  id: string;
  name: string;
  
  // Identity
  fingerprint: BrowserFingerprint;
  
  // Sessions per engine
  sessions: {
    [engine in SupportedEngine]?: {
      cookies: ProfileCookie[];
      localStorage: Record<string, string>;
      lastUsed: string; // ISO date
      usageCount: number;
    };
  };
  
  // Proxy association
  proxyId?: string;
  
  // Behavior profile
  behavior: {
    typingSpeed: 'slow' | 'normal' | 'fast';
    mouseSpeed: 'slow' | 'normal' | 'fast';
    pauseFrequency: 'low' | 'normal' | 'high';
  };
  
  // Usage tracking
  created: string;
  lastUsed: string;
  totalUsageCount: number;
  dailyUsageCount: number;
  lastUsageDate: string;
  
  // Health
  isHealthy: boolean;
  warningCount: number;
  lastWarning?: string;
}

export interface ProfileCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface ProfileManagerConfig {
  // Storage
  storagePath: string;
  encryptionKey?: string;
  
  // Pool
  poolSize: number;
  maxUsagePerDay: number;
  maxWarningsBeforeRotate: number;
  
  // Rotation
  rotateAfterDays: number;
  cooldownHours: number;
}

// ===========================================
// Default Configuration
// ===========================================

const DEFAULT_CONFIG: ProfileManagerConfig = {
  storagePath: '.browser-profiles',
  poolSize: 5,
  maxUsagePerDay: 50,
  maxWarningsBeforeRotate: 3,
  rotateAfterDays: 7,
  cooldownHours: 2,
};

// ===========================================
// Profile Manager
// ===========================================

export class ProfileManager {
  private config: ProfileManagerConfig;
  private profiles: Map<string, BrowserProfile> = new Map();
  private fingerprintGenerator: FingerprintGenerator;
  private encryptionKey: Buffer | null = null;
  private initialized = false;
  
  constructor(config: Partial<ProfileManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fingerprintGenerator = getFingerprintGenerator();
    
    // Setup encryption
    const key = this.config.encryptionKey || process.env.PROFILE_ENCRYPTION_KEY;
    if (key) {
      this.encryptionKey = crypto.scryptSync(key, 'salt', 32);
    }
  }
  
  // ===========================================
  // Initialization
  // ===========================================
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Ensure storage directory exists
    const storagePath = path.resolve(this.config.storagePath);
    await fs.mkdir(storagePath, { recursive: true });
    
    // Load existing profiles
    await this.loadProfiles();
    
    // Create new profiles if needed
    while (this.profiles.size < this.config.poolSize) {
      await this.createProfile();
    }
    
    // Rotate stale profiles
    await this.rotateStaleProfiles();
    
    this.initialized = true;
    console.log(`[ProfileManager] Initialized with ${this.profiles.size} profiles`);
  }
  
  /**
   * Load profiles from disk
   */
  private async loadProfiles(): Promise<void> {
    const storagePath = path.resolve(this.config.storagePath);
    
    try {
      const files = await fs.readdir(storagePath);
      const profileFiles = files.filter(f => f.endsWith('.profile'));
      
      for (const file of profileFiles) {
        try {
          const filePath = path.join(storagePath, file);
          const encrypted = await fs.readFile(filePath, 'utf-8');
          const decrypted = this.decrypt(encrypted);
          const profile: BrowserProfile = JSON.parse(decrypted);
          
          // Reset daily count if new day
          if (profile.lastUsageDate !== new Date().toISOString().split('T')[0]) {
            profile.dailyUsageCount = 0;
            profile.lastUsageDate = new Date().toISOString().split('T')[0];
          }
          
          this.profiles.set(profile.id, profile);
        } catch {
          console.warn(`[ProfileManager] Failed to load profile: ${file}`);
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }
  
  /**
   * Save a profile to disk
   */
  private async saveProfile(profile: BrowserProfile): Promise<void> {
    const storagePath = path.resolve(this.config.storagePath);
    const filePath = path.join(storagePath, `${profile.id}.profile`);
    
    const json = JSON.stringify(profile, null, 2);
    const encrypted = this.encrypt(json);
    
    await fs.writeFile(filePath, encrypted, 'utf-8');
  }
  
  // ===========================================
  // Profile Management
  // ===========================================
  
  /**
   * Create a new profile
   */
  async createProfile(): Promise<BrowserProfile> {
    const fingerprint = this.fingerprintGenerator.generate();
    
    const profile: BrowserProfile = {
      id: `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: this.generateHumanName(),
      fingerprint,
      sessions: {},
      behavior: {
        typingSpeed: this.randomElement(['slow', 'normal', 'fast'] as const),
        mouseSpeed: this.randomElement(['slow', 'normal', 'fast'] as const),
        pauseFrequency: this.randomElement(['low', 'normal', 'high'] as const),
      },
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      totalUsageCount: 0,
      dailyUsageCount: 0,
      lastUsageDate: new Date().toISOString().split('T')[0],
      isHealthy: true,
      warningCount: 0,
    };
    
    this.profiles.set(profile.id, profile);
    await this.saveProfile(profile);
    
    console.log(`[ProfileManager] Created profile: ${profile.name} (${profile.id})`);
    
    return profile;
  }
  
  /**
   * Get an available profile for an engine
   */
  async getProfile(engine: SupportedEngine): Promise<BrowserProfile | null> {
    await this.initialize();
    
    const now = Date.now();
    const cooldownMs = this.config.cooldownHours * 60 * 60 * 1000;
    
    // Find best available profile
    const candidates = Array.from(this.profiles.values())
      .filter(p => p.isHealthy)
      .filter(p => p.dailyUsageCount < this.config.maxUsagePerDay)
      .filter(p => {
        // Check cooldown
        const session = p.sessions[engine];
        if (!session) return true;
        
        const lastUsed = new Date(session.lastUsed).getTime();
        return now - lastUsed > cooldownMs;
      })
      .sort((a, b) => {
        // Prefer less used profiles
        return a.dailyUsageCount - b.dailyUsageCount;
      });
    
    if (candidates.length === 0) {
      console.warn('[ProfileManager] No available profiles');
      
      // Try to create a new one
      if (this.profiles.size < this.config.poolSize * 2) {
        return await this.createProfile();
      }
      
      return null;
    }
    
    // Select with some randomness
    const topCandidates = candidates.slice(0, 3);
    return this.randomElement(topCandidates);
  }
  
  /**
   * Mark profile as used
   */
  async markUsed(profileId: string, engine: SupportedEngine): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (!profile) return;
    
    profile.lastUsed = new Date().toISOString();
    profile.totalUsageCount++;
    profile.dailyUsageCount++;
    
    if (!profile.sessions[engine]) {
      profile.sessions[engine] = {
        cookies: [],
        localStorage: {},
        lastUsed: new Date().toISOString(),
        usageCount: 0,
      };
    }
    
    profile.sessions[engine]!.lastUsed = new Date().toISOString();
    profile.sessions[engine]!.usageCount++;
    
    await this.saveProfile(profile);
  }
  
  /**
   * Report a warning for a profile
   */
  async reportWarning(profileId: string, warning: string): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (!profile) return;
    
    profile.warningCount++;
    profile.lastWarning = warning;
    
    if (profile.warningCount >= this.config.maxWarningsBeforeRotate) {
      profile.isHealthy = false;
      console.warn(`[ProfileManager] Profile marked unhealthy: ${profile.name}`);
    }
    
    await this.saveProfile(profile);
  }
  
  /**
   * Update session data for a profile
   */
  async updateSession(
    profileId: string, 
    engine: SupportedEngine, 
    context: BrowserContext
  ): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (!profile) return;
    
    try {
      // Get cookies
      const cookies = await context.cookies();
      
      // Get localStorage (from first page if available)
      const pages = context.pages();
      let localStorage: Record<string, string> = {};
      
      if (pages.length > 0) {
        localStorage = await pages[0].evaluate(() => {
          const items: Record<string, string> = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key) {
              items[key] = window.localStorage.getItem(key) || '';
            }
          }
          return items;
        });
      }
      
      // Update profile
      if (!profile.sessions[engine]) {
        profile.sessions[engine] = {
          cookies: [],
          localStorage: {},
          lastUsed: new Date().toISOString(),
          usageCount: 0,
        };
      }
      
      profile.sessions[engine]!.cookies = cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      }));
      profile.sessions[engine]!.localStorage = localStorage;
      
      await this.saveProfile(profile);
    } catch (e) {
      console.warn(`[ProfileManager] Failed to update session: ${e}`);
    }
  }
  
  /**
   * Apply profile session to a context
   */
  async applySession(
    profileId: string, 
    engine: SupportedEngine, 
    context: BrowserContext
  ): Promise<boolean> {
    const profile = this.profiles.get(profileId);
    if (!profile) return false;
    
    const session = profile.sessions[engine];
    if (!session || session.cookies.length === 0) return false;
    
    try {
      // Apply cookies
      await context.addCookies(session.cookies);
      
      // Apply localStorage will be done after page navigation
      
      return true;
    } catch (e) {
      console.warn(`[ProfileManager] Failed to apply session: ${e}`);
      return false;
    }
  }
  
  /**
   * Rotate stale or unhealthy profiles
   */
  private async rotateStaleProfiles(): Promise<void> {
    const maxAge = this.config.rotateAfterDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    for (const [id, profile] of Array.from(this.profiles.entries())) {
      const age = now - new Date(profile.created).getTime();
      
      if (!profile.isHealthy || age > maxAge) {
        // Delete old profile
        const storagePath = path.resolve(this.config.storagePath);
        const filePath = path.join(storagePath, `${id}.profile`);
        
        try {
          await fs.unlink(filePath);
        } catch {
          // Ignore
        }
        
        this.profiles.delete(id);
        console.log(`[ProfileManager] Rotated profile: ${profile.name}`);
      }
    }
    
    // Create new profiles to maintain pool size
    while (this.profiles.size < this.config.poolSize) {
      await this.createProfile();
    }
  }
  
  // ===========================================
  // Encryption
  // ===========================================
  
  private encrypt(text: string): string {
    if (!this.encryptionKey) return text;
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  private decrypt(text: string): string {
    if (!this.encryptionKey) return text;
    
    const [ivHex, authTagHex, encrypted] = text.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  // ===========================================
  // Utilities
  // ===========================================
  
  private generateHumanName(): string {
    const firstNames = [
      'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery',
      'Jamie', 'Dakota', 'Skyler', 'Parker', 'Charlie', 'Peyton', 'Reese', 'Sawyer',
    ];
    const lastNames = [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia',
      'Rodriguez', 'Wilson', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson',
    ];
    
    return `${this.randomElement(firstNames)} ${this.randomElement(lastNames)}`;
  }
  
  private randomElement<T>(array: readonly T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }
  
  /**
   * Get statistics for monitoring
   */
  getStats(): {
    total: number;
    healthy: number;
    unhealthy: number;
    dailyUsage: number;
    byEngine: Record<string, number>;
  } {
    const profiles = Array.from(this.profiles.values());
    
    return {
      total: profiles.length,
      healthy: profiles.filter(p => p.isHealthy).length,
      unhealthy: profiles.filter(p => !p.isHealthy).length,
      dailyUsage: profiles.reduce((sum, p) => sum + p.dailyUsageCount, 0),
      byEngine: profiles.reduce((acc, p) => {
        for (const engine of Object.keys(p.sessions)) {
          acc[engine] = (acc[engine] || 0) + (p.sessions[engine as SupportedEngine]?.usageCount || 0);
        }
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

// ===========================================
// Singleton
// ===========================================

let profileManagerInstance: ProfileManager | null = null;

export async function getProfileManager(config?: Partial<ProfileManagerConfig>): Promise<ProfileManager> {
  if (!profileManagerInstance) {
    profileManagerInstance = new ProfileManager(config);
    await profileManagerInstance.initialize();
  }
  return profileManagerInstance;
}

export default ProfileManager;

