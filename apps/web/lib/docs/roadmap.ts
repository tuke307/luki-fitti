/**
 * Reads the public GitHub Project (v2) board for the docs roadmap page.
 * The token is required for the GraphQL API even though the project is public;
 * it is only ever sent in the Authorization header, never logged.
 */

const QUERY = `
query($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) {
      title
      url
      items(first: 100) {
        nodes {
          id
          type
          status: fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          release: fieldValueByName(name: "Release") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          content {
            __typename
            ... on Issue {
              title
              number
              url
              labels(first: 8) { nodes { name } }
            }
            ... on PullRequest {
              title
              number
              url
              labels(first: 8) { nodes { name } }
            }
            ... on DraftIssue {
              title
            }
          }
        }
      }
    }
  }
}`;

export interface RoadmapItem {
  id: string;
  kind: 'issue' | 'pr' | 'draft';
  title: string;
  number: number | null;
  url: string | null;
  status: string;
  release: string | null;
  labels: string[];
}

export interface Roadmap {
  title: string;
  url: string;
  items: RoadmapItem[];
}

interface GqlNode {
  id: string;
  type: string;
  status?: { name?: string } | null;
  release?: { name?: string } | null;
  content?: {
    __typename: string;
    title?: string;
    number?: number;
    url?: string;
    labels?: { nodes?: { name: string }[] };
  } | null;
}

/** Null when the board can't be read; callers render a calm fallback. */
export async function fetchRoadmap(): Promise<Roadmap | null> {
  const token = process.env.GITHUB_PROJECT_TOKEN;
  const number = Number(process.env.GITHUB_PROJECT_NUMBER ?? '4');
  const owner = process.env.GITHUB_PROJECT_OWNER ?? 'tuke307';
  if (!token || !Number.isFinite(number)) return null;

  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: QUERY, variables: { owner, number } }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        user?: { projectV2?: { title?: string; url?: string; items?: { nodes?: GqlNode[] } } };
      };
      errors?: unknown[];
    };
    const project = json.data?.user?.projectV2;
    if (!project?.items?.nodes) return null;

    const items: RoadmapItem[] = project.items.nodes
      .filter((n) => n?.content?.title)
      .map((n) => ({
        id: n.id,
        kind:
          n.content?.__typename === 'PullRequest'
            ? 'pr'
            : n.content?.__typename === 'DraftIssue'
              ? 'draft'
              : 'issue',
        title: n.content?.title ?? '',
        number: n.content?.number ?? null,
        url: n.content?.url ?? null,
        status: n.status?.name ?? 'Todo',
        release: n.release?.name ?? null,
        labels: (n.content?.labels?.nodes ?? []).map((l) => l.name),
      }));
    return { title: project.title ?? 'Roadmap', url: project.url ?? '', items };
  } catch {
    return null;
  }
}
