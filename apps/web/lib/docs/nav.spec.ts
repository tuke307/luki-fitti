import test from 'node:test';
import assert from 'node:assert/strict';
import { docsTree } from './nav';
import { getLayoutTabs } from 'fumadocs-ui/layouts/shared';
import type { Root, Node, Item } from 'fumadocs-core/page-tree';

const item = (url: string, name = url): Item => ({ type: 'page', $id: `file-${url}`, name, url });
const folder = (name: string, children: Node[]): Node => ({
  type: 'folder',
  $id: `dir-${name}`,
  name,
  children,
});

function fakeRoot(): Root {
  return {
    type: 'root',
    name: 'Docs',
    children: [
      item('/', 'Welcome'),
      { type: 'separator', name: 'Guides' },
      item('/import-format'),
      item('/training-data-import'),
      item('/gymlife-import'),
      item('/alpha-progression-import'),
      item('/mci-import'),
      item('/public-api'),
      item('/mcp'),
      folder('api-reference', [
        item('/api-reference/v1/me/get'),
        item('/api-reference/v1/sessions/get'),
      ]),
      { type: 'separator', name: 'App & platform' },
      item('/pwa-setup-and-architecture'),
      item('/exercise-catalog'),
      item('/admin-ai-nutrition'),
      item('/app-store-release'),
      item('/release'),
      { type: 'separator', name: 'Project' },
      item('/contributing'),
      folder('adr', [item('/adr'), item('/adr/0001-social-features-2-0')]),
    ],
  } as Root;
}

test('docsTree produces three sidebar tabs with unique titles', () => {
  const tree = docsTree(fakeRoot());
  const tabs = getLayoutTabs(tree);
  const titles = tabs.map((t) => t.title);
  assert.deepEqual(titles, ['Guides', 'API', 'Project']);
  assert.equal(new Set(titles).size, titles.length, 'tab titles must be unique');
});

test('docsTree gives every folder a unique $id for tab matching', () => {
  const tree = docsTree(fakeRoot());
  const ids: string[] = [];
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.type === 'folder') {
        if (n.$id) ids.push(n.$id);
        walk(n.children);
      }
    }
  };
  walk(tree.children);
  assert.equal(new Set(ids).size, ids.length, 'folder $ids must be unique');
  // Tabs must resolve to their own folder, not the first one — the dropdown
  // matches tab.$folder to nodes by identity or $id; undefined ids made every
  // root folder match the first tab ("Guides" shown three times).
  const rootIds = tree.children.map((n) => n.$id);
  assert.ok(rootIds.every(Boolean));
});
