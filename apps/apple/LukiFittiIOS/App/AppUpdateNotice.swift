import SwiftUI
import LukiFittiDomain
import LukiFittiDesign

/// Soft "new App Store version" alert attached at the app root. Best-effort: the iTunes
/// lookup runs at most once per 24 h, every failure is silent, and "Later" snoozes the
/// notice for that version for 24 h. Disabled in UI-test/App Review runs.
struct AppUpdateNotice: ViewModifier {
    @Environment(\.lukiLocale) private var tr
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    /// The live App Store version while the alert is up.
    @State private var storeVersion: String?

    private enum Keys {
        static let lastCheckAt = "appUpdateNotice.lastCheckAt"
        static let dismissedVersion = "appUpdateNotice.dismissedVersion"
        static let dismissedAt = "appUpdateNotice.dismissedAt"
    }

    private static let interval: TimeInterval = 24 * 60 * 60

    func body(content: Content) -> some View {
        content
            .onAppear { checkIfNeeded() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { checkIfNeeded() }
            }
            .alert(
                tr("New version available"),
                isPresented: Binding(
                    get: { storeVersion != nil },
                    set: { if !$0 { storeVersion = nil } }
                )
            ) {
                Button(tr("Update now")) {
                    openURL(AppLinks.appStoreURL)
                }
                Button(tr("Use the web app")) {
                    openURL(AppLinks.webAppURL)
                }
                Button(tr("Later"), role: .cancel) {
                    dismissNotice()
                }
            } message: {
                Text(tr("LukiFitti %@ is out. Update now, or use the web app in the meantime.", storeVersion ?? ""))
            }
    }

    private func checkIfNeeded() {
        let args = ProcessInfo.processInfo.arguments
        // UI tests, the App Review walkthrough and marketing screenshots never see this.
        guard !args.contains("--uitesting"), !args.contains("--uitesting-review") else { return }
        #if DEBUG
        if args.contains("--force-update-notice") {
            storeVersion = "9.9.9"
            return
        }
        #endif
        let defaults = UserDefaults.standard
        let now = Date()
        if let last = defaults.object(forKey: Keys.lastCheckAt) as? Date,
           now.timeIntervalSince(last) < Self.interval { return }
        Task { @MainActor in
            guard let version = await AppStoreLookup.fetchLatestVersion() else { return }
            defaults.set(now, forKey: Keys.lastCheckAt)
            guard AppVersion.isNewer(version, than: AppVersionInfo.marketingVersion),
                  !recentlyDismissed(version) else { return }
            storeVersion = version
        }
    }

    private func recentlyDismissed(_ version: String) -> Bool {
        let defaults = UserDefaults.standard
        guard defaults.string(forKey: Keys.dismissedVersion) == version,
              let at = defaults.object(forKey: Keys.dismissedAt) as? Date else { return false }
        return Date().timeIntervalSince(at) < Self.interval
    }

    private func dismissNotice() {
        guard let version = storeVersion else { return }
        let defaults = UserDefaults.standard
        defaults.set(version, forKey: Keys.dismissedVersion)
        defaults.set(Date(), forKey: Keys.dismissedAt)
        storeVersion = nil
    }
}
