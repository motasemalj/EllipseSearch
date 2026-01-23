/**
 * Browser Engines Index
 * 
 * Exports all browser automation engines for AI platforms.
 */

export { BaseBrowserEngine, type EngineSimulationInput } from './base-engine';
export { ChatGPTBrowserEngine, chatGPTEngine } from './chatgpt-engine';
export { PerplexityBrowserEngine, perplexityEngine } from './perplexity-engine';
export { GeminiBrowserEngine, geminiEngine } from './gemini-engine';
export { GrokBrowserEngine, grokEngine } from './grok-engine';

import type { SupportedEngine } from '@/types';
import { chatGPTEngine } from './chatgpt-engine';
import { perplexityEngine } from './perplexity-engine';
import { geminiEngine } from './gemini-engine';
import { grokEngine } from './grok-engine';
import type { BaseBrowserEngine } from './base-engine';

/**
 * Get browser engine for a specific AI platform
 */
export function getBrowserEngine(engine: SupportedEngine): BaseBrowserEngine {
  switch (engine) {
    case 'chatgpt':
      return chatGPTEngine;
    case 'perplexity':
      return perplexityEngine;
    case 'gemini':
      return geminiEngine;
    case 'grok':
      return grokEngine;
    default:
      throw new Error(`Unsupported browser engine: ${engine}`);
  }
}

