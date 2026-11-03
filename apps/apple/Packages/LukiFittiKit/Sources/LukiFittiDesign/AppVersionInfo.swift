import Foundation

/// App version read from the main bundle: marketing version, build number and an OS description.
public enum AppVersionInfo {
    public static var marketingVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    public static var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
    }

    /// e.g. `"iOS 26.1"`, `"watchOS 26.1"`, `"macOS 26.1"`.
    public static var osDescription: String {
        #if os(iOS)
        let name = "iOS"
        #elseif os(watchOS)
        let name = "watchOS"
        #else
        let name = "macOS"
        #endif
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "\(name) \(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }

    /// `"1.0.0 (1)"` — used in the settings footer; reuse for support emails.
    public static var display: String {
        "\(marketingVersion) (\(buildNumber))"
    }
}
