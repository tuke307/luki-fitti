import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { pageGitInfo, source } from '@/lib/docs/source';
import { OpenAPIPage } from '@/components/docs/api-page';
import { DocsHomeHero } from '@/components/docs/docs-home-hero';
import { Mermaid } from '@/components/docs/mermaid';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

function isApiReferencePage(data: unknown): data is {
  getOpenAPIPageProps: () => Record<string, unknown>;
} {
  return typeof data === 'object' && data !== null && 'getOpenAPIPageProps' in data;
}

/**
 * ADR pages open with a "- Status: … - Date: … - Deciders: …" bullet list. The
 * markdown stays untouched; here it becomes a compact meta row (status tag plus
 * muted date and deciders), and the original list is hidden via `.docs-adr`.
 */
function AdrMeta({ slug }: { slug: string }) {
  const meta: Record<string, string> = {};
  try {
    const src = readFileSync(path.join(process.cwd(), 'content', 'adr', `${slug}.md`), 'utf8');
    for (const line of src.split('\n')) {
      if (!line.startsWith('- ')) {
        if (Object.keys(meta).length > 0) break;
        continue;
      }
      const m = /^- ([^:]+):\s*(.+)$/.exec(line);
      if (m) meta[m[1].trim()] = m[2].trim();
    }
  } catch {
    return null;
  }
  if (!meta.Status) return null;

  const status = meta.Status;
  const tone = /propos/i.test(status)
    ? 'docs-adr-status-proposed'
    : /implement/i.test(status)
      ? 'docs-adr-status-implemented'
      : /accept/i.test(status)
        ? 'docs-adr-status-accepted'
        : 'docs-adr-status-default';
  const rest = [meta.Date, meta.Deciders].filter(Boolean);

  return (
    <p className="docs-adr-meta">
      <span className={`docs-adr-status ${tone}`}>{status}</span>
      {rest.map((v) => (
        <span key={v} className="docs-adr-meta-value">
          {v}
        </span>
      ))}
    </p>
  );
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const info = pageGitInfo(page.slugs);
  const isHome = page.slugs.length === 0;

  if (isApiReferencePage(page.data)) {
    return (
      <DocsPage toc={page.data.toc} full>
        <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
      </DocsPage>
    );
  }

  const Mdx = page.data.body;
  const isAdr = page.slugs[0] === 'adr' && page.slugs.length === 2;
  return (
    <DocsPage
      toc={page.data.toc}
      lastUpdate={info?.lastModified ? new Date(info.lastModified) : undefined}
      editOnGithub={
        info ? { owner: 'tuke307', repo: 'luki-fitti', sha: 'main', path: info.path } : undefined
      }
    >
      {isHome ? <DocsHomeHero title={page.data.title} /> : <DocsTitle>{page.data.title}</DocsTitle>}
      {/* The derived description repeats the first paragraph; it stays for
          meta/OG/search only. */}
      {isAdr && <AdrMeta slug={page.slugs[1]} />}
      <DocsBody className={isAdr ? 'docs-adr' : undefined}>
        <Mdx components={{ ...defaultMdxComponents, Mermaid }} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams('slug');
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) return {};
  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: { images: [`/og-image?path=${encodeURIComponent(page.url)}`] },
  };
}
