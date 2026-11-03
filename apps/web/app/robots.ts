import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { SITE_HOSTNAMES } from '../lib/site/config';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('x-forwarded-host') ?? (await headers()).get('host') ?? '';
  const isSite = SITE_HOSTNAMES.some((h) => host.startsWith(h));

  if (isSite) {
    return {
      rules: { userAgent: '*', allow: '/', disallow: ['/site/'] },
      sitemap: `https://${host}/sitemap.xml`,
    };
  }
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
