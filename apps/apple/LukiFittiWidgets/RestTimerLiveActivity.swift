import SwiftUI
import WidgetKit
import AppIntents
import LukiFittiModels
import LukiFittiDesign

#if canImport(ActivityKit)
import ActivityKit

public struct WorkoutActivityAttributes: ActivityAttributes, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var currentExerciseName: String
        public var currentSetLabel: String
        public var targetLoadLabel: String
        public var liveHeartRateBpm: Int?
        public var restTimerEndsAt: Date?
        public var elapsedSeconds: Int

        public init(
            currentExerciseName: String,
            currentSetLabel: String,
            targetLoadLabel: String,
            liveHeartRateBpm: Int? = nil,
            restTimerEndsAt: Date? = nil,
            elapsedSeconds: Int = 0
        ) {
            self.currentExerciseName = currentExerciseName
            self.currentSetLabel = currentSetLabel
            self.targetLoadLabel = targetLoadLabel
            self.liveHeartRateBpm = liveHeartRateBpm
            self.restTimerEndsAt = restTimerEndsAt
            self.elapsedSeconds = elapsedSeconds
        }
    }

    public var workoutName: String

    public init(workoutName: String) {
        self.workoutName = workoutName
    }
}

public struct AddRestTimeIntent: AppIntent {
    public static let title: LocalizedStringResource = "Add 15 Seconds Rest"
    public init() {}
    public func perform() async throws -> some IntentResult {
        .result()
    }
}

public struct SkipRestTimerIntent: AppIntent {
    public static let title: LocalizedStringResource = "Skip Rest Timer"
    public init() {}
    public func perform() async throws -> some IntentResult {
        .result()
    }
}

public struct RestTimerLiveActivity: Widget {
    public init() {}

    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            // Lock Screen / Banner Live Activity UI
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(context.attributes.workoutName)
                        .font(.caption.bold())
                        .foregroundStyle(LukiColors.neonLime)
                    Spacer()
                    if let bpm = context.state.liveHeartRateBpm {
                        Text("❤️ \(bpm) BPM")
                            .font(.caption.bold().monospacedDigit())
                            .foregroundStyle(LukiColors.heartRose)
                    }
                }
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.currentExerciseName)
                            .font(.subheadline.bold())
                            .foregroundStyle(.white)
                        Text("\(context.state.currentSetLabel) • \(context.state.targetLoadLabel)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let endsAt = context.state.restTimerEndsAt, endsAt > Date() {
                        Text(timerInterval: Date()...endsAt, countsDown: true)
                            .font(.title3.bold().monospacedDigit())
                            .foregroundStyle(LukiColors.neonLime)
                    }
                }
                HStack(spacing: 10) {
                    Button(intent: AddRestTimeIntent()) {
                        Text("+15s")
                            .font(.caption2.bold())
                    }
                    Button(intent: SkipRestTimerIntent()) {
                        Text("Skip Rest")
                            .font(.caption2.bold())
                    }
                }
            }
            .padding(14)
            .activityBackgroundTint(Color.black.opacity(0.9))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.currentSetLabel)
                        .font(.caption.bold())
                        .foregroundStyle(LukiColors.neonLime)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let bpm = context.state.liveHeartRateBpm {
                        Text("❤️ \(bpm)")
                            .font(.caption.bold().monospacedDigit())
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(context.state.currentExerciseName) — \(context.state.targetLoadLabel)")
                            .font(.caption.bold())
                        HStack {
                            Button(intent: AddRestTimeIntent()) {
                                Text("+15s")
                            }
                            Button(intent: SkipRestTimerIntent()) {
                                Text("Skip Rest")
                            }
                        }
                        .font(.caption2.bold())
                    }
                }
            } compactLeading: {
                Text(context.state.currentSetLabel)
                    .font(.caption2.bold())
                    .foregroundStyle(LukiColors.neonLime)
            } compactTrailing: {
                if let endsAt = context.state.restTimerEndsAt, endsAt > Date() {
                    Text(timerInterval: Date()...endsAt, countsDown: true)
                        .font(.caption2.bold().monospacedDigit())
                        .foregroundStyle(LukiColors.neonLime)
                } else if let bpm = context.state.liveHeartRateBpm {
                    Text("\(bpm) ♥")
                        .font(.caption2.bold().monospacedDigit())
                        .foregroundStyle(LukiColors.heartRose)
                }
            } minimal: {
                Image(systemName: "dumbbell.fill")
                    .foregroundStyle(LukiColors.neonLime)
            }
        }
    }
}
#endif
