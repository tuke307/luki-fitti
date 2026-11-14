# 0003. Personal API keys

- Status: Accepted, implemented
- Date: 2026-11-15
- Deciders: Tony Meissner

## Context and problem statement

Users want to read their own LukiFitti data from scripts and tools (spreadsheets, Notion,
Home Assistant, Apple Shortcuts, their own dashboards, an AI assistant). The app's internal
API is a moving target shaped by the clients, so it can't serve as a stable contract. A
stable, personal, read-only API also makes the GDPR right to data portability (Art. 20)
something people can actually use, rather than only a manual backup button.

## Decision drivers

- A small, stable, versioned surface that returns only the key owner's data.
- Keys must be safe if the database leaks: only hashes are stored.
- Scoped access, expiry, "last used" visibility, and a global kill switch.
- The full backup should be available as one call in the existing `luki-fitti-import@1`
  format, so an export can be imported again.
- Privacy: no IP storage, no other users' data, no new App Store review concerns.

## Considered options

- **Personal access tokens for a versioned read API (`/api/v1`).** Simple, familiar,
  self-service. Chosen.
- **OAuth for third-party apps.** A consent screen and client management are far more
  machinery than personal scripting needs. Deferred.
- **Reusing the existing session-token API.** Rejected: it isn't a stable contract and
  mixing token types in one guard invites confusion.
- **Write access in v1.** Deferred to a later `write:*` scope set once the read API has
  settled.

## Decision outcome

Users create, name, list and revoke API keys in the web settings (the iPhone app lists and
revokes them and links to "Create on the web"). A key is a bearer token for `/api/v1`, a
separate read-only API that only ever returns the owner's data.

Key format `lf_pat_<id>_<secret>`: the `lf_pat_` prefix makes leaked keys recognisable to
secret scanners, the 8-char base32 `id` is the lookup key stored in clear, and the secret is
32 random bytes base64url (256 bits). Storage is `HMAC-SHA256(API_KEY_PEPPER, secret)` — a
slow hash is unnecessary at 256 bits of entropy, and the pepper means a DB dump alone can't
confirm a guessed key. Verification is a constant-time compare plus `revokedAt`, `expiresAt`
and account-state checks.

Scopes gate every route (`read:profile`, `read:workouts`, `read:sessions`, `read:nutrition`,
`read:body`, `read:activity`, `export`); a route without an `@ApiScope()` decorator is
unreachable with a key. Lists are cursor-paginated (`limit` 1–200, `nextCursor`) and support
`?updatedSince=` for incremental sync. `GET /v1/export` returns the backup as
`application/json` with `Content-Disposition: attachment`, built by a shared builder in
`@luki-fitti/common` that is validated against `ImportFileSchema` in tests.

Authentication is a dedicated `ApiKeyGuard` on the public-api controllers only; the app
`AuthGuard` never accepts keys and vice versa. No cookies (no CSRF), CORS `*` without
credentials. `lastUsedAt` is written asynchronously and throttled to one write per minute
per key via Redis. Keys in query strings are rejected; the `authorization` header is redacted
from logs.

Rate limits: 60 req/min and 5,000/day per key, 10,000/day per user across keys, 5/day per
user on `/v1/export`, with `X-RateLimit-*` headers on every response. Failed key lookups are
throttled per IP.

### Consequences

**Good**

- Self-service data access with a stable contract; export → import is a round trip.
- Hashed-at-rest keys, one-time display, scoped reads, and an email notice on creation keep
  the risk of a leaked key or account takeover low.
- Read-only and owner-scoped means no user-generated content is exposed to others — no new
  App Store review concerns, and social data stays off-limits.

**Bad**

- A second auth path and a second API surface to maintain; public DTOs must stay stable.
- `GET /v1/export` covers workouts only (custom exercises, folders, templates, completed
  sessions) because that's what the `luki-fitti-import@1` format holds; meals, body weight
  and activity come through their own endpoints.
- `/v1/deletions` (tombstones for incremental sync) is deferred, so deleted rows aren't
  visible to sync clients.

## Implementation notes

- Key management routes live in `apps/api/src/modules/api-keys` behind `AuthGuard` +
  `CsrfGuard`; the read API lives in `apps/api/src/modules/public-api` behind `ApiKeyGuard` +
  `ScopesGuard`. DTOs, the scope enum and key-format helpers are in `@luki-fitti/common`.
- `API_KEY_PEPPER` (≥32 chars) is required in production — boot fails without it. The global
  kill switch `apiKeysEnabled` is managed at `/admin/api-keys`.
- Date-only `from`/`to` query params are whole UTC calendar days (`to` inclusive); datetimes
  are exact.
- At most 10 active keys per user; expired keys stay listed for 30 days. Password change and
  "log out everywhere" do not revoke keys; an admin lock makes every key fail with 401.
- Docs: `docs/public-api.md` plus the generated `docs/openapi/public-api-v1.json`
  (a filtered output of `openapi-export.ts`).

## Links

- `docs/public-api.md` (guide) and `docs/openapi/public-api-v1.json` (OpenAPI document)
- MCP server: ADR 0005 builds on the `mcp` scope and `GET /v1/key`
- Docs site: ADR 0004
