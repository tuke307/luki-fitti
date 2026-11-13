# PR 1 — Social foundation (implementation spec)

Part of [social-2.0.md](social-2.0.md). Branch `feat/social-1-foundation`, stacked on
`feat/social-2.0`. Work is done in three parts on the same branch: **A backend**, **B web**,
**C iOS**. Tick items here as they land.

## Progress

- [x] A — DB, common, API (`social`, `push`, `notifications`, admin), email-worker push processor
- [x] B — Web: social tab, onboarding, profile, friends, invites, contact picker, Web Push, admin
- [ ] C — iOS: social feature, APNs, contacts, invite universal link, entitlements
- [ ] `PRODUCT.md` tone update, privacy policy draft (`docs/privacy-social.md`)
- [ ] Security review + dependency vetting, PR opened

## Naming note

`apps/api/src/modules/activity` already exists (Apple Health import). The in-app inbox is
therefore called **notifications** (`Notification` model, `/notifications` routes).

## A — Backend

### Prisma (`packages/database/prisma/schema.prisma`, one migration `social_foundation`)

```prisma
enum FriendshipStatus { PENDING ACCEPTED }
enum PushPlatform { APNS WEBPUSH }
enum ReportReason { SPAM HARASSMENT INAPPROPRIATE_NAME INAPPROPRIATE_AVATAR OTHER }
enum ReportStatus { OPEN RESOLVED DISMISSED }
enum NotificationKind { FRIEND_REQUEST FRIEND_ACCEPTED }

// User additions
handle              String?   @unique   // stored lowercase
handleChangedAt     DateTime?
avatarKey           String?
avatarUpdatedAt     DateTime?
emailLookupHash     String?   @unique   // sha256 hex of lower(trim(email))
discoverableByEmail Boolean   @default(true)
socialPaused        Boolean   @default(false)

// UserPreferences addition
pushFriends Boolean @default(true)

// AppSettings additions
socialEnabled     Boolean  @default(false)
socialBetaUserIds String[] @default([])

model Friendship   { id, userAId, userBId (userAId < userBId), requestedById, status,
                     createdAt, acceptedAt?; @@unique([userAId, userBId]); @@index([userBId]) }
model FriendInvite { id, tokenHash @unique, createdById, expiresAt, maxUses @default(20),
                     uses @default(0), createdAt; @@index([createdById]) }
model UserBlock    { id, blockerId, blockedId, createdAt; @@unique([blockerId, blockedId]);
                     @@index([blockedId]) }
model UserReport   { id, reporterId, reportedId, reason, details String? (≤ 500),
                     handleSnapshot?, nameSnapshot?, avatarKeySnapshot?, status @default(OPEN),
                     createdAt, resolvedAt?, resolvedById?; @@index([status, createdAt]) }
model PushDevice   { id, userId, platform, token @unique (APNs hex token or Web Push endpoint),
                     p256dh?, auth?, apnsSandbox Boolean @default(false), locale, timeZone,
                     lastSeenAt, createdAt; @@index([userId]) }
model Notification { id, userId, kind, actorId?, payload Json, readAt?, createdAt;
                     @@index([userId, createdAt]) }
```

All user relations `onDelete: Cascade` (account deletion removes everything social). The
migration backfills `emailLookupHash = encode(sha256(convert_to(lower(trim(email)), 'UTF8')),
'hex')`; registration sets it for new users (shared helper `emailLookupHash(email)` in
`@luki-fitti/common` utils, used by API and clients).

### Common (`packages/common`)

- `schemas/social.schemas.ts` (zod + DTO types), exported from `schemas/index.ts`.
- `utils/social.util.ts`: `normalizeHandle`, `HANDLE_REGEX = /^[a-z0-9_]{3,20}$/`,
  `RESERVED_HANDLES`, `isHandleAllowed` (reserved + small EN/DE profanity list, substring match),
  `HANDLE_CHANGE_COOLDOWN_DAYS = 30`, `normalizeEmailForLookup`, `emailLookupHash` (SHA-256
  hex; must work in Node and the browser → use `@noble/hashes` only if already present,
  otherwise Node `crypto` on the server and `SubtleCrypto` on the web; document identical
  output with a shared test vector).
- `push-messages.ts`: EN/DE title/body per `NotificationKind` (`{actor}` placeholder).
- Unit tests for handle rules and the hash test vector.

### API (`apps/api/src/modules/`)

Access rule: `SocialAccessService.isEnabledFor(userId)` = `settings.socialEnabled &&
(socialBetaUserIds.length === 0 || socialBetaUserIds.includes(userId))`. A `SocialEnabledGuard`
returns 403 otherwise. All social routes: `AuthGuard` + `SocialEnabledGuard`; mutations also
`CsrfGuard` (same pattern as `progress.controller.ts`). `/auth/me` gains
`social: { enabled: boolean; handle: string | null }`.

Relation resolver (deny by default): `relation(viewerId, targetId)` →
`SELF | FRIEND | INCOMING | OUTGOING | NONE | BLOCKED` (blocked in either direction).
`BLOCKED` → 404 everywhere. Public card for `NONE/INCOMING/OUTGOING`: `{ userId, handle,
avatarUrl }`. `FRIEND`/`SELF` add `name`. Users without a handle are invisible to others.

**`social` module**

| Route                                                      | Notes                                                                                                                                                                                                                                  |
| :--------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /social/me`                                           | `{ handle, name, avatarUrl, discoverableByEmail, socialPaused, handleChangeAvailableAt }`                                                                                                                                              |
| `PATCH /social/me`                                         | `handle?, name? (1–40), discoverableByEmail?, socialPaused?`; handle rules + cooldown (first set exempt); 409 when taken                                                                                                               |
| `GET /social/handles/:handle/availability`                 | `{ available, reason? }`, throttled 30/min                                                                                                                                                                                             |
| `PUT /social/me/avatar`                                    | multipart `avatar`, ≤ 2 MB, `detectImageType` + `normalizeImage`, square 512 px JPEG, EXIF stripped, key `avatars/<userId>/<uuid>.jpg`, old object deleted                                                                             |
| `DELETE /social/me/avatar`                                 |                                                                                                                                                                                                                                        |
| `GET /social/avatars/:userId`                              | streams JPEG unless BLOCKED/no handle; `Cache-Control: private, max-age=86400`; `avatarUrl` includes `?v=<avatarUpdatedAt ms>`                                                                                                         |
| `GET /social/users/:handle`                                | card + `relation`                                                                                                                                                                                                                      |
| `GET /social/search?q=`                                    | handle prefix, `q` ≥ 2 chars, ≤ 20 results, excludes self/blocked/no handle; throttled 30/min                                                                                                                                          |
| `GET /social/friends`                                      | `{ friends, incoming, outgoing }`                                                                                                                                                                                                      |
| `POST /social/friends/requests`                            | `{ userId }`; reverse pending → auto-accept; ≤ 20 new requests per user per 24 h (Redis counter via `getRedis()`), ≤ 500 friends; notifies target (`FRIEND_REQUEST`)                                                                   |
| `POST /social/friends/requests/:userId/accept`             | notifies requester (`FRIEND_ACCEPTED`)                                                                                                                                                                                                 |
| `POST /social/friends/requests/:userId/decline`            | silent                                                                                                                                                                                                                                 |
| `DELETE /social/friends/:userId`                           | unfriend or cancel outgoing; silent                                                                                                                                                                                                    |
| `POST /social/invites`                                     | random 32-byte base64url token, store SHA-256 only, 7-day expiry; returns `{ url: FRONTEND_URL + /invite/<token>, expiresAt }`                                                                                                         |
| `GET /social/invites/:token`                               | preview card of the inviter (404 if expired/used up/blocked)                                                                                                                                                                           |
| `POST /social/invites/:token/accept`                       | creates ACCEPTED friendship (invite = inviter's consent), increments `uses`; self → 400                                                                                                                                                |
| `POST /social/contacts/match`                              | `{ hashes: string[] }` (1–2000, `/^[0-9a-f]{64}$/`, deduped); ≤ 5 calls per user per 24 h (Redis); returns cards + relation for users with `discoverableByEmail`, a handle, not self, not blocked; **never log or persist the hashes** |
| `GET/POST /social/blocks`, `DELETE /social/blocks/:userId` | block removes friendship/requests in the same transaction                                                                                                                                                                              |
| `POST /social/reports`                                     | `{ userId, reason, details? }`, snapshots handle/name/avatarKey, ≤ 10/day                                                                                                                                                              |

**`push` module**

| Route                         | Notes                                                                                                                      |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `GET /push/config`            | `{ webPushPublicKey: string \| null, apnsConfigured: boolean }`                                                            |
| `PUT /push/devices`           | upsert by `token` (moves token to the current user), `{ platform, token, p256dh?, auth?, apnsSandbox?, locale, timeZone }` |
| `DELETE /push/devices`        | `{ token }` (own devices only)                                                                                             |
| `GET/PATCH /push/preferences` | `{ friends: boolean }`                                                                                                     |

`NotificationService.notify(userId, kind, actorId, payload)`: inserts `Notification`, then
if the category preference allows it, enqueues a BullMQ `push` job `{ notificationId }`.
Quiet hours 22:00–08:00 in the newest device's `timeZone` → job delayed to 08:00 local.

**`notifications` module**: `GET /notifications?cursor=&limit=` → `{ items, unreadCount,
nextCursor }` (items resolve actor cards, BLOCKED actors dropped); `POST /notifications/read`
`{ ids?: string[]; all?: boolean }`.

**Admin**: `GET/PUT /admin/settings/social` `{ socialEnabled, socialBetaUserIds }`;
`GET /admin/reports?status=`; `PATCH /admin/reports/:id` `{ status, action?: 'CLEAR_AVATAR' |
'RESET_HANDLE' }` (same permission model as the existing admin routes).

### Push delivery (`apps/email-worker`)

- `BullMQService`: second queue `push` (`addPushJob`, `startPushWorker`), 3 attempts.
- `PushSenderService` in `apps/api/src/modules/push/push-sender.service.ts`, exported via
  `apps/api/package.json` `exports` (`./services/push-sender.service`) like the email service;
  the worker starts both processors.
- **APNs:** Node `http2` + ES256 JWT via the existing `jsonwebtoken` dependency (token cached
  50 min), `api.push.apple.com` / `api.sandbox.push.apple.com` per device, topic
  `APNS_BUNDLE_ID`. **Web Push:** `web-push` package (new; pin exact version, vet first).
- Env (all optional; channel disabled + one warning log when missing): `APNS_KEY_P8_BASE64`,
  `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`. Add to `.env.sample` files and `compose*.yml` with empty defaults.
- Message text from `push-messages.ts` by device `locale`; payload carries `{ kind,
notificationId, url }` for deep links. APNs 410 / `BadDeviceToken` and Web Push 404/410
  delete the device row.

### Tests (node test runner, existing `*.spec.ts` style)

Relation resolver and visibility (incl. blocked → 404), handle rules + cooldown, request
auto-accept, invite expiry/max uses/self, contact match (discoverable filter, blocked
excluded, hashes not persisted), report snapshot, access guard (off / beta list), quiet-hour
delay calculation, push sender dead-token cleanup (mocked transports).

## B — Web (after A)

Social tab in `pwa-shell.tsx` only when `me.social.enabled`; onboarding sheet when enabled and
`handle` is null (dismissable, reachable again from the tab); profile editor (handle with live
availability, name, avatar upload/remove, find-me-by-email, pause); friends list with incoming/
outgoing; search; invite link (copy/share) + QR; `/invite/[token]` page (signed out → sign
in/up then accept); contact picker where `navigator.contacts` exists; notifications inbox with
unread badge; Web Push subscribe in settings (`public/sw.js` `push` + `notificationclick`);
block/report sheets; admin portal page for social settings and the report queue. EN/DE
strings. Playwright e2e: two users become friends via search and via invite link.

## C — iOS (after A)

`Features/Social/` (tab hidden unless enabled), onboarding, profile editor (PhotosPicker
avatar), friends, search, invite share sheet + CoreImage QR, contact sync (`CNContactStore`,
`NSContactsUsageDescription` EN/DE, hash on device), notifications inbox, block/report.
APNs: `aps-environment` entitlement, `registerForRemoteNotifications`, token upload with
`apnsSandbox` for Debug builds, tap handling in `LukiNotificationCenterDelegate`. Invite
universal links: `com.apple.developer.associated-domains` (`applinks:` prod host) and an
`apple-app-site-association` route on the web (team id from env). DTOs + API client in
`LukiFittiKit`. EN/DE strings in `LukiStrings.swift` (grep for duplicates).

**User action needed before C ships:** enable _Push Notifications_ and _Associated Domains_
for the App ID in the Apple developer portal so signing in `app-store.yaml` keeps working.
