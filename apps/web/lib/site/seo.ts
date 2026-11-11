import type { Metadata } from 'next';

import type { SiteLocale } from './config';

export const SITE_PUBLIC_ORIGIN = 'https://luki-fitti.tony-luke.de';

/** Public marketing paths per locale (the site host rewrites them to /site/*). */
export const SITE_PAGES = {
  home: { de: '/', en: '/en' },
  impressum: { de: '/impressum', en: '/en/imprint' },
  datenschutz: { de: '/datenschutz', en: '/en/privacy' },
  nutzungsbedingungen: { de: '/nutzungsbedingungen', en: '/en/terms' },
} as const;

export type SitePage = keyof typeof SITE_PAGES;

const OG_LOCALE: Record<SiteLocale, string> = { de: 'de_DE', en: 'en_US' };

/**
 * Per-page metadata for the marketing site. Child metadata replaces parent
 * openGraph/alternates wholesale, so every site page builds its full set here.
 */
export function buildSiteMetadata({
  locale,
  page,
  title,
  description,
}: {
  locale: SiteLocale;
  page: SitePage;
  title: string;
  description: string;
}): Metadata {
  const paths = SITE_PAGES[page];
  const path = paths[locale];
  const url = `${SITE_PUBLIC_ORIGIN}${path}`;
  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: { de: paths.de, en: paths.en, 'x-default': paths.de },
    },
    openGraph: {
      type: 'website',
      url,
      siteName: 'LukiFitti',
      locale: OG_LOCALE[locale],
      alternateLocale: OG_LOCALE[locale === 'de' ? 'en' : 'de'],
      title,
      description,
      images: [{ url: `/og/${locale}`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`/og/${locale}`],
    },
  };
}
