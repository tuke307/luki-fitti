import { ArrowRight, Database, FileUp, Search, Terminal } from 'lucide-react';
import { DOCS_ORIGIN } from '@/lib/site/config';

const PATHS = [
  {
    href: '/import-format',
    icon: FileUp,
    title: 'Bring your training history',
    body: 'Move workouts, templates and personal records in from GymLife, Alpha Progression or MCI.',
  },
  {
    href: '/public-api',
    icon: Terminal,
    title: 'Read your data with the API',
    body: 'Personal API keys, JSON endpoints and a full workout export for backups and Shortcuts.',
  },
  {
    href: '/contributing',
    icon: Database,
    title: 'Run it yourself',
    body: 'LukiFitti is open source. Set up the stack or pick up an issue and contribute.',
  },
];

/**
 * Signature element of the docs home page: a calm intro plus a real app screenshot,
 * followed by the main entry paths as an asymmetric list.
 */
export function DocsHomeHero({ title }: { title: string }) {
  return (
    <div className="docs-hero">
      <div className="docs-hero-grid">
        <div className="docs-hero-copy">
          <h1 className="font-display">{title}</h1>
          <p>
            Everything about LukiFitti in one place: moving your data in, reading it back out, and
            running the whole stack yourself.
          </p>
          <button type="button" data-search-full="" className="docs-hero-search">
            <Search className="size-4" aria-hidden />
            Search the docs
            <kbd aria-hidden>⌘K</kbd>
          </button>
        </div>
        <div className="docs-hero-shot" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screens/en/05-history.png" alt="" width={660} height={1363} loading="eager" />
        </div>
      </div>
      <nav className="docs-hero-paths" aria-label="Where to start">
        {PATHS.map(({ href, icon: Icon, title: t, body }) => (
          <a key={href} href={href} className="docs-hero-path">
            <Icon className="size-5 shrink-0" aria-hidden />
            <span>
              <span className="docs-hero-path-title">{t}</span>
              <span className="docs-hero-path-body">{body}</span>
            </span>
            <ArrowRight className="docs-hero-path-arrow size-4 shrink-0" aria-hidden />
          </a>
        ))}
      </nav>
      <p className="docs-hero-meta">
        OpenAPI spec: <a href={`${DOCS_ORIGIN}/openapi/public-api-v1.json`}>public-api-v1.json</a>
      </p>
    </div>
  );
}
