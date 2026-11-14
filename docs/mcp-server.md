# LukiFitti MCP server (design)

Status: **approved 2026-11-15** · Target: 2.0.0 (branch `feat/api-keys` → `release/2.0.0`) ·
Depends on: [personal API keys](api-keys.md)

AI assistants (Claude Desktop/Code, Cursor, VS Code, ChatGPT and other MCP clients) connect to
LukiFitti with the user's personal API key and answer questions about their own training:
"How did my bench press develop this year?", "Which muscle groups did I neglect last month?",
"Did I hit my protein goal last week?".

## Reuse: same architecture as marienmühle and kds-werkzeugbau

Both projects already run an MCP server, and LukiFitti copies that setup instead of
inventing a new one:

| Piece     | marienmühle / kds-werkzeugbau                                                                                                                                                    | LukiFitti                                                                  |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| App       | `apps/mcp-server`, a standalone NestJS app                                                                                                                                       | `apps/mcp-server` (`@luki-fitti/mcp-server`)                               |
| Libraries | `@rekog/mcp-nest` 2.0.8, `@modelcontextprotocol/server` 2.3.1, `/node` 2.1.1, `/core` 2.3.1                                                                                      | the same, **pinned exact** (repo policy), re-vetted at implementation time |
| Transport | `new StreamableHttpTransport()`: Streamable HTTP, stateless, JSON responses                                                                                                      | the same                                                                   |
| Wiring    | `McpStrategy` + `McpHttpControllerFor(transport)` under `@Controller('mcp')`, a guard on that controller (never global, because tools are RPC handlers)                          | the same; the comments from `app.module.ts` are copied verbatim            |
| Tools     | `@McpController()` classes with `@Tool({ name, description, parameters: zod })`, calling the main API over HTTP (`API_BASE_URL`), returning `content` text + `structuredContent` | the same pattern, but calling `/api/v1` with the user's key                |
| Auth      | `McpAuthGuard`: shared secret `x-mcp-secret`, constant-time compare, handshake + `tools/list` public                                                                             | **changed:** per-user API key (below)                                      |
| Helpers   | `tools/mcp-date-utils.ts` (pure date helpers)                                                                                                                                    | copied and adapted: ISO dates, Berlin day keys from `@luki-fitti/common`   |
| Docker    | turbo-prune multi-stage `Dockerfile`, non-root user, port 3030                                                                                                                   | the same, without the site-content extraction stage                        |
| Bruno     | `bruno/mcp-server/` request collection                                                                                                                                           | `bruno/mcp-server/` with initialize, tools/list and one call per tool      |

**What does not carry over:** the shared-secret model. In marienmühle the caller is our own chat
backend; here every caller is a user's assistant, so authentication is the user's API key.

## Architecture

```
AI client ──HTTPS + Bearer lf_pat_…──▶ mcp-server (/mcp, :3030)
                                         │  forwards the same key
                                         ▼
                                  api (/api/v1, :3001) ── ApiKeyGuard, scopes, rate limits
```

- **The MCP server holds no data, database access or secrets.** Every tool call becomes one or
  more `GET /api/v1/...` requests carrying the caller's key, so all access control lives in one
  place, the API (`ApiKeyGuard`, `ScopesGuard`, owner filters, rate limits from the
  [API keys design](api-keys.md)). A bug in the MCP server can't read anyone else's data.
- **Routing:** Coolify/Caddy labels add `handle /mcp/*` → `mcp-server:3030` on both
  `luki-fitti.tony-luke.de` and `app.luki-fitti.tony-luke.de`, next to the existing `/api/*`
  route. Public URL: `https://app.luki-fitti.tony-luke.de/mcp`.
- **Internal call:** `API_BASE_URL=http://luki-fitti-api:3001/api` inside the compose network,
  not through the public proxy.

## Authentication (`McpAuthGuard`, adapted)

1. `initialize`, `notifications/initialized` and `ping` stay public, so clients can connect.
2. Every other method, **including `tools/list`**, needs `Authorization: Bearer lf_pat_…`.
   The guard checks the format only (regex) and rejects anything else with 401 and a
   `WWW-Authenticate: Bearer` header. It does not verify the key itself.
3. The guard calls `GET /api/v1/key` (new, tiny endpoint returning `{ scopes, expiresAt }` for
   the presented key) and caches the result for 60 s per key hash in memory. Missing
   `mcp` scope → 403 "This API key is not allowed for AI assistants".
4. `tools/list` returns only the tools whose scopes the key has (filtering per request via
   `@rekog/mcp-nest`'s dynamic tool registration through `MCP_STRATEGY`, as marienmühle exposes
   it). Calling a tool the key can't use returns an MCP tool error naming the missing scope.
5. The key reaches each tool through request context and is forwarded unchanged. It is never
   logged (the logger gets the key id `lf_pat_9f3k2m7q` only).

## Tools (read-only)

Names in kebab-case, like the existing projects. Descriptions in English (assistants work in
any language); answers use the user's units from `get-profile`.

| Tool                                                           | Scope            | Calls                           | Returns (`structuredContent`)                              |
| :------------------------------------------------------------- | :--------------- | :------------------------------ | :--------------------------------------------------------- |
| `get-profile`                                                  | `read:profile`   | `/v1/me`                        | units, weekly session goal, training goal, nutrition goals |
| `list-sessions` (`from`, `to`, `limit ≤ 50`)                   | `read:sessions`  | `/v1/sessions`                  | date, workout, duration, volume, sets, PR count            |
| `get-session` (`id`)                                           | `read:sessions`  | `/v1/sessions/:id`              | exercises with all sets                                    |
| `exercise-progress` (`exercise`, `from`, `to`)                 | `read:sessions`  | `/v1/exercises`, `/v1/sessions` | per session: best set, e1RM, volume; plus the trend        |
| `personal-records` (`exercise?`)                               | `read:sessions`  | `/v1/personal-records`          | current PRs                                                |
| `training-summary` (`period: week \| month \| year`, `offset`) | `read:sessions`  | `/v1/sessions`                  | sessions vs goal, volume per muscle group, streak          |
| `list-workouts`                                                | `read:workouts`  | `/v1/workouts`                  | templates with exercises and targets                       |
| `nutrition-summary` (`from`, `to`)                             | `read:nutrition` | `/v1/meals`, `/v1/me`           | per day: kcal/protein/carbs/fat vs goals, averages         |
| `body-weight-trend` (`from`, `to`)                             | `read:body`      | `/v1/body-weight`               | entries, 7-day average, change                             |

- **Calculations reuse `@luki-fitti/common`** (`history-insights`, `muscle-volume`,
  `nutrition`, `body-weight`, `progression` e1RM), so assistant answers match the app.
- **Exercise names:** `exercise` is free text, resolved with the existing
  `exercise-search.util` (EN/DE vocabulary). An ambiguous match returns the candidates
  ("Did you mean Bench Press (Barbell) or Bench Press (Dumbbell)?") instead of guessing.
- **Dates:** `from`/`to` accept `YYYY-MM-DD` or relative words (`today`, `last-week`,
  `this-month`, `last-30-days`), resolved in the user's time zone from `/v1/me`, falling back
  to Europe/Berlin (adapted `mcp-date-utils.ts`).
- **Output format:** like the existing tools, a short human-readable `content` text plus
  `structuredContent` with the full data. At most 200 rows; a `truncated: true` flag plus a
  hint to narrow the range.
- **No user free text** (session notes, meal descriptions, exercise notes) in v1 outputs.
  This keeps the surface for prompt injection through your own data small, and an assistant
  doesn't need notes to compute progress.
- **No write tools.** Logging a workout or meal by voice is a natural v2 once `write:*`
  scopes exist.

## Rate limits

The API's limits apply to the forwarded calls (60/min, 5,000/day per key). One tool may make
several API calls (e.g. `exercise-progress`), so the MCP server also limits tool calls to 30/min
per key, and returns an MCP error "Rate limit reached, try again in N s" instead of a raw 429.

## Configuration

```
MCP_SERVER_PORT=3030
API_BASE_URL=http://luki-fitti-api:3001/api
MCP_PUBLIC_URL=https://app.luki-fitti.tony-luke.de/mcp   # shown in docs/snippets
```

Kill switch: `AppSettings.mcpEnabled` (default off). The API answers `/v1/key` with 403
`mcp_disabled` while it's off, so the MCP server needs no admin settings of its own.

## Client setup (on `/developers`)

```bash
# Claude Code
claude mcp add --transport http lukifitti https://app.luki-fitti.tony-luke.de/mcp \
  --header "Authorization: Bearer lf_pat_…"
```

```json
// Claude Desktop (claude_desktop_config.json) via mcp-remote
{
  "mcpServers": {
    "lukifitti": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://app.luki-fitti.tony-luke.de/mcp",
        "--header",
        "Authorization: Bearer ${LUKIFITTI_KEY}"
      ],
      "env": { "LUKIFITTI_KEY": "lf_pat_…" }
    }
  }
}
```

Plus Cursor and VS Code snippets. The key-creation sheet gets a preset "AI assistant (MCP)"
that ticks `mcp` plus all read scopes except `export`.

**Not in 2.0:** OAuth, which one-click connectors in claude.ai and ChatGPT need instead of a
pasted key. It can be added later in front of the same server (OAuth 2.1 authorization server
in the API issuing the same `lf_pat_` keys).

## Monorepo integration

- `apps/mcp-server` workspace with `build`/`dev`/`lint`/`start` scripts as in marienmühle;
  `turbo.json` env list (`MCP_SERVER_PORT`, `API_BASE_URL`, `MCP_PUBLIC_URL`).
- `compose.yml` and `compose.dev.yml`: a `mcp-server` service (dev: port 3030, depends on `api`).
- `production.yaml`: a fourth image `tuke307/luki-fitti-mcp-server`, built and deployed like the
  email worker.
- CI: lint, tests and build run through turbo like every workspace; the boot spec idea is
  reused (build the MCP module graph once in a test).
- Bruno collection `bruno/mcp-server/` (initialize, tools/list, each tool) using a
  `LUKIFITTI_API_KEY` environment variable.

## Security checklist

- No data access in the MCP server; the key is forwarded to the API, which enforces owner,
  scopes and rate limits (deny by default).
- Everything except the handshake requires a key, including `tools/list`; a scope check is
  cached for at most 60 s, so a revoked key stops working within a minute.
- Keys never logged; only the key id.
- Read-only tools, row caps, no user free text in outputs.
- `MCP-Protocol-Version` and `Origin` checks: the Streamable HTTP transport's DNS-rebinding
  protection is enabled with the public host as the allowed host, per the MCP spec's
  recommendation for HTTP servers.
- Dependencies pinned exactly and vetted (`@rekog/mcp-nest`, `@modelcontextprotocol/*`).
- Privacy policy: one paragraph explaining that data a user's assistant fetches is sent to
  that assistant's provider at the user's own request.

## Tests

- Guard: handshake public; `tools/list` and `tools/call` without a key → 401; a key without
  the `mcp` scope → 403; scope cache expiry.
- `tools/list` filtered by scopes.
- Each tool against a mocked `/api/v1`: correct requests with the forwarded key, output shape,
  truncation, the ambiguous-exercise path, relative date words in Berlin and in the user's zone.
- An end-to-end run with the MCP SDK client against the dev stack: create a key → initialize →
  list → call `training-summary` → revoke the key → the next call fails.

## Delivery

The third PR of the API keys work (after keys + read API and export + docs), into
`release/2.0.0`: the `apps/mcp-server` workspace (copied scaffold), the guard, the tools, the
`/v1/key` endpoint, compose/production wiring, the Bruno collection, the `/developers` MCP
section and the tests.

## Decisions (2026-11-15)

1. **URL:** a path on the app domain, `https://app.luki-fitti.tony-luke.de/mcp` (and the same
   path on `luki-fitti.tony-luke.de`).
2. **`tools/list` requires the key**, so the list can be filtered by the key's scopes; only the
   handshake (`initialize`, `notifications/initialized`, `ping`) stays public.
