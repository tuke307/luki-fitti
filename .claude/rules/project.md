---
paths:
  - "**"
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
- `@luki-fitti/common` and `@luki-fitti/database` are consumed from `dist/` — after changing them, rebuild before dependents consume them (`yarn workspace @luki-fitti/common build`, `yarn workspace @luki-fitti/database build`). Otherwise API/web tests and type checks see stale exports or Prisma enums.
- The `.lintstagedrc` globs start with `/` and match nothing, so the pre-commit hook does not format code. Run `npx prettier --write <changed files>` yourself before committing.
- Commit bodies go through commitlint: a body line that starts with `word:` is read as a footer token and causes a `footer-leading-blank` warning.

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
- **Deploy to a physical Apple Watch (same prod-URL rules as the iPhone):**
  - `LukiFittiWatch` is embedded in the iOS app (`Watch/` folder via `project.yml`). This is required: without it WatchConnectivity reports `isWatchAppInstalled == false` and never delivers sign-in or workouts. Building `LukiFittiIOS` builds the Watch app too, and installing the iPhone app makes the iPhone push the Watch app to the Watch (can take a minute; check the iPhone's Watch app → LukiFitti if it doesn't arrive). A direct `devicectl` install to the Watch right after fails with CoreDeviceError 3002 while the iPhone is already installing it; that's expected.
  - First time only: the Watch must have **Developer Mode** turned on. The switch (Watch **Settings → Privacy & Security → Developer Mode**) only appears after Xcode has connected to the Watch. To get it, the user selects the Watch in Xcode (**Window → Devices and Simulators**, or as the run destination) with the Watch unlocked, charging and near the Mac, then triggers a build. Turning it on restarts the Watch. While it is not connected, `devicectl` lists the Watch as `unavailable`, and `xcodebuild` reports that the Watch's watchOS "doesn't match" the deployment target (the version is empty).
  - After pairing or a restart, Xcode spends several minutes "Preparing Apple Watch". `xcodebuild` then fails with "Timed out waiting for all destinations…", so retry with `-destination-timeout 60` until it builds.
  - Build: `cd apps/apple && xcodebuild -project LukiFitti.xcodeproj -scheme LukiFittiWatch -configuration Debug -destination 'id=<WATCH_UDID>' -destination-timeout 60 -derivedDataPath build/DerivedData -allowProvisioningUpdates 'LUKIFITTI_API_BASE_URL=https:/$()/luki-fitti.tony-luke.de' build`
  - **After every iPhone install, also install the embedded Watch app directly:** `xcrun devicectl device install app --device <WATCH_UDID> build/DerivedData/Build/Products/Debug-iphoneos/LukiFittiIOS.app/Watch/LukiFittiWatch.app`, then launch it. The iPhone only forwards a new Watch build when `CFBundleVersion` changes, and ours stays at `1`, so otherwise the Watch keeps the old version.
  - The Watch build above is only needed to install the Watch app on its own, without building the iPhone app. Verify and install from `build/DerivedData/Build/Products/Debug-watchos/LukiFittiWatch.app` (check `LUKIFITTI_API_BASE_URL` with PlistBuddy as above). The bundle ID is `$(LUKIFITTI_BUNDLE_ID_PREFIX).app.watchkitapp`: `xcrun devicectl device install app --device <WATCH_UDID> <APP> && xcrun devicectl device process launch --terminate-existing --device <WATCH_UDID> <BUNDLE_ID>`.
  - Sync check: iPhone **Profil → Apple Watch** shows pairing, last send and the last request from the Watch, with a "send now" button. The Watch home screen's **iPhone** section shows the signed-in account, "Synced with iPhone …" or the last error, and a "Sync now" button.
  - WatchConnectivity's application context is limited to about 64 KB. Only sign-in and preferences go there (`WatchAuthPayload`); the full workout data goes as a file transfer.
  - Both apps declare `CFBundleLocalizations` (en, de). Without that, `Locale.current` and system error texts fall back to English even on a German device.
- **Personal-team device installs expire after about 7 days.** When the app stops opening, rebuild and reinstall both the iPhone and Watch apps with the steps above.
- **Device builds talk to the production API.** Features that need new endpoints or migrations only work after the API from `main` is deployed and `yarn db:deploy` has run on the server. To check whether an endpoint is live, call it without a session (`curl -s -o /dev/null -w '%{http_code}' https://luki-fitti.tony-luke.de/api/<path>`): 401 means it is deployed, 404 means it is not.
- **Apple workspace pitfalls:**
  - `LukiFitti.xcodeproj` is generated by xcodegen and is gitignored. After adding Swift files under `LukiFittiIOS`/`LukiFittiWatch`, run `xcodegen generate`. New files in `Packages/LukiFittiKit` need no project change.
  - `LukiFittiDesign/LukiStrings.swift` is a dictionary literal, so a duplicate key crashes the app at runtime. Grep for a key before adding it. `LukiStringsTests` checks that each German string keeps the same `%d`/`%@` placeholders as its English key.
  - Parallel builds or tests need separate `--scratch-path` (SwiftPM) and `-derivedDataPath` (xcodebuild) directories.
  - `LukiFittiStoreTests.BodyWeightStoreTests.testGuestWeighInsStayLocalQueueAndPersist` already fails on `main`, and its crash stops the rest of that suite. Run `--filter LukiFittiDomainTests` to check domain changes.

## Agent Instructions (APM)

- This repository manages agent instructions with [APM](https://microsoft.github.io/apm/) (`apm.yml`). Do not edit generated files directly — they are overwritten on every `apm install` / `apm compile`.
- Always-on rules live in `.claude/rules/` and `AGENTS.md` (repo root).
- All authoring happens in `.apm/` (instructions in `.apm/instructions/*.instructions.md`, skills in `.apm/skills/`). After any change run `apm install && apm compile` and commit `.apm/` sources and generated outputs together.

