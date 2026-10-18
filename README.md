# LukiFitti (`luki-fitti`) — Personal Gym & Workout Management PWA

LukiFitti is an installable, offline-first Progressive Web App (PWA) for personal gym workout planning, active session execution, stretching & mobility flows, progress analytics, and Gymlife / Apple Health data migration.

## 1. Architecture & Monorepo Structure

- `apps/web` (`@luki-fitti/web`) — Next.js 16 (App Router) + React 19 + Tailwind CSS v4 PWA optimized for iPhone & Safari (`manifest.ts`, `public/sw.js`, IndexedDB offline workout engine `lib/offline/offline-store.ts`).
- `apps/api` (`@luki-fitti/api`) — NestJS 12 REST API (Express 5) with Swagger/OpenAPI (`/api-docs`), Zod validation pipes, HTTP-only JWT + CSRF protection, brute-force account lockout, and idempotent offline session synchronization.
- `packages/database` (`@luki-fitti/database`) — Prisma 7 PostgreSQL schema, SQL migrations, and seed script (`src/seed.ts`).
- `packages/common` (`@luki-fitti/common`) — Shared Zod schemas, TypeScript DTOs, enums, and initial exercise catalog (`INITIAL_EXERCISE_CATALOG`, `DEFAULT_STARTER_TEMPLATES`, `DEFAULT_STRETCHING_ROUTINES`).
- `packages/ui` (`@luki-fitti/ui`) — Shared Radix UI / shadcn-style accessible component primitives and design tokens.
- `packages/logger` (`@luki-fitti/logger`) — Structured Winston logger.

---

## 2. Environment Variables & Setup

Copy the `.env.sample` files in `packages/database`, `apps/api`, and `apps/web` to `.env.local` (never commit `.env*.local` files):

| Variable | Package | Description |
|---|---|---|
| `DATABASE_URL` | `database`, `api` | PostgreSQL connection string (e.g., `postgresql://postgres:postgres@localhost:5436/luki_fitti`) |
| `API_PORT` | `api`, `web` | NestJS API port (default `3001`) |
| `JWT_SECRET` | `api`, `web` | High-entropy secret (≥ 32 chars in production) for access token signing |
| `JWT_REFRESH_SECRET` | `api` | High-entropy secret (≥ 32 chars in production) for refresh token rotation |
| `BCRYPT_SALT_ROUNDS` | `api` | Bcrypt cost factor (default `10`) |
| `REDIS_URL` | `api` | Redis connection URL for access-token logout denylist |
| `FRONTEND_URL` | `api` | Allowed CORS origin (default `http://localhost:3000`) |
| `NEXT_PUBLIC_SITE_URL` | `web` | Public canonical URL |

### Commands

```bash
# Build all packages & apps
yarn run build

# Start development servers
yarn run dev

# Run unit & service tests across API and Web
yarn run test

# Lint all workspaces
yarn run lint

# Database operations
yarn run db:generate
yarn run db:migrate -- <migration_name>
yarn run db:deploy
yarn run db:seed
```

---

## 3. Offline-First Workout Execution & Synchronization

1. **Pre-Session Caching:** The Exercise Catalog, Workout Folders/Templates, and Stretching Routines are cached in IndexedDB (`luki_fitti_offline_v1`) so workouts can be started and executed without connectivity.
2. **Incremental Persistence:** Every set completion, weight/rep change, rest timer adjustment, exercise skip, or backup exercise substitution writes immediately to IndexedDB (`active_workout_session` + `sync_queue`).
3. **Timestamp-Backed Rest Timers:** iOS suspends background JavaScript timers when Safari is backgrounded or the iPhone screen locks. LukiFitti persists `restTimerEndsAt` (ISO timestamp) and `restTimerPausedRemSec` and computes remaining seconds from `Date.now()`, ensuring accurate recovery after reloads or screen lock.
4. **Idempotent Sync & Conflict Resolution:** Every session, exercise, and set carries a client-generated UUID (`clientSessionId`, `clientExerciseId`, `clientSetId`) and optimistic version counter (`version`). Repeated sync requests never create duplicate sessions or sets, and server version conflicts prompt explicit user resolution.
5. **Browser Storage Warning:** Local browser storage (IndexedDB) is an offline recovery mechanism, not a substitute for server backups. Avoid clearing Safari Website Data or deleting the Home Screen bookmark while offline with unsynchronized sessions.

---

## 4. Exercise Catalog, Visual Demonstrations & Gymlife Migration Notes

- **4-Layer Exercise Visual & Media Architecture (`packages/common/src/catalog/index.ts` & `apps/web/components/gym/exercise-visual.tsx`):**
  1. **Public-Domain Start/Finish Frames (`free-exercise-db`):** Public commercial fitness sites restrict automated scraping. Instead, `resolveExerciseMedia()` maps all built-in exercises (including 20 stretching & mobility drills) and all 85 imported Gymlife exercises (`gymlife-*` slugs and EN/DE keyword matching) to the public-domain [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db) dataset (`Unlicense`), loading `0.jpg` (Start Position) and `1.jpg` (Peak Contraction / Finish Position) from GitHub's CDN.
  2. **Animated 2-Frame Motion Loop:** `<ExerciseVisual />` displays Start and Finish frames side-by-side on catalog cards and runs a `1.1s` animated loop (GIF-style motion preview) inside the Exercise Detail modal without requiring heavy video files.
  3. **Offline Vector Anatomical Muscle Map (`MuscleAnatomySvg`):** Pure inline front-and-back SVG body diagram highlighting primary muscles in lime (`#CCFF00`) and secondary muscles in cyan (`#00E5FF`), serving as both an anatomy reference and a 100% offline fallback if images are not cached.
  4. **Custom Image/GIF URLs & External Video Links:** Custom exercises support an optional direct Image/GIF URL (`ExerciseMedia` table), and every exercise detail modal includes one-tap external links to **YouTube** form tutorials and **MuscleWiki** GIF guides.
- **Gymlife Migration & Full Gym Data Export:**
  - **Import:** LukiFitti's Import Wizard (`POST /api/import/preview` & `POST /api/import/commit`) and SQL migration scripts (`gymlife-extracted/`) import Gymlife SQLite/CSV/JSON and Apple Health exports with duplicate detection and exercise mapping.
  - **Export:** When signed in, **Profile & Preferences → Export Gym Data** exports a complete JSON backup (`luki-fitti-backup-YYYY-MM-DD.json`) or a spreadsheet-compatible workout log CSV (`luki-fitti-workouts-YYYY-MM-DD.csv`).

---

## 5. iPhone & Safari Home Screen Installation Guide & Architectural Trade-Offs (PWA vs. Native)

See [`docs/pwa-setup-and-architecture.md`](./docs/pwa-setup-and-architecture.md) for the complete guide.

### iPhone & Safari Home Screen Installation Guide

1. **Open in Safari on iPhone:** Navigate to your LukiFitti URL in iOS Safari.
2. **Add to Home Screen:** Tap the Safari **Share** icon in the bottom bar and select **Add to Home Screen**.
3. **Standalone Full-Screen Launch:** Launch LukiFitti from your Home Screen — it runs in standalone mode without browser chrome, respecting the iPhone Dynamic Island and Home Indicator safe areas.
4. **Offline Data Warning:** Active workouts are stored in IndexedDB. Avoid clearing Safari Website Data while offline with unsynchronized sessions.

### PWA vs Native Architecture Trade-offs

- **Option A — Pure PWA (Implemented Primary Architecture):**
  - *Advantages:* Zero Apple Developer Program cost ($99/yr saved), no 7-day Personal Team Xcode signing expiry, single unified TypeScript codebase, instant updates, and full offline gym execution via IndexedDB.
  - *Disadvantages:* Safari does not expose direct HealthKit write APIs or a standalone watchOS app.
- **Option B — PWA + Native iOS Bridge:**
  - *Advantages:* Can bridge HealthKit workout writes while reusing the web UI.
  - *Disadvantages:* Still subject to 7-day signing expiry on a free Personal Team and does not provide a true standalone Apple Watch app.
- **Option C — Full Native SwiftUI iOS + watchOS Companion:**
  - *Advantages:* Best native Apple Watch wrist controls (`HKWorkoutSession` + `WatchConnectivity`).
  - *Disadvantages:* Separate Swift codebase and paid Apple Developer membership required for long-lived distribution. The NestJS REST API (`/api/sessions/sync`, `/api/workouts`) is designed so a future SwiftUI watchOS client can sync against the exact same endpoints.

---

## 6. Database Backup & Restoration

```bash
# Backup PostgreSQL database
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="luki-fitti-backup-$(date +%F).dump"

# Restore PostgreSQL database
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "luki-fitti-backup-YYYY-MM-DD.dump"
```

---

## 7. Manual iPhone & Safari Test Checklist

- [ ] Open LukiFitti in iOS Safari → tap **Share** → **Add to Home Screen**.
- [ ] Launch LukiFitti from the iPhone Home Screen and verify standalone full-screen mode (no Safari URL bar) and safe-area padding around the Dynamic Island and Home Indicator.
- [ ] Register a new account (or sign in) and verify the `4er Split (Hypertrophy)` folder and 4 workout templates appear.
- [ ] Start **Day 1 — Chest & Triceps**, log a working set, and verify the rest timer starts automatically.
- [ ] Lock the iPhone screen for 20 seconds or reload the app, then return and verify the active session and rest timer countdown recover accurately.
- [ ] Enable Airplane Mode on the iPhone, log 2 more sets, swap an exercise with its configured backup alternative, and finish the workout.
- [ ] Disable Airplane Mode and verify the status indicator transitions from `Offline` / `Saved Locally` to `Synced` and the workout appears in the **Diary** without duplicates.
