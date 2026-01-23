/**
 * Advanced Human Behavior Simulation
 * 
 * Simulates realistic human interaction patterns to avoid bot detection.
 * 
 * Features:
 * - Bezier curve mouse movements (mimics real hand movement)
 * - Variable typing speeds with realistic typos
 * - Natural scrolling patterns
 * - Random pauses that mimic reading/thinking
 * - Focus/blur simulation
 * - Realistic click patterns
 */

import type { Page } from 'playwright';

// ===========================================
// Types
// ===========================================

export interface HumanBehaviorConfig {
  // Typing
  typingSpeed: 'slow' | 'normal' | 'fast' | 'variable';
  baseTypingDelayMs: number;
  typingVariance: number;
  typoRate: number; // Probability of making a typo
  
  // Mouse
  mouseMovementStyle: 'bezier' | 'linear' | 'natural';
  mouseSpeed: 'slow' | 'normal' | 'fast';
  jitterAmount: number;
  
  // Scrolling
  scrollStyle: 'smooth' | 'stepped' | 'variable';
  scrollSpeed: 'slow' | 'normal' | 'fast';
  
  // Pauses
  readingPauseMs: { min: number; max: number };
  thinkingPauseMs: { min: number; max: number };
  
  // Clicks
  clickHoldMs: { min: number; max: number };
  doubleClickProbability: number;
}

// ===========================================
// Default Configuration
// ===========================================

export const DEFAULT_HUMAN_CONFIG: HumanBehaviorConfig = {
  typingSpeed: 'variable',
  baseTypingDelayMs: 80,
  typingVariance: 0.5,
  typoRate: 0.02,
  
  mouseMovementStyle: 'bezier',
  mouseSpeed: 'normal',
  jitterAmount: 2,
  
  scrollStyle: 'variable',
  scrollSpeed: 'normal',
  
  readingPauseMs: { min: 1000, max: 3000 },
  thinkingPauseMs: { min: 500, max: 1500 },
  
  clickHoldMs: { min: 50, max: 150 },
  doubleClickProbability: 0.02,
};

// ===========================================
// Human Behavior Simulator
// ===========================================

export class HumanBehavior {
  private config: HumanBehaviorConfig;
  private lastMousePosition: { x: number; y: number } = { x: 0, y: 0 };
  
  constructor(config: Partial<HumanBehaviorConfig> = {}) {
    this.config = { ...DEFAULT_HUMAN_CONFIG, ...config };
  }
  
  // ===========================================
  // Mouse Movements
  // ===========================================
  
  /**
   * Move mouse to element using bezier curve
   */
  async moveToElement(page: Page, selector: string): Promise<void> {
    const element = page.locator(selector);
    const box = await element.boundingBox();
    
    if (!box) {
      console.warn(`[HumanBehavior] Element not found: ${selector}`);
      return;
    }
    
    // Target with slight randomness (don't always hit center)
    const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
    const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);
    
    await this.moveTo(page, targetX, targetY);
  }
  
  /**
   * Move mouse to coordinates using bezier curve
   */
  async moveTo(page: Page, targetX: number, targetY: number): Promise<void> {
    const startX = this.lastMousePosition.x || Math.random() * 500 + 100;
    const startY = this.lastMousePosition.y || Math.random() * 300 + 100;
    
    // Generate bezier control points
    const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));
    const duration = this.calculateMoveDuration(distance);
    const steps = Math.max(20, Math.floor(distance / 10));
    
    // Create bezier curve with 2 control points
    const cp1 = {
      x: startX + (targetX - startX) * 0.3 + (Math.random() - 0.5) * distance * 0.2,
      y: startY + (targetY - startY) * 0.3 + (Math.random() - 0.5) * distance * 0.2,
    };
    const cp2 = {
      x: startX + (targetX - startX) * 0.7 + (Math.random() - 0.5) * distance * 0.2,
      y: startY + (targetY - startY) * 0.7 + (Math.random() - 0.5) * distance * 0.2,
    };
    
    // Move along bezier curve
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      
      // Cubic bezier formula
      const x = this.cubicBezier(t, startX, cp1.x, cp2.x, targetX);
      const y = this.cubicBezier(t, startY, cp1.y, cp2.y, targetY);
      
      // Add micro-jitter
      const jitterX = (Math.random() - 0.5) * this.config.jitterAmount;
      const jitterY = (Math.random() - 0.5) * this.config.jitterAmount;
      
      await page.mouse.move(x + jitterX, y + jitterY);
      
      // Variable delay (faster in middle, slower at ends)
      const speedMultiplier = 1 - Math.abs(t - 0.5) * 0.5;
      const stepDelay = (duration / steps) * speedMultiplier;
      await this.sleep(stepDelay);
    }
    
    this.lastMousePosition = { x: targetX, y: targetY };
  }
  
  /**
   * Cubic bezier interpolation
   */
  private cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const mt = 1 - t;
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
  }
  
  /**
   * Calculate duration for mouse movement based on distance
   */
  private calculateMoveDuration(distance: number): number {
    const baseSpeed = this.config.mouseSpeed === 'slow' ? 0.3 
                    : this.config.mouseSpeed === 'fast' ? 1.5 
                    : 0.7;
    
    // Fitts's Law inspired calculation
    const duration = (distance * 0.5 + 100) / baseSpeed;
    
    // Add randomness
    return duration * (0.8 + Math.random() * 0.4);
  }
  
  // ===========================================
  // Clicking
  // ===========================================
  
  /**
   * Click with human-like timing
   */
  async click(page: Page, selector: string): Promise<void> {
    // Move to element first
    await this.moveToElement(page, selector);
    
    // Small pause before clicking (aiming)
    await this.sleep(this.randomBetween(50, 150));
    
    // Click with hold time
    const holdTime = this.randomBetween(
      this.config.clickHoldMs.min,
      this.config.clickHoldMs.max
    );
    
    await page.mouse.down();
    await this.sleep(holdTime);
    await page.mouse.up();
    
    // Occasional double-click
    if (Math.random() < this.config.doubleClickProbability) {
      await this.sleep(this.randomBetween(80, 150));
      await page.mouse.down();
      await this.sleep(holdTime * 0.7);
      await page.mouse.up();
    }
    
    // Small pause after clicking
    await this.sleep(this.randomBetween(100, 300));
  }
  
  // ===========================================
  // Typing
  // ===========================================
  
  /**
   * Type text with human-like patterns
   */
  async type(page: Page, selector: string, text: string): Promise<void> {
    const element = page.locator(selector);
    await element.click();
    
    // Small pause before typing
    await this.sleep(this.randomBetween(200, 500));
    
    const chars = text.split('');
    let i = 0;
    
    while (i < chars.length) {
      const char = chars[i];
      
      // Simulate typo
      if (Math.random() < this.config.typoRate && i > 0) {
        const wrongChar = this.getAdjacentKey(char);
        await page.keyboard.type(wrongChar);
        await this.getTypingDelay();
        
        // Notice and correct the typo
        await this.sleep(this.randomBetween(200, 600)); // Pause to "notice"
        await page.keyboard.press('Backspace');
        await this.sleep(this.randomBetween(50, 150));
      }
      
      // Type the character
      await page.keyboard.type(char);
      
      // Variable delay
      let delay = this.getTypingDelay();
      
      // Longer pause after punctuation
      if (['.', '!', '?', ',', ';', ':'].includes(char)) {
        delay += this.randomBetween(100, 300);
      }
      
      // Pause at word boundaries (thinking)
      if (char === ' ' && Math.random() < 0.1) {
        delay += this.randomBetween(200, 800);
      }
      
      await this.sleep(delay);
      i++;
    }
  }
  
  /**
   * Get adjacent key for typo simulation
   */
  private getAdjacentKey(char: string): string {
    const keyboard: Record<string, string[]> = {
      'a': ['s', 'q', 'z'],
      'b': ['v', 'g', 'n'],
      'c': ['x', 'd', 'v'],
      'd': ['s', 'e', 'f', 'c'],
      'e': ['w', 'r', 'd'],
      'f': ['d', 'r', 'g', 'v'],
      'g': ['f', 't', 'h', 'b'],
      'h': ['g', 'y', 'j', 'n'],
      'i': ['u', 'o', 'k'],
      'j': ['h', 'u', 'k', 'm'],
      'k': ['j', 'i', 'l', 'm'],
      'l': ['k', 'o', 'p'],
      'm': ['n', 'j', 'k'],
      'n': ['b', 'h', 'm'],
      'o': ['i', 'p', 'l'],
      'p': ['o', 'l'],
      'q': ['w', 'a'],
      'r': ['e', 't', 'f'],
      's': ['a', 'w', 'd', 'z'],
      't': ['r', 'y', 'g'],
      'u': ['y', 'i', 'j'],
      'v': ['c', 'f', 'b'],
      'w': ['q', 'e', 's'],
      'x': ['z', 's', 'c'],
      'y': ['t', 'u', 'h'],
      'z': ['a', 'x'],
    };
    
    const lowerChar = char.toLowerCase();
    const adjacent = keyboard[lowerChar] || [char];
    const randomAdjacent = adjacent[Math.floor(Math.random() * adjacent.length)];
    
    // Maintain case
    return char === char.toUpperCase() ? randomAdjacent.toUpperCase() : randomAdjacent;
  }
  
  /**
   * Get variable typing delay
   */
  private getTypingDelay(): number {
    const base = this.config.baseTypingDelayMs;
    const variance = this.config.typingVariance;
    
    // Speed variations
    const speedMultiplier = this.config.typingSpeed === 'slow' ? 1.5
                         : this.config.typingSpeed === 'fast' ? 0.6
                         : this.config.typingSpeed === 'variable' ? (0.5 + Math.random())
                         : 1;
    
    // Calculate delay with variance
    const delay = base * speedMultiplier * (1 + (Math.random() - 0.5) * variance);
    
    return Math.max(30, delay);
  }
  
  // ===========================================
  // Scrolling
  // ===========================================
  
  /**
   * Scroll with human-like patterns
   */
  async scroll(page: Page, direction: 'up' | 'down', amount: number): Promise<void> {
    const actualAmount = direction === 'down' ? amount : -amount;
    
    if (this.config.scrollStyle === 'smooth') {
      await this.smoothScroll(page, actualAmount);
    } else if (this.config.scrollStyle === 'stepped') {
      await this.steppedScroll(page, actualAmount);
    } else {
      // Variable - mix of both
      if (Math.random() > 0.5) {
        await this.smoothScroll(page, actualAmount);
      } else {
        await this.steppedScroll(page, actualAmount);
      }
    }
  }
  
  /**
   * Smooth momentum-based scroll
   */
  private async smoothScroll(page: Page, amount: number): Promise<void> {
    const steps = Math.abs(amount) > 500 ? 30 : 15;
    const direction = amount > 0 ? 1 : -1;
    const totalAmount = Math.abs(amount);
    
    // Simulate scroll momentum (fast start, slow end)
    for (let i = 0; i < steps; i++) {
      const progress = i / steps;
      
      // Ease-out curve
      const easing = 1 - Math.pow(1 - progress, 3);
      const previousEasing = i > 0 ? 1 - Math.pow(1 - (i - 1) / steps, 3) : 0;
      
      const scrollAmount = (easing - previousEasing) * totalAmount * direction;
      
      await page.mouse.wheel(0, scrollAmount);
      
      // Variable delay
      const delay = 10 + Math.random() * 20 + (progress > 0.7 ? 20 : 0);
      await this.sleep(delay);
    }
    
    // Pause after scrolling (reading)
    await this.sleep(this.randomBetween(300, 800));
  }
  
  /**
   * Stepped scroll (discrete wheel ticks)
   */
  private async steppedScroll(page: Page, amount: number): Promise<void> {
    const tickAmount = 100; // Standard wheel tick
    const ticks = Math.ceil(Math.abs(amount) / tickAmount);
    const direction = amount > 0 ? 1 : -1;
    
    for (let i = 0; i < ticks; i++) {
      const scrollAmount = tickAmount * direction * (0.8 + Math.random() * 0.4);
      
      await page.mouse.wheel(0, scrollAmount);
      await this.sleep(this.randomBetween(50, 150));
    }
    
    // Pause after scrolling
    await this.sleep(this.randomBetween(500, 1500));
  }
  
  // ===========================================
  // Pauses & Waits
  // ===========================================
  
  /**
   * Pause as if reading content
   */
  async readingPause(page: Page): Promise<void> {
    const duration = this.randomBetween(
      this.config.readingPauseMs.min,
      this.config.readingPauseMs.max
    );
    
    // Maybe scroll a little while reading
    if (Math.random() > 0.6) {
      await this.sleep(duration * 0.3);
      await this.scroll(page, 'down', this.randomBetween(50, 150));
      await this.sleep(duration * 0.7);
    } else {
      await this.sleep(duration);
    }
  }
  
  /**
   * Pause as if thinking
   */
  async thinkingPause(page: Page): Promise<void> {
    const duration = this.randomBetween(
      this.config.thinkingPauseMs.min,
      this.config.thinkingPauseMs.max
    );
    
    // Maybe move mouse randomly while thinking
    if (Math.random() > 0.7) {
      const viewport = page.viewportSize() || { width: 1920, height: 1080 };
      const randomX = this.lastMousePosition.x + (Math.random() - 0.5) * 100;
      const randomY = this.lastMousePosition.y + (Math.random() - 0.5) * 50;
      
      await this.moveTo(
        page,
        Math.max(0, Math.min(viewport.width, randomX)),
        Math.max(0, Math.min(viewport.height, randomY))
      );
    }
    
    await this.sleep(duration);
  }
  
  /**
   * Wait with variance
   */
  async wait(baseMs: number, variance: number = 0.3): Promise<void> {
    const actual = baseMs * (1 + (Math.random() - 0.5) * variance * 2);
    await this.sleep(actual);
  }
  
  // ===========================================
  // Focus/Blur Simulation
  // ===========================================
  
  /**
   * Simulate user looking away (blur) and coming back (focus)
   */
  async simulateDistraction(page: Page): Promise<void> {
    // Blur
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    
    // Wait (user is distracted)
    await this.sleep(this.randomBetween(2000, 8000));
    
    // Focus
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    
    // Small pause to "reorient"
    await this.sleep(this.randomBetween(300, 800));
  }
  
  // ===========================================
  // Utilities
  // ===========================================
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

// ===========================================
// Singleton
// ===========================================

let humanBehaviorInstance: HumanBehavior | null = null;

export function getHumanBehavior(config?: Partial<HumanBehaviorConfig>): HumanBehavior {
  if (!humanBehaviorInstance) {
    humanBehaviorInstance = new HumanBehavior(config);
  }
  return humanBehaviorInstance;
}

export default HumanBehavior;

