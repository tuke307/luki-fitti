import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';

import '@luki-fitti/ui/globals.css';

import { PageViewTracker } from '@/components/analytics/page-view-tracker';
import { Providers } from '@/providers/Providers';
import RootLoading from './loading';
import { SITE_URL } from '../lib/config/env.config';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
  ],
};

export const metadata: Metadata = {
  title: {
    default: 'LukiFitti — Workout Tracker',
    template: '%s | LukiFitti',
  },
  description:
    'Plan your workouts, log every set, and see your progress. Works offline on iPhone, Apple Watch and the web.',
  applicationName: 'LukiFitti',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LukiFitti',
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <Suspense fallback={<RootLoading />}>
          <Providers>{children}</Providers>
        </Suspense>
        <PageViewTracker />
      </body>
    </html>
  );
}
