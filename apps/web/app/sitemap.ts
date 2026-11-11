import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import type { SiteLocale } from '../lib/site/config';
import { SITE_HOSTNAMES } from '../lib/site/config';
import { SITE_PAGES, SITE_PUBLIC_ORIGIN } from '../lib/site/seo';

const PRIORITY: Record<keyof typeof SITE_PAGES, number> = {
  home: 1,
  impressum: 0.3,
  datenschutz: 0.3,
  nutzungsbedingungen: 0.3,
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('x-forwarded-host') ?? (await headers()).get('host') ?? '';
  if (!SITE_HOSTNAMES.some((h) => host.startsWith(h))) return [];

  return Object.entries(SITE_PAGES).flatMap(([page, paths]) =>
    (Object.keys(paths) as SiteLocale[]).map((locale) => ({
      url: `${SITE_PUBLIC_ORIGIN}${paths[locale]}`,
      alternates: {
        languages: {
          de: `${SITE_PUBLIC_ORIGIN}${paths.de}`,
          en: `${SITE_PUBLIC_ORIGIN}${paths.en}`,
          'x-default': `${SITE_PUBLIC_ORIGIN}${paths.de}`,
        },
      },
      changeFrequency: 'weekly',
      priority: PRIORITY[page as keyof typeof SITE_PAGES],
    })),
  );
}
