// ============================================================================
// RMIS — HTML sanitizer (spec §12.4). Regex allowlist: strips scripts/iframes,
// on* handlers, javascript: URLs, data-*/style attributes; forces links to
// target=_blank rel=noopener noreferrer. Applied to admin-authored rich text.
// ============================================================================

const DANGEROUS_TAGS =
  /<\s*\/?\s*(script|style|iframe|object|embed|form|input|textarea|select|button|link|meta|base|svg|math)[^>]*>[\s\S]*?(?=<\s*\/?\s*(script|style|iframe|object|embed|form|input|textarea|select|button|link|meta|base|svg|math)|$)/gi;

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  let html = String(input);

  // Remove dangerous tag blocks entirely (with content for script/style/iframe).
  html = html.replace(/<\s*\/?\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*\/?\s*(script|style|iframe|object|embed|form|input|textarea|select|button|link|meta|base|svg|math)[^>]*\/?>/gi, "");

  // Strip event handlers.
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Neutralize javascript: URLs.
  html = html.replace(/(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi, '$1="#"');

  // Strip data-* and style attributes.
  html = html.replace(/\sdata-[\w-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Force anchor safety.
  html = html.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
  html = html.replace(/<a\s+target="_blank" rel="noopener noreferrer" ([^>]*?)target="[^"]*"/gi, '<a $1');
  html = html.replace(/<a\s+target="_blank" rel="noopener noreferrer" ([^>]*?)rel="[^"]*"/gi, '<a $1 rel="noopener noreferrer"');

  return html.trim();
}

export function textToHtml(text: string | null | undefined): string {
  if (!text) return "";
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
}
