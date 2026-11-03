// TODO(legal): draft only — needs legal review before going public.
// TODO(legal): postal address required by §5 DDG before going public.
import { SITE_LOCALES, type SiteLocale } from '@/lib/site/config';
import { notFound } from 'next/navigation';
import { LegalPage } from '@/components/site/LegalPage';
import { getSiteCopy } from '@/lib/site/content';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!SITE_LOCALES.includes(locale as SiteLocale)) notFound();
  const t = getSiteCopy(locale as SiteLocale);
  return (
    <LegalPage t={t} locale={locale as SiteLocale} title={t.legal.impressumTitle}>
      {locale === 'de' ? (
        <>
          <section>
            <h2>Angaben gemäß § 5 DDG</h2>
            <p>
              Tony Meißner
              <br />
              [Anschrift folgt]
              <br />
              E-Mail:{' '}
              <a href="mailto:tonymeissner70@gmail.com" className="text-primary underline">
                tonymeissner70@gmail.com
              </a>
            </p>
          </section>
        </>
      ) : (
        <>
          <section>
            <h2>Information pursuant to § 5 DDG</h2>
            <p>
              Tony Meißner
              <br />
              [Address to follow]
              <br />
              Email:{' '}
              <a href="mailto:tonymeissner70@gmail.com" className="text-primary underline">
                tonymeissner70@gmail.com
              </a>
            </p>
          </section>
        </>
      )}
    </LegalPage>
  );
}
