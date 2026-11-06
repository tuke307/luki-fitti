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
                DynamicIslandExpandedRegion(.leading, priority: 1) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.currentExerciseName)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Text(context.state.currentSetLabel)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dynamicIsland(verticalPlacement: .belowIfTooWide)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TimerValue(state: context.state, isResting: context.isResting)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(LukiColors.accent)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 8) {
                        Text(context.state.targetLoadLabel)
                            .font(.subheadline.weight(.medium).monospacedDigit())
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Spacer(minLength: 4)
                        if context.isResting {
                            CompactRestButtons(labels: context.attributes.labels)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: context.isResting ? "timer" : "dumbbell.fill")
                    .foregroundStyle(LukiColors.accent)
            } compactTrailing: {
                TimerValue(state: context.state, isResting: context.isResting)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(LukiColors.accent)
                    .frame(maxWidth: 52)
            } minimal: {
                // Remaining rest (or elapsed time) instead of a static logo.
                TimerValue(state: context.state, isResting: context.isResting)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(LukiColors.accent)
                    .minimumScaleFactor(0.7)
            }
        }
    }
}

extension ActivityViewContext where Attributes == WorkoutActivityAttributes {
    /// A rest whose end date has passed (or content the system marked stale) counts as over, so the
    /// views fall back to elapsed time instead of freezing at 0:00 with the rest buttons showing.
    var isResting: Bool { !isStale && state.isResting }
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
                        .lineLimit(1)
                        .accessibilityLabel("\(bpm) bpm")
                }
            }
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.currentExerciseName)
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text([context.state.currentSetLabel, context.state.targetLoadLabel].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(caption)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    TimerValue(state: context.state, isResting: context.isResting)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(context.isResting ? LukiColors.accent : .primary)
                }
                .fixedSize()
            }
            if context.isResting {
                HStack(spacing: 8) {
                    Button(intent: AddRestTimeIntent()) {
                        Text(context.attributes.labels.addRest)
                            .lineLimit(1)
                            .fixedSize()
                    }
                    .buttonStyle(.bordered)
                    Button(intent: SkipRestTimerIntent()) {
                        Label(context.attributes.labels.skipRest, systemImage: "forward.end.fill")
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(LukiColors.accent)
                }
                .font(.subheadline.weight(.semibold))
            }
        }
    }

    private var caption: String {
        guard context.isResting else { return context.attributes.labels.elapsed }
        return context.state.restPausedRemainingSeconds != nil ? context.attributes.labels.restPaused : context.attributes.labels.rest
    }
}

/// Counts down rest while resting, otherwise counts up the workout. `Text(timerInterval:)` claims
/// all offered width, so the value is pinned to the width of a placeholder clock string.
private struct TimerValue: View {
    let state: WorkoutActivityAttributes.ContentState
    let isResting: Bool

    var body: some View {
        Text(placeholder)
            .hidden()
            .overlay(alignment: .trailing) {
                value
                    .multilineTextAlignment(.trailing)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .monospacedDigit()
    }

    @ViewBuilder
    private var value: some View {
        if isResting, let paused = state.restPausedRemainingSeconds {
            Text(LukiFormat.clock(paused))
        } else if isResting, let endsAt = state.restTimerEndsAt, endsAt > Date() {
            Text(timerInterval: Date()...endsAt, countsDown: true)
        } else {
            Text(state.workoutStartedAt, style: .timer)
        }
    }

    private var placeholder: String {
        if isResting {
            let remaining = state.restPausedRemainingSeconds.map(TimeInterval.init)
                ?? state.restTimerEndsAt.map { $0.timeIntervalSinceNow } ?? 0
            return remaining >= 600 ? "00:00" : "0:00"
        }
        // Elapsed time keeps growing between updates, so leave room for the hour digit early.
        return Date().timeIntervalSince(state.workoutStartedAt) >= 40 * 60 ? "0:00:00" : "00:00"
    }
}

private struct CompactRestButtons: View {
    let labels: WorkoutActivityAttributes.Labels

    var body: some View {
        HStack(spacing: 6) {
            Button(intent: AddRestTimeIntent()) {
                Text(labels.addRest)
                    .lineLimit(1)
                    .fixedSize()
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            Button(intent: SkipRestTimerIntent()) {
                Image(systemName: "forward.end.fill")
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.circle)
            .tint(LukiColors.accent)
            .accessibilityLabel(labels.skipRest)
        }
        .controlSize(.small)
        .font(.footnote.weight(.semibold))
    }
}

#if DEBUG
private extension WorkoutActivityAttributes {
    static let previewGerman = WorkoutActivityAttributes(
        workoutName: "Oberkörper",
        labels: .init(rest: "Pause", restPaused: "Pause angehalten", addRest: "+15", skipRest: "Pause überspringen", elapsed: "Dauer")
    )
}

private extension WorkoutActivityAttributes.ContentState {
    static var previewResting: Self {
        .init(
            currentExerciseName: "Rudern auf der Maschine (eng)",
            currentSetLabel: "Satz 2 von 4",
            targetLoadLabel: "60 kg × 8",
            liveHeartRateBpm: 128,
            restTimerEndsAt: Date().addingTimeInterval(84),
            workoutStartedAt: Date().addingTimeInterval(-25 * 60)
        )
    }

    static var previewRestOver: Self {
        .init(
            currentExerciseName: "Rudern auf der Maschine (eng)",
            currentSetLabel: "Satz 3 von 4",
            targetLoadLabel: "60 kg × 8",
            restTimerEndsAt: Date().addingTimeInterval(-5),
            workoutStartedAt: Date().addingTimeInterval(-52 * 60)
        )
    }
}

#Preview("Expanded", as: .dynamicIsland(.expanded), using: WorkoutActivityAttributes.previewGerman) {
    RestTimerLiveActivity()
} contentStates: {
    WorkoutActivityAttributes.ContentState.previewResting
    WorkoutActivityAttributes.ContentState.previewRestOver
}

#Preview("Lock Screen", as: .content, using: WorkoutActivityAttributes.previewGerman) {
    RestTimerLiveActivity()
} contentStates: {
    WorkoutActivityAttributes.ContentState.previewResting
    WorkoutActivityAttributes.ContentState.previewRestOver
}
#endif
#endif
