# @luki-fitti/mcp-server

MCP server that lets AI assistants (Claude Code/Desktop, Cursor, VS Code, …) answer questions
about a user's own training — sessions, exercise progress, nutrition, body weight — using the
user's personal API key. It holds no data and no secrets: every tool call is forwarded to the
main API's `/api/v1` with the caller's `lf_pat_…` key, so all access control (scopes, owner
filters, rate limits) lives in the API. Design doc: `docs/mcp-server.md`.

- Transport: **Streamable HTTP** at `POST /mcp` (stateless, JSON responses), plus unauthenticated
  `GET /health` for healthchecks.
- Auth: `Authorization: Bearer lf_pat_…`; the guard introspects the key via `GET /v1/key`
  (cached 60 s, failures never cached) and requires the `mcp` scope. The `initialize`,
  `notifications/initialized` and `ping` JSON-RPC methods are public.
- Kill switch: `AppSettings.mcpEnabled` in the API — while off, `/v1/key` answers 403
  `mcp_disabled` and no tool is reachable.

## Scripts

```bash
yarn dev          # tsx watch, env from .env.local
yarn build        # tsc → dist/
yarn start        # node dist/main.js, env from .env.local
yarn start:prod   # node dist/main.js, real env vars
yarn test         # node:test specs (unit + boot + end-to-end against a stub API)
yarn lint         # tsc --noEmit + eslint
```

## Environment

| Variable            | Default                     | Purpose                                                          |
| :------------------ | :-------------------------- | :--------------------------------------------------------------- |
| `MCP_SERVER_PORT`   | `3030`                      | Port `/mcp` and `/health` listen on                              |
| `API_BASE_URL`      | `http://localhost:3001/api` | Internal API base; tool calls forward the caller's key here      |
| `MCP_PUBLIC_URL`    | `http://localhost:3030/mcp` | Public URL, shown in docs/snippets                               |
| `MCP_ALLOWED_HOSTS` | `localhost` shorthand       | Comma-separated Host/Origin allowlist (DNS-rebinding protection) |

## Client setup

Create a key in the app (Settings → API keys → "AI assistant (MCP)" preset) and point the
client at `https://app.luki-fitti.tony-luke.de/mcp`.

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

```json
// Cursor (~/.cursor/mcp.json)
{
  "mcpServers": {
    "lukifitti": {
      "url": "https://app.luki-fitti.tony-luke.de/mcp",
      "headers": { "Authorization": "Bearer ${env:LUKIFITTI_KEY}" }
    }
  }
}
```

```json
// VS Code (.vscode/mcp.json — prompts for the key once, stores nothing)
{
  "inputs": [
    {
      "type": "promptString",
      "id": "lukifitti-key",
      "description": "LukiFitti API key",
      "password": true
    }
  ],
  "servers": {
    "lukifitti": {
      "type": "http",
      "url": "https://app.luki-fitti.tony-luke.de/mcp",
      "headers": { "Authorization": "Bearer ${input:lukifitti-key}" }
    }
  }
}
```
