import { APP_STORE_URL, GITHUB_URL, type SiteLocale } from '@/lib/site/config';
import { getSiteCopy } from '@/lib/site/content';
import { shotFile } from '@/lib/site/screens';
import { SITE_PAGES, SITE_PUBLIC_ORIGIN } from '@/lib/site/seo';

const APP_PUBLIC_ORIGIN = 'https://app.luki-fitti.tony-luke.de';

export function StructuredData({ locale }: { locale: SiteLocale }) {
  const t = getSiteCopy(locale);
  const pageUrl = `${SITE_PUBLIC_ORIGIN}${SITE_PAGES.home[locale]}`;
  const ogUrl = `${SITE_PUBLIC_ORIGIN}/og/${locale}`;
  const screenshotUrl = `${SITE_PUBLIC_ORIGIN}${shotFile(locale, '01-active-workout.png')}`;

  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'LukiFitti',
        url: pageUrl,
        inLanguage: locale,
      },
      {
        '@type': 'MobileApplication',
        name: 'LukiFitti',
        operatingSystem: 'iOS 26, watchOS 26',
        applicationCategory: 'HealthApplication',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        isAccessibleForFree: true,
        url: pageUrl,
        downloadUrl: APP_STORE_URL,
        installUrl: APP_STORE_URL,
        sameAs: [APP_STORE_URL, GITHUB_URL],
        image: ogUrl,
        screenshot: screenshotUrl,
        inLanguage: locale,
        license: 'https://www.gnu.org/licenses/agpl-3.0.html',
        author: { '@type': 'Person', name: 'Tony Meißner' },
      },
      {
        '@type': 'WebApplication',
        name: 'LukiFitti',
        url: APP_PUBLIC_ORIGIN,
        applicationCategory: 'HealthApplication',
        browserRequirements: 'Requires JavaScript',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: t.faq.items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
