'use client';

import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { SidebarTrigger } from 'fumadocs-ui/layouts/docs/slots/sidebar';
import { SiGithub } from '@icons-pack/react-simple-icons';
import { APP_ORIGIN, SITE_ORIGIN } from '@/lib/site/config';
import { useEffect, useState } from 'react';
import Link from 'next/link';

function KbdHint() {
  // Client-only: the platform differs between server and browser, so rendering it
  // during hydration is a mismatch. Empty until mounted.
  const [isMac, setIsMac] = useState<boolean | null>(null);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  return (
    <kbd className="docs-kbd" aria-hidden>
      {isMac === null ? '' : isMac ? '⌘K' : 'Ctrl K'}
    </kbd>
  );
}

export function DocsHeader() {
  const { setOpenSearch } = useSearchContext();
  return (
    <div className="docs-header-slot">
      <header className="docs-header material-bar">
        <div className="docs-header-inner">
          <SidebarTrigger
            className="docs-sidebar-trigger md:hidden"
            aria-label="Open the docs menu"
            data-testid="docs-sidebar-trigger"
          />
          <Link href="/" className="docs-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="size-6 rounded-[0.35rem]" />
            <span className="font-display">LukiFitti Docs</span>
          </Link>
          <button
            type="button"
            className="docs-search-trigger"
            onClick={() => setOpenSearch(true)}
            aria-label="Search the docs"
            data-testid="docs-search-trigger"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span className="docs-search-label">Search</span>
            <KbdHint />
          </button>
          <nav className="docs-nav" aria-label="More LukiFitti">
            <a href={SITE_ORIGIN} className="docs-nav-link hidden sm:inline">
              Website
            </a>
            <a
              href="https://github.com/tuke307/luki-fitti"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LukiFitti on GitHub"
              className="docs-nav-icon"
            >
              <SiGithub size={18} aria-hidden />
            </a>
            <a href={APP_ORIGIN} className="docs-open-app">
              Open app
            </a>
          </nav>
        </div>
      </header>
    </div>
  );
}
