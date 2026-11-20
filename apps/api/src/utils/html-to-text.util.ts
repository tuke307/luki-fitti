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
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));

/**
 * Derives a readable plain-text alternative from a rendered HTML email so every
 * message carries a text/plain part (HTML-only mail is a spam signal). Links
 * become `label (url)`; the output contains no markup.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label) => {
      const inner = String(label)
        .replace(/<[^>]+>/g, '')
        .trim();
      const url = decodeEntities(href);
      return !inner || inner === url ? url : `${inner} (${url})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
