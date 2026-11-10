import Foundation
import LukiFittiModels

/// Shared "what to train next" and weekly-progress rules so the Home tab, the Watch home screen
/// and the widgets all pick the same workout and count.
public enum WorkoutRotation {
    /// The Home tab's suggestion: the template trained least recently. A template matches a
    /// history entry by `templateId`, or by its name for sessions recorded before ids existed.
    /// Ties (never trained) keep folder/template order.
    public static func nextUp(
        folders: [WorkoutFolderDto],
        unfiledTemplates: [WorkoutTemplateDto],
        historySessions: [WorkoutSessionDto]
    ) -> (template: WorkoutTemplateDto, lastDate: Date?)? {
        let templates = folders.flatMap(\.templates) + unfiledTemplates
        guard !templates.isEmpty else { return nil }
        func lastDate(_ tpl: WorkoutTemplateDto) -> Date? {
            historySessions
                .first {
                    $0.templateId == tpl.id
                        || $0.workoutNameSnapshot.caseInsensitiveCompare(tpl.name) == .orderedSame
                }
                .flatMap { LukiISODate.parse($0.startedAt) }
        }
        let sorted = templates.sorted {
            (lastDate($0) ?? .distantPast) < (lastDate($1) ?? .distantPast)
        }
        return sorted.first.map { ($0, lastDate($0)) }
    }

    /// Sessions counted from this week's ISO-8601 start, the same "done / goal" the Home tab shows.
    public static func sessionsDoneThisWeek(
        historySessions: [WorkoutSessionDto],
        now: Date = Date()
    ) -> (done: Int, weekStart: Date) {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = .current
        guard let weekStart = calendar.dateInterval(of: .weekOfYear, for: now)?.start else {
            return (0, now)
        }
        let done = historySessions.filter {
            (LukiISODate.parse($0.startedAt) ?? .distantPast) >= weekStart
        }.count
        return (done, weekStart)
    }

    /// ISO timestamp of the current ISO week start — widgets compare it to `weekStartISO`.
    public static func currentWeekStartISO(now: Date = Date()) -> String {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = .current
        let start = calendar.dateInterval(of: .weekOfYear, for: now)?.start ?? now
        return ISO8601DateFormatter().string(from: start)
    }
}
