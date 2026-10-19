import SwiftUI
import WidgetKit
import LukiFittiDesign

public struct WatchStreakEntry: TimelineEntry {
    public let date: Date
    public let sessionsThisWeek: Int
    public let weeklyGoal: Int

    public init(date: Date = Date(), sessionsThisWeek: Int = 3, weeklyGoal: Int = 4) {
        self.date = date
        self.sessionsThisWeek = sessionsThisWeek
        self.weeklyGoal = weeklyGoal
    }
}

public struct WatchStreakProvider: TimelineProvider {
    public init() {}

    public func placeholder(in context: Context) -> WatchStreakEntry {
        WatchStreakEntry()
    }

    public func getSnapshot(in context: Context, completion: @escaping (WatchStreakEntry) -> Void) {
        completion(WatchStreakEntry())
    }

    public func getTimeline(in context: Context, completion: @escaping (Timeline<WatchStreakEntry>) -> Void) {
        let entry = WatchStreakEntry()
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(1800))))
    }
}

public struct WatchStreakComplicationView: View {
    public let entry: WatchStreakEntry

    public init(entry: WatchStreakEntry) {
        self.entry = entry
    }

    public var body: some View {
        VStack(spacing: 2) {
            Image(systemName: "dumbbell.fill")
                .foregroundStyle(LukiColors.neonLime)
            Text("\(entry.sessionsThisWeek)/\(entry.weeklyGoal)")
                .font(.caption2.bold().monospacedDigit())
        }
        .containerBackground(.black, for: .widget)
    }
}

@main
public struct LukiFittiWidgetBundle: WidgetBundle {
    public init() {}

    public var body: some Widget {
        #if canImport(ActivityKit)
        RestTimerLiveActivity()
        #endif
    }
}
