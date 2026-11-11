import type { Metadata, Viewport } from 'next';
import '@luki-fitti/ui/globals.css';
import '../site.css';
import { notFound } from 'next/navigation';
import { APP_STORE_ID, SITE_LOCALES, type SiteLocale } from '@/lib/site/config';
import { SITE_PUBLIC_ORIGIN } from '@/lib/site/seo';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
  colorScheme: 'dark',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!SITE_LOCALES.includes(locale as SiteLocale)) notFound();
  return {
    metadataBase: new URL(SITE_PUBLIC_ORIGIN),
    applicationName: 'LukiFitti',
    authors: [{ name: 'Tony Meißner' }],
    creator: 'Tony Meißner',
    category: 'health',
    itunes: { appId: APP_STORE_ID },
    icons: { icon: '/icon.svg', apple: '/images/apple-touch-icon.png' },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!SITE_LOCALES.includes(locale as SiteLocale)) notFound();
  return (
    <html lang={locale as SiteLocale} className="dark">
      <body className="site bg-background text-foreground min-h-dvh antialiased">{children}</body>
    </html>
  );
}
