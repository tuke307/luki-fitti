import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { SITE_HOSTNAMES } from '../lib/config/env.config';

const SITE_PATHS = [
  '/',
  '/en',
  '/impressum',
  '/datenschutz',
  '/nutzungsbedingungen',
  '/en/imprint',
  '/en/privacy',
  '/en/terms',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('x-forwarded-host') ?? (await headers()).get('host') ?? '';
  if (!SITE_HOSTNAMES.some((h) => host.startsWith(h))) return [];

  const now = new Date().toISOString();
  return SITE_PATHS.map((path) => ({
    url: `https://${host}${path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1.0 : path.startsWith('/en') && path !== '/en' ? 0.3 : 0.5,
  }));
}
