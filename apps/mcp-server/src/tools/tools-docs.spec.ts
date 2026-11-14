import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * The user guide's tools table (docs/mcp.md) must stay in sync with the
 * registered @Tool() names — this fails if a tool is added or renamed
 * without updating the doc.
 */
describe('documented tool names', () => {
  it('match the registered @Tool() names', () => {
    const toolsDir = path.dirname(new URL(import.meta.url).pathname);
    const registered = readdirSync(toolsDir)
      .filter((f) => f.endsWith('.tool.ts'))
      .flatMap((f) =>
        [...readFileSync(path.join(toolsDir, f), 'utf8').matchAll(/name: '([a-z-]+)'/g)].map(
          (m) => m[1],
        ),
      )
      .sort();

    const doc = readFileSync(path.join(toolsDir, '../../../../docs/mcp.md'), 'utf8');
    const documented = [...doc.matchAll(/^\| `([a-z-]+)`\s+\|/gm)].map((m) => m[1]).sort();

    assert.deepEqual(documented, registered);
  });
});
