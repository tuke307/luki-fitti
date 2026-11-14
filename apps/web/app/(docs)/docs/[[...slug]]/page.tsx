import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { pageGitInfo, source } from '@/lib/docs/source';
import { OpenAPIPage } from '@/components/docs/api-page';
import { DocsHomeHero } from '@/components/docs/docs-home-hero';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

function isApiReferencePage(data: unknown): data is {
  getOpenAPIPageProps: () => Record<string, unknown>;
} {
  return typeof data === 'object' && data !== null && 'getOpenAPIPageProps' in data;
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
  return (
    <DocsPage
      toc={page.data.toc}
      lastUpdate={info?.lastModified ? new Date(info.lastModified) : undefined}
      editOnGithub={
        info ? { owner: 'tuke307', repo: 'luki-fitti', sha: 'main', path: info.path } : undefined
      }
    >
      {isHome ? <DocsHomeHero title={page.data.title} /> : <DocsTitle>{page.data.title}</DocsTitle>}
      {page.data.description && !isHome ? (
        <DocsDescription>{page.data.description}</DocsDescription>
      ) : null}
      <DocsBody>
        <Mdx components={defaultMdxComponents} />
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
