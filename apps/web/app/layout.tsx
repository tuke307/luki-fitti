import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google';
import { Suspense } from 'react';

import '@luki-fitti/ui/globals.css';

import { Providers } from '@/providers/Providers';
import RootLoading from './loading';
import { SITE_URL } from '../lib/config/env.config';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-display',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-mono',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0B0D10' },
    { media: '(prefers-color-scheme: light)', color: '#F4F6F9' },
  ],
};

export const metadata: Metadata = {
  title: {
    default: 'LukiFitti — Personal Gym & Workout Management PWA',
    template: '%s | LukiFitti',
  },
  description:
    'Personal gym workout tracker, split planner, offline-first session execution, stretching routines, and training diary optimized for iPhone & Safari.',
  applicationName: 'LukiFitti',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LukiFitti',
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: '/icon-192.svg',
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
        className={`${spaceGrotesk.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} antialiased selection:bg-primary selection:text-primary-foreground`}
        suppressHydrationWarning
      >
        <Suspense fallback={<RootLoading />}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
