# LukiFitti

Offline-first gym workout tracker, progressive overload engine, and stretching studio for **Web (PWA)**, **iPhone (iOS 26+)**, and **Apple Watch (watchOS 26+)**.

[Download on the App Store](https://apps.apple.com/app/lukifitti/id6831508360) · [Open the web app](https://app.luki-fitti.tony-luke.de)

---

## Features

- **Offline-First Workout Execution:** Start, pause, swap backup exercises, and log sets without an internet connection on Web (`IndexedDB`) or Apple devices (`LukiFittiStore`).
- **Statistical Progressive Overload:** Blended Epley + Brzycki 1RM estimation, EWMA smoothing, OLS trend slope, and inline set progression suggestions (`+2.5 kg`, `+1 rep`) with Apple Watch Heart Rate Recovery fatigue detection.
- **Native Apple Watch & HealthKit Telemetry:** Standalone and companion watchOS 26 workout execution (`HKWorkoutSession`), 1 Hz optical heart rate curves, active/total calorie tracking, per-set peak & recovery BPM, and iOS 26 Dynamic Island Live Activities.
- **Guided Stretching & Mobility Studio:** Timed stretching routines with transition bells and anatomical start/finish posture illustrations.
- **Calorie & Macro Tracking:** Log meals by hand (offline-capable), daily goals, intake vs. estimated workout burn, 7-day trend.
- **Admin Portal & Opt-in AI:** `/admin` for user access and AI settings; AI workout planner and meal-photo and meal-text calorie estimates for everyone with an OpenRouter key. See [docs/admin-ai-nutrition.md](docs/admin-ai-nutrition.md). Roadmap ideas: [docs/possible-features.md](docs/possible-features.md).
- **Bilingual (`EN` / `DE`):** Full English and German interface and exercise search aliases.

---

## Monorepo Structure

```text
luki-fitti/
├── apps/
│   ├── web/            # Next.js 16 + React 19 + Tailwind CSS v4 PWA
│   ├── api/            # NestJS 12 REST API (Express 5, Swagger, Cookie + Bearer Auth)
│   ├── email-worker/   # BullMQ transactional email worker (MJML templates)
│   └── apple/          # Native Swift 6 workspace (iOS 26, watchOS 26, WidgetKit)
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
- **Xcode 26+ / Swift 6.2+** (optional, for building `apps/apple`)

### 2. Environment Setup

Copy the sample environment files in `packages/database`, `apps/api`, `apps/web`, and `apps/email-worker` to `.env.local`:

```bash
cp packages/database/.env.sample packages/database/.env.local
cp apps/api/.env.sample apps/api/.env.local
cp apps/web/.env.sample apps/web/.env.local
cp apps/email-worker/.env.sample apps/email-worker/.env.local
```

| Variable                                                                                                                                | Workspace             | Description                                                                                                        |
| :-------------------------------------------------------------------------------------------------------------------------------------- | :-------------------- | :----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                                          | `database`, `api`     | PostgreSQL connection URL                                                                                          |
| `REDIS_URL`                                                                                                                             | `api`, `email-worker` | Redis URL for BullMQ and access-token revocation                                                                   |
| `JWT_SECRET`                                                                                                                            | `api`, `web`          | Access token signing secret (`>= 32` chars in production)                                                          |
| `JWT_REFRESH_SECRET`                                                                                                                    | `api`                 | Refresh token signing secret (`>= 32` chars in production)                                                         |
| `FRONTEND_URL`                                                                                                                          | `api`                 | Allowed CORS origin — the app host `https://app.luki-fitti.tony-luke.de` (default `http://localhost:3000`)         |
| `API_PORT`                                                                                                                              | `api`, `web`          | Backend port (default `3001`)                                                                                      |
| `UMAMI_URL`                                                                                                                             | `api`                 | Self-hosted Umami base URL (default `https://umami.tony-luke.de`)                                                  |
| `UMAMI_WEBSITE_ID`                                                                                                                      | `api`                 | Umami website ID; pageview forwarding is off when unset or outside production                                      |
| `UMAMI_ALLOWED_HOSTNAMES`                                                                                                               | `api`                 | Comma-separated hostnames to forward pageviews for (default `luki-fitti.tony-luke.de,app.luki-fitti.tony-luke.de`) |
| `APP_STORE_ID`, `APP_STORE_URL` (constants in `lib/site/config.ts`)                                                                     | `web`                 | App Store listing for the landing badge, header Download link and Smart App Banner                                 |
| `NEXT_PUBLIC_SITE_URL`                                                                                                                  | `web`                 | Public app origin baked at build time (`https://app.luki-fitti.tony-luke.de`)                                      |
| `AI_KEY_ENCRYPTION_KEY`                                                                                                                 | `api`                 | 32-byte master key (`openssl rand -base64 32`) encrypting per-user OpenRouter keys; AI stays off when unset        |
| `SEAWEEDFS_ENDPOINT`, `SEAWEEDFS_PORT`, `SEAWEEDFS_USE_SSL`, `SEAWEEDFS_ACCESS_KEY_API`, `SEAWEEDFS_SECRET_KEY_API`, `SEAWEEDFS_BUCKET` | `api`                 | Private SeaweedFS storage for meal photos; optional. `SEAWEEDFS_ENDPOINT` is a host; TLS on 443 is the default     |

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

| Command                              | Description                                                                       |
| :----------------------------------- | :-------------------------------------------------------------------------------- |
| `yarn dev`                           | Start development servers across workspaces                                       |
| `yarn build`                         | Build all packages and applications                                               |
| `yarn test`                          | Run unit and integration tests (`api`, `web`, `common`, and Swift `LukiFittiKit`) |
| `yarn lint`                          | Run TypeScript and ESLint checks                                                  |
| `yarn db:migrate -- <name>`          | Create and apply a new Prisma migration                                           |
| `yarn --cwd apps/api openapi:export` | Export Swagger OpenAPI spec to `apps/apple`                                       |

Releasing: see [docs/release.md](docs/release.md).

---

## Native Apple App (`apps/apple`)

The native iOS 26, watchOS 26, and Dynamic Island Widget targets share business logic via the `LukiFittiKit` Swift Package (`apps/apple/Packages/LukiFittiKit`).

```bash
# Run Swift package unit tests
swift test --package-path apps/apple/Packages/LukiFittiKit

# Generate LukiFitti.xcodeproj via XcodeGen and open in Xcode
cd apps/apple && xcodegen generate && open LukiFitti.xcodeproj

# Pair Apple Watch & iPhone Simulators for WatchConnectivity sync
xcrun simctl pair <WATCH_SIM_UDID> <IPHONE_SIM_UDID>
```

- **Environment Switching:** `Config/Debug.xcconfig` defaults to `http://localhost:3001` and `Config/Release.xcconfig` defaults to `https://app.luki-fitti.tony-luke.de`. You can override the API URL in Xcode under **Edit Scheme (`⌘<`) → Run → Environment Variables → `LUKIFITTI_API_BASE_URL`**.
- **Physical iPhone builds must use the prod URL:** On a real device `localhost` is the phone itself, so a plain Debug build can't reach the API or S3 storage. The scheme environment variable only applies to launches from Xcode, so override the build setting instead.

  ```bash
  cd apps/apple && xcodegen generate
  xcrun devicectl list devices   # pick the "physical" UDID
  xcodebuild -project LukiFitti.xcodeproj -scheme LukiFittiIOS -configuration Debug \
    -destination 'id=<DEVICE_UDID>' -derivedDataPath build/DerivedData -allowProvisioningUpdates \
    'LUKIFITTI_API_BASE_URL=https:/$()/app.luki-fitti.tony-luke.de' build
  APP=build/DerivedData/Build/Products/Debug-iphoneos/LukiFittiIOS.app
  /usr/libexec/PlistBuddy -c 'Print LUKIFITTI_API_BASE_URL' "$APP/Info.plist"   # expect prod URL
  xcrun devicectl device install app --device <DEVICE_UDID> "$APP"
  xcrun devicectl device process launch --terminate-existing --device <DEVICE_UDID> \
    "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")"
  ```

---

## License

LukiFitti is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

The goal of the project is that nobody has to pay a subscription for a workout, progression or
AI meal-tracking app. The license is chosen to protect that:

- **You can** use, study, modify and self-host LukiFitti for free, also commercially.
- **You must** publish the source code of your modified version under the AGPL-3.0 when you
  distribute it (for example as an app) **or** let people use it over a network (for example as a
  hosted service).
- **Nobody can** take the code, close it and sell it as a paid, proprietary fitness app.

### Why not another license?

| License        | Why not                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **MIT**        | Very simple and popular, but allows anyone to fork LukiFitti into a closed-source, paid subscription app as long as the copyright notice is kept.                        |
| **Apache-2.0** | Same as MIT (plus an explicit patent grant): closed-source, paid forks are allowed.                                                                                      |
| **GPL-3.0**    | Protects distributed apps, but a modified server can be run as a paid service without ever sharing the changes, because running a server does not count as distribution. |
| **AGPL-3.0**   | Closes that gap: hosted versions must share their source too. Also used by Mastodon, Nextcloud, Bitwarden (server), Immich and wger.                                     |

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, commit conventions, how to become a contributor
(with access to the KPI dashboard and analytics), and why we collect anonymous usage data.

By contributing you agree that your contributions are licensed under the AGPL-3.0 and may be
shipped in the official LukiFitti builds, including the App Store releases for iPhone and
Apple Watch.
