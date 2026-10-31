# LukiFitti

Offline-first gym workout tracker, progressive overload engine, and stretching studio for **Web (PWA)**, **iPhone (iOS 18+)**, and **Apple Watch (watchOS 11+)**.

---

## Features

- **Offline-First Workout Execution:** Start, pause, swap backup exercises, and log sets without an internet connection on Web (`IndexedDB`) or Apple devices (`LukiFittiStore`).
- **Statistical Progressive Overload:** Blended Epley + Brzycki 1RM estimation, EWMA smoothing, OLS trend slope, and inline set progression suggestions (`+2.5 kg`, `+1 rep`) with Apple Watch Heart Rate Recovery fatigue detection.
- **Native Apple Watch & HealthKit Telemetry:** Standalone and companion watchOS 11 workout execution (`HKWorkoutSession`), 1 Hz optical heart rate curves, active/total calorie tracking, per-set peak & recovery BPM, and iOS 18 Dynamic Island Live Activities.
- **Guided Stretching & Mobility Studio:** Timed stretching routines with transition bells and anatomical start/finish posture illustrations.
- **Calorie & Macro Tracking:** Log meals by hand (offline-capable), daily goals, intake vs. estimated workout burn, 7-day trend.
- **Admin Portal & Opt-in AI:** `/admin` for user access and AI settings; AI workout planner and meal-photo calorie estimates for users an admin grants them to. See [docs/admin-ai-nutrition.md](docs/admin-ai-nutrition.md).
- **Bilingual (`EN` / `DE`):** Full English and German interface and exercise search aliases.

---

## Monorepo Structure

```text
luki-fitti/
├── apps/
│   ├── web/            # Next.js 16 + React 19 + Tailwind CSS v4 PWA
│   ├── api/            # NestJS 12 REST API (Express 5, Swagger, Cookie + Bearer Auth)
│   ├── email-worker/   # BullMQ transactional email worker (MJML templates)
│   └── apple/          # Native Swift 6 workspace (iOS 18, watchOS 11, WidgetKit)
└── packages/
    ├── common/         # Shared Zod schemas, DTOs, enums, starter catalog & 1RM math
    ├── database/       # Prisma 7 PostgreSQL schema, migrations & seed script
    ├── ui/             # Shared Radix UI / shadcn-style accessible components
    └── logger/         # Structured Winston logger
```

---

## Quick Start

### 1. Prerequisites

- **Node.js** `>= 22` and **Yarn** `1.22+`
- **PostgreSQL** and **Redis** (for API & email worker)
- **Xcode 16+ / Swift 6+** (optional, for building `apps/apple`)

### 2. Environment Setup

Copy the sample environment files in `packages/database`, `apps/api`, and `apps/web` to `.env.local`:

```bash
cp packages/database/.env.sample packages/database/.env.local
cp apps/api/.env.sample apps/api/.env.local
cp apps/web/.env.sample apps/web/.env.local
```

| Variable                                                                                                                                | Workspace             | Description                                                                                                    |
| :-------------------------------------------------------------------------------------------------------------------------------------- | :-------------------- | :------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                                          | `database`, `api`     | PostgreSQL connection URL                                                                                      |
| `REDIS_URL`                                                                                                                             | `api`, `email-worker` | Redis URL for BullMQ and access-token revocation                                                               |
| `JWT_SECRET`                                                                                                                            | `api`, `web`          | Access token signing secret (`>= 32` chars in production)                                                      |
| `JWT_REFRESH_SECRET`                                                                                                                    | `api`                 | Refresh token signing secret (`>= 32` chars in production)                                                     |
| `FRONTEND_URL`                                                                                                                          | `api`                 | Allowed CORS origin (default `http://localhost:3000`)                                                          |
| `API_PORT`                                                                                                                              | `api`, `web`          | Backend port (default `3001`)                                                                                  |
| `UMAMI_URL`                                                                                                                             | `api`                 | Self-hosted Umami base URL (default `https://umami.tony-luke.de`)                                              |
| `UMAMI_WEBSITE_ID`                                                                                                                      | `api`                 | Umami website ID; pageview forwarding is off when unset or outside production                                  |
| `UMAMI_ALLOWED_HOSTNAMES`                                                                                                               | `api`                 | Comma-separated hostnames to forward pageviews for (default `luki-fitti.tony-luke.de`)                         |
| `AI_KEY_ENCRYPTION_KEY`                                                                                                                 | `api`                 | 32-byte master key (`openssl rand -base64 32`) encrypting per-user OpenRouter keys; AI stays off when unset    |
| `SEAWEEDFS_ENDPOINT`, `SEAWEEDFS_PORT`, `SEAWEEDFS_USE_SSL`, `SEAWEEDFS_ACCESS_KEY_API`, `SEAWEEDFS_SECRET_KEY_API`, `SEAWEEDFS_BUCKET` | `api`                 | Private SeaweedFS storage for meal photos; optional. `SEAWEEDFS_ENDPOINT` is a host; TLS on 443 is the default |

### 3. Install, Migrate & Run

```bash
yarn install
yarn db:generate
yarn db:deploy
yarn db:seed

# Start development servers
yarn dev
```

---

## Common Scripts

| Command                              | Description                                                             |
| :----------------------------------- | :---------------------------------------------------------------------- |
| `yarn dev`                           | Start development servers across workspaces                             |
| `yarn build`                         | Build all packages and applications                                     |
| `yarn test`                          | Run unit and integration tests (`api`, `web`, and Swift `LukiFittiKit`) |
| `yarn lint`                          | Run TypeScript and ESLint checks                                        |
| `yarn db:migrate -- <name>`          | Create and apply a new Prisma migration                                 |
| `yarn --cwd apps/api openapi:export` | Export Swagger OpenAPI spec to `apps/apple`                             |

---

## Native Apple App (`apps/apple`)

The native iOS 18, watchOS 11, and Dynamic Island Widget targets share business logic via the `LukiFittiKit` Swift Package (`apps/apple/Packages/LukiFittiKit`).

```bash
# Run Swift package unit tests
swift test --package-path apps/apple/Packages/LukiFittiKit

# Generate LukiFitti.xcodeproj via XcodeGen and open in Xcode
cd apps/apple && xcodegen generate && open LukiFitti.xcodeproj

# Pair Apple Watch & iPhone Simulators for WatchConnectivity sync
xcrun simctl pair <WATCH_SIM_UDID> <IPHONE_SIM_UDID>
```

- **Environment Switching:** `Config/Debug.xcconfig` defaults to `http://localhost:3001` and `Config/Release.xcconfig` defaults to `https://luki-fitti.tony-luke.de`. You can override the API URL in Xcode under **Edit Scheme (`⌘<`) → Run → Environment Variables → `LUKIFITTI_API_BASE_URL`**.
- **Physical iPhone builds must use the prod URL:** On a real device `localhost` is the phone itself, so a plain Debug build can't reach the API or S3 storage. The scheme environment variable only applies to launches from Xcode, so override the build setting instead. Don't switch to Release for personal-team builds, because it resets the bundle ID prefix from `Local.xcconfig`.

  ```bash
  cd apps/apple && xcodegen generate
  xcrun devicectl list devices   # pick the "physical" UDID
  xcodebuild -project LukiFitti.xcodeproj -scheme LukiFittiIOS -configuration Debug \
    -destination 'id=<DEVICE_UDID>' -derivedDataPath build/DerivedData -allowProvisioningUpdates \
    'LUKIFITTI_API_BASE_URL=https:/$()/luki-fitti.tony-luke.de' build
  APP=build/DerivedData/Build/Products/Debug-iphoneos/LukiFittiIOS.app
  /usr/libexec/PlistBuddy -c 'Print LUKIFITTI_API_BASE_URL' "$APP/Info.plist"   # expect prod URL
  xcrun devicectl device install app --device <DEVICE_UDID> "$APP"
  xcrun devicectl device process launch --terminate-existing --device <DEVICE_UDID> \
    "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
  ```
