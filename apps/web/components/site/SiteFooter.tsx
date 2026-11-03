import type { SiteLocale } from '@/lib/site/config';
import type { getSiteCopy } from '@/lib/site/content';

export function SiteFooter({
  t,
  locale,
}: {
  t: ReturnType<typeof getSiteCopy>;
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
    <footer className="border-white/10 border-t">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center">
        <nav className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2">
          <a href={`${base || '/'}#features`} className="hover:text-foreground transition-colors">
            {t.nav.features}
          </a>
          <a href={`${base || '/'}#faq`} className="hover:text-foreground transition-colors">
            {t.nav.faq}
          </a>
          {legal.map(([href, label]) => (
            <a key={href} href={href} className="hover:text-foreground transition-colors">
              {label}
            </a>
          ))}
        </nav>
        <p className="text-muted-foreground sm:ml-auto">{t.footer.copyright}</p>
      </div>
    </footer>
  );
}
