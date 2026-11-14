# 0004. Docs site on its own host (Fumadocs in the web app)

- Status: Accepted, implemented
- Date: 2026-11-14
- Deciders: Tony Meissner

## Context and problem statement

The project docs (import format, import guides, the public API guide, release docs) live as
markdown in `docs/` and were linked directly on GitHub. Users hitting a `blob/main/docs/…`
link get GitHub's chrome, raw tables for frontmatter, and no search — not a great place to
read a guide or copy an API example. A dedicated docs site was needed, without a new app to
deploy and maintain, and without publishing internal plan documents as if they were user
docs.

## Decision drivers

- Must feel like the same product as the app and the marketing site (Apple-aligned design
  tokens, calm and confident) — never a generic template.
- Content stays markdown in the repository, published as-is, so docs ship with the code they
  describe.
- Search must work without an external service, and must not live under `/api/*` (Caddy
  routes that prefix to the NestJS API in production).
- One web app to deploy: no separate container, no separate CI pipeline.
- OpenAPI reference rendered from the generated `public-api-v1.json`, same theme.

## Considered options

- **Fumadocs inside `apps/web`.** MDX-based, Next-native, themable down to the design tokens,
  built-in local (Orama) search and an OpenAPI renderer. Chosen.
- **Starlight (Astro) / VitePress / Docusaurus.** Separate frameworks and a separate app,
  build and container for the same job; theming them into the product look is fighting the
  framework. Rejected.
- **Nextra.** Close fit but weaker theming and a smaller ecosystem than Fumadocs. Rejected.
- **Own `react-markdown` pages.** Full control but re-implements navigation, search, ToC and
  code highlighting for no benefit. Rejected.

## Decision outcome

A third host on the existing web app, next to `luki-fitti.tony-luke.de` (site) and
`app.luki-fitti.tony-luke.de` (app): `docs.luki-fitti.tony-luke.de`. `apps/web/proxy.ts`
routes the docs host to an internal `/docs` tree the same way the site host maps to `/site`;
requests for the docs tree on the other hosts redirect to the docs origin. Local dev host:
`docs.localhost:3000`.

- Built with Fumadocs (`fumadocs-core`, `fumadocs-ui`, `fumadocs-mdx`, `fumadocs-openapi`)
  inside `apps/web`, versions pinned exactly, each at least 7 days old at vetting.
- **Dark mode only**: the docs host always renders the dark theme, with no light mode and no
  toggle. The app and website are unchanged.
- Content: every markdown file in `docs/`, plus `README.md` as the home page ("Overview") and
  `CONTRIBUTING.md` as "Contributing". English only. No frontmatter in the source files —
  titles come from the first H1, descriptions from the first paragraph, injected at staging.
  Branch plans and specs are never published: they live in `docs/plans/` on the feature
  branch and are deleted before the PR into `develop`; lasting decisions become ADRs.
- Navigation: three sidebar tabs — **Guides**, **API**, **Project** — with short nav labels
  from one map in `apps/web/lib/docs/nav.tsx`; page titles stay untouched. A **Decisions**
  group lists the ADRs present on the branch.
- Search: Fumadocs' built-in static Orama index, served from the docs tree (not `/api/*`).
- API reference: `fumadocs-openapi` renders `docs/openapi/public-api-v1.json` under
  `/api-reference`, grouped by tag with quiet method badges.
- Every page shows an "Edit on GitHub" link and a "Last updated" date from the file's last
  git commit, computed at build time and degrading gracefully without history.
- Diagrams are written in Mermaid — rendered client-side on the docs site and natively on
  GitHub. `remarkMdxMermaid` turns ` ```mermaid ` blocks into a client component that
  lazy-loads `mermaid` (12.3.0, `securityLevel: 'strict'`, `base` theme on the docs tokens).
- `/llms.txt` and `/llms-full.txt` are generated for AI consumers; the docs host is
  indexable (own sitemap and robots), unlike the app host.
- The roadmap lives on a GitHub Project board, shown on the docs site at `/roadmap` (fetched
  via GraphQL at request time, revalidated hourly, with a calm fallback when the token is
  absent).

### Consequences

**Good**

- Docs deploy with the web app; no extra container or pipeline.
- Real product look: the Fumadocs `--color-fd-*` variables map onto the LukiFitti tokens.
- Markdown stays the source of truth; links between files become docs routes.

**Bad**

- Docs content is coupled to the web build — a docs typo means a web rebuild, and the Docker
  build needs the repo `docs/`, `README.md`, `CONTRIBUTING.md` and git history copied in.
- Ops: the docs host needs a DNS record and the domain added to the web container.

## Implementation notes

- `apps/web/scripts/prepare-docs.mjs` stages `docs/**/*.md` (+ README/CONTRIBUTING) into
  `apps/web/content/` with frontmatter injected and links rewritten; it tolerates a missing
  `.git` (no dates, no crash). `apps/web/Dockerfile` copies the docs inputs into the
  installer stage and `lib/docs/git-info.json` from the build stage.
- Repo `docs/**`, `README.md` and `CONTRIBUTING.md` are turbo `inputs` of the web build so
  cached builds don't serve stale docs.
- The roadmap page reads GitHub Project v2 #4 via GraphQL (`GITHUB_PROJECT_OWNER`,
  `GITHUB_PROJECT_NUMBER` default 4, `GITHUB_PROJECT_TOKEN` fine-grained read-only),
  `revalidate = 3600`; missing config or a failed request renders a fallback, never a build
  failure. The token is never logged.
- Ops (user): DNS record for `docs.luki-fitti.tony-luke.de`, and the domain added to the web
  container in Coolify.

## Links

- ADR 0003 (personal API keys) — the public API guide and OpenAPI document it publishes
- ADR 0005 (MCP server) — will publish `docs/mcp.md` in the API tab
- [Fumadocs](https://fumadocs.dev)
