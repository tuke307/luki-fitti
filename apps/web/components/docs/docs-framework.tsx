'use client';

import { FrameworkProvider } from 'fumadocs-core/framework';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';

/**
 * The docs host rewrites public paths to the internal /docs tree, so during
 * prerender usePathname() resolves '/docs/x' while the browser keeps '/x'.
 * Fumadocs resolves the active sidebar item and tab from the pathname —
 * normalizing it here keeps SSR and hydration identical.
 */
function useDocsPathname(): string {
  const pathname = usePathname() ?? '/';
  if (pathname === '/docs') return '/';
  return pathname.startsWith('/docs/') ? pathname.slice(5) : pathname;
}

export function DocsFramework({ children }: { children: ReactNode }) {
  return (
    <FrameworkProvider
      usePathname={useDocsPathname}
      useRouter={useRouter}
      useParams={useParams}
      Link={Link as unknown as React.ComponentProps<typeof FrameworkProvider>['Link']}
      Image={Image as unknown as React.ComponentProps<typeof FrameworkProvider>['Image']}
    >
      {children}
    </FrameworkProvider>
  );
}
