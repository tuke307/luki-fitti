import { DOCS_ORIGIN } from '@/lib/site/config';
import { pageGitInfo, source } from '@/lib/docs/source';

export const dynamic = 'force-static';

export function GET() {
  const urls = source
    .getPages()
    .map((page) => {
      const lastMod = pageGitInfo(page.slugs)?.lastModified;
      return `  <url>\n    <loc>${DOCS_ORIGIN}${page.url}</loc>${
        lastMod ? `\n    <lastmod>${lastMod.slice(0, 10)}</lastmod>` : ''
      }\n  </url>`;
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
