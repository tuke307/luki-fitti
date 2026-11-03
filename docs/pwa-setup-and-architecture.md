# iOS Installation & Platform Modes (PWA vs. Native Apple App)

LukiFitti supports two complementary ways to train on iPhone and Apple Watch against the same `@luki-fitti/api` backend.

---

## 1. Native iPhone + Apple Watch App (`apps/apple`)

Built with **Swift 6**, **SwiftUI**, **HealthKit**, **ActivityKit**, and **WatchConnectivity**:

- **iPhone (`LukiFittiIOS`):** Full offline-first workout tracker with Dynamic Island & Lock Screen Live Activities (`LukiFittiWidgets`) and Keychain-backed Bearer authentication.
- **Apple Watch (`LukiFittiWatch`):** Standalone and companion wrist execution with 1 Hz optical Heart Rate streaming, Active/Total KCal ring credit, per-set peak & recovery BPM capture, and a 3-page workout interface designed for quick glances between sets.

To generate the Xcode project:

```bash
cd apps/apple
xcodegen generate
open LukiFitti.xcodeproj
```

---

## 2. iOS Safari Home Screen PWA (`apps/web`)

For zero-install or cross-platform use without Xcode signing:

1. Open your LukiFitti URL in **Safari** on iPhone.
2. Tap **Share** → **Add to Home Screen**.
3. Launch LukiFitti from the Home Screen for a standalone full-screen viewport (`viewport-fit=cover`) with IndexedDB offline persistence and timestamp-backed rest timers.

> **Note:** When using the Safari PWA in offline or guest mode, avoid clearing Safari Website Data while unsynchronized workouts are queued locally.

---

## Domain cutover: app.luki-fitti.tony-luke.de

The marketing site lives on `luki-fitti.tony-luke.de` and the PWA moved to
`app.luki-fitti.tony-luke.de`. Both hosts route to the same web container; `proxy.ts` splits
requests by host (`SITE_HOSTNAMES` / `APP_ORIGIN`), `/api/*` stays reachable on the old host so
installed iOS builds keep syncing.

Cutover order:

1. Deploy a web release **on the old host** that flushes the sync outbox, so nothing
   unsent is left behind.
2. Switch DNS/Caddy: `app.luki-fitti.tony-luke.de` → the server (new A/AAAA record, Caddy issues
   the cert automatically once it resolves).
3. Users open the app once on the new host and sign in again (host-only cookies).

**Offline data caveat:** IndexedDB is per-origin — anything stored in the browser under the old
origin does not carry over. An installed PWA launched on the old origin is bounced to the new
one by the standalone-mode check on the landing page, but it cannot bring its IndexedDB with it.
