import type { getCopy, SiteLocale } from '@/lib/site/copy';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

export function LegalPage({
  t,
  locale,
  title,
  children,
}: {
  t: ReturnType<typeof getCopy>;
  locale: SiteLocale;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader t={t} />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold">{title}</h1>
        <div className="mt-8 space-y-6 text-sm [&_h2]:text-lg [&_h2]:font-semibold [&_p]:text-muted-foreground [&_ul]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <SiteFooter t={t} locale={locale} />
    </>
  );
}
