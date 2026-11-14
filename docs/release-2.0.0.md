# LukiFitti 2.0.0: release plan and session handoff

**Start every new session here.** This file is the entry point for all 2.0.0 work. It lists
the branches, the PRs, what is done, what is next, and the pitfalls already hit. Update the
[Status](#status) and the [Session log](#session-log) before a session ends.

Last updated: 2026-11-14 (session 2).

## Branch model

```
main ◀── develop ◀── release/2.0.0  (version bump 2.0.0)        PR #106 → develop  (draft)
                      ├── feat/social-2.0   (social features)    PR #100 → release/2.0.0
                      │    └── #101 … #104 already merged into it
                      └── feat/api-keys     (API keys)           PR #107 → release/2.0.0 (draft, docs only)
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

| Stream                                                                 | PR                                                               | State                                                                                                                   | Docs                                                                |
| :--------------------------------------------------------------------- | :--------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| Version bump 2.0.0                                                     | #106 (`release/2.0.0` → `develop`)                               | draft. Screenshots for 2.0 still missing (on purpose, done last)                                                        | `docs/release.md`                                                   |
| Social: friends, leagues, duels, raids                                 | #100 (`feat/social-2.0` → `release/2.0.0`)                       | **all 4 sub-PRs merged** (#101–#104). **merged** into `release/2.0.0` (squash `4ae47c21`, 2026-11-14), all checks green | `docs/social-2.0.md` + `social-2.0-pr1…4.md` (on `feat/social-2.0`) |
| Personal API keys                                                      | #107 (`feat/api-keys` → `release/2.0.0`)                         | **design approved, implementation not started**                                                                         | `docs/api-keys.md` (on `feat/api-keys`)                             |
| MCP server (separate feature)                                          | #108 (`feat/mcp-server` → `feat/api-keys`, then `release/2.0.0`) | **design approved, implementation not started**; starts after API keys                                                  | `docs/mcp-server.md` (on `feat/mcp-server`)                         |
| Former "PR 5": beta, final privacy policy, App Store notes, release PR | —                                                                | **postponed** by the user; ships together with the next feature                                                         | `docs/social-2.0.md` → "Later"                                      |

## Next steps (in order)

1. ~~**Finish #100.**~~ Done: e2e fixed in `99cf5a6a`, squash-merged into `release/2.0.0` as
   `4ae47c21` (tree verified equal to the PR head apart from the version bump).
2. **Prepare `feat/api-keys` for implementation.**
   - After #100 is merged, `git merge --no-ff origin/release/2.0.0` into `feat/api-keys`, so
     the schema already contains the social models (User/AppSettings fields, migrations up to
     `20261116000000_raids`).
   - Name the API key migration later than that, e.g. `20261117000000_api_keys`.
3. **API keys PR A: keys + read API** (`docs/api-keys.md` → "Delivery" 1).
   - Migration `ApiKey`, `AppSettings.apiKeysEnabled`, email template `API_KEY_CREATED`.
   - Key management routes (password re-auth, max 10 keys, expiry 30/90/365 days or none).
   - `ApiKeyGuard` + `ScopesGuard` (deny by default), `/api/v1` read endpoints except export,
     and per-key Redis rate limits with headers.
   - Web settings page (create, show once, list, revoke) and iOS list + revoke.
   - All tests from the doc.
   - New server env var `API_KEY_PEPPER` (user must add it to Coolify and the env samples).
4. **API keys PR B: export + docs.**
   - Shared `luki-fitti-import@1` export builder in `@luki-fitti/common` (the web backup
     button switches to it) and `/v1/export`.
   - Public OpenAPI output for `/api/v1`, the `/developers` page, the privacy paragraph.
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
- Later for API keys: create the `API_KEY_PEPPER` secret.

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

| Date            | Done                                                                                                                                                                                                                                          | Next                                                                |
| :-------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| 2026-11-13 → 15 | Social plan + PRs #101–#104 built, reviewed and merged into `feat/social-2.0`; CI extended to feature branches; `release/2.0.0` + #106; API keys design (#107) and MCP design (#108, split into its own feature) approved; lint fixes on #100 | Check #100 e2e, merge #100, then API keys PR A                      |
| 2026-11-14      | #100 e2e fixed: the social spec's UI logins hit the login throttle. Seeded users now sign in through a minted session (`99cf5a6a`), and all checks are green; the user squash-merged #100                                                     | API keys PR A + B: merge `release/2.0.0` into `feat/api-keys` first |
