import Foundation
import UserNotifications
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Weigh-ins: logging, Apple Health sync and the weekly reminder.
extension LukiAppViewModel {
    var isSignedIn: Bool { store.currentUser != nil }

    /// Weight used for a workout's calorie estimate: the weigh-in that applied on that day,
    /// else the profile value (callers fall back to the default weight).
    func bodyWeightKg(at date: Date) -> Double? {
        BodyWeightMath.estimateWeightKg(bodyWeight.points, at: date, fallbackKg: store.preferences.bodyWeightKg)
    }

    func bodyWeightKg(for session: WorkoutSessionDto) -> Double? {
        bodyWeightKg(at: LukiISODate.parse(session.startedAt) ?? Date())
    }

    /// Current weight for the profile and estimates (latest weigh-in, else the profile value).
    var currentBodyWeightKg: Double? {
        bodyWeight.latest?.weightKg ?? store.preferences.bodyWeightKg
    }

    func openWeight() {
        selectedTab = .home
        isWeightPresented = true
    }

    // MARK: Logging

    /// Saves a weigh-in (new when `existing` is nil). Returns `true` when it reached the server.
    @discardableResult
    func saveWeighIn(existing: BodyWeightEntryDto?, measuredAt: Date, weightKg: Double, note: String?) async -> Bool {
        let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload = UpsertBodyWeightEntryDto(
            clientEntryId: existing?.clientEntryId ?? BodyWeightStore.newClientId(),
            measuredAt: LukiISODate.string(min(measuredAt, Date())),
            weightKg: (min(BodyWeightLimits.maxKg, max(BodyWeightLimits.minKg, weightKg)) * 100).rounded() / 100,
            note: trimmed.flatMap { $0.isEmpty ? nil : String($0.prefix(BodyWeightLimits.noteMaxLength)) }
        )
        let reached = await bodyWeight.save(payload, isSignedIn: isSignedIn)
        if let saved = bodyWeight.entry(clientEntryId: payload.clientEntryId) {
            await bodyMassSync.export(saved)
        }
        rescheduleWeighInReminders()
        return reached
    }

    func deleteWeighIn(_ entry: BodyWeightEntryDto) async {
        await bodyWeight.remove(entry, isSignedIn: isSignedIn)
        if entry.source == .MANUAL {
            await bodyMassSync.deleteExported(clientEntryId: entry.clientEntryId)
        }
        rescheduleWeighInReminders()
    }

    /// Text typed into the reminder's "Log weight" action, in the person's unit.
    func logWeighInFromNotification(_ text: String) async {
        let unit = store.preferences.weightUnit
        guard let kg = BodyWeightMath.parseInput(text, unit: unit) else {
            let content = UNMutableNotificationContent()
            content.title = locale("Weight not saved")
            content.body = locale("That doesn’t look like a weight. Open LukiFitti to log it.")
            content.categoryIdentifier = WeighInReminderScheduler.categoryIdentifier
            try? await UNUserNotificationCenter.current().add(
                UNNotificationRequest(identifier: "lukifitti.weighin-invalid", content: content, trigger: nil)
            )
            return
        }
        await saveWeighIn(existing: nil, measuredAt: Date(), weightKg: kg, note: nil)
    }

    // MARK: Sync

    /// Refreshes weigh-ins from the server, imports Apple Health changes and tops up reminders.
    /// `requestHealthAccess` is only set when the weight screen opens (asks once).
    func syncBodyWeight(requestHealthAccess: Bool = false) async {
        if isSignedIn {
            await bodyWeight.refresh(isSignedIn: true)
            if requestHealthAccess, !bodyMassSync.hasRequestedAuthorization {
                await bodyMassSync.requestAuthorization()
            }
            let store = bodyWeight
            let imported = await bodyMassSync.importChanges { samples, deleted in
                await store.importHealthKit(samples: samples, deletedUuids: deleted)
            }
            if imported { await bodyWeight.refresh(isSignedIn: true) }
        }
        rescheduleWeighInReminders()
    }

    /// Forgets weigh-ins and reminders on sign-out / account deletion.
    func clearBodyWeightData() {
        bodyWeight.clear()
        bodyMassSync.resetImportAnchor()
        rescheduleWeighInReminders()
    }

    // MARK: Reminder

    func rescheduleWeighInReminders() {
        let settings = WeighInReminderScheduler.Settings(store.preferences)
        let copy = WeighInReminderScheduler.Copy(locale: locale, unit: store.preferences.weightUnit)
        let coveredThisWeek = bodyWeight.hasWeighIn(since: WeighInSchedule.weekStart())
        let previous = reminderTask
        reminderTask = Task {
            await previous?.value
            await WeighInReminderScheduler.reschedule(settings: settings, copy: copy, hasWeighInThisWeek: coveredThisWeek)
        }
    }

    func sendTestWeighInReminder() async -> Bool {
        await WeighInReminderScheduler.sendTest(
            copy: WeighInReminderScheduler.Copy(locale: locale, unit: store.preferences.weightUnit)
        )
    }

    /// Saves reminder settings on this device and, when signed in, on the server.
    /// Returns an error message when the server rejected the change.
    func updateWeighInReminder(enabled: Bool, weekday: Int, minutes: Int) async -> String? {
        var prefs = store.preferences
        prefs.weighInReminderEnabled = enabled
        prefs.weighInReminderWeekday = weekday
        prefs.weighInReminderMinutes = minutes
        store.savePreferences(prefs)
        rescheduleWeighInReminders()
        guard isSignedIn else { return nil }
        var dto = UpdatePreferencesDto()
        dto.weighInReminderEnabled = enabled
        dto.weighInReminderWeekday = weekday
        dto.weighInReminderMinutes = minutes
        do {
            let user = try await store.apiClient.updatePreferences(dto)
            store.saveAuthenticatedUser(user)
            rescheduleWeighInReminders()
            return nil
        } catch {
            return error.localizedDescription
        }
    }
}
