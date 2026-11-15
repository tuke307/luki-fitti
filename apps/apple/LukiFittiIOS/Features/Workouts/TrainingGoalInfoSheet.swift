import SwiftUI
import LukiFittiModels
import LukiFittiDesign

/// "i" button next to a training-goal setting; opens `TrainingGoalInfoSheet`.
struct TrainingGoalInfoButton: View {
    @Environment(\.lukiLocale) private var tr
    @State private var showsInfo = false

    var body: some View {
        Button {
            showsInfo = true
        } label: {
            Image(systemName: "info.circle")
                .font(.subheadline)
                .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.borderless)
        .foregroundStyle(.secondary)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityLabel(tr("About training goals"))
        .accessibilityIdentifier("ios.trainingGoalInfo")
        .sheet(isPresented: $showsInfo) {
            TrainingGoalInfoSheet()
        }
    }
}

/// What each training goal changes: rep ranges, rest, and progression rules.
struct TrainingGoalInfoSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr

    private static func rule(_ goal: TrainingGoal, _ tr: SupportedLocale) -> String {
        switch goal {
        case .STRENGTH:
            return tr("Bigger weight steps on barbell compound lifts. After a max-effort session the weight stays the same.")
        case .HYPERTROPHY:
            return tr("More weight once every set reaches the top of the range, even at max effort.")
        case .ENDURANCE:
            return tr("More weight only while the last session stayed below RPE 9.")
        }
    }

    private static let goodToKnowKeys = [
        "The goal's rep range replaces the rep targets of your exercises.",
        "Rest only changes where it is still at the 90 s default. Rest times you set yourself stay.",
        "The number of sets doesn't change.",
        "The AI workout builder follows your goal too.",
        "The profile goal applies to all workouts. In the workout editor you can override it for a single workout.",
    ]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(tr("Your training goal tunes the weight and rep suggestions to what you train for. Without a goal, suggestions work as before."))
                }
                ForEach(TrainingGoal.allCases, id: \.self) { goal in
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(TrainingGoalLabels.name(goal, tr))
                                .font(.body.weight(.semibold))
                            Text(TrainingGoalLabels.caption(goal, tr))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Text(Self.rule(goal, tr))
                        }
                    }
                }
                Section {
                    ForEach(Self.goodToKnowKeys, id: \.self) { key in
                        Text(tr(key))
                    }
                } header: {
                    Text(tr("Good to know"))
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(tr("Training goal"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Done")) { dismiss() }
                }
            }
        }
    }
}
