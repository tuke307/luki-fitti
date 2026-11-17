import { DOCS_ORIGIN } from '@/lib/site/config';

export const dynamic = 'force-static';

export function GET() {
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${DOCS_ORIGIN}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
