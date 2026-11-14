import Foundation
import UIKit
import LukiFittiAPI
import LukiFittiModels

/// Uploads the APNs device token to `PUT /push/devices` (platform APNS) and removes it on
/// sign-out. The AppDelegate forwards registration callbacks; the view model attaches the
/// authenticated `APIClient` once it exists.
public actor ApnsPushManager {
    public static let shared = ApnsPushManager()

    private var apiClient: APIClient?
    /// Latest hex token — kept so `unregister` can delete the device row by token.
    private var lastToken: String?
    /// Tokens that arrived before an authenticated client was attached, replayed on attach.
    private var pendingUpload: String?

    private init() {}

    public func attach(_ apiClient: APIClient) {
        self.apiClient = apiClient
        guard let token = pendingUpload ?? lastToken else { return }
        pendingUpload = nil
        Task { await upload(token: token, apiClient: apiClient) }
    }

    public func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        lastToken = token
        guard let apiClient else {
            pendingUpload = token
            return
        }
        Task { await upload(token: token, apiClient: apiClient) }
    }

    /// Removes this device's registration server-side; local APNs registration is left to iOS.
    public func unregister(apiClient: APIClient) async {
        guard let token = lastToken else { return }
        lastToken = nil
        pendingUpload = nil
        try? await apiClient.deletePushDevice(token: token)
    }

    private func upload(token: String, apiClient: APIClient) async {
        #if DEBUG
        let sandbox = true
        #else
        let sandbox = false
        #endif
        let dto = RegisterPushDeviceDto(
            platform: .APNS,
            token: token,
            apnsSandbox: sandbox,
            locale: Locale.current.identifier,
            timeZone: TimeZone.current.identifier
        )
        do {
            try await apiClient.registerPushDevice(dto)
        } catch {
            // Best-effort: a failed upload retries on the next launch's re-registration.
            pendingUpload = token
        }
    }
}

/// Bridges `UIApplicationDelegate` APNs callbacks into the SwiftUI app.
final class LukiAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { await ApnsPushManager.shared.didRegister(deviceToken: deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Registration failures are transient (no network, simulator); the next launch retries.
    }
}
