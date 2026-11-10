import SwiftUI
import WidgetKit
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

private struct HomeWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: HomeWidgetSnapshot?

    /// Strings render in the locale the app last wrote, not whatever the extension process uses.
    func tr(_ key: String, _ args: CVarArg...) -> String {
        let locale = snapshot?.locale ?? .en
        let format = locale(key)
        return args.isEmpty ? format
            : String(format: format, locale: Locale(identifier: locale.rawValue), arguments: args)
    }
}

private func dayKey(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
}

private func nextMidnight(after date: Date) -> Date {
    Calendar.current.startOfDay(for: date).advanced(by: 24 * 60 * 60)
}

private struct HomeWidgetProvider: TimelineProvider {
    typealias Entry = HomeWidgetEntry

    func placeholder(in context: Context) -> Entry { Entry(date: Date(), snapshot: nil) }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: Date(), snapshot: SharedSnapshotStore.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let now = Date()
        // Rollover at local midnight handles the nutrition day / week flip.
        let entries = [Entry(date: now, snapshot: SharedSnapshotStore.read()),
                       Entry(date: nextMidnight(after: now), snapshot: nil)]
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

public struct NextWorkoutWidget: Widget {
    public init() {}

    public var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NextWorkoutWidget", provider: HomeWidgetProvider()) { entry in
            NextWorkoutWidgetView(entry: entry)
        }
        .configurationDisplayName(SupportedLocale.en("Next workout"))
        .description(SupportedLocale.en("Your next workout and weekly progress."))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

public struct NutritionWidget: Widget {
    public init() {}

    public var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NutritionWidget", provider: HomeWidgetProvider()) { entry in
            NutritionWidgetView(entry: entry)
        }
        .configurationDisplayName(SupportedLocale.en("Today's nutrition"))
        .description(SupportedLocale.en("Calories and protein for today."))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

private struct NextWorkoutWidgetView: View {
    let entry: HomeWidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let snapshot = entry.snapshot
        let done = snapshot?.sessionsDone(currentWeekStartISO: WorkoutRotation.currentWeekStartISO(now: entry.date)) ?? 0
        let goal = max(1, snapshot?.weeklyGoal ?? 4)
        Group {
            if let workout = snapshot?.nextWorkout {
                VStack(alignment: .leading, spacing: 6) {
                    Label(entry.tr("Next workout"), systemImage: "dumbbell")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LukiColors.accent)
                    Text(workout.name)
                        .font(family == .systemSmall ? .subheadline.weight(.semibold) : .headline)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                    Text(entry.tr("%d exercises", workout.exerciseCount))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    HStack(spacing: 8) {
                        ProgressView(value: min(1, Double(done) / Double(goal)))
                            .tint(LukiColors.accent)
                        Text(entry.tr("%d/%d this week", done, goal))
                            .font(.caption.weight(.semibold).monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Label(entry.tr("Next workout"), systemImage: "dumbbell")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LukiColors.accent)
                    Spacer()
                    Text(entry.tr("Create a workout"))
                        .font(.subheadline.weight(.semibold))
                    Text(entry.tr("Your plans appear here."))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(4)
        .containerBackground(LukiColors.groupedBackground, for: .widget)
        .widgetURL(snapshot?.nextWorkout.flatMap { URL(string: "lukifitti://workouts?template=\($0.templateId)") }
            ?? URL(string: "lukifitti://workouts")!)
    }
}

private struct NutritionWidgetView: View {
    let entry: HomeWidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let snapshot = entry.snapshot
        let nutrition = snapshot?.nutrition
        let key = dayKey(entry.date)
        let kcal = snapshot?.kcalEatenToday(dayKey: key) ?? 0
        let kcalGoal = nutrition?.kcalGoal
        let protein = snapshot?.proteinToday(dayKey: key) ?? 0
        let proteinGoal = nutrition?.proteinGoalG
        HStack(spacing: family == .systemSmall ? 12 : 16) {
            ZStack {
                if let kcalGoal, kcalGoal > 0 {
                    ProgressView(value: min(1, Double(kcal) / Double(kcalGoal)))
                        .progressViewStyle(.circular)
                        .tint(LukiColors.accent)
                } else {
                    Circle().stroke(LukiColors.fill, lineWidth: 5)
                }
                VStack(spacing: 0) {
                    Text("\(kcal)")
                        .font(family == .systemSmall ? .footnote.weight(.bold) : .title3.weight(.bold))
                        .monospacedDigit()
                    Text("kcal")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: family == .systemSmall ? 56 : 72, height: family == .systemSmall ? 56 : 72)

            VStack(alignment: .leading, spacing: 4) {
                Text(entry.tr("Today"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LukiColors.accent)
                Text(kcalGoal.map { entry.tr("of %d kcal", $0) } ?? entry.tr("No kcal goal"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Image(systemName: "fish")
                        .font(.caption2)
                    Text(proteinGoal.map { entry.tr("%d/%d g protein", protein, $0) }
                        ?? entry.tr("%d g protein", protein))
                        .font(.caption.weight(.medium).monospacedDigit())
                }
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(family == .systemSmall ? 6 : 4)
        .containerBackground(LukiColors.groupedBackground, for: .widget)
        .widgetURL(URL(string: "lukifitti://nutrition")!)
    }
}
