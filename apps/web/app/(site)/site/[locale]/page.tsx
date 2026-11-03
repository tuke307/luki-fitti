import { notFound } from 'next/navigation';
import { LandingPage } from '@/components/site/LandingPage';
import { SITE_LOCALES, type SiteLocale } from '@/lib/site/config';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!SITE_LOCALES.includes(locale as SiteLocale)) notFound();
  return <LandingPage locale={locale as SiteLocale} />;
}
