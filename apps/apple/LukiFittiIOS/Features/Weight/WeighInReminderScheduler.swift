import Foundation
import UserNotifications
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

/// Weekly weigh-in reminder. iOS can't skip a single occurrence of a repeating trigger, so the
/// next few occurrences are scheduled as individual one-shot notifications (one per ISO-ish week)
/// and topped up on launch, foreground, settings changes and after every weigh-in. The current
/// week's reminder is left out once there is a weigh-in since the start of that week.
enum WeighInReminderScheduler {
    static let identifierPrefix = WeighInSchedule.identifierPrefix
    static let categoryIdentifier = "lukifitti.weighin"
    static let logActionIdentifier = "lukifitti.weighin.log"
    static let testIdentifier = "lukifitti.test.weighin"
    static let upcomingCount = 4

    struct Settings: Equatable, Sendable {
        var enabled: Bool
        var weekday: Int
        var minutes: Int

        init(_ prefs: UserPreferencesDto) {
            enabled = prefs.notificationsEnabled && prefs.weighInReminderEnabled
            weekday = min(7, max(1, prefs.weighInReminderWeekday))
            minutes = min(1439, max(0, prefs.weighInReminderMinutes))
        }
    }

    struct Copy: Sendable {
        var title: String
        var body: String
        var actionTitle: String
        var actionButton: String
        var placeholder: String

        init(locale tr: SupportedLocale, unit: WeightUnit) {
            title = tr("Time to weigh in")
            body = tr("Weigh yourself after waking, before breakfast, for the most consistent trend.")
            actionTitle = tr("Log weight")
            actionButton = tr("Save")
            placeholder = tr("Weight in %@, e.g. %@", LukiFormat.unitLabel(unit), unit == .LBS ? "165.4" : "75.2")
        }
    }

    static func registerCategory(_ copy: Copy) async {
        let action = UNTextInputNotificationAction(
            identifier: logActionIdentifier,
            title: copy.actionTitle,
            options: [.authenticationRequired],
            textInputButtonTitle: copy.actionButton,
            textInputPlaceholder: copy.placeholder
        )
        let category = UNNotificationCategory(
            identifier: categoryIdentifier,
            actions: [action],
            intentIdentifiers: [],
            options: []
        )
        let center = UNUserNotificationCenter.current()
        // Keep any other categories the app registers in the future.
        let existing = await center.notificationCategories().filter { $0.identifier != categoryIdentifier }
        center.setNotificationCategories(existing.union([category]))
    }

    /// Replaces all pending weigh-in reminders. Never prompts for permission.
    static func reschedule(settings: Settings, copy: Copy, hasWeighInThisWeek: Bool) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
            .map(\.identifier)
            .filter { $0.hasPrefix(identifierPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        guard settings.enabled else { return }
        let status = await center.notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional || status == .ephemeral else { return }
        await registerCategory(copy)

        let now = Date()
        let calendar = Calendar.current
        let dates = WeighInSchedule.upcomingDates(
            weekday: settings.weekday,
            minutes: settings.minutes,
            after: now,
            hasWeighInThisWeek: hasWeighInThisWeek,
            calendar: calendar,
            count: upcomingCount
        )
        for date in dates {
            let content = makeContent(copy)
            let trigger = UNCalendarNotificationTrigger(
                dateMatching: calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date),
                repeats: false
            )
            try? await center.add(UNNotificationRequest(identifier: WeighInSchedule.identifier(for: date, calendar: calendar), content: content, trigger: trigger))
        }
    }

    static func sendTest(copy: Copy) async -> Bool {
        let center = UNUserNotificationCenter.current()
        guard (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) == true else { return false }
        await registerCategory(copy)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 3, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: testIdentifier, content: makeContent(copy), trigger: trigger))
        return true
    }

    static func requestAuthorization() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    private static func makeContent(_ copy: Copy) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = copy.title
        content.body = copy.body
        content.sound = .default
        content.categoryIdentifier = categoryIdentifier
        content.userInfo = ["route": "weight"]
        return content
    }
}
