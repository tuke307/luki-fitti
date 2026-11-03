import type { getCopy, SiteLocale } from '@/lib/site/copy';

export function SiteFooter({
  t,
  locale,
}: {
  t: ReturnType<typeof getCopy>;
  locale: SiteLocale;
}) {
  const base = locale === 'de' ? '' : '/en';
  const legal =
    locale === 'de'
      ? [
          ['/impressum', t.footer.impressum],
          ['/datenschutz', t.footer.datenschutz],
          ['/nutzungsbedingungen', t.footer.nutzungsbedingungen],
        ]
      : [
          ['/en/imprint', t.footer.impressum],
          ['/en/privacy', t.footer.datenschutz],
          ['/en/terms', t.footer.nutzungsbedingungen],
        ];
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm">
        <nav className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2">
          <a href={`${base || '/'}#features`} className="hover:text-foreground">
            {t.nav.features}
          </a>
          <a href={`${base || '/'}#screenshots`} className="hover:text-foreground">
            {t.nav.screenshots}
          </a>
          <a href={`${base || '/'}#faq`} className="hover:text-foreground">
            {t.nav.faq}
          </a>
          {legal.map(([href, label]) => (
            <a key={href} href={href} className="hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
        <p className="text-muted-foreground ml-auto">{t.footer.copyright}</p>
      </div>
    </footer>
  );
}
