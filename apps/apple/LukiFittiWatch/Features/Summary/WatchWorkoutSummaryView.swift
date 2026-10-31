import SwiftUI
import LukiFittiModels
import LukiFittiDesign

public struct WatchWorkoutSummaryView: View {
    public let session: WorkoutSessionDto
    public let onDismiss: () -> Void
    public let onDiscard: () -> Void
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var confirmingDiscard = false

    public init(session: WorkoutSessionDto, onDismiss: @escaping () -> Void, onDiscard: @escaping () -> Void = {}) {
        self.session = session
        self.onDismiss = onDismiss
        self.onDiscard = onDiscard
    }

    private var stats: [(label: String, value: String)] {
        var list: [(String, String)] = [(tr("Duration"), LukiFormat.clock(session.activeDurationSeconds))]
        list.append((tr("Sets"), "\(session.totalSetsCompleted)"))
        if session.totalVolumeKg > 0 {
            list.append((tr("Volume"), LukiFormat.volume(kg: session.totalVolumeKg, unit: session.weightUnit)))
        }
        if session.totalStretchSeconds > 0 {
            list.append((tr("Stretching"), LukiFormat.clock(session.totalStretchSeconds)))
        }
        if let kcal = session.activeCaloriesKcal, kcal > 0 {
            list.append((tr("Active energy"), "\(Int(kcal)) kcal"))
        }
        if let avg = session.avgHeartRateBpm {
            list.append((tr("Heart rate"), tr("%d avg · %@ max", avg, session.maxHeartRateBpm.map(String.init) ?? "–")))
        }
        return list
    }

    public var body: some View {
        // Two columns by default, one at the largest text sizes so values don't truncate.
        let columns = Array(
            repeating: GridItem(.flexible(), spacing: 8, alignment: .topLeading),
            count: dynamicTypeSize.isAccessibilitySize ? 1 : 2
        )
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Label(tr("Workout saved"), systemImage: "checkmark.circle.fill")
                    .font(.headline)
                    .foregroundStyle(LukiColors.accent)
                    .accessibilityIdentifier("watch.summary.title")

                Text(session.workoutNameSnapshot)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
                    ForEach(stats, id: \.label) { stat in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(stat.label)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            Text(stat.value)
                                .font(.headline.monospacedDigit())
                                .lineLimit(2)
                                .minimumScaleFactor(0.8)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }

                Button(action: onDismiss) {
                    Text(tr("Done")).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(LukiColors.accent)
                .accessibilityIdentifier("watch.summary.doneButton")
                .padding(.top, 4)

                Button(role: .destructive) {
                    confirmingDiscard = true
                } label: {
                    Text(tr("Discard Workout")).frame(maxWidth: .infinity, minHeight: 44)
                }
                .accessibilityIdentifier("watch.summary.discardButton")
            }
            .padding(.horizontal, 4)
        }
        .confirmationDialog(tr("Discard this workout?"), isPresented: $confirmingDiscard) {
            Button(tr("Discard Workout"), role: .destructive, action: onDiscard)
                .accessibilityIdentifier("watch.summary.discardConfirm")
            Button(tr("Cancel"), role: .cancel) {}
        } message: {
            Text(tr("It’s removed from your history on all devices and from Apple Health."))
        }
    }
}
