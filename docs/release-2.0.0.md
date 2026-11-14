# LukiFitti 2.0.0: release plan and session handoff

**Start every new session here.** This file is the entry point for all 2.0.0 work. It lists
the branches, the PRs, what is done, what is next, and the pitfalls already hit. Update the
[Status](#status) and the [Session log](#session-log) before a session ends.

Last updated: 2026-11-14 (session 3).

## Branch model

```
main ◀── develop ◀── release/2.0.0  (version bump 2.0.0)        PR #106 → develop  (draft)
                      ├── feat/social-2.0   (social features)    PR #100 → release/2.0.0
                      │    └── #101 … #104 already merged into it
                      └── feat/api-keys     (API keys)           PR #107 → release/2.0.0 (draft, umbrella)
                           ├── feat/api-keys-pr-a (keys + v1)    PR #109 → feat/api-keys (CI green)
                           │    └── feat/api-keys-pr-b (export, OpenAPI, docs site)  → feat/api-keys-pr-a
                           └── feat/mcp-server (MCP server)      PR #108 → feat/api-keys (draft, docs only;
                                                                  retarget to release/2.0.0 after #107)
```

- `release/2.0.0` was cut from `develop` and carries only the version bump (`yarn version:set
2.0.0`). **Every 2.0 feature targets this branch**, never `develop` directly.
- When all features are in: add the 2.0 marketing screenshots on `release/2.0.0`, merge #106
  into `develop`, then open the usual release PR `develop` → `main` (`docs/release.md`).
- Hotfixes on 1.0.x: merge `develop` into `release/2.0.0` afterwards so it doesn't drift.
- CI runs the full pipeline (lint, test incl. the DI boot spec, apple, e2e) for PRs into
  `develop`, `main`, `feat/**`, `fix/**` and `release/**`.

## Status

| Stream                                                                 | PR                                                               | State                                                                                                                                                                                                       | Docs                                                                |
| :--------------------------------------------------------------------- | :--------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| Version bump 2.0.0                                                     | #106 (`release/2.0.0` → `develop`)                               | draft. Screenshots for 2.0 still missing (on purpose, done last)                                                                                                                                            | `docs/release.md`                                                   |
| Social: friends, leagues, duels, raids                                 | #100 (`feat/social-2.0` → `release/2.0.0`)                       | **all 4 sub-PRs merged** (#101–#104). **merged** into `release/2.0.0` (squash `4ae47c21`, 2026-11-14), all checks green                                                                                     | `docs/social-2.0.md` + `social-2.0-pr1…4.md` (on `feat/social-2.0`) |
| Personal API keys                                                      | #107 (`feat/api-keys` → `release/2.0.0`)                         | **PR A #109 open, CI green**, waiting for review/merge into `feat/api-keys`. PR B in progress (export, OpenAPI, docs site)                                                                                  | `docs/api-keys.md` (on `feat/api-keys`)                             |
| MCP server (separate feature)                                          | #108 (`feat/mcp-server` → `feat/api-keys`, then `release/2.0.0`) | **implemented locally** in the `feat/mcp-server` worktree: API additions (`8f204cf0`) + `apps/mcp-server` with 9 tools (`06bb4662`), all checks green; not pushed yet — Dockerfile/compose/Bruno still open | `docs/mcp-server.md` (on `feat/mcp-server`)                         |
| Former "PR 5": beta, final privacy policy, App Store notes, release PR | —                                                                | **postponed** by the user; ships together with the next feature                                                                                                                                             | `docs/social-2.0.md` → "Later"                                      |

## Next steps (in order)

1. ~~**Finish #100.**~~ Done: e2e fixed in `99cf5a6a`, squash-merged into `release/2.0.0` as
   `4ae47c21` (tree verified equal to the PR head apart from the version bump).
2. ~~**Prepare `feat/api-keys`.**~~ Done: `release/2.0.0` merged in (`fcb8d74a`); migration
   `20261117000000_api_keys`.
3. ~~**API keys PR A: keys + read API.**~~ Built as #109 (`feat/api-keys-pr-a` →
   `feat/api-keys`), CI green. The user reviews and merges it. Sub-PRs go into `feat/api-keys`
   (like social); #107 is the umbrella PR into `release/2.0.0`.
4. **API keys PR B: export + docs** (`feat/api-keys-pr-b`, stacked on PR A).
   - `/v1/export` built server-side with the existing shared `buildImportFile` (the web backup
     button already uses it). It covers workouts only, because of the `luki-fitti-import@1`
     format.
   - Public OpenAPI file `docs/openapi/public-api-v1.json`, the developer guide
     `docs/public-api.md`, the privacy paragraph.
   - **Docs site `docs.luki-fitti.tony-luke.de`** (decided 2026-11-14, replaces the planned
     `/developers` page):
     - Fumadocs inside `apps/web`, as a third host in `proxy.ts` next to site and app.
     - Publishes every file in `docs/`, English only.
     - API reference via `fumadocs-openapi`.
     - App, iOS and site links point there.
     - Details: `docs/api-keys.md` → "Docs site".
5. **MCP server: a separate feature, #108** (`docs/mcp-server.md` on `feat/mcp-server`).
   - Before starting, merge the implemented `feat/api-keys` into `feat/mcp-server`. Retarget
     #108 to `release/2.0.0` once #107 is merged.
   - Copy the `apps/mcp-server` scaffold from `/Users/MEISSTO/source/marienmuehle/apps/mcp-server`
     (same as kds-werkzeugbau): `app.module.ts`, `config.ts`, guard, `tools/mcp-date-utils.ts`,
     Dockerfile, Bruno collection.
   - Pin `@rekog/mcp-nest` 2.0.8, `@modelcontextprotocol/server` 2.3.1, `/node` 2.1.1 and
     `/core` 2.3.1 **exactly**, after vetting.
   - Replace the shared-secret guard with forwarding the user's `lf_pat_` key. This feature
     also adds the `mcp` scope, `GET /v1/key` and `AppSettings.mcpEnabled` to the API (not
     the API keys feature).
   - The 9 read-only tools.
   - Routing: Caddy `handle /mcp/*` → `mcp-server:3030`, plus a fourth production image.
   - Decided: URL `https://app.luki-fitti.tony-luke.de/mcp`, and `tools/list` requires a key.
6. **Screenshots for 2.0** on `release/2.0.0` (`yarn workspace @luki-fitti/apple
marketing:screenshots`), then the user merges #106 into `develop`.

## Waiting on the user

- Apple developer portal: enable **Push Notifications** and **Associated Domains**
  (`applinks:app.luki-fitti.tony-luke.de`) for the App ID, otherwise `app-store.yaml` signing
  fails once the social code is on `main`.
- Add `APNS_KEY_P8_BASE64`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`,
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (empty values) to
  `apps/api/.env.sample` and `apps/email-worker/.env.sample`. Agents can't read or edit `.env*`
  files (user permission rule).
- Set `APPLE_APP_IDS=<TEAMID>.<bundle id>` on the web server (AASA for invite universal links).
- `apps/web/.env.local` sets `DATABASE_URL` to an empty `luki_fitti` database, and the e2e
  helpers load it first, so local e2e only passes with an env override.
- Legal review of `docs/privacy-social.md` (5 open points, incl. "Find me by email" on by
  default).
- API keys:
  - Create the `API_KEY_PEPPER` secret (≥32 chars, `openssl rand -hex 32`) in Coolify and add
    it to `apps/api/.env.sample`. Changing it later invalidates all keys.
  - Turn the kill switch on at `/admin/api-keys` after release.
- Docs site: a DNS record for `docs.luki-fitti.tony-luke.de`, and the domain added to the web
  container in Coolify.

## Local environment (as left at handoff)

- **Worktrees:**
  - `/Users/MEISSTO/source/luki-fitti`: the user's main checkout on `develop`. Don't touch.
  - `/Users/MEISSTO/source/luki-fitti-wt/social-2.0`: detached at `feat/social-2.0`
    (`f9b280a3`), with its own `node_modules`.
  - `/Users/MEISSTO/source/luki-fitti-wt/api-keys`: `feat/api-keys` / `feat/mcp-server`. It has its own `node_modules` (`yarn install` done there); don't symlink another
    worktree's.
- **Databases (local Postgres `tuke307-local-postgres-1`, port 5432):**
  - `lukifittidb` is the user's shared dev DB. It already has the `20261113000000_social_foundation`
    migration applied (from an e2e run); the user's main checkout lacks it, so `prisma migrate dev`
    there would offer a reset — **don't accept it**.
  - `luki_fitti_social` is the agent test DB with all social migrations and seed data.
  - Use a separate DB (e.g. `luki_fitti_apikeys`) for API key work. Pass `DATABASE_URL`
    through the exec tool's `env`.
- **Dev servers:** a web dev server (:3000) and API (:3001) against `luki_fitti_social` may
  still be running from the social worktree. Use other ports for a second stack.
- **Simulators:** an iPhone 17 Pro + Watch pair is set up with the social build installed.

## Pitfalls learned in session 1

- **Squash merges of stacked PRs cause conflicts in the next PR.** After a squash, check that the
  squashed tree equals the old head (`git diff --stat <old-head> <squash>` is empty), merge the
  new base into the next branch with `--no-ff`, and resolve with `--ours`. Then verify the merge
  added nothing unexpected (`git diff --cached HEAD --stat`). Never force-push.
- **Prettier:** always use the repo's `node_modules/.bin/prettier`. `npx prettier` without
  `node_modules` pulls a newer version that formats differently, and CI fails `format:check`.
  Run `prettier --check .` plus `yarn turbo run lint --continue --filter='!@luki-fitti/apple'`
  before pushing; `--continue` shows every failing workspace, not only the first.
- **NestJS DI:** never `import type` a class that is injected; it compiles but crashes at boot,
  or a `@Optional()` dependency silently becomes `undefined`. `apps/api/src/app.module.boot.spec.ts`
  (on `feat/social-2.0`) catches it, and CI builds the API first so it runs.
- **Web build typechecks spec files:** implicit `any` in a `*.spec.ts` breaks `next build` and
  therefore e2e.
- **`gh pr create` bodies with apostrophes inside `$(cat <<'EOF')` break bash parsing.** Write
  the body to a file and use `--body-file`.
- **SceneKit vs three.js:** SceneKit `eulerAngles` composes in the opposite order from three's
  `XYZ`. Use matrices. Parity tests on both platforms guard the boss geometry.
- **Commits:** conventional commits, lower-case subject, no AI attribution or co-author
  trailers; stage specific files.
- **Login throttle in e2e:** `POST /auth/login` allows 10 requests per 10 minutes per IP, and
  the API keeps the count in memory. Use the real login form once per spec at most. Sign in
  other seeded users with `signInSeededUser` (`apps/web/tests/e2e/helpers/social.ts`), and
  never relax the throttle. Restart the API between local full runs.
- **Worktree `release-2.0.0`:** `/Users/MEISSTO/source/luki-fitti-wt/release-2.0.0` has
  `release/2.0.0` checked out for doc updates. It has no `node_modules`.

## Session log

| Date            | Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Next                                                                |
| :-------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------ |
| 2026-11-13 → 15 | Social plan + PRs #101–#104 built, reviewed and merged into `feat/social-2.0`; CI extended to feature branches; `release/2.0.0` + #106; API keys design (#107) and MCP design (#108, split into its own feature) approved; lint fixes on #100                                                                                                                                                                                                                                               | Check #100 e2e, merge #100, then API keys PR A                      |
| 2026-11-14      | MCP server implemented (worktree `luki-fitti-wt/mcp-server`): `mcp` scope, `GET /v1/key`, `mcpEnabled` kill switch, `include=exercises` (`8f204cf0`); `apps/mcp-server` with guard, API client, Berlin date utils and the 9 tools (`06bb4662`). api 423 + mcp 44 tests green, lint + prettier clean. Findings: `@nestjs/microservices` pinned to 12.1.2 (12.5.0 needs a newer core); tool DI needs `@Inject` because tsx drops design:paramtypes. `.env.sample` blocked by user permissions | Push `feat/mcp-server`, Dockerfile/compose/Bruno, retarget #108     |
| 2026-11-14      | #100 e2e fixed: the social spec's UI logins hit the login throttle. Seeded users now sign in through a minted session (`99cf5a6a`), and all checks are green; the user squash-merged #100                                                                                                                                                                                                                                                                                                   | API keys PR A + B: merge `release/2.0.0` into `feat/api-keys` first |
