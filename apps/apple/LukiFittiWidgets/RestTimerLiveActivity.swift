import SwiftUI
import WidgetKit
import AppIntents
import LukiFittiModels
import LukiFittiDesign

#if canImport(ActivityKit)
import ActivityKit
import LukiFittiLiveActivity

public struct RestTimerLiveActivity: Widget {
    public init() {}

    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            LockScreenWorkoutView(context: context)
                .padding(14)
                .activityBackgroundTint(nil)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.currentExerciseName)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        Text(context.state.currentSetLabel)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TimerValue(state: context.state)
                        .font(.title3.weight(.semibold).monospacedDigit())
                        .foregroundStyle(LukiColors.accent)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 8) {
                        Text(context.state.targetLoadLabel)
                            .font(.subheadline.weight(.medium).monospacedDigit())
                        Spacer()
                        RestButtons(labels: context.attributes.labels, isResting: context.state.isResting)
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.isResting ? "timer" : "dumbbell.fill")
                    .foregroundStyle(LukiColors.accent)
            } compactTrailing: {
                TimerValue(state: context.state)
                    .font(.footnote.weight(.semibold).monospacedDigit())
                    .foregroundStyle(LukiColors.accent)
                    .frame(maxWidth: 52)
            } minimal: {
                // Remaining rest (or elapsed time) instead of a static logo.
                TimerValue(state: context.state)
                    .font(.caption2.weight(.semibold).monospacedDigit())
                    .foregroundStyle(LukiColors.accent)
                    .minimumScaleFactor(0.7)
            }
        }
    }
}

private struct LockScreenWorkoutView: View {
    let context: ActivityViewContext<WorkoutActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(context.attributes.workoutName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer()
                if let bpm = context.state.liveHeartRateBpm {
                    Label("\(bpm)", systemImage: "heart.fill")
                        .font(.footnote.weight(.semibold).monospacedDigit())
                        .foregroundStyle(LukiColors.heartRate)
                        .accessibilityLabel("\(bpm) bpm")
                }
            }
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.currentExerciseName)
                        .font(.headline)
                        .lineLimit(1)
                    Text([context.state.currentSetLabel, context.state.targetLoadLabel].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    Text(caption)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                    TimerValue(state: context.state)
                        .font(.title2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(context.state.isResting ? LukiColors.accent : .primary)
                        .multilineTextAlignment(.trailing)
                }
            }
            if context.state.isResting {
                RestButtons(labels: context.attributes.labels, isResting: true)
            }
        }
    }

    private var caption: String {
        if context.state.restPausedRemainingSeconds != nil { return context.attributes.labels.restPaused }
        return context.state.isResting ? context.attributes.labels.rest : context.attributes.labels.elapsed
    }
}

/// Counts down rest while resting, otherwise counts up the workout.
private struct TimerValue: View {
    let state: WorkoutActivityAttributes.ContentState

    var body: some View {
        if let paused = state.restPausedRemainingSeconds {
            Text(LukiFormat.clock(paused))
        } else if let endsAt = state.restTimerEndsAt, endsAt > Date() {
            Text(timerInterval: Date()...endsAt, countsDown: true)
        } else {
            Text(state.workoutStartedAt, style: .timer)
        }
    }
}

private struct RestButtons: View {
    let labels: WorkoutActivityAttributes.Labels
    let isResting: Bool

    var body: some View {
        if isResting {
            HStack(spacing: 8) {
                Button(intent: AddRestTimeIntent()) {
                    Text(labels.addRest)
                }
                .buttonStyle(.bordered)
                Button(intent: SkipRestTimerIntent()) {
                    Label(labels.skipRest, systemImage: "forward.end.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(LukiColors.accent)
            }
            .font(.subheadline.weight(.semibold))
        }
    }
}
#endif
