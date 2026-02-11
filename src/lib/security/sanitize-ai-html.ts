import { textToSafeHtml } from "@/lib/ai/text-to-html";

function decodeHtmlEntities(input: string): string {
  // Minimal entity decoding. We keep this small and dependency-free.
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'");
}

function stripHtmlToText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutStyles.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

function stripEnginePreface(text: string): string {
  // Some upstream pipelines accidentally prefix content with "ChatGPT said:" etc.
  // We store the raw assistant answer only.
  return (text || "")
    .replace(/^\s*(ChatGPT|Gemini|Perplexity|Grok)\s+said:\s*/i, "")
    .trim();
}

/**
 * Allowlist of safe HTML tags that preserve formatting without XSS risk.
 * These are semantic/formatting tags only - no scripts, iframes, forms, etc.
 */
const SAFE_TAGS = new Set([
  "p", "br", "div", "span",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "strong", "b", "em", "i", "u", "s", "strike",
  "code", "pre", "blockquote",
  "table", "thead", "tbody", "tr", "th", "td",
  "a", "mark", "sub", "sup", "hr",
]);

/**
 * Safe attributes for allowed tags. Restrict to non-executable attributes.
 */
const SAFE_ATTRS = new Set([
  "class", "id", "href", "target", "rel", "title", "aria-label",
  "colspan", "rowspan", "dir", "lang",
]);

/**
 * Sanitize HTML by keeping only safe tags and attributes.
 * This preserves formatting (lists, headers, paragraphs, links) while preventing XSS.
 */
function sanitizeHtmlPreserveFormatting(html: string): string {
  if (!html || html.trim().length === 0) return "";

  // Remove script/style tags entirely (including content)
  let result = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?<\/embed>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<input[^>]*>/gi, "")
    .replace(/<button[\s\S]*?<\/button>/gi, "")
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, "");

  // Remove event handlers (onclick, onerror, onload, etc.)
  result = result.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "");
  result = result.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, "");

  // Remove javascript: and data: URLs
  result = result.replace(/href\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, 'href="#"');
  result = result.replace(/href\s*=\s*["']?\s*data:[^"'\s>]*/gi, 'href="#"');
  result = result.replace(/src\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, "");
  result = result.replace(/src\s*=\s*["']?\s*data:[^"'\s>]*/gi, "");

  // Process tags: keep safe ones, strip unsafe ones (but keep their content)
  result = result.replace(/<\/?([a-z][a-z0-9]*)[^>]*>/gi, (match, tagName) => {
    const tag = tagName.toLowerCase();
    
    if (!SAFE_TAGS.has(tag)) {
      // Unsafe tag: remove the tag but keep content (for closing tags, just remove)
      return "";
    }

    // Safe tag: keep it but filter attributes
    if (match.startsWith("</")) {
      return `</${tag}>`;
    }

    // Opening tag: filter to safe attributes only
    const attrMatch = match.match(/<[a-z][a-z0-9]*\s+([^>]*)>/i);
    if (!attrMatch || !attrMatch[1]) {
      // Self-closing or no attributes
      if (match.endsWith("/>")) {
        return `<${tag} />`;
      }
      return `<${tag}>`;
    }

    const attrsStr = attrMatch[1];
    const safeAttrs: string[] = [];
    
    // Parse attributes (simple regex-based)
    const attrRegex = /([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/gi;
    let attrPart;
    while ((attrPart = attrRegex.exec(attrsStr))) {
      const attrName = attrPart[1].toLowerCase();
      const attrValue = attrPart[2] ?? attrPart[3] ?? attrPart[4] ?? "";
      
      if (SAFE_ATTRS.has(attrName)) {
        // For href, ensure it's a safe URL
        if (attrName === "href") {
          const lowerVal = attrValue.toLowerCase().trim();
          if (lowerVal.startsWith("javascript:") || lowerVal.startsWith("data:")) {
            safeAttrs.push('href="#"');
          } else {
            safeAttrs.push(`href="${attrValue.replace(/"/g, "&quot;")}"`);
          }
        } else {
          safeAttrs.push(`${attrName}="${attrValue.replace(/"/g, "&quot;")}"`);
        }
      }
    }

    // For links, always add safe defaults
    if (tag === "a") {
      if (!safeAttrs.some(a => a.startsWith("target="))) {
        safeAttrs.push('target="_blank"');
      }
      if (!safeAttrs.some(a => a.startsWith("rel="))) {
        safeAttrs.push('rel="noopener noreferrer"');
      }
    }

    if (safeAttrs.length > 0) {
      return `<${tag} ${safeAttrs.join(" ")}>`;
    }
    return `<${tag}>`;
  });

  // Clean up excessive whitespace but preserve intentional line breaks
  result = result.replace(/[\t ]+/g, " ");
  result = result.replace(/\n\s*\n\s*\n/g, "\n\n");

  return result.trim();
}

/**
 * Check if the input looks like it already has HTML formatting.
 */
function hasHtmlFormatting(html: string): boolean {
  if (!html) return false;
  // Check for common formatting tags
  return /<(p|div|ul|ol|li|h[1-6]|pre|code|blockquote|table|strong|em)\b/i.test(html);
}

export function sanitizeAiResponseForStorage(input: {
  html?: string;
  text?: string;
  maxTextChars?: number;
}): { safe_html: string; plain_text: string } {
  const html = input.html || "";
  const text = input.text || "";
  const max = typeof input.maxTextChars === "number" ? input.maxTextChars : 20_000;

  // Get plain text version (for search, sentiment analysis, etc.)
  let plain = (text || "").trim();
  if (plain.length < 30 && html.length > 0) {
    const stripped = stripHtmlToText(html);
    if (stripped.length > plain.length) {
      plain = stripped;
    }
  }

  // Remove any engine preface strings if present.
  plain = stripEnginePreface(plain);

  if (plain.length > max) {
    plain = `${plain.slice(0, max)}…`;
  }

  // Determine safe HTML:
  // 1. If we have HTML with real formatting tags, sanitize but preserve formatting
  // 2. Otherwise, convert plain text to safe HTML (handles markdown-ish text)
  let safe_html: string;
  
  if (html && hasHtmlFormatting(html)) {
    // Preserve the original formatting but sanitize for XSS
    safe_html = sanitizeHtmlPreserveFormatting(html);
    
    // Also strip engine preface from HTML if present
    safe_html = safe_html.replace(/^\s*<p[^>]*>\s*(ChatGPT|Gemini|Perplexity|Grok)\s+said:\s*/i, "<p>");
  } else {
    // Convert plain text (possibly with markdown) to safe HTML
    safe_html = textToSafeHtml(plain);
  }

  // Fallback if sanitization produced empty result
  if (!safe_html || safe_html.trim().length === 0) {
    safe_html = textToSafeHtml(plain);
  }

  return { safe_html, plain_text: plain };
}


