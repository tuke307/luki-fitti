# Connect an AI assistant

LukiFitti runs an MCP server, so an AI assistant — Claude Code, Claude Desktop, Cursor, VS
Code and other MCP clients — can answer questions about your own training: "How did my
bench press develop this year?", "Which muscle groups did I neglect last month?", "Did I
hit my protein goal last week?". It is read-only: the assistant can look at your training
data but can never change it.

## Get a key

The connection uses your personal API key:

1. Open **Settings → API keys** in the app or on the web.
2. Create a key and pick the **AI assistant (MCP)** preset — it ticks the `mcp` scope plus
   the read scopes the tools need. A key without `mcp` is rejected.
3. Copy the `lf_pat_…` key once; it is shown only at creation.

## Endpoint

```
https://app.luki-fitti.tony-luke.de/mcp
```

The server speaks Streamable HTTP at exactly this path. Everything except the connection
handshake requires your key — including the tool list, which is filtered to the scopes
your key holds.

## Setup

**Claude Code**

```bash
claude mcp add --transport http lukifitti https://app.luki-fitti.tony-luke.de/mcp \
  --header "Authorization: Bearer lf_pat_…"
```

**Claude Desktop** (`claude_desktop_config.json`, via `mcp-remote`):

```json
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

**Cursor / VS Code** use the same `mcp-remote` pattern in their MCP settings JSON, or a
direct `url` + `headers` entry where HTTP transport is supported.

## Tools

All tools are read-only. Answers use the units from your profile, and dates accept
`YYYY-MM-DD` or relative words like `last-week` or `last-30-days` in your time zone.

| Tool                | What it answers                                                        | Scope needed                      |
| :------------------ | :--------------------------------------------------------------------- | :-------------------------------- |
| `get-profile`       | Units, weekly session goal, training and nutrition goals               | `read:profile`                    |
| `list-sessions`     | Sessions in a range: date, workout, duration, volume, sets, PR count   | `read:sessions`                   |
| `get-session`       | One session with every exercise and set                                | `read:sessions`                   |
| `exercise-progress` | Best set, e1RM and volume per session for one exercise, plus the trend | `read:sessions` + `read:workouts` |
| `personal-records`  | Current personal records, optionally for one exercise                  | `read:sessions`                   |
| `training-summary`  | Sessions vs goal, volume per muscle group, streak for a period         | `read:sessions`                   |
| `list-workouts`     | Your workout templates with exercises and targets                      | `read:workouts`                   |
| `nutrition-summary` | kcal/protein/carbs/fat per day vs goals, with averages                 | `read:nutrition`                  |
| `body-weight-trend` | Weigh-ins, 7-day average and change over a range                       | `read:body`                       |

## Limits

- Tool calls are capped at 30 per minute per key (the API's own limits apply on top), and
  long lists are truncated with a `truncated` flag — narrow the date range if you see it.
- The MCP server holds no data of its own: every tool call becomes API requests with your
  key, so scopes and rate limits are enforced exactly as for direct API use.
- Tool outputs deliberately exclude your free text (session notes, meal descriptions) to
  keep the prompt-injection surface small.

## Privacy

When your assistant calls a tool, the requested slice of your training data is sent to the
assistant's provider (e.g. Anthropic) — at your request, through your key. Read-only
tools only; no photos or social data are exposed. The privacy policy has a paragraph on
this under "API keys".

## Revoking

Delete or revoke the key in **Settings → API keys**. The MCP server's scope check is
cached for at most a minute, so a revoked key stops working almost immediately.
