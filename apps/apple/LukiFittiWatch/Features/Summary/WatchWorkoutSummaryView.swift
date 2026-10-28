import SwiftUI
import LukiFittiModels
import LukiFittiDesign

public struct WatchWorkoutSummaryView: View {
    public let session: WorkoutSessionDto
    public let onDismiss: () -> Void
    @Environment(\.lukiLocale) private var tr

    public init(session: WorkoutSessionDto, onDismiss: @escaping () -> Void) {
        self.session = session
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Label(tr("Workout saved"), systemImage: "checkmark.circle.fill")
                    .font(.headline)
                    .foregroundStyle(LukiColors.accent)
                    .accessibilityIdentifier("watch.summary.title")

                Text(session.workoutNameSnapshot)
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Text(LukiFormat.clock(session.activeDurationSeconds))
                    .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())

                Divider()

                if session.totalVolumeKg > 0 {
                    stat(tr("Volume"), LukiFormat.volume(kg: session.totalVolumeKg, unit: session.weightUnit))
                }
                stat(tr("Sets"), "\(session.totalSetsCompleted)")
                if session.totalStretchSeconds > 0 {
                    stat(tr("Stretching"), LukiFormat.clock(session.totalStretchSeconds))
                }
                if let kcal = session.activeCaloriesKcal, kcal > 0 {
                    stat(tr("Active energy"), "\(Int(kcal)) kcal")
                }
                if let avg = session.avgHeartRateBpm {
                    stat(
                        tr("Heart rate"),
                        tr("%d avg · %@ max", avg, session.maxHeartRateBpm.map(String.init) ?? "–")
                    )
                }

                Button(tr("Done"), action: onDismiss)
                    .tint(LukiColors.accent)
                    .accessibilityIdentifier("watch.summary.doneButton")
                    .padding(.top, 4)
            }
            .padding(.horizontal, 4)
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline.monospacedDigit())
        }
        .accessibilityElement(children: .combine)
    }
}
