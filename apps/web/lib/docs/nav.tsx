import { BookOpen, FolderGit2, Terminal } from 'lucide-react';
import type { Folder, Item, Node, Root } from 'fumadocs-core/page-tree';

/**
 * Sidebar navigation: three root folders become the sidebar tabs, and a short
 * label map keeps the tree compact. Page titles and <title> stay untouched —
 * only nav labels, breadcrumbs and prev/next (all tree-driven) change here.
 */

const SHORT_LABELS: Record<string, string> = {
  '/': 'Overview',
  '/import-format': 'File format',
  '/training-data-import': 'From other apps',
  '/gymlife-import': 'GymLife',
  '/alpha-progression-import': 'Alpha Progression',
  '/mci-import': 'MCI',
  '/pwa-setup-and-architecture': 'Web app vs. iPhone',
  '/exercise-catalog': 'Exercise catalog',
  '/admin-ai-nutrition': 'AI & nutrition',
  '/public-api': 'Getting started',
  '/contributing': 'Contributing',
  '/possible-features': 'Roadmap',
  '/release': 'Release flow',
  '/app-store-release': 'App Store',
  '/specs/release-2.0.0': '2.0.0 plan',
  '/specs/social-2.0': 'Social',
  '/specs/social-2.0-pr1': 'Foundation',
  '/specs/social-2.0-pr2': 'Leagues',
  '/specs/social-2.0-pr3': 'Duels',
  '/specs/social-2.0-pr4': 'Raids',
  '/specs/api-keys': 'API keys',
  '/specs/privacy-social': 'Privacy (draft)',
  '/specs/mcp-server': 'MCP server',
};

const API_OPS: Record<string, { group: string; label: string }> = {
  '/api-reference/v1/me/get': { group: 'Profile', label: 'Get profile' },
  '/api-reference/v1/sessions/get': { group: 'Sessions', label: 'List sessions' },
  '/api-reference/v1/sessions/id/get': { group: 'Sessions', label: 'Get a session' },
  '/api-reference/v1/personal-records/get': { group: 'Sessions', label: 'Personal records' },
  '/api-reference/v1/workouts/get': { group: 'Workouts', label: 'List workouts' },
  '/api-reference/v1/folders/get': { group: 'Workouts', label: 'List folders' },
  '/api-reference/v1/stretching-routines/get': { group: 'Workouts', label: 'Stretching routines' },
  '/api-reference/v1/exercises/get': { group: 'Workouts', label: 'List exercises' },
  '/api-reference/v1/meals/get': { group: 'Nutrition', label: 'List meals' },
  '/api-reference/v1/body-weight/get': { group: 'Body', label: 'Body weight' },
  '/api-reference/v1/progress/check-ins/get': { group: 'Body', label: 'Check-ins' },
  '/api-reference/v1/activity/daily-energy/get': { group: 'Activity', label: 'Daily energy' },
  '/api-reference/v1/activity/workouts/get': { group: 'Activity', label: 'Workout activity' },
  '/api-reference/v1/export/get': { group: 'Export', label: 'Export backup' },
};

const API_GROUP_ORDER = [
  'Profile',
  'Sessions',
  'Workouts',
  'Nutrition',
  'Body',
  'Activity',
  'Export',
];

function collectPages(nodes: Node[], into = new Map<string, Item>()) {
  for (const node of nodes) {
    if (node.type === 'page') into.set(node.url, node);
    if (node.type === 'folder') collectPages(node.children, into);
  }
  return into;
}

/**
 * Rebuilds the page tree into three sidebar tabs with short labels.
 * Unknown pages keep their original name, so new docs show up without a map entry.
 */
export function docsTree(tree: Root): Root {
  const items = collectPages(tree.children);
  const label = (node: Item): Item => ({
    ...node,
    name: SHORT_LABELS[node.url] ?? node.name,
  });
  const page = (url: string) => {
    const node = items.get(url);
    return node ? label(node) : undefined;
  };
  const pages = (urls: string[]) => urls.map(page).filter((n): n is Item => Boolean(n));

  const group = (name: string, children: Node[]): Folder => ({
    type: 'folder',
    name,
    children,
  });

  const overview = page('/');
  const guides: Folder = {
    type: 'folder',
    name: 'Guides',
    description: 'Move your data in and use the app',
    icon: <BookOpen className="size-4" />,
    root: true,
    index: overview,
    children: [
      ...(overview ? [overview] : []),
      group(
        'Import',
        pages([
          '/import-format',
          '/training-data-import',
          '/gymlife-import',
          '/alpha-progression-import',
          '/mci-import',
        ]),
      ),
      group(
        'Using the app',
        pages(['/pwa-setup-and-architecture', '/exercise-catalog', '/admin-ai-nutrition']),
      ),
    ],
  };

  const apiGroups = new Map<string, Item[]>();
  for (const [url, op] of Object.entries(API_OPS)) {
    const node = items.get(url);
    if (!node) continue;
    const list = apiGroups.get(op.group) ?? [];
    list.push({ ...node, name: op.label });
    apiGroups.set(op.group, list);
  }
  // OpenAPI operations not in the map land in an "Other" group instead of disappearing.
  const knownOpUrls = new Set(Object.keys(API_OPS));
  for (const [url, node] of items) {
    if (url.startsWith('/api-reference/') && !knownOpUrls.has(url)) {
      const list = apiGroups.get('Other') ?? [];
      list.push(node);
      apiGroups.set('Other', list);
    }
  }
  const gettingStarted = page('/public-api');
  const api: Folder = {
    type: 'folder',
    name: 'API',
    description: 'Personal API keys and the v1 reference',
    icon: <Terminal className="size-4" />,
    root: true,
    index: gettingStarted,
    children: [
      ...(gettingStarted ? [gettingStarted] : []),
      ...API_GROUP_ORDER.filter((g) => apiGroups.has(g)).map((g) =>
        group(g, apiGroups.get(g) ?? []),
      ),
    ],
  };

  const socialIndex = page('/specs/social-2.0');
  const specs: Folder = {
    type: 'folder',
    name: 'Plans & specs',
    defaultOpen: false,
    collapsible: true,
    children: [
      ...pages(['/specs/release-2.0.0']),
      ...(socialIndex
        ? [
            {
              type: 'folder',
              name: 'Social',
              defaultOpen: false,
              collapsible: true,
              index: socialIndex,
              children: pages([
                '/specs/social-2.0-pr1',
                '/specs/social-2.0-pr2',
                '/specs/social-2.0-pr3',
                '/specs/social-2.0-pr4',
              ]),
            } satisfies Folder,
          ]
        : []),
      ...pages(['/specs/api-keys', '/specs/privacy-social', '/specs/mcp-server']),
    ],
  };
  const contributing = page('/contributing');
  const project: Folder = {
    type: 'folder',
    name: 'Project',
    description: 'Contribute, release and follow the plans',
    icon: <FolderGit2 className="size-4" />,
    root: true,
    index: contributing,
    children: [
      ...pages(['/contributing', '/possible-features']),
      group('Releases', pages(['/release', '/app-store-release'])),
      specs,
    ],
  };

  // Any page not placed in a tab stays reachable at the top level.
  const placed = new Set(
    [
      overview,
      gettingStarted,
      contributing,
      ...guides.children,
      ...api.children.flatMap((f: Node) => (f.type === 'folder' ? f.children : [])),
      ...project.children,
      ...specs.children,
    ]
      .flatMap((n) => (n && n.type === 'folder' ? [n, ...n.children] : n ? [n] : []))
      .map((n: Node | undefined) => (n && n.type === 'page' ? n.url : '')),
  );
  const rest = tree.children.filter((n) => n.type === 'page' && !placed.has(n.url));

  return { ...tree, children: [guides, api, project, ...rest] };
}
