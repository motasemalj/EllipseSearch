/**
 * Minimal, dependency-free text → safe HTML renderer.
 *
 * Why: We store `ai_response_html` and render it via `dangerouslySetInnerHTML`.
 * The simulator responses are plain text / markdown-ish; if we store them raw,
 * the UI will collapse newlines and lists (and it becomes hard to compare to ChatGPT).
 *
 * This renderer:
 * - Escapes all HTML by default (prevents injection)
 * - Preserves paragraphs + line breaks
 * - Renders markdown: lists, bold, italic, links, code
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isUlItem(line: string): boolean {
  return /^(\s*[-*])\s+/.test(line);
}

function isOlItem(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line);
}

function stripListPrefix(line: string): string {
  return line.replace(/^(\s*[-*]|\s*\d+\.)\s+/, "");
}

/**
 * Render inline markdown in text (bold, italic, links, code).
 * This is safe because we escape HTML first, then selectively render markdown.
 * Processing order matters: code -> links -> bold -> italic
 */
function renderInlineMarkdown(text: string): string {
  // Escape HTML first
  let result = escapeHtml(text);
  
  // Code spans: `code` (handle first to avoid conflicts with other markdown)
  result = result.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-sm font-mono">$1</code>');
  
  // Links: [text](url) (handle before bold/italic to avoid conflicts)
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, (match, linkText, url) => {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${escapeHtml(linkText)}</a>`;
  });
  
  // Bold: **text** or __text__ (double markers - handle before single)
  // Use a more permissive regex that allows any characters between markers
  // The .*? is non-greedy so it will match the shortest possible string
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Italic: *text* or _text_ (single markers)
  // Only match if not at word boundaries to avoid matching things like file_name_here
  // Match *text* where text doesn't start or end with space
  result = result.replace(/(?<!\*)\*([^\s*][^*]*?[^\s*]|[^\s*])\*(?!\*)/g, '<em>$1</em>');
  result = result.replace(/(?<!_)_([^\s_][^_]*?[^\s_]|[^\s_])_(?!_)/g, '<em>$1</em>');
  
  return result;
}

/**
 * Check if a line is a markdown header
 */
function isHeader(line: string): { level: number; text: string } | null {
  const trimmed = line.trim();
  // Match #, ##, ###, ####, #####, ######
  const match = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (match) {
    return {
      level: match[1].length,
      text: match[2].trim(),
    };
  }
  return null;
}

/**
 * Convert plain text into safe HTML while preserving basic structure and markdown.
 */
export function textToSafeHtml(input: string): string {
  const text = (input ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "<p class='text-muted-foreground'>No response recorded</p>";

  const lines = text.split("\n");
  const out: string[] = [];

  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  let para: string[] = [];
  const flushPara = () => {
    const joined = para.join(" ").trim();
    if (joined) {
      const rendered = renderInlineMarkdown(joined);
      out.push(`<p>${rendered}</p>`);
    }
    para = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // Blank line: end paragraph / close lists
    if (!trimmed) {
      flushPara();
      closeLists();
      continue;
    }

    // Headers: #, ##, ###, etc.
    const header = isHeader(trimmed);
    if (header) {
      flushPara();
      closeLists();
      const rendered = renderInlineMarkdown(header.text);
      const tag = `h${Math.min(header.level + 2, 6)}`; // h3-h6 for ###-######
      const classes = header.level === 1 ? 'text-2xl font-bold mt-6 mb-3' :
                     header.level === 2 ? 'text-xl font-bold mt-5 mb-2' :
                     header.level === 3 ? 'text-lg font-semibold mt-4 mb-2' :
                     'text-base font-semibold mt-3 mb-1';
      out.push(`<${tag} class="${classes}">${rendered}</${tag}>`);
      continue;
    }

    // List items
    if (isUlItem(trimmed)) {
      flushPara();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul class='list-disc list-inside space-y-1 my-2'>");
        inUl = true;
      }
      const listContent = stripListPrefix(trimmed);
      const rendered = renderInlineMarkdown(listContent);
      out.push(`<li class='ml-2'>${rendered}</li>`);
      continue;
    }

    if (isOlItem(trimmed)) {
      flushPara();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol class='list-decimal list-inside space-y-1 my-2'>");
        inOl = true;
      }
      const listContent = stripListPrefix(trimmed);
      const rendered = renderInlineMarkdown(listContent);
      out.push(`<li class='ml-2'>${rendered}</li>`);
      continue;
    }

    // Regular text line: keep as paragraph text; preserve manual line breaks lightly
    closeLists();
    para.push(trimmed);
  }

  flushPara();
  closeLists();

  return out.join("\n");
}


