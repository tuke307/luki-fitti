/**
 * Stages the repo documentation for the docs site (docs.luki-fitti.tony-luke.de).
 *
 * Reads every .md in <repo>/docs plus README.md (home page) and CONTRIBUTING.md, and writes
 * apps/web/content/ for fumadocs-mdx:
 *   - frontmatter { title, description } injected into the staged copies — the source files
 *     stay untouched (GitHub would render frontmatter as a table).
 *   - links rewritten: `foo.md` / `docs/foo.md` -> docs routes, other repo paths -> GitHub
 *     blob URLs on main.
 *   - spec documents are grouped under content/specs/ ("Plans & specs").
 *   - git-info.json records each page's repo path and last git commit date for the
 *     "Edit on GitHub" link and "Last updated" line.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(WEB, '../..');
const CONTENT = path.join(WEB, 'content');
const GIT_INFO = path.join(WEB, 'lib/docs/git-info.json');
const GITHUB_BLOB = 'https://github.com/tuke307/luki-fitti/blob/main';

/** Docs that live in the nested "Plans & specs" sidebar folder. */
const SPECS = new Set([
  'release-2.0.0.md',
  'social-2.0.md',
  'social-2.0-pr1.md',
  'social-2.0-pr2.md',
  'social-2.0-pr3.md',
  'social-2.0-pr4.md',
  'api-keys.md',
  'privacy-social.md',
]);

const sources = [];
for (const name of readdirSync(path.join(ROOT, 'docs'))) {
  if (!name.endsWith('.md') || name === 'meta.json') continue;
  sources.push({ repo: `docs/${name}`, base: name });
}
sources.push({ repo: 'README.md', base: 'index.md' });
sources.push({ repo: 'CONTRIBUTING.md', base: 'contributing.md' });

/** repo-relative .md file name -> docs route slug (no leading slash). */
const slugOf = (repo) => {
  if (repo === 'README.md') return '';
  if (repo === 'CONTRIBUTING.md') return 'contributing';
  const name = path.basename(repo, '.md');
  return SPECS.has(path.basename(repo)) ? `specs/${name}` : name;
};

const LINK = /\[([^\]]*)\]\(([^)\s]+)([^)]*)\)/g;
function rewriteLinks(body, sourceRepo) {
  const sourceDir = path.posix.dirname(sourceRepo);
  return body.replace(LINK, (match, text, href, rest) => {
    if (/^(https?:|mailto:|#|\/)/.test(href)) return match;
    const [target, anchor = ''] = href.split('#');
    const clean = target.replace(/^\.\//, '');
    const base = path.basename(clean);
    if (base.endsWith('.md')) {
      const repo = clean.startsWith('docs/')
        ? clean
        : clean.startsWith('../')
          ? clean.slice(3)
          : `docs/${base}`;
      if (base === 'CONTRIBUTING.md' || base === 'README.md') {
        return `[${text}](/${slugOf(base)}${anchor ? '#' + anchor : ''}${rest})`;
      }
      return `[${text}](/${slugOf(repo)}${anchor ? '#' + anchor : ''}${rest})`;
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
mkdirSync(path.join(CONTENT, 'specs'), { recursive: true });

const gitInfo = {};
for (const { repo, base } of sources) {
  const raw = readFileSync(path.join(ROOT, repo), 'utf8');
  const { title, titleIndex, description } = titleAndDescription(raw);
  const bodyLines = raw.split('\n').filter((_, i) => i !== titleIndex);
  const body = rewriteLinks(bodyLines.join('\n').replace(/^\n+/, ''), repo);
  const fm = [
    '---',
    `title: ${JSON.stringify(title ?? base.replace(/\.md$/, ''))}`,
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    '---',
    '',
    body,
  ].join('\n');
  const dest = SPECS.has(base) ? path.join('specs', base) : base;
  writeFileSync(path.join(CONTENT, dest), fm);
  gitInfo[slugOf(repo)] = { path: repo, lastModified: gitDate(repo) };
}

writeFileSync(GIT_INFO, JSON.stringify(gitInfo, null, 2));
try {
  const meta = readFileSync(path.join(ROOT, 'docs/meta.json'), 'utf8');
  writeFileSync(path.join(CONTENT, 'meta.json'), meta);
} catch {
  // meta.json is optional; the staged tree falls back to file order.
}
writeFileSync(
  path.join(CONTENT, 'specs/meta.json'),
  JSON.stringify(
    {
      title: 'Plans & specs',
      defaultOpen: false,
      pages: [
        'release-2.0.0',
        'social-2.0',
        'social-2.0-pr1',
        'social-2.0-pr2',
        'social-2.0-pr3',
        'social-2.0-pr4',
        'api-keys',
        'privacy-social',
      ],
    },
    null,
    2,
  ),
);
// Serve the generated public OpenAPI spec on the docs host at /openapi/public-api-v1.json.
try {
  const spec = readFileSync(path.join(ROOT, 'docs/openapi/public-api-v1.json'));
  mkdirSync(path.join(WEB, 'public/openapi'), { recursive: true });
  writeFileSync(path.join(WEB, 'public/openapi/public-api-v1.json'), spec);
} catch {
  console.warn('docs: docs/openapi/public-api-v1.json missing — run the api openapi export first');
}
console.log(`docs: staged ${sources.length} pages into ${CONTENT}`);
