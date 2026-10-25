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
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LukiColors.accent)
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
                            .foregroundStyle(LukiColors.accent)
                    }
                }
                HStack(spacing: 10) {
                    Button(intent: AddRestTimeIntent()) {
                        Text("+15s")
                            .font(.footnote.weight(.medium))
                    }
                    Button(intent: SkipRestTimerIntent()) {
                        Text("Skip Rest")
                            .font(.footnote.weight(.medium))
                    }
                }
            }
            .padding(14)
            .activityBackgroundTint(Color.black.opacity(0.9))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.currentSetLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LukiColors.accent)
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
                            .font(.subheadline.weight(.semibold))
                        HStack {
                            Button(intent: AddRestTimeIntent()) {
                                Text("+15s")
                            }
                            Button(intent: SkipRestTimerIntent()) {
                                Text("Skip Rest")
                            }
                        }
                        .font(.footnote.weight(.medium))
                    }
                }
            } compactLeading: {
                Text(context.state.currentSetLabel)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(LukiColors.accent)
            } compactTrailing: {
                if let endsAt = context.state.restTimerEndsAt, endsAt > Date() {
                    Text(timerInterval: Date()...endsAt, countsDown: true)
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(LukiColors.accent)
                } else if let bpm = context.state.liveHeartRateBpm {
                    Text("\(bpm) ♥")
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(LukiColors.heartRose)
                }
            } minimal: {
                Image(systemName: "dumbbell.fill")
                    .foregroundStyle(LukiColors.accent)
            }
        }
    }
}
#endif
