#!/usr/bin/env npx tsx
/**
 * Interactive ChatGPT Verification Script
 * 
 * Run this script to manually verify ChatGPT in a browser.
 * The session will be saved for future automated use.
 * 
 * Usage: npx tsx scripts/verify-chatgpt.ts
 */

import { runInteractiveVerification } from '../src/lib/browser/persistent-profile';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('           ChatGPT Browser Verification');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('This will open a browser window. Please:');
  console.log('  1. Complete any Cloudflare challenges');
  console.log('  2. Log in to ChatGPT if prompted');
  console.log('  3. Wait for the main ChatGPT page to load');
  console.log('');
  console.log('The session will be saved for future automated use.');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  const success = await runInteractiveVerification('chatgpt', 'https://chatgpt.com');
  
  if (success) {
    console.log('');
    console.log('✅ Verification successful! The browser session has been saved.');
    console.log('   Future browser automation will use this verified session.');
    console.log('');
  } else {
    console.log('');
    console.log('❌ Verification failed. Please try again.');
    console.log('   Make sure to complete any challenges in the browser window.');
    console.log('');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

