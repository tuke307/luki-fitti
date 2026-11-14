import type { Metadata } from 'next';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { fetchRoadmap, type RoadmapItem } from '@/lib/docs/roadmap';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Roadmap',
  description: 'What is planned for LukiFitti, straight from the GitHub project board.',
};

const STATUS_ORDER = ['in progress', 'in review', 'todo'];
const DONE = 'done';
const DONE_SHOWN = 10;

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: '2.0.0', label: '2.0.0' },
  { id: 'later', label: 'Later' },
] as const;

const KIND_LABEL = { issue: 'Issue', pr: 'PR', draft: 'Draft' } as const;

function Row({ item }: { item: RoadmapItem }) {
  const title = item.url ? (
    <a href={item.url} target="_blank" rel="noreferrer" className="docs-roadmap-title">
      {item.title}
    </a>
  ) : (
    <span className="docs-roadmap-title">{item.title}</span>
  );
  return (
    <li className="docs-roadmap-row">
      <span className="docs-roadmap-kind">{KIND_LABEL[item.kind]}</span>
      {title}
      {item.number != null && <span className="docs-roadmap-meta">#{item.number}</span>}
      {item.release && <span className="docs-roadmap-tag">{item.release}</span>}
      {item.labels.map((label) => (
        <span key={label} className="docs-roadmap-label">
          {label}
        </span>
      ))}
    </li>
  );
}

interface PageProps {
  searchParams: Promise<{ release?: string }>;
}

export default async function RoadmapPage({ searchParams }: PageProps) {
  const { release } = await searchParams;
  const filter = FILTERS.some((f) => f.id === release) ? release! : 'all';
  const board = await fetchRoadmap();

  return (
    <DocsPage>
      <DocsTitle>Roadmap</DocsTitle>
      <DocsBody>
        <p>
          What is planned for LukiFitti, read straight from the GitHub project board and refreshed
          hourly.
        </p>
        <nav className="docs-roadmap-filters" aria-label="Filter by release">
          {FILTERS.map((f) => (
            <a
              key={f.id}
              href={f.id === 'all' ? '/roadmap' : `/roadmap?release=${f.id}`}
              className="docs-roadmap-filter"
              aria-current={filter === f.id ? 'true' : undefined}
            >
              {f.label}
            </a>
          ))}
        </nav>
        {!board ? (
          <p>
            The board can’t be read right now. You can browse it on{' '}
            <a href="https://github.com/users/tuke307/projects">GitHub</a>.
          </p>
        ) : (
          <RoadmapGroups
            items={board.items.filter(
              (item) =>
                filter === 'all' || (item.release ?? '').toLowerCase() === filter.toLowerCase(),
            )}
          />
        )}
      </DocsBody>
    </DocsPage>
  );
}

function RoadmapGroups({ items }: { items: RoadmapItem[] }) {
  const byStatus = new Map<string, RoadmapItem[]>();
  for (const item of items) {
    const list = byStatus.get(item.status) ?? [];
    list.push(item);
    byStatus.set(item.status, list);
  }
  const statuses = [...byStatus.keys()].sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.toLowerCase());
    const bi = STATUS_ORDER.indexOf(b.toLowerCase());
    if (a.toLowerCase() === DONE) return 1;
    if (b.toLowerCase() === DONE) return -1;
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b);
  });

  return (
    <>
      {statuses.map((status) => {
        const group = byStatus.get(status) ?? [];
        if (status.toLowerCase() === DONE) {
          return (
            <details key={status} className="docs-roadmap-done">
              <summary>
                Done <span className="docs-roadmap-count">{group.length}</span>
              </summary>
              <ul className="docs-roadmap-list">
                {group.slice(0, DONE_SHOWN).map((item) => (
                  <Row key={item.id} item={item} />
                ))}
              </ul>
            </details>
          );
        }
        return (
          <section key={status}>
            <h2 className="docs-roadmap-status">
              {status} <span className="docs-roadmap-count">{group.length}</span>
            </h2>
            <ul className="docs-roadmap-list">
              {group.map((item) => (
                <Row key={item.id} item={item} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
