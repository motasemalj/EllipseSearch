"use client";

import { useMemo } from "react";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightedHtml({
  html,
  terms,
  className,
}: {
  html: string;
  terms: string[];
  className?: string;
}) {
  const highlighted = useMemo(() => {
    if (!html) return html;
    const cleanedTerms = Array.from(
      new Set(
        (terms || [])
          .map((t) => (t || "").trim().toLowerCase())
          .filter((t) => t.length >= 2) // Allow 2-char terms (e.g., "AI")
      )
    ).slice(0, 20); // Increased from 10 to 20 terms

    if (cleanedTerms.length === 0) return html;

    // DOM-safe highlighting (only modifies text nodes)
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      
      // Use word boundary for longer terms, but allow partial matches for short terms
      // This ensures "Red Bull" matches even in "RedBull" or "Red-Bull"
      const patternStr = cleanedTerms
        .map(t => {
          const escaped = escapeRegExp(t);
          // For terms with spaces (like "Red Bull"), also match without spaces
          if (t.includes(" ")) {
            const noSpace = escaped.replace(/\\ /g, "\\s*[-]?\\s*");
            return `(?:${escaped}|${noSpace})`;
          }
          return escaped;
        })
        .join("|");
      
      // Case-insensitive matching
      const pattern = new RegExp(`(${patternStr})`, "gi");

      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let node: Node | null;
      
      // Collect all text nodes first to avoid modifying while walking
      while ((node = walker.nextNode())) {
        textNodes.push(node as Text);
      }
      
      let replacements = 0;
      const MAX_REPLACEMENTS = 200; // Increased from 60 to 200
      
      for (const textNode of textNodes) {
        if (replacements >= MAX_REPLACEMENTS) break;
        
        const text = textNode.nodeValue || "";
        pattern.lastIndex = 0; // Reset before test
        if (!pattern.test(text)) continue;

        const frag = doc.createDocumentFragment();
        let lastIndex = 0;
        pattern.lastIndex = 0; // Reset before exec loop
        let m: RegExpExecArray | null;

        while ((m = pattern.exec(text)) && replacements < MAX_REPLACEMENTS) {
          const start = m.index;
          const matchText = m[0];
          if (start > lastIndex) {
            frag.appendChild(doc.createTextNode(text.slice(lastIndex, start)));
          }
          const mark = doc.createElement("mark");
          mark.setAttribute(
            "class",
            "rounded px-1 py-0.5 bg-yellow-300/40 text-foreground dark:bg-yellow-400/20"
          );
          mark.textContent = matchText;
          frag.appendChild(mark);
          lastIndex = start + matchText.length;
          replacements++;
        }

        if (lastIndex < text.length) {
          frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
        }

        if (lastIndex > 0) {
          textNode.parentNode?.replaceChild(frag, textNode);
        }
      }

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  }, [html, terms]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: highlighted }} />;
}


