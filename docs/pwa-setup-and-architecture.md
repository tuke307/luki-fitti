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
