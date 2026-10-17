# iPhone & Safari Home Screen Installation Guide and PWA vs Native Architecture Trade-offs

## iPhone & Safari Home Screen Installation Guide

1. **Open in Safari on iPhone:** Navigate to your LukiFitti URL in iOS Safari.
2. **Add to Home Screen:** Tap the Safari **Share** icon in the bottom bar and select **Add to Home Screen**.
3. **Standalone Full-Screen Launch:** Launch LukiFitti from your Home Screen — it runs in standalone mode without browser chrome, respecting the iPhone Dynamic Island and Home Indicator safe areas (`viewport-fit=cover`).
4. **Offline Data Warning:** Active workouts are stored in IndexedDB (`luki_fitti_offline_v1`). Avoid clearing Safari Website Data or deleting the Home Screen web app bookmark while offline with unsynchronized sessions.

---

## PWA vs Native Architecture Trade-offs

- **Option A — Pure PWA (Implemented):**
  - Zero Apple Developer Program cost ($99/yr saved) and no 7-day Personal Team Xcode signing expiry.
  - Single unified Next.js + NestJS TypeScript codebase with instant over-the-air updates.
  - Full offline workout execution via IndexedDB, service worker caching, and timestamp-backed rest timers (`restTimerEndsAt`) that survive iOS screen locks and background tab suspension.
  - Trade-off: iOS Safari does not expose direct HealthKit write APIs or a standalone watchOS app.
- **Option B — Native iOS Bridge:**
  - Can write workouts directly to Apple HealthKit while wrapping the web UI.
  - Trade-off: Requires Xcode signing and expires every 7 days on a free Apple Personal Team without a paid Apple Developer Program membership.
- **Option C — Full SwiftUI iOS + watchOS:**
  - Best for standalone Apple Watch wrist controls (`HKWorkoutSession` + `WatchConnectivity`).
  - Trade-off: Requires maintaining a separate Swift codebase and paid developer signing. Reserved as a future native companion against the same NestJS API (`/api/sessions/sync`, `/api/workouts`).
