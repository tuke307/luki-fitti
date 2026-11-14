# LukiFitti Public API v1

LukiFitti has a read-only REST API for your own data. Use it to pull your
workouts, sessions, nutrition, body measurements and activity into your own
scripts, dashboards or backups.

The machine-readable OpenAPI document lives at
[`openapi/public-api-v1.json`](openapi/public-api-v1.json).

## Creating an API key

1. Sign in to the web app.
2. Go to **Profile → Settings → API keys**.
3. Create a key: give it a name, pick the scopes it may use and choose an
   expiry (30 days, 90 days, 1 year or no expiry).
4. Copy the key — it is shown **once** and cannot be retrieved later. If you
   lose it, revoke it and create a new one.

You can have up to 10 active keys.

## Authentication

Send the key as a bearer token on every request:

```
Authorization: Bearer lf_pat_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Never put the key in the URL. Requests with `lf_pat_…` in the query string are
rejected.

## Scopes

| Scope            | Access                                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| `read:profile`   | `GET /v1/me`                                                                  |
| `read:sessions`  | `GET /v1/sessions`, `/v1/sessions/:id`, `/v1/personal-records`                |
| `read:workouts`  | `GET /v1/workouts`, `/v1/folders`, `/v1/stretching-routines`, `/v1/exercises` |
| `read:nutrition` | `GET /v1/meals`                                                               |
| `read:body`      | `GET /v1/body-weight`, `/v1/progress/check-ins`                               |
| `read:activity`  | `GET /v1/activity/daily-energy`, `/v1/activity/workouts`                      |
| `export`         | `GET /v1/export`                                                              |

A request to an endpoint your key is not scoped for returns `403
insufficient_scope` with the required scope in the `required` field.

## Endpoints

All endpoints are `GET` and return only your own data.

| Method | Path                        | Scope            | Notes                                  |
| ------ | --------------------------- | ---------------- | -------------------------------------- |
| GET    | `/v1/me`                    | `read:profile`   | Name, handle, units, goals (no email). |
| GET    | `/v1/sessions`              | `read:sessions`  | Session summaries, paginated.          |
| GET    | `/v1/sessions/:id`          | `read:sessions`  | One session with exercises and sets.   |
| GET    | `/v1/personal-records`      | `read:sessions`  | Computed personal records.             |
| GET    | `/v1/workouts`              | `read:workouts`  | Workout templates with exercises.      |
| GET    | `/v1/folders`               | `read:workouts`  | Workout folders.                       |
| GET    | `/v1/stretching-routines`   | `read:workouts`  | Stretching routines with exercises.    |
| GET    | `/v1/exercises`             | `read:workouts`  | Your custom exercises + the catalog.   |
| GET    | `/v1/meals`                 | `read:nutrition` | Meal entries with items (no photos).   |
| GET    | `/v1/body-weight`           | `read:body`      | Body weight entries in kg.             |
| GET    | `/v1/progress/check-ins`    | `read:body`      | Check-in metadata (no photo URLs).     |
| GET    | `/v1/activity/daily-energy` | `read:activity`  | Active energy per day.                 |
| GET    | `/v1/activity/workouts`     | `read:activity`  | Imported Apple Health workouts.        |
| GET    | `/v1/export`                | `export`         | Full workout backup file.              |

`/v1/exercises?custom=true` returns only your custom exercises.

## Pagination and incremental sync

Every list endpoint accepts:

- `limit` — 1–200, default `50`.
- `cursor` — an opaque cursor; pass the `nextCursor` from the previous page.
- `updatedSince` — ISO datetime; only rows updated after that instant.

List responses have the shape:

```json
{ "data": [/* items */], "nextCursor": "…" }
```

`nextCursor` is `null` when there are no more rows. For incremental sync, keep
the newest `updatedAt` you saw and pass it as `updatedSince` next time, then
page until `nextCursor` is `null`.

## Date filters

`from` and `to` accept an ISO date or datetime.

- A date-only value is a whole UTC calendar day: `from=2026-11-14` means
  `>= 2026-11-14T00:00Z`, `to=2026-11-14` means until the end of that day
  (`< 2026-11-15T00:00Z`).
- A full datetime is used exactly (`to` is inclusive).

## Rate limits

| Window                       | Limit               |
| ---------------------------- | ------------------- |
| Per key, per minute          | 60 requests         |
| Per key, per day             | 5,000 requests      |
| Per user, per day (all keys) | 10,000 requests     |
| `GET /v1/export`, per user   | 5 downloads per day |

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset` (Unix seconds) for the per-minute window. When you are
limited, you get `429 rate_limited` plus a `Retry-After` header telling you how
many seconds to wait.

## Error format

Errors always look like:

```json
{ "error": "insufficient_scope", "message": "…", "required": "read:sessions" }
```

| Status | `error`              | Meaning                                          |
| ------ | -------------------- | ------------------------------------------------ |
| 400    | `invalid_request`    | Bad query (also: key found in the query string). |
| 401    | `invalid_api_key`    | Key missing, unknown, revoked or expired.        |
| 403    | `insufficient_scope` | Key lacks the required scope (`required` field). |
| 403    | `api_keys_disabled`  | API keys are currently turned off.               |
| 404    | `not_found`          | Resource does not exist (or is not yours).       |
| 429    | `rate_limited`       | Slow down; see `Retry-After`.                    |
| 500    | `internal_error`     | Something broke on our side.                     |

## Examples

```bash
# Your profile
curl -H "Authorization: Bearer lf_pat_…" https://<host>/api/v1/me

# Sessions changed since the last sync
curl -H "Authorization: Bearer lf_pat_…" \
  "https://<host>/api/v1/sessions?updatedSince=2026-11-01T00:00:00Z&limit=200"

# Full workout backup (needs the `export` scope; 5/day)
curl -OJ -H "Authorization: Bearer lf_pat_…" https://<host>/api/v1/export
```

## The export format

`GET /v1/export` downloads a `luki-fitti-import@1` backup file — the same file
the app's built-in backup produces, so you can re-import it in the app.
**Format limit:** the export covers workouts only — your custom exercises,
folders, templates and completed sessions. Meals, body weight, check-ins and
activity are not in the file; use their own endpoints for those.

## Security notes

- Treat the key like a password. Store it in a password manager or secrets
  store, never in code or a screenshot.
- If a key leaks, revoke it immediately under **Profile → Settings → API
  keys** — revocation takes effect at once.
- The API is read-only: a key cannot modify or delete your data.
- v1 never returns photos (meal photos, progress photos) or social data.
- Keys can be set to expire; prefer an expiry over "never" for one-off use.
