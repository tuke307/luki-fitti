import type { CSSProperties } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/docs/source';
import { docsTree } from '@/lib/docs/nav';
import { DocsHeader } from '@/components/docs/docs-header';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#nd-page" className="docs-skip">
        Skip to content
      </a>
      <DocsLayout
        tree={docsTree(source.getPageTree())}
        nav={{ component: <DocsHeader /> }}
        themeSwitch={{ enabled: false }}
        containerProps={{
          className: 'docs-layout',
          style: { '--fd-docs-row-1': '3.5rem' } as CSSProperties,
        }}
      >
        {children}
      </DocsLayout>
    </>
  );
}
