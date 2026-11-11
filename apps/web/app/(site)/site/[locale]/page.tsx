import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LandingPage } from '@/components/site/LandingPage';
import { SITE_LOCALES, type SiteLocale } from '@/lib/site/config';
import { buildSiteMetadata } from '@/lib/site/seo';

const META: Record<SiteLocale, { title: string; description: string }> = {
  de: {
    title: 'LukiFitti — Kostenloser Workout-Tracker für iPhone, Apple Watch & Web',
    description:
      'Kostenloser, quelloffener Workout-Tracker: Training planen, jeden Satz loggen, Fortschritt sehen. Offline auf iPhone, Apple Watch und im Web.',
  },
  en: {
    title: 'LukiFitti — Free Workout Tracker for iPhone, Apple Watch & Web',
    description:
      'Free, open-source workout tracker: plan workouts, log every set and see your progress. Works offline on iPhone, Apple Watch and the web.',
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
  return buildSiteMetadata({
    locale: lang,
    page: 'home',
    title: META[lang].title,
    description: META[lang].description,
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!SITE_LOCALES.includes(locale as SiteLocale)) notFound();
  return <LandingPage locale={locale as SiteLocale} />;
}
