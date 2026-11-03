import type { Metadata, Viewport } from 'next';
import '@luki-fitti/ui/globals.css';
import { notFound } from 'next/navigation';
import { SITE_LOCALES, type SiteLocale } from '@/lib/site/config';
import { shotFile } from '@/lib/site/screens';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

const META: Record<SiteLocale, { title: string; description: string; canonical: string }> = {
  de: {
    title: 'LukiFitti — Workout-Tracker',
    description:
      'Plane deine Workouts, protokolliere jeden Satz und sieh deinen Fortschritt. Funktioniert offline auf iPhone, Apple Watch und im Web.',
    canonical: '/',
  },
  en: {
    title: 'LukiFitti — Workout Tracker',
    description:
      'Plan your workouts, log every set and watch your progress. Works offline on iPhone, Apple Watch and the web.',
    canonical: '/en',
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!SITE_LOCALES.includes(locale as SiteLocale)) notFound();
  const lang = locale as SiteLocale;
  const meta = META[lang];
  return {
    metadataBase: new URL('https://luki-fitti.tony-luke.de'),
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical, languages: { de: '/', en: '/en' } },
    openGraph: {
      title: meta.title,
      description: meta.description,
      images: [shotFile(lang, '01-active-workout.png')],
      type: 'website',
    },
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
    <html lang={locale as SiteLocale}>
      <body className="bg-background text-foreground min-h-dvh antialiased">{children}</body>
    </html>
  );
}
