import Foundation
import UserNotifications
import LukiFittiDomain

/// App-wide `UNUserNotificationCenter` delegate. Only weigh-in reminders get custom tap handling;
/// they and the settings test notification are shown as banners even while the app is in the
/// foreground. Every other notification (rest timer) keeps the system default: no banner while
/// the app is in the foreground, and tapping it just opens the app.
@MainActor
final class LukiNotificationCenterDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = LukiNotificationCenterDelegate()
    nonisolated static let testNotificationIdentifier = "lukifitti.test.notification"

    private weak var viewModel: LukiAppViewModel?
    /// Responses that arrive before the view model is attached (cold launch from a notification).
    private var pending: [(action: String, text: String?)] = []

    func attach(_ viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
        UNUserNotificationCenter.current().delegate = self
        let queued = pending
        pending = []
        for item in queued {
            Task { await handleWeighIn(action: item.action, text: item.text) }
        }
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        notification.request.content.categoryIdentifier == WeighInReminderScheduler.categoryIdentifier
            || notification.request.identifier == Self.testNotificationIdentifier
            ? [.banner, .list, .sound]
            : []
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard response.notification.request.content.categoryIdentifier == WeighInReminderScheduler.categoryIdentifier else {
            return
        }
        let action = response.actionIdentifier
        let text = (response as? UNTextInputNotificationResponse)?.userText
        await handleWeighIn(action: action, text: text)
    }

    private func handleWeighIn(action: String, text: String?) async {
        guard let viewModel else {
            pending.append((action, text))
            return
        }
        switch action {
        case WeighInReminderScheduler.logActionIdentifier:
            await viewModel.logWeighInFromNotification(text ?? "")
        case UNNotificationDefaultActionIdentifier:
            viewModel.openWeight()
        default:
            break
        }
    }
}
