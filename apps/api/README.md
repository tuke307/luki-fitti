# `@luki-fitti/api`

NestJS 12 REST API for LukiFitti.

## Features

- Dual authentication: `HttpOnly` cookies + constant-time CSRF protection for web browsers, and `Authorization: Bearer` + refresh token rotation for native iOS/watchOS clients.
- Idempotent offline workout synchronization (`POST /api/sessions/sync`) with version conflict detection and Apple HealthKit telemetry (`heartRateSamples`, active/total kcal, per-set peak/recovery HR).
- Swagger / OpenAPI documentation at `/api-docs`.

## Development

```bash
cp .env.sample .env.local
yarn dev
yarn test
```
