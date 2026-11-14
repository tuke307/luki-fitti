# Personal API keys (design)

Status: **approved 2026-11-15** · Target: 2.0.0 (branch `feat/api-keys` → `release/2.0.0`)

Users create personal API keys in their settings and use them to read their own LukiFitti data
from scripts and tools (spreadsheets, Notion, Home Assistant, Apple Shortcuts, their own
dashboards, an AI assistant). It also makes the GDPR right to data portability (Art. 20)
something people can actually use, rather than only a manual backup button.

## Goals

- A signed-in user can create, name, list and revoke API keys on the web (iPhone shows and
  revokes them).
- A key is a bearer token for a small, **stable, versioned, read-only** API (`/api/v1/…`)
  that returns only the key owner's data.
- Keys are scoped (which data), can expire, show when they were last used, and are safe if the
  database leaks (only hashes are stored).
- The full backup is available as one call, in the existing `luki-fitti-import@1` format, so
  an export can be imported again.

## Non-goals (v1)

- **Write access.** No creating or editing sessions, meals and so on through keys. That can
  come in v2 with `write:*` scopes once the read API has settled.
- **Third-party apps / OAuth.** Keys are personal ("personal access tokens"); there is no
  consent screen for other apps.
- **Social data.** Friends, leagues, duels and raids involve other users' data and stay
  off-limits to keys.
- **Admin routes.** Keys never authenticate admin endpoints, even for admins.
- **Using keys on the existing app routes.** The app's internal API keeps changing with the
  clients; only `/api/v1` is a contract.

## User experience

**Web: Profile → Settings → API keys**

- Empty state: one sentence ("Use API keys to read your workouts and meals from your own tools
  and scripts") plus a link to the API docs page.
- "Create key" opens a sheet with:
  - Name (required, e.g. "Google Sheets").
  - Access: a checklist of scopes. All read scopes are preselected, with "Full backup" shown
    as its own scope.
  - Expiry: 30 days / 90 days (default) / 1 year / No expiry. "No expiry" shows a warning.
- After creating, the full key is shown **once**, with a copy button and "You won't see this
  key again." Closing requires confirming that it was copied.
- The list shows name, scopes, created date, "Last used 2 h ago" (or "Never used"), expiry,
  and Revoke (confirm dialog). Expired keys stay listed, greyed out, for 30 days, then they're
  deleted.
- Re-authentication: creating a key requires the current password (the same check as
  change-password), because a key is a long-lived credential.

**iPhone: Profile → API keys:** list + revoke only, plus a "Create on the web" link (pasting
long secrets on a phone is error-prone, and the copy-once flow suits a desktop).

**Email:** "A new API key 'Google Sheets' was created for your LukiFitti account", with a
link to the key list. This is the cheap way to detect an account takeover. There's no email
for revoke.

## Key format

```
lf_pat_<id>_<secret>
lf_pat_9f3k2m7q_Vq3c…(43 chars)
```

- `lf_pat_`: a fixed prefix, so leaked keys are recognisable (secret scanning in GitHub/GitLab
  can match `lf_pat_[a-z0-9]{8}_[A-Za-z0-9_-]{43}`, and we can register the pattern with
  GitHub secret scanning later).
- `<id>`: 8 random base32 characters, unique, stored in clear. It's the lookup key and is shown
  in the UI ("lf_pat_9f3k2m7q…").
- `<secret>`: 32 random bytes, base64url (256 bits).
- **Storage:** `secretHash = HMAC-SHA256(API_KEY_PEPPER, secret)`, hex. A slow hash (bcrypt or
  Argon2) isn't needed: the secret has 256 bits of entropy, so brute force is impossible, and a
  fast hash keeps every request cheap. The pepper (server env, not in the DB) means a DB dump
  alone can't even be used to confirm a guessed key.
- **Verification:** parse → look up by `id` → constant-time compare of the HMAC (existing
  `constantTimeEqual`) → check `revokedAt`, `expiresAt`, and the user's account state.

## Data model

```prisma
model ApiKey {
  id          String    @id            // the 8-char public id
  userId      String
  name        String                   // 1–40 chars
  secretHash  String
  scopes      String[]                 // ApiKeyScope values, validated in zod
  createdAt   DateTime  @default(now())
  expiresAt   DateTime?
  revokedAt   DateTime?
  lastUsedAt  DateTime?                // updated at most once per minute per key
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

// AppSettings
apiKeysEnabled Boolean @default(false)  // global kill switch, off until release
// EmailTemplateType
API_KEY_CREATED
```

- At most 10 active keys per user.
- **No IP address storage** (privacy, nothing to justify); `lastUsedAt` is enough for "is this
  key still in use".
- Account deletion cascades. Password change and "log out everywhere" **do not** revoke keys
  (people automate with them; revoking silently would break scripts), but the key list is
  linked from those confirmations: "You have 2 active API keys. Review them."
- An admin lock or ban of the account (`lockedUntil`, a future ban flag) makes every key fail
  with 401 for the duration.

## Scopes

| Scope            | Grants                                                                 |
| :--------------- | :--------------------------------------------------------------------- |
| `read:profile`   | `GET /v1/me` (id, name, units, goals; never the email)                 |
| `read:workouts`  | templates, folders, stretching routines, custom exercises              |
| `read:sessions`  | workout sessions with exercises and sets, personal records             |
| `read:nutrition` | meal entries and items (no photos in v1)                               |
| `read:body`      | body weight entries, progress check-ins (metadata, no photos)          |
| `read:activity`  | Apple Health daily energy and imported workouts                        |
| `export`         | `GET /v1/export` (everything above as `luki-fitti-import@1`)           |
| `mcp`            | `POST /api/mcp` (the MCP endpoint; tools still need their read scopes) |

Deny by default: a route without an `@ApiScope(...)` decorator is unreachable with a key.
Progress and meal photos are excluded in v1 (large, sensitive, and they'd need signed URLs);
they could come later as `read:photos`.

## API surface (`/api/v1`)

- Versioned prefix `v1`, separate controllers in `apps/api/src/modules/public-api/`, and
  separate response DTOs in `@luki-fitti/common/schemas/public-api` (stable field names,
  ISO dates, kg/metres as stored with the unit stated, no internal fields such as
  `version`, `lastWriterDeviceId` or client ids).
- **Pagination:** cursor based, `?limit=` (1–200, default 50) + `nextCursor`, ordered by
  `updatedAt` then `id`.
- **Incremental sync:** `?updatedSince=<ISO>` on every list, so a spreadsheet script pulls only
  changes. Deletions: `GET /v1/deletions?updatedSince=` returns `{ kind, id, deletedAt }`.
  This needs a small tombstone table, written where sessions, meals and body-weight entries
  are deleted. That's a nice-to-have; v1 could ship without it.
- Endpoints v1:

| Method + path                                                                                                                       | Scope            |
| :---------------------------------------------------------------------------------------------------------------------------------- | :--------------- |
| `GET /v1/me`                                                                                                                        | `read:profile`   |
| `GET /v1/sessions?from=&to=&updatedSince=&cursor=`                                                                                  | `read:sessions`  |
| `GET /v1/sessions/:id`                                                                                                              | `read:sessions`  |
| `GET /v1/personal-records`                                                                                                          | `read:sessions`  |
| `GET /v1/workouts` (templates with exercises) · `GET /v1/folders` · `GET /v1/stretching-routines` · `GET /v1/exercises?custom=true` | `read:workouts`  |
| `GET /v1/meals?from=&to=`                                                                                                           | `read:nutrition` |
| `GET /v1/body-weight?from=&to=` · `GET /v1/progress/check-ins`                                                                      | `read:body`      |
| `GET /v1/activity/daily-energy?from=&to=` · `GET /v1/activity/workouts`                                                             | `read:activity`  |
| `GET /v1/export`                                                                                                                    | `export`         |

- **Export:** today the backup is built on the clients (`ImportFileBuilder.swift`, the web
  equivalent). v1 adds a server-side builder in `@luki-fitti/common` (shared with the web,
  so there's one implementation of the format) and returns `application/json` with
  `Content-Disposition: attachment`. It's validated against `ImportFileSchema` in a test, so
  "export → import" is a round trip.
- **Errors:** `401` (missing/invalid/expired/revoked, with one generic message, never saying
  which), `403` (valid key, missing scope: `{"error":"insufficient_scope","required":"read:meals"}`),
  `429` (rate limit, with `Retry-After`).
- **Docs:** an OpenAPI document for `/api/v1` only (the existing `openapi-export.ts` gets a
  second output filtered to the public controllers), served as a docs page on the web
  (`/developers`) with curl examples.

## Authentication

- New `ApiKeyGuard` on the public-api controllers only. It reads `Authorization: Bearer
lf_pat_…`. Anything that doesn't start with `lf_pat_` is rejected there, and the existing
  `AuthGuard` never accepts keys (separate code paths, so neither can be confused for the
  other).
- The guard sets `request.user = { id, … }` plus `request.apiKey = { id, scopes }`, and
  a `ScopesGuard` checks `@ApiScope()` metadata.
- No cookies, so CSRF doesn't apply. CORS for `/api/v1` is `*` without credentials, so browser
  tools such as Observable notebooks work; that's safe because keys are never sent
  implicitly.
- `lastUsedAt` is written asynchronously and throttled (Redis `SET NX EX 60` per key), so
  reads don't turn into writes.
- The key never reaches logs: the dev `LoggingInterceptor` already redacts `authorization`
  headers; add a test for `lf_pat_` in query strings too (keys in URLs are rejected with 400
  "send the key in the Authorization header").

## Rate limits and abuse

- Per key: 60 requests/minute and 5,000/day (Redis counters, same helper as the social
  limits). `/v1/export`: 5/day per user.
- Per user across all keys: 10,000/day.
- Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response.
- Failed key lookups count per IP (existing throttler), so random keys can't be probed in a
  loop.

## Security checklist

- 256-bit secrets, HMAC with a pepper, constant-time compare, shown once.
- Read-only and owner-scoped: every query in the public-api services filters by
  `request.user.id`. Add a spec per endpoint asserting another user's id returns 404.
- No email in `/v1/me`, no AI keys, no social data, no photos, no admin.
- Creation needs password re-authentication, plus an email notice.
- Expiry default 90 days, a warning for "no expiry", and a hard limit of 10 keys.
- Global kill switch `apiKeysEnabled`, plus per-key revoke.
- App Store: nothing user-generated is exposed to others, so no new review concerns. The
  privacy policy gets one paragraph (keys are stored hashed, last use is recorded, no IPs).

## MCP server

Ships in 2.0 as a separate `apps/mcp-server` workspace, built like the MCP servers in
marienmühle and kds-werkzeugbau. It forwards the user's API key to `/api/v1`, so all access
control stays in the API. The full design is in [mcp-server.md](mcp-server.md). The key
system adds one scope (`mcp`) and one endpoint (`GET /v1/key`, the presented key's scopes and
expiry) for it.

## Architecture fit

| Piece                                               | Where                                                                                |
| :-------------------------------------------------- | :----------------------------------------------------------------------------------- |
| Key management routes (`GET/POST/DELETE /api-keys`) | new `api-keys` module, `AuthGuard` + `CsrfGuard` (session auth, the app UI)          |
| Public read API                                     | new `public-api` module with `ApiKeyGuard` + `ScopesGuard`                           |
| DTOs + scope enum + key format helpers              | `@luki-fitti/common` (`api-key.util.ts`, `schemas/public-api.ts`)                    |
| Export builder                                      | `@luki-fitti/common/utils/export-file.util.ts`, reused by the web backup button      |
| Email                                               | new `API_KEY_CREATED` template through the existing email worker                     |
| Settings UI                                         | `apps/web/components/gym/settings/api-keys-page.tsx`; iOS list in `Features/Profile` |
| Docs                                                | `apps/web/app/(site)/site/[locale]/developers` + `docs/public-api.md`                |

The boot spec from the social work (`app.module.boot.spec.ts`) covers the new modules'
dependency injection automatically.

## Delivery (three PRs into `release/2.0.0`)

1. **Keys + read API:** migration, key management routes, `ApiKeyGuard`/`ScopesGuard`, the v1
   endpoints except export, rate limits, email, web settings page, iOS list/revoke, tests.
2. **Export + docs:** the shared export builder (web backup button switched to it), `/v1/export`,
   the public OpenAPI file, the `/developers` page, the privacy paragraph.
3. **MCP server:** see [mcp-server.md](mcp-server.md#delivery).

## Tests

Key format parsing and HMAC verification (valid, wrong secret, unknown id, revoked, expired,
locked account). Scope enforcement per route (missing scope → 403, route without a scope →
unreachable). Owner isolation per endpoint. Pagination and `updatedSince`. Rate-limit
headers and 429. Keys rejected by the normal `AuthGuard` and app tokens rejected by
`ApiKeyGuard`. Keys in query strings rejected. `lastUsedAt` throttling. Export output passes
`ImportFileSchema` and re-imports with zero new entries (idempotency). e2e: create a key in
the settings, copy it, `curl /api/v1/sessions` with it, revoke it, get 401.

## Decisions (2026-11-15)

1. **Read-only for v1.** `write:*` scopes are a later version.
2. **"No expiry" is allowed**, alongside 30 days / 90 days (default) / 1 year, with a warning
   in the create sheet and the "Last used" date in the list to spot forgotten keys.
3. **Keys are created on the web only**; iPhone lists and revokes them.
4. **No photos in v1** (progress and meal photos stay excluded).
5. **MCP server ships in 2.0** (see [MCP server](#mcp-server)), as the third PR.
