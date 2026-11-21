const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

const decodeEntities = (value: string) =>
  value
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(x[0-9a-fA-F]{1,6}|[0-9]{1,7});/gi, (m, code: string) => {
      const hex = code[0] === 'x' || code[0] === 'X';
      const point = Number.parseInt(hex ? code.slice(1) : code, hex ? 16 : 10);
      return point <= 0x10ffff ? String.fromCodePoint(point) : m;
    });

/** Tags whose entire content is non-body markup and must be dropped. */
const HIDDEN_BLOCKS = ['head', 'style', 'script'] as const;

const isTagBoundary = (char: string | undefined) =>
  char === undefined || char === '>' || char === '/' || /\s/.test(char);

/**
 * Removes `<head>`, `<style>` and `<script>` blocks with a linear indexOf scan
 * (case-insensitive) — deliberately not a regex, which would allow polynomial
 * backtracking on adversarial input. An unclosed block drops the rest.
 */
const stripHiddenBlocks = (html: string): string => {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const open = lower.indexOf('<', cursor);
    if (open === -1) {
      out.push(html.slice(cursor));
      break;
    }
    let tag = '';
    for (const candidate of HIDDEN_BLOCKS) {
      if (
        lower.startsWith(candidate, open + 1) &&
        isTagBoundary(lower[open + 1 + candidate.length])
      ) {
        tag = candidate;
        break;
      }
    }
    if (!tag) {
      // Not a hidden block (e.g. `<header`) — keep scanning.
      out.push(html.slice(cursor, open + 1));
      cursor = open + 1;
      continue;
    }
    out.push(html.slice(cursor, open));
    const openEnd = lower.indexOf('>', open);
    if (openEnd === -1) break;
    const close = lower.indexOf(`</${tag}`, openEnd + 1);
    if (close === -1) break;
    const closeEnd = lower.indexOf('>', close);
    if (closeEnd === -1) break;
    cursor = closeEnd + 1;
  }
  return out.join('');
};

/**
 * Drops `<...>` spans with a linear indexOf scan — a `<[^>]+>` regex is
 * quadratic on inputs full of unclosed `<` characters.
 */
const stripTags = (html: string): string => {
  const out: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const open = html.indexOf('<', cursor);
    if (open === -1) {
      out.push(html.slice(cursor));
      break;
    }
    const close = html.indexOf('>', open);
    if (close === -1) {
      // Stray '<' without a '>' — kept for the caller's final <> cleanup.
      out.push(html.slice(cursor));
      break;
    }
    out.push(html.slice(cursor, open));
    cursor = close + 1;
  }
  return out.join('');
};

/** Reads the quoted `href` value from an `<a ...>` opening tag. */
const extractHref = (tag: string): string | null => {
  const lower = tag.toLowerCase();
  const hrefAt = lower.indexOf('href');
  if (hrefAt === -1) return null;
  const eq = lower.indexOf('=', hrefAt + 4);
  if (eq === -1) return null;
  const quote = tag[eq + 1];
  if (quote !== '"' && quote !== "'") return null;
  const end = tag.indexOf(quote, eq + 2);
  return end === -1 ? null : tag.slice(eq + 2, end);
};

const isAnchorStart = (char: string | undefined) =>
  char === undefined || char === '>' || char === '/' || /\s/.test(char);

const isAnchorEnd = (char: string | undefined) =>
  char === undefined || char === '>' || /\s/.test(char);

/**
 * Rewrites anchors to `label (url)` (or bare `url` when the label is empty or
 * equals the url) with a linear indexOf scan — the regex equivalent backtracks
 * quadratically on uncontrolled input.
 */
const rewriteAnchors = (html: string): string => {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const open = lower.indexOf('<a', cursor);
    if (open === -1) {
      out.push(html.slice(cursor));
      break;
    }
    const tagEnd = isAnchorStart(lower[open + 2]) ? lower.indexOf('>', open) : -1;
    const href = tagEnd === -1 ? null : extractHref(html.slice(open, tagEnd + 1));
    const close = href === null ? -1 : lower.indexOf('</a', tagEnd + 1);
    if (href === null || close === -1 || !isAnchorEnd(lower[close + 3])) {
      out.push(html.slice(cursor, open + 1));
      cursor = open + 1;
      continue;
    }
    out.push(html.slice(cursor, open));
    const label = html.slice(tagEnd + 1, close);
    const closeEnd = lower.indexOf('>', close);
    cursor = closeEnd === -1 ? html.length : closeEnd + 1;
    const inner = decodeEntities(stripTags(label)).replace(/[<>]/g, '').trim();
    const url = decodeEntities(href);
    out.push(!inner || inner === url ? url : `${inner} (${url})`);
  }
  return out.join('');
};

/**
 * Derives a readable plain-text alternative from a rendered HTML email so every
 * message carries a text/plain part (HTML-only mail is a spam signal). Links
 * become `label (url)`; the output contains no markup.
 */
export function htmlToText(html: string): string {
  const text = rewriteAnchors(stripHiddenBlocks(html))
    .replace(/<br\b[^<>]*>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)\b[^<>]*>/gi, '\n');

  const withoutTags = stripTags(text);

  return decodeEntities(withoutTags)
    .replace(/[<>]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
