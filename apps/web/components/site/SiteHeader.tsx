import { SiGithub } from '@icons-pack/react-simple-icons';

import { APP_ORIGIN, APP_STORE_URL, GITHUB_URL } from '@/lib/site/config';
import { type getSiteCopy } from '@/lib/site/content';

export function SiteHeader({ t }: { t: ReturnType<typeof getSiteCopy> }) {
  return (
    <header className="bg-background/72 border-white/10 sticky top-0 z-10 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <a
          href={t.nav.switchHref === '/en' ? '/' : '/en'}
          className="text-base font-semibold tracking-tight"
        >
          LukiFitti
        </a>
        <nav className="text-muted-foreground ml-6 hidden gap-5 text-sm sm:flex">
          <a href="#features" className="hover:text-foreground transition-colors">
            {t.nav.features}
          </a>
          <a href="#open-source" className="hover:text-foreground transition-colors">
            {t.nav.openSource}
          </a>
          <a href="#faq" className="hover:text-foreground transition-colors">
            {t.nav.faq}
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.nav.github}
            className="text-muted-foreground hover:text-foreground flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          >
            <SiGithub size={18} aria-hidden />
          </a>
          <a
            href={t.nav.switchHref}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            {t.nav.switchTo}
          </a>
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground hidden text-sm sm:inline"
          >
            {t.nav.download}
          </a>
          <a
            href={APP_ORIGIN}
            className="bg-primary text-primary-foreground flex h-9 items-center rounded-full px-4 text-sm font-medium transition-[filter] hover:brightness-110"
            data-testid="nav-open-app"
          >
            {t.nav.openApp}
          </a>
        </div>
      </div>
    </header>
  );
}
