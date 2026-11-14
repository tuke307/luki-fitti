/**
 * Stages the repo documentation for the docs site (docs.luki-fitti.tony-luke.de).
 *
 * Reads every .md in <repo>/docs plus README.md (home page) and CONTRIBUTING.md, and writes
 * apps/web/content/ for fumadocs-mdx:
 *   - frontmatter { title, description } injected into the staged copies — the source files
 *     stay untouched (GitHub would render frontmatter as a table).
 *   - links rewritten: relative .md links resolve against the source file's directory to
 *     docs routes, other repo paths -> GitHub blob URLs on main.
 *   - decision records under content/adr/.
 *   - git-info.json records each page's repo path and last commit date for the
 *     "Edit on GitHub" link and "Last updated" line — from git locally, and from
 *     the GitHub API (lib/docs/github-dates.mjs) where .git is missing (Docker).
 *
 * Branch plans and specs (`docs/plans/**`) are never published — they are
 * branch-only guidance, deleted before the PR into `develop`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(WEB, '../..');
const CONTENT = path.join(WEB, 'content');
const GIT_INFO = path.join(WEB, 'lib/docs/git-info.json');
const GITHUB_BLOB = 'https://github.com/tuke307/luki-fitti/blob/main';

const sources = [];
const stagedRepos = new Set(['README.md', 'CONTRIBUTING.md']);

/** repo path -> { dest (content-relative file), slug (docs route, no leading slash) } */
function targetFor(repo) {
  const base = path.basename(repo);
  if (repo === 'README.md') return { dest: 'index.md', slug: '' };
  if (repo === 'CONTRIBUTING.md') return { dest: 'contributing.md', slug: 'contributing' };
  const name = base.replace(/\.md$/, '');
  if (repo.startsWith('docs/adr/')) {
    if (base === 'README.md') return { dest: 'adr/index.md', slug: 'adr' };
    return { dest: `adr/${base}`, slug: `adr/${name}` };
  }
  return { dest: base, slug: name };
}

function collect(dir) {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return;
  for (const name of readdirSync(abs)) {
    // docs/plans/** is never collected: only top-level .md files are read.
    if (!name.endsWith('.md') || name === 'meta.json') continue;
    stagedRepos.add(`${dir}/${name}`);
  }
}
collect('docs');
collect('docs/adr');

for (const repo of stagedRepos) {
  sources.push({ repo, ...targetFor(repo) });
}

const byRepo = new Map(sources.map((s) => [s.repo, s.slug]));

const LINK = /\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g;
function rewriteLinks(body, sourceRepo) {
  const sourceDir = path.posix.dirname(sourceRepo);
  return body.replace(LINK, (match, text, href, rest) => {
    if (/^(https?:|mailto:|#|\/)/.test(href)) return match;
    const [target, anchor = ''] = href.split('#');
    const clean = target.replace(/^\.\//, '');
    const base = path.basename(clean);
    if (base.endsWith('.md')) {
      // Resolve relative to the source file, then the repo root, then docs/.
      const candidates = [path.posix.normalize(path.posix.join(sourceDir, clean))];
      if (clean.startsWith('../')) candidates.push(clean.slice(3));
      if (clean.startsWith('docs/')) candidates.push(clean);
      if (!clean.includes('/')) candidates.push(`docs/${clean}`);
      const repo = candidates.find((c) => byRepo.has(c));
      if (repo) {
        return `[${text}](/${byRepo.get(repo)}${anchor ? '#' + anchor : ''}${rest})`;
      }
      // Markdown that is not staged stays a GitHub link.
      const repoPath = candidates[0].startsWith('.')
        ? clean
        : (candidates.find((c) => !c.startsWith('.')) ?? candidates[0]);
      return `[${text}](${GITHUB_BLOB}/${repoPath}${anchor ? '#' + anchor : ''}${rest})`;
    }
    // Other repo-relative paths resolve against the source file's directory.
    const repoPath = clean.startsWith('../')
      ? clean.slice(3)
      : clean.startsWith('docs/')
        ? clean
        : path.posix.normalize(path.posix.join(sourceDir, clean));
    // The generated public OpenAPI spec is served on the docs host itself.
    if (repoPath === 'docs/openapi/public-api-v1.json') {
      return `[${text}](/openapi/public-api-v1.json${rest})`;
    }
    return `[${text}](${GITHUB_BLOB}/${repoPath}${anchor ? '#' + anchor : ''}${rest})`;
  });
}

function gitDate(repo) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%aI', '--', repo], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) return out;
  } catch {
    // Git history or meta.json unavailable — keep going without it.
  }
  return null;
}

function titleAndDescription(md) {
  const lines = md.split('\n');
  let title = null;
  let titleIndex = -1;
  let description = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (titleIndex === -1 && line.startsWith('# ')) {
      title = line.slice(2).trim().replace(/[*_`]/g, '');
      titleIndex = i;
      continue;
    }
    if (titleIndex !== -1 && line && !line.startsWith('#') && !line.startsWith('---')) {
      description = line
        .replace(/[[\]()_*`]/g, '')
        .slice(0, 200)
        .trim();
      break;
    }
  }
  return { title, titleIndex, description };
}

rmSync(CONTENT, { recursive: true, force: true });
mkdirSync(path.join(CONTENT, 'adr'), { recursive: true });

const gitInfo = {};
const undated = [];
for (const { repo, dest, slug } of sources) {
  const raw = readFileSync(path.join(ROOT, repo), 'utf8');
  const { title, titleIndex, description } = titleAndDescription(raw);
  const bodyLines = raw.split('\n').filter((_, i) => i !== titleIndex);
  const body = rewriteLinks(bodyLines.join('\n').replace(/^\n+/, ''), repo);
  const fm = [
    '---',
    `title: ${JSON.stringify(title ?? path.basename(dest, '.md'))}`,
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    '---',
    '',
    body,
  ].join('\n');
  const file = path.join(CONTENT, dest);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, fm);
  const lastModified = gitDate(repo);
  gitInfo[slug] = { path: repo, lastModified };
  if (!lastModified) undated.push({ repo, slug });
}

// No .git in the build image: ask GitHub for the last commit date of the files
// that git could not date. Best-effort only — failures leave the date empty.
if (undated.length) {
  const { githubDatesFor } = await import('../lib/docs/github-dates.mjs');
  const dates = await githubDatesFor(
    undated.map((u) => u.repo),
    { token: process.env.DOCS_GITHUB_TOKEN },
  );
  for (const { repo, slug } of undated) {
    const date = dates.get(repo);
    if (date) gitInfo[slug].lastModified = date;
  }
}

writeFileSync(GIT_INFO, JSON.stringify(gitInfo, null, 2));
try {
  const meta = readFileSync(path.join(ROOT, 'docs/meta.json'), 'utf8');
  writeFileSync(path.join(CONTENT, 'meta.json'), meta);
} catch {
  // meta.json is optional; the staged tree falls back to file order.
}
// Serve the generated public OpenAPI spec on the docs host at /openapi/public-api-v1.json.
try {
  const spec = readFileSync(path.join(ROOT, 'docs/openapi/public-api-v1.json'));
  mkdirSync(path.join(WEB, 'public/openapi'), { recursive: true });
  writeFileSync(path.join(WEB, 'public/openapi/public-api-v1.json'), spec);
} catch {
  console.warn('docs: docs/openapi/public-api-v1.json missing — run the api openapi export first');
}
console.log(`docs: staged ${sources.length} pages into ${CONTENT}`);
