import type { Metadata, Viewport } from 'next';

import '@luki-fitti/ui/globals.css';
import './docs/docs.css';

import { RootProvider } from 'fumadocs-ui/provider/next';
import { DOCS_ORIGIN } from '@/lib/site/config';

export const metadata: Metadata = {
  metadataBase: new URL(DOCS_ORIGIN),
  title: {
    default: 'LukiFitti Docs',
    template: '%s | LukiFitti Docs',
  },
  description:
    'Guides, import formats and the public API reference for LukiFitti, the workout tracker.',
  applicationName: 'LukiFitti Docs',
  icons: { icon: '/icon.svg' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
  colorScheme: 'dark',
};

export default function DocsRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: 'dark' }} suppressHydrationWarning>
      <body className="docs-site bg-background text-foreground min-h-dvh antialiased">
        {/* Static Orama index at /search-index — never under /api (Caddy owns that).
            The docs host is dark-only: no next-themes, no toggle. */}
        <RootProvider
          theme={{ enabled: false }}
          search={{ options: { type: 'static', api: '/search-index' } }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
