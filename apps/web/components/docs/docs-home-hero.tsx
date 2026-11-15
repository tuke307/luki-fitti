import { ArrowRight } from 'lucide-react';

const IMPORT_GUIDES = [
  { href: '/import-format', label: 'File format' },
  { href: '/gymlife-import', label: 'GymLife' },
  { href: '/alpha-progression-import', label: 'Alpha Progression' },
  { href: '/mci-import', label: 'MCI' },
];

const SECONDARY_PATHS = [
  {
    href: '/public-api',
    title: 'Read your data with the API',
    body: 'Personal API keys, JSON endpoints and a full workout export for backups and Shortcuts.',
  },
  {
    href: '/contributing',
    title: 'Run it yourself',
    body: 'LukiFitti is open source. Set up the stack or pick up an issue and contribute.',
  },
];

/**
 * Signature element of the docs home page: a calm intro plus a real app screenshot,
 * followed by the main entry paths as an asymmetric typographic list.
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
        </div>
        <div className="docs-hero-shot" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screens/en/06-history.png" alt="" width={660} height={1363} loading="eager" />
        </div>
      </div>
      <nav className="docs-hero-paths" aria-label="Where to start">
        <div className="docs-hero-path-main">
          <a href="/import-format" className="docs-hero-path-title">
            Bring your training history
          </a>
          <p className="docs-hero-path-body">
            Move workouts, templates and personal records in from another app.
          </p>
          <p className="docs-hero-path-links">
            {IMPORT_GUIDES.map((g) => (
              <a key={g.href} href={g.href}>
                {g.label}
              </a>
            ))}
          </p>
        </div>
        {SECONDARY_PATHS.map(({ href, title, body }) => (
          <a key={href} href={href} className="docs-hero-path-row">
            <span>
              <span className="docs-hero-path-row-title">{title}</span>
              <span className="docs-hero-path-body">{body}</span>
            </span>
            <ArrowRight className="docs-hero-path-arrow size-4 shrink-0" aria-hidden />
          </a>
        ))}
      </nav>
    </div>
  );
}
