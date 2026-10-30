import SwiftUI
import LukiFittiModels
import LukiFittiDesign

/// Weekly weigh-in reminder settings: on/off, weekday, time and a test notification.
struct WeighInReminderSection: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var enabled: Bool
    @State private var weekday: Int
    @State private var time: Date
    @State private var status: String?

    init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
        let p = viewModel.store.preferences
        _enabled = State(initialValue: p.weighInReminderEnabled)
        _weekday = State(initialValue: min(7, max(1, p.weighInReminderWeekday)))
        _time = State(initialValue: Self.date(fromMinutes: p.weighInReminderMinutes))
    }

    private static func date(fromMinutes minutes: Int) -> Date {
        Calendar.current.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: Date()) ?? Date()
    }

    private var minutes: Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: time)
        return (c.hour ?? 7) * 60 + (c.minute ?? 30)
    }

    /// Weekdays in the order of the person's calendar, named in the app language.
    private var weekdays: [(value: Int, name: String)] {
        var calendar = Calendar.current
        calendar.locale = Locale(identifier: tr.rawValue)
        let symbols = calendar.weekdaySymbols
        let first = Calendar.current.firstWeekday
        return (0..<7).map { offset in
            let value = (first - 1 + offset) % 7 + 1
            return (value, symbols[value - 1])
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $enabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(tr("Weekly weigh-in reminder"))
                        .font(.subheadline.bold())
                        .foregroundStyle(.primary)
                    Text(tr("Skipped when you already weighed in that week"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(LukiColors.accent)
            .accessibilityIdentifier("ios.profile.weighInReminderToggle")

            if enabled {
                Picker(tr("Day"), selection: $weekday) {
                    ForEach(weekdays, id: \.value) { day in
                        Text(day.name).tag(day.value)
                    }
                }
                .font(.subheadline)
                .accessibilityIdentifier("ios.profile.weighInWeekdayPicker")

                DatePicker(tr("Time"), selection: $time, displayedComponents: .hourAndMinute)
                    .font(.subheadline)
                    .accessibilityIdentifier("ios.profile.weighInTimePicker")

                if !viewModel.store.preferences.notificationsEnabled {
                    Text(tr("Turn on Notifications to get the reminder."))
                        .font(.footnote)
                        .foregroundStyle(LukiColors.warning)
                }

                Button {
                    Task {
                        let ok = await viewModel.sendTestWeighInReminder()
                        status = ok
                            ? tr("A test reminder arrives in a few seconds.")
                            : tr("Allow notifications for LukiFitti in Settings to get reminders.")
                    }
                } label: {
                    Label(tr("Send test reminder"), systemImage: "bell.badge")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("ios.profile.testWeighInReminderButton")
            }

            if let status {
                Text(status)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .onChange(of: enabled) { _, isOn in
            Task {
                if isOn, !(await WeighInReminderScheduler.requestAuthorization()) {
                    status = tr("Allow notifications for LukiFitti in Settings to get reminders.")
                    enabled = false
                    return
                }
                await persist()
            }
        }
        .onChange(of: weekday) { Task { await persist() } }
        .onChange(of: minutes) { Task { await persist() } }
    }

    private func persist() async {
        let p = viewModel.store.preferences
        guard p.weighInReminderEnabled != enabled || p.weighInReminderWeekday != weekday || p.weighInReminderMinutes != minutes else {
            return
        }
        if let error = await viewModel.updateWeighInReminder(enabled: enabled, weekday: weekday, minutes: minutes) {
            status = error
        } else {
            status = nil
        }
    }
}
