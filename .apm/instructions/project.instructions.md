---
applyTo: '**'
description: 'Project orientation for luki-fitti — what the product is, monorepo map, toolchain, commands, local docker environment, deployment, and testing'
---

# Project Orientation — LukiFitti

## What this is

Personal gym and workout management Progressive Web App (`luki-fitti`), optimized for iPhone and Safari with durable IndexedDB offline workout execution, timestamp-based rest timers, stretching & mobility routines, training diary analytics, and Gymlife / Apple Health export migration.

## Monorepo map

- `apps/api` (`@luki-fitti/api`) — NestJS 12 REST API (Express 5). Domain modules under `src/modules/` (`auth`, `exercise`, `workout`, `session`, `stretching`, `analytics`, `import`, `database`, `health`). Listens on port 3001.
- `apps/web` (`@luki-fitti/web`) — Next.js 16 App Router PWA (`app/`): main PWA shell (`components/gym/`), IndexedDB offline store (`lib/offline/offline-store.ts`), Service Worker (`public/sw.js`), Web App Manifest (`app/manifest.ts`), and components from `@luki-fitti/ui`.
- `apps/apple` (`@luki-fitti/apple`) — Native Swift 6 workspace (`LukiFittiIOS`, `LukiFittiWatch`, `LukiFittiWidgets`, and shared `Packages/LukiFittiKit`).
- `packages/common` (`@luki-fitti/common`) — shared Zod schemas (single source of truth), DTOs, enums, initial exercise catalog (`src/catalog/`), and utilities.
- `packages/database` (`@luki-fitti/database`) — Prisma 7 schema, SQL migrations, client, and seed script (PostgreSQL).
- `packages/logger` (`@luki-fitti/logger`) — Winston wrapper; log via `@luki-fitti/logger`, never `console.log`.
- `packages/ui` (`@luki-fitti/ui`) — shared shadcn-style component library.
- `packages/eslint-config`, `packages/typescript-config` — shared configs.

## Toolchain facts

- **yarn 1** workspaces + turbo. Never use npm or pnpm here.
- Node ≥ 22, TypeScript strict, pure ESM (`"type": "module"`).
- `@luki-fitti/api` builds via `nestgo`; `common`, `database`, `logger` build via `tsc` + `tsc-alias`.
- `@luki-fitti/common` and `@luki-fitti/database` are consumed from `dist/` — after changing them, rebuild before dependents consume them.

## Commands (repo root)

- `yarn run dev` / `build` / `lint` / `test` / `format` — turbo pipelines
- `yarn run db:generate` / `db:migrate -- <name>` / `db:deploy` / `db:push` / `db:seed` — Prisma tasks
- `yarn workspace @luki-fitti/<name> run <script>` — run a script in one workspace

## Local environment

- `docker compose -f compose.dev.yml up -d` starts the stack: `db`, `redis`, `caddy`, `web`, `api`, `db-migrate`.
- Env files per app: `<app>/.env.local` (samples in `<app>/.env.sample`). Never commit `.env*.local`.
- Inside docker, services reach each other by **service name** (`db`, `redis`, `api`), not `localhost`.
- Next.js server-side fetch needs the **absolute** API URL — set `SERVER_API_URL=http://api:3001/api` (mirrors `API_URL`).

## Native Apple Workspace (`apps/apple`)

- **Generate Xcode Project:** `cd apps/apple && xcodegen generate && open LukiFitti.xcodeproj`
- **Run Swift Package Tests:** `swift test --package-path apps/apple/Packages/LukiFittiKit`
- **Build & Launch on Simulators:**
  - List simulators: `xcrun simctl list devices available`
  - Pair Watch & iPhone simulators: `xcrun simctl pair <WATCH_UDID> <IPHONE_UDID>`
  - Build iOS: `xcodebuild -project apps/apple/LukiFitti.xcodeproj -scheme LukiFittiIOS -destination 'id=<IPHONE_UDID>' CODE_SIGNING_ALLOWED=NO build`
  - Build watchOS: `xcodebuild -project apps/apple/LukiFitti.xcodeproj -scheme LukiFittiWatch -destination 'id=<WATCH_UDID>' CODE_SIGNING_ALLOWED=NO build`
  - Install & launch: `xcrun simctl install <UDID> <PATH_TO_APP> && xcrun simctl launch <UDID> com.lukifitti.app` (or `com.lukifitti.app.watchkitapp` for Watch)
- **API Environment Configuration:**
  - `Config/Debug.xcconfig` defaults to `http://localhost:3001`; `Config/Release.xcconfig` defaults to `https://luki-fitti.tony-luke.de`.
  - Override at runtime in Xcode via **Edit Scheme → Run → Environment Variables → `LUKIFITTI_API_BASE_URL`**.
- **Deploy to a physical iPhone (always use the prod URL):**
  - A Debug build bakes `http://localhost:3001` into `Info.plist`. On a real device `localhost` is the phone itself, so the app cannot reach the API or S3 storage. Always pass the prod URL when building for a device.
  - The scheme environment variable only applies when launching from Xcode, not when the app is opened from the home screen. Use the build setting override instead.
  - Do not use the Release configuration for personal-team device builds: `Release.xcconfig` resets `LUKIFITTI_BUNDLE_ID_PREFIX` to `com.lukifitti`, which overrides `Local.xcconfig` and breaks signing.
  - Find the device ID: `xcrun devicectl list devices` (use the `physical` entry).
  - Build: `cd apps/apple && xcodegen generate && xcodebuild -project LukiFitti.xcodeproj -scheme LukiFittiIOS -configuration Debug -destination 'id=<DEVICE_UDID>' -derivedDataPath build/DerivedData -allowProvisioningUpdates 'LUKIFITTI_API_BASE_URL=https:/$()/luki-fitti.tony-luke.de' build`
  - Verify: `/usr/libexec/PlistBuddy -c 'Print LUKIFITTI_API_BASE_URL' build/DerivedData/Build/Products/Debug-iphoneos/LukiFittiIOS.app/Info.plist` must print `https://luki-fitti.tony-luke.de`.
  - Install & launch: `xcrun devicectl device install app --device <DEVICE_UDID> build/DerivedData/Build/Products/Debug-iphoneos/LukiFittiIOS.app && xcrun devicectl device process launch --terminate-existing --device <DEVICE_UDID> <BUNDLE_ID>` (the bundle ID is `$(LUKIFITTI_BUNDLE_ID_PREFIX).app` from `Config/Local.xcconfig`).

## Agent Instructions (APM)

- This repository manages agent instructions with [APM](https://microsoft.github.io/apm/) (`apm.yml`). Do not edit generated files directly — they are overwritten on every `apm install` / `apm compile`.
- Always-on rules live in `.claude/rules/` and `AGENTS.md` (repo root).
- All authoring happens in `.apm/` (instructions in `.apm/instructions/*.instructions.md`, skills in `.apm/skills/`). After any change run `apm install && apm compile` and commit `.apm/` sources and generated outputs together.

