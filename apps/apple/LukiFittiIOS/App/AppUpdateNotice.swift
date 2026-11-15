import SwiftUI
import LukiFittiDomain
import LukiFittiDesign

/// "New App Store version" alert attached at the app root. The iTunes lookup runs on every
/// launch and return to the foreground until the user is on the live version; every failure is
/// silent. There is no "Later": the alert offers the App Store or the web app and comes back on
/// the next foreground. Disabled in UI-test/App Review runs.
struct AppUpdateNotice: ViewModifier {
    @Environment(\.lukiLocale) private var tr
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    /// The live App Store version while the alert is up.
    @State private var storeVersion: String?
    /// Launch fires both `onAppear` and `.active`; only one lookup runs at a time.
    @State private var isChecking = false

    func body(content: Content) -> some View {
        content
            .onAppear { check() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { check() }
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
            } message: {
                Text(tr("LukiFitti %@ is out. Update now, or use the web app in the meantime.", storeVersion ?? ""))
            }
    }

    private func check() {
        let args = ProcessInfo.processInfo.arguments
        // UI tests, the App Review walkthrough and marketing screenshots never see this.
        guard !args.contains("--uitesting"), !args.contains("--uitesting-review") else { return }
        guard storeVersion == nil, !isChecking else { return }
        #if DEBUG
        if args.contains("--force-update-notice") {
            storeVersion = "9.9.9"
            return
        }
        #endif
        isChecking = true
        Task { @MainActor in
            defer { isChecking = false }
            guard let version = await AppStoreLookup.fetchLatestVersion(),
                  AppVersion.isNewer(version, than: AppVersionInfo.marketingVersion) else { return }
            storeVersion = version
        }
    }
}
