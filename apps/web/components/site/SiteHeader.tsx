import { APP_ORIGIN, TESTFLIGHT_URL } from '@/lib/site/config';
import { type getSiteCopy } from '@/lib/site/content';

export function SiteHeader({ t }: { t: ReturnType<typeof getSiteCopy> }) {
  return (
    <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <a href={t.nav.switchHref === '/en' ? '/' : '/en'} className="text-lg font-bold">
          LukiFitti
        </a>
        <nav className="text-muted-foreground ml-6 hidden gap-4 text-sm sm:flex">
          <a href="#features" className="hover:text-foreground">
            {t.nav.features}
          </a>
          <a href="#screenshots" className="hover:text-foreground">
            {t.nav.screenshots}
          </a>
          <a href="#faq" className="hover:text-foreground">
            {t.nav.faq}
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a
            href={t.nav.switchHref}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            {t.nav.switchTo}
          </a>
          <a
            href={APP_ORIGIN}
            className="hover:text-foreground text-sm font-medium"
            data-testid="nav-open-app"
          >
            {t.nav.openApp}
          </a>
          {TESTFLIGHT_URL ? (
            <a
              href={TESTFLIGHT_URL}
              className="bg-primary text-primary-foreground rounded-full px-4 py-1.5 text-sm font-medium"
            >
              {t.nav.download}
            </a>
          ) : (
            <span className="bg-secondary text-muted-foreground cursor-default rounded-full px-4 py-1.5 text-sm">
              {t.nav.download}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
