# Admin portal, calorie tracking & AI features

## Roles and access

There is no separate staff table: admin rights are fields on `User`.

| Field                | Values                                                 | Meaning                               |
| :------------------- | :----------------------------------------------------- | :------------------------------------ |
| `User.permissions`   | `DASHBOARD_VIEW`, `USERS_MANAGE`, `AI_SETTINGS_MANAGE` | Admin portal access (any-of per page) |
| `User.featureGrants` | `AI_WORKOUT_BUILDER`, `AI_MEAL_PHOTO`                  | Opt-in features for this user         |

- Both are re-read from the database on every request by `AuthGuard`; the JWT never carries them,
  so revoking access is immediate.
- `PermissionsGuard` and `FeatureGuard` are deny-by-default: a route without
  `@RequirePermissions(...)` / `@RequireFeature(...)` metadata is rejected.
- There is **no global OpenRouter key**. Each user needs a key: their own (USER slot, set in the
  profile) or one an admin assigned (ADMIN slot, Admin → Users). The own key wins.
- With an **own key** every AI feature whose global switch in `AppSettings` is on is active — no
  grant needed and no daily limit (the user pays OpenRouter directly).
- With only an **admin-assigned key** a feature needs the grant and the global switch, and the
  daily run limit applies.
- `/auth/me` returns the resulting `features` list; clients only show AI entry points for
  features in that list. `GET /api/ai/key` returns the key status (never the key).
- Keys are stored AES-256-GCM encrypted (`UserAiKey`, random IV, auth tag, AAD
  `${userId}:${slot}`) with the master key `AI_KEY_ENCRYPTION_KEY`; only the last 4 characters
  are shown. Users see whether an admin key is assigned; admins see whether an own key exists.
- Admins cannot remove their own `USERS_MANAGE` permission (prevents lock-out).

Locally, `yarn db:seed` upserts the accounts in `packages/database/data/users.jsonc` with all
admin permissions, feature grants and the starter templates (skipped when `NODE_ENV=production`).

The portal lives at `/admin` in the web app (Overview, Users, AI). `proxy.ts` bounces visitors
without a session to `/login?redirect=…`; authorization itself is always enforced by the API.

## Calorie tracking (everyone)

- `MealEntry` (meal type, optional label, time) with `MealItem`s (grams, kcal, protein, carbs,
  fat, optional fiber/sugar, `source` MANUAL | AI, `confidence`).
- `PUT /api/nutrition/entries` is an idempotent upsert keyed by `clientEntryId`, so web
  (IndexedDB outbox) and iOS (`NutritionStore` outbox) can queue changes offline and replay them.
- `GET /api/nutrition/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Europe/Berlin` buckets intake and
  burn by local day.
- Goals and body metrics live on `UserPreferences` (`dailyKcalGoal`, `proteinGoalG`, …,
  `bodyWeightKg`, `heightCm`, `birthYear`, `sex`). "Suggest" uses Mifflin–St Jeor × 1.4 and
  1.8 g protein per kg.

### Calories burned per workout

`estimateWorkoutEnergy` (`packages/common/src/utils/energy.util.ts`, Swift port in
`NutritionMath`) is stored on `WorkoutSession.estimatedCaloriesKcal` on every sync:

1. HealthKit active energy when the workout was recorded with an Apple Watch.
2. Otherwise `(MET − 1) × body weight (kg) × hours`. Strength MET scales from 3.5 to 6.0 with
   working sets per minute, stretching is 2.3, cardio uses speed when distance is logged.
   Subtracting 1 MET keeps it comparable to "active energy" (no double-counted BMR).
3. Without a body weight, 75 kg is used and the UI asks for the real value.

## AI harness

`apps/api/src/modules/ai/`:

- `openrouter.client.ts`: OpenAI-compatible chat calls via OpenRouter with `models[]` fallbacks.
  Upstream errors are logged, never returned to clients.
- `harness/agent-runner.service.ts`: a generic tool-calling loop. The model may call the skill's
  tools (inputs validated with Zod, user id always taken from the session) and must finish by
  calling the skill's answer tool. The answer is schema-validated, and errors are fed back for
  self-correction. The answer is forced on the last step. Every run is metered in `AiRun`
  (tokens, cost, duration, error code) without prompt or photo content. The daily run limit is
  enforced per user.
- `skills/*.skill.ts`: system prompt, allowed tools, output schema, model selection. New AI
  features are new skills.

### Skill `workout-builder`

Tools (`tools/training.tools.ts`):

| Tool                                        | Purpose                                                                                |
| :------------------------------------------ | :------------------------------------------------------------------------------------- |
| `get_user_profile`                          | Units, rest, saved workouts, equipment actually used                                   |
| `get_exercise_feedback`                     | Exercises marked as not working / painful / disliked, often skipped, often swapped out |
| `get_weak_points`                           | Under-trained muscles and stalled lifts (`classifyExerciseStall`)                      |
| `get_training_history`                      | Sets per muscle, top exercises with trend, recent workouts                             |
| `search_exercises` / `get_exercise_details` | Catalog search (EN/DE) and alternatives                                                |

Exercise ids in the proposal are resolved against the catalog. Unknown ids are dropped and
reported in `droppedExerciseIds`. The proposal is only a preview; the user saves it as a normal
workout.

### Skill `meal-analyzer`

`POST /api/ai/meal-analysis` (multipart: `photos[]` up to 5 × 8 MB, `clientEntryId`, `eatenAt`,
optional `mealType`, `hint`):

- Uploads are checked by magic bytes (JPEG/PNG/WebP), then re-encoded with `sharp` to a ≤1600 px
  JPEG. This strips EXIF data, including GPS location. Clients also downscale and convert HEIC
  before uploading.
- Photos are stored in a private S3 bucket under server-generated keys and are only served
  through `GET /api/nutrition/photos/:id` after an ownership check. They are deleted with the
  meal, and optionally after `AppSettings.mealPhotoRetentionDays`.
- kcal that deviates > 25 % from the 4/4/9 macro value is replaced by the macro value. AI items
  replace earlier AI items on the entry; manual items are kept.
- Without storage configured, photos are analysed but not kept.

## Configuration

| Variable                                                                                                                                | Description                                         |
| :-------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------- |
| `AI_KEY_ENCRYPTION_KEY`                                                                                                                 | 32-byte master key for per-user OpenRouter keys (`openssl rand -base64 32`); AI is off without it |
| `AI_KEY_ENCRYPTION_KEY_PREVIOUS` / `AI_KEY_ENCRYPTION_KEY_VERSION`                                                                      | Rotation: old key + bumped version; keys are re-encrypted lazily |
| `OPENROUTER_BASE_URL` / `OPENROUTER_TIMEOUT_MS`                                                                                         | Optional overrides (https only outside local tests) |
| `SEAWEEDFS_ENDPOINT`, `SEAWEEDFS_PORT`, `SEAWEEDFS_USE_SSL`, `SEAWEEDFS_ACCESS_KEY_API`, `SEAWEEDFS_SECRET_KEY_API`, `SEAWEEDFS_BUCKET` | Meal photo storage (same names as kds/marienmuehle) |

Models, switches, daily limit and photo retention are edited in **Admin → AI** (stored in
`AppSettings`). Defaults: `openai/gpt-6.1-terra` for the workout builder and
`google/gemini-3.8-flash` for meal photos, each with the other as fallback.

In production, SeaweedFS runs as its own Coolify resource. Create the `luki-fitti-meal-photos`
bucket and an S3 user with access to it there, then set `SEAWEEDFS_ENDPOINT` to its host (e.g.
`s3.tony-luke.de`; TLS on port 443 is the default) and put that user's keys into
`SEAWEEDFS_ACCESS_KEY_API` / `SEAWEEDFS_SECRET_KEY_API`.

For local dev (`compose.dev.yml`, same layout as kds/marienmuehle), copy the sample to
`~/seaweedfs/luki-fitti/config/s3.json`. The S3 API is then at `http://localhost:8335` and the
SeaweedFS admin UI at `http://localhost:23648`.
