/**
 * Session Storage & Persistence
 * 
 * Manages authenticated browser sessions with persistence.
 * Saves and restores cookies, localStorage, and sessionStorage.
 * 
 * Features:
 * - Cookie persistence across runs
 * - Storage state save/restore
 * - Session freshness tracking
 * - Auto-refresh for expired sessions
 */

import type { BrowserContext, Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import type { SupportedEngine } from '@/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// ===========================================
// Types
// ===========================================

export interface StoredSession {
  id: string;
  engine: SupportedEngine;
  user_id?: string;
  
  // Playwright storage state
  storage_state: StorageState;
  
  // Metadata
  created_at: string;
  updated_at: string;
  expires_at: string;
  last_used_at: string;
  
  // Health
  is_valid: boolean;
  validation_error?: string;
  use_count: number;
}

export interface StorageState {
  cookies: Cookie[];
  origins: OriginStorage[];
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface OriginStorage {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
  sessionStorage?: Array<{ name: string; value: string }>;
}

export interface SessionConfig {
  // Storage backend: 'file' for local, 'supabase' for cloud
  backend: 'file' | 'supabase';
  
  // For file storage
  storagePath?: string;
  
  // Session lifetime
  sessionTTLHours?: number;
  
  // Encryption
  encryptSessions?: boolean;
  encryptionKey?: string;
}

// ===========================================
// Default Configuration
// ===========================================

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  backend: 'file',
  storagePath: './.browser-sessions',
  sessionTTLHours: 24 * 7, // 1 week
  encryptSessions: true,
};

// ===========================================
// Session Storage Class
// ===========================================

export class SessionStorage {
  private config: SessionConfig;
  private encryptionKey: Buffer | null = null;
  
  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    
    // Initialize encryption key
    if (this.config.encryptSessions) {
      const keySource = this.config.encryptionKey || 
        process.env.SESSION_ENCRYPTION_KEY ||
        'default-key-change-me-in-production';
      this.encryptionKey = crypto.scryptSync(keySource, 'salt', 32);
    }
  }
  
  // ===========================================
  // Core Methods
  // ===========================================
  
  /**
   * Save browser context state to storage
   */
  async saveSession(
    context: BrowserContext,
    engine: SupportedEngine,
    userId?: string
  ): Promise<StoredSession> {
    // Get storage state from Playwright
    const storageState = await context.storageState() as StorageState;
    
    // Create session object
    const session: StoredSession = {
      id: this.generateSessionId(engine, userId),
      engine,
      user_id: userId,
      storage_state: storageState,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: this.calculateExpiry(),
      last_used_at: new Date().toISOString(),
      is_valid: true,
      use_count: 0,
    };
    
    // Store session
    if (this.config.backend === 'supabase') {
      await this.saveToSupabase(session);
    } else {
      await this.saveToFile(session);
    }
    
    console.log(`[SessionStorage] Saved session for ${engine}${userId ? ` (user: ${userId})` : ''}`);
    
    return session;
  }
  
  /**
   * Load and apply session to browser context
   */
  async loadSession(
    engine: SupportedEngine,
    userId?: string
  ): Promise<StoredSession | null> {
    const sessionId = this.generateSessionId(engine, userId);
    
    let session: StoredSession | null = null;
    
    if (this.config.backend === 'supabase') {
      session = await this.loadFromSupabase(sessionId);
    } else {
      session = await this.loadFromFile(sessionId);
    }
    
    if (!session) {
      console.log(`[SessionStorage] No session found for ${engine}`);
      return null;
    }
    
    // Check if session is still valid
    if (!this.isSessionValid(session)) {
      console.log(`[SessionStorage] Session expired for ${engine}`);
      await this.deleteSession(engine, userId);
      return null;
    }
    
    // Update last used
    session.last_used_at = new Date().toISOString();
    session.use_count++;
    
    if (this.config.backend === 'supabase') {
      await this.saveToSupabase(session);
    } else {
      await this.saveToFile(session);
    }
    
    console.log(`[SessionStorage] Loaded session for ${engine} (uses: ${session.use_count})`);
    
    return session;
  }
  
  /**
   * Apply stored session to a browser context
   */
  async applySession(
    context: BrowserContext,
    session: StoredSession
  ): Promise<void> {
    // Add cookies
    if (session.storage_state.cookies.length > 0) {
      await context.addCookies(session.storage_state.cookies);
    }
    
    // For localStorage, we need to navigate to each origin first
    // This is handled by the page after navigation
    console.log(`[SessionStorage] Applied ${session.storage_state.cookies.length} cookies`);
  }
  
  /**
   * Apply localStorage to a page after navigation
   */
  async applyLocalStorage(
    page: Page,
    session: StoredSession
  ): Promise<void> {
    const currentOrigin = new URL(page.url()).origin;
    
    const originData = session.storage_state.origins.find(
      o => o.origin === currentOrigin
    );
    
    if (originData && originData.localStorage.length > 0) {
      await page.evaluate((items) => {
        for (const item of items) {
          localStorage.setItem(item.name, item.value);
        }
      }, originData.localStorage);
      
      console.log(`[SessionStorage] Applied ${originData.localStorage.length} localStorage items`);
    }
  }
  
  /**
   * Delete a session
   */
  async deleteSession(
    engine: SupportedEngine,
    userId?: string
  ): Promise<void> {
    const sessionId = this.generateSessionId(engine, userId);
    
    if (this.config.backend === 'supabase') {
      await this.deleteFromSupabase(sessionId);
    } else {
      await this.deleteFromFile(sessionId);
    }
    
    console.log(`[SessionStorage] Deleted session for ${engine}`);
  }
  
  /**
   * Check if we have a valid session for an engine
   */
  async hasValidSession(
    engine: SupportedEngine,
    userId?: string
  ): Promise<boolean> {
    const session = await this.loadSession(engine, userId);
    return session !== null && this.isSessionValid(session);
  }
  
  /**
   * Get storage state object for Playwright context creation
   */
  async getStorageStateForContext(
    engine: SupportedEngine,
    userId?: string
  ): Promise<StorageState | undefined> {
    const session = await this.loadSession(engine, userId);
    return session?.storage_state;
  }
  
  // ===========================================
  // Validation
  // ===========================================
  
  private isSessionValid(session: StoredSession): boolean {
    // Check expiry
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      return false;
    }
    
    // Check validity flag
    if (!session.is_valid) {
      return false;
    }
    
    // Check for essential cookies (engine-specific)
    const essentialCookies = this.getEssentialCookies(session.engine);
    for (const cookieName of essentialCookies) {
      const hasCookie = session.storage_state.cookies.some(
        c => c.name === cookieName && new Date(c.expires * 1000) > new Date()
      );
      if (!hasCookie) {
        return false;
      }
    }
    
    return true;
  }
  
  private getEssentialCookies(engine: SupportedEngine): string[] {
    switch (engine) {
      case 'chatgpt':
        return ['__Secure-next-auth.session-token', '_puid'];
      case 'perplexity':
        return ['pplx.visitor-id'];
      case 'gemini':
        return ['SAPISID', 'HSID', 'SID'];
      case 'grok':
        return ['auth_token', 'ct0'];
      default:
        return [];
    }
  }
  
  // ===========================================
  // File Storage Backend
  // ===========================================
  
  private async saveToFile(session: StoredSession): Promise<void> {
    const filePath = this.getFilePath(session.id);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Serialize and optionally encrypt
    let data = JSON.stringify(session, null, 2);
    if (this.config.encryptSessions && this.encryptionKey) {
      data = this.encrypt(data);
    }
    
    await fs.writeFile(filePath, data, 'utf-8');
  }
  
  private async loadFromFile(sessionId: string): Promise<StoredSession | null> {
    const filePath = this.getFilePath(sessionId);
    
    try {
      let data = await fs.readFile(filePath, 'utf-8');
      
      // Decrypt if needed
      if (this.config.encryptSessions && this.encryptionKey) {
        data = this.decrypt(data);
      }
      
      return JSON.parse(data) as StoredSession;
    } catch {
      return null;
    }
  }
  
  private async deleteFromFile(sessionId: string): Promise<void> {
    const filePath = this.getFilePath(sessionId);
    
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
  
  private getFilePath(sessionId: string): string {
    const sanitizedId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.config.storagePath!, `${sanitizedId}.session.json`);
  }
  
  // ===========================================
  // Supabase Storage Backend
  // ===========================================
  
  private getSupabase() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  
  private async saveToSupabase(session: StoredSession): Promise<void> {
    const supabase = this.getSupabase();
    
    // Encrypt storage state if enabled
    let storageData = JSON.stringify(session.storage_state);
    if (this.config.encryptSessions && this.encryptionKey) {
      storageData = this.encrypt(storageData);
    }
    
    await supabase.from('browser_sessions').upsert({
      id: session.id,
      engine: session.engine,
      user_id: session.user_id,
      storage_state_encrypted: storageData,
      created_at: session.created_at,
      updated_at: new Date().toISOString(),
      expires_at: session.expires_at,
      last_used_at: session.last_used_at,
      is_valid: session.is_valid,
      validation_error: session.validation_error,
      use_count: session.use_count,
    });
  }
  
  private async loadFromSupabase(sessionId: string): Promise<StoredSession | null> {
    const supabase = this.getSupabase();
    
    const { data, error } = await supabase
      .from('browser_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    // Decrypt storage state
    let storageState: StorageState;
    if (this.config.encryptSessions && this.encryptionKey) {
      const decrypted = this.decrypt(data.storage_state_encrypted);
      storageState = JSON.parse(decrypted);
    } else {
      storageState = JSON.parse(data.storage_state_encrypted);
    }
    
    return {
      id: data.id,
      engine: data.engine,
      user_id: data.user_id,
      storage_state: storageState,
      created_at: data.created_at,
      updated_at: data.updated_at,
      expires_at: data.expires_at,
      last_used_at: data.last_used_at,
      is_valid: data.is_valid,
      validation_error: data.validation_error,
      use_count: data.use_count,
    };
  }
  
  private async deleteFromSupabase(sessionId: string): Promise<void> {
    const supabase = this.getSupabase();
    
    await supabase
      .from('browser_sessions')
      .delete()
      .eq('id', sessionId);
  }
  
  // ===========================================
  // Helpers
  // ===========================================
  
  private generateSessionId(engine: SupportedEngine, userId?: string): string {
    if (userId) {
      return `${engine}_user_${userId}`;
    }
    return `${engine}_default`;
  }
  
  private calculateExpiry(): string {
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + (this.config.sessionTTLHours || 168));
    return expiryDate.toISOString();
  }
  
  private encrypt(data: string): string {
    if (!this.encryptionKey) throw new Error('Encryption key not set');
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }
  
  private decrypt(data: string): string {
    if (!this.encryptionKey) throw new Error('Encryption key not set');
    
    const [ivHex, encrypted] = data.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let sessionStorageInstance: SessionStorage | null = null;

export function getSessionStorage(config?: Partial<SessionConfig>): SessionStorage {
  if (!sessionStorageInstance) {
    sessionStorageInstance = new SessionStorage(config);
  }
  return sessionStorageInstance;
}

// ===========================================
// Convenience Functions
// ===========================================

/**
 * Capture and save session from current page
 */
export async function captureSession(
  context: BrowserContext,
  engine: SupportedEngine,
  userId?: string
): Promise<StoredSession> {
  const storage = getSessionStorage();
  return storage.saveSession(context, engine, userId);
}

/**
 * Create a new browser context with stored session
 */
export async function createContextWithSession(
  browser: import('playwright').Browser,
  engine: SupportedEngine,
  userId?: string
): Promise<{ context: import('playwright').BrowserContext; hasSession: boolean }> {
  const storage = getSessionStorage();
  const storageState = await storage.getStorageStateForContext(engine, userId);
  
  const contextOptions: NonNullable<Parameters<typeof browser.newContext>[0]> = {};
  
  if (storageState) {
    contextOptions.storageState = storageState as NonNullable<Parameters<typeof browser.newContext>[0]>['storageState'];
  }
  
  const context = await browser.newContext(contextOptions);
  
  return {
    context,
    hasSession: !!storageState,
  };
}

export default SessionStorage;

