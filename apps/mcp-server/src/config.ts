// Environment is injected by the launch command — the same pattern the api
// uses: `--env-file=.env.local` on `dev`/`start` (Node's native flag), and
// real environment variables for `start:prod`/compose. There is intentionally
// no in-code dotenv loader here, so the app only boots with secrets when
// launched through the scripts.

export const MCP_SERVER_PORT = Number(process.env.MCP_SERVER_PORT || '3030');

/** Internal base URL of the main API — tool calls forward the caller's key here. */
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

/** Public MCP URL, shown in docs/snippets (`https://app…/mcp`). */
export const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL || 'http://localhost:3030/mcp';

/**
 * Comma-separated Host (and Origin) allowlist for the transport's DNS-rebinding
 * protection — the public host(s) the server is reachable as. Defaults to the
 * SDK's `'localhost'` shorthand (localhost + 127.0.0.1 + ::1).
 */
export const MCP_ALLOWED_HOSTS: string[] | 'localhost' = process.env.MCP_ALLOWED_HOSTS
  ? process.env.MCP_ALLOWED_HOSTS.split(',')
      .map((h) => h.trim())
      .filter(Boolean)
  : 'localhost';
