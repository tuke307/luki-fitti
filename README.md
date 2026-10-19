# LukiFitti

Offline-first gym workout tracker, progressive overload engine, and stretching studio for **Web (PWA)**, **iPhone (iOS 18+)**, and **Apple Watch (watchOS 11+)**.

---

## Features

- **Offline-First Workout Execution:** Start, pause, swap backup exercises, and log sets without an internet connection on Web (`IndexedDB`) or Apple devices (`LukiFittiStore`).
- **Statistical Progressive Overload:** Blended Epley + Brzycki 1RM estimation, EWMA smoothing, OLS trend slope, and inline set progression suggestions (`+2.5 kg`, `+1 rep`) with Apple Watch Heart Rate Recovery fatigue detection.
- **Native Apple Watch & HealthKit Telemetry:** Standalone and companion watchOS 11 workout execution (`HKWorkoutSession`), 1 Hz optical heart rate curves, active/total calorie tracking, per-set peak & recovery BPM, and iOS 18 Dynamic Island Live Activities.
- **Guided Stretching & Mobility Studio:** Timed stretching routines with transition bells and anatomical start/finish posture illustrations.
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

| Variable | Workspace | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `database`, `api` | PostgreSQL connection URL |
| `REDIS_URL` | `api`, `email-worker` | Redis URL for BullMQ and access-token revocation |
| `JWT_SECRET` | `api`, `web` | Access token signing secret (`>= 32` chars in production) |
| `JWT_REFRESH_SECRET` | `api` | Refresh token signing secret (`>= 32` chars in production) |
| `FRONTEND_URL` | `api` | Allowed CORS origin (default `http://localhost:3000`) |
| `API_PORT` | `api`, `web` | Backend port (default `3001`) |

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

| Command | Description |
| :--- | :--- |
| `yarn dev` | Start development servers across workspaces |
| `yarn build` | Build all packages and applications |
| `yarn test` | Run unit and integration tests (`api`, `web`, and Swift `LukiFittiKit`) |
| `yarn lint` | Run TypeScript and ESLint checks |
| `yarn db:migrate -- <name>` | Create and apply a new Prisma migration |
| `yarn --cwd apps/api openapi:export` | Export Swagger OpenAPI spec to `apps/apple` |

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

