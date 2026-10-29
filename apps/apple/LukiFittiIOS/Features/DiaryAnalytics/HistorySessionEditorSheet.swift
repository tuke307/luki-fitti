import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

/// Details of a finished workout where weight, reps and set type can be corrected, mirroring the
/// web history dialog. Changes stay in a draft until Save.
struct HistorySessionEditorSheet: View {
    let onSave: (WorkoutSessionDto) -> Void
    @State private var draft: WorkoutSessionDto
    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr

    /// Stretches stay stretches; strength sets can be corrected between these.
    private static let strengthSetTypes: [SetType] = [.WARMUP, .WORKING, .DROPSET]

    init(session: WorkoutSessionDto, onSave: @escaping (WorkoutSessionDto) -> Void) {
        self.onSave = onSave
        _draft = State(initialValue: session)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(tr("Fix the set type, weight or reps, then save."))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    heartRateCard

                    ForEach(Array(doneExercises.enumerated()), id: \.element.clientExerciseId) { exIdx, ex in
                        exerciseCard(ex, number: exIdx + 1)
                    }

                    notDoneDisclosure
                }
                .padding(16)
            }
            .background(LukiColors.groupedBackground)
            .navigationTitle(draft.workoutNameSnapshot)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Save")) {
                        onSave(draft)
                        dismiss()
                    }
                    .accessibilityIdentifier("ios.diary.saveButton")
                }
            }
        }
    }

    private var doneExercises: [SessionExerciseDto] { draft.exercises.filter(\.hasLoggedSet) }

    @ViewBuilder
    private var heartRateCard: some View {
        if let samples = draft.heartRateSamples, samples.count > 1 {
            VStack(alignment: .leading, spacing: 8) {
                Text(tr("Heart rate"))
                    .font(.headline)
                    .foregroundStyle(LukiColors.heartRate)
                Chart(samples, id: \.offsetSec) { pt in
                    LineMark(
                        x: .value("Sec", pt.offsetSec),
                        y: .value("BPM", pt.bpm)
                    )
                    .foregroundStyle(LukiColors.heartRate)
                }
                .frame(height: 150)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
        }
    }

    @ViewBuilder
    private var notDoneDisclosure: some View {
        let notDone = draft.exercises.filter { !$0.hasLoggedSet }
        if !notDone.isEmpty {
            DisclosureGroup(tr("%d not done", notDone.count)) {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(notDone) { ex in
                        Text(ex.exerciseNameSnapshot)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 6)
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(minHeight: 44)
            .padding(.horizontal, 4)
            .accessibilityIdentifier("ios.diary.notDoneExercises")
        }
    }

    private func exerciseCard(_ ex: SessionExerciseDto, number: Int) -> some View {
        let labels = LukiI18n.setBadgeLabels(ex.sets.map(\.setType))
        return VStack(alignment: .leading, spacing: 8) {
            Text(ex.exerciseNameSnapshot)
                .font(.headline)
            ForEach(Array(ex.sets.enumerated()), id: \.element.clientSetId) { sIdx, set in
                setRow(exercise: ex, set: set, badgeLabel: labels[sIdx], id: "\(number).\(sIdx + 1)")
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    private func setRow(exercise ex: SessionExerciseDto, set: SessionSetDto, badgeLabel: String, id: String) -> some View {
        let n = set.setNumber
        let weight = set.weight ?? 0
        let reps = set.reps ?? 0
        let step = LukiFormat.weightStep(set.weightUnit)
        let isStretch = set.setType == .STRETCH || ex.exerciseTypeSnapshot == .STRETCHING

        return HStack(spacing: 8) {
            if isStretch {
                SetTypeBadge(setType: set.setType, label: badgeLabel, completed: set.completed)
                    .frame(minWidth: 44, minHeight: 44)
                Text("\(set.durationSeconds ?? 0) s")
                    .font(.body.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Menu {
                    Picker(tr("Set type"), selection: Binding(
                        get: { set.setType },
                        set: { changeSetType(exercise: ex, clientSetId: set.clientSetId, to: $0) }
                    )) {
                        ForEach(Self.strengthSetTypes, id: \.self) { type in
                            Text(LukiI18n.setTypeLabel(type, locale: tr)).tag(type)
                        }
                    }
                } label: {
                    SetTypeBadge(setType: set.setType, label: badgeLabel, completed: set.completed)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(tr("Set %d: %@", n, LukiI18n.setTypeLabel(set.setType, locale: tr)))
                .accessibilityIdentifier("ios.diary.setType.\(id)")

                LukiValueStepper(
                    value: LukiFormat.weight(weight),
                    unit: LukiFormat.unitLabel(set.weightUnit),
                    minusLabel: tr("Decrease weight by %@, set %d", LukiFormat.weight(step), n),
                    plusLabel: tr("Increase weight by %@, set %d", LukiFormat.weight(step), n),
                    onMinus: { updateSet(ex, set.clientSetId) { $0.weight = max(0, weight - step) } },
                    onPlus: { updateSet(ex, set.clientSetId) { $0.weight = weight + step } }
                )
                .layoutPriority(1)
                LukiValueStepper(
                    value: "\(reps)",
                    unit: tr("reps"),
                    minusLabel: tr("Decrease reps, set %d", n),
                    plusLabel: tr("Increase reps, set %d", n),
                    onMinus: { updateSet(ex, set.clientSetId) { $0.reps = max(0, reps - 1) } },
                    onPlus: { updateSet(ex, set.clientSetId) { $0.reps = reps + 1 } }
                )
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.diary.setRow.\(id)")
    }

    private func updateExercise(_ clientExerciseId: String, _ change: (inout SessionExerciseDto) -> Void) {
        guard let idx = draft.exercises.firstIndex(where: { $0.clientExerciseId == clientExerciseId }) else { return }
        change(&draft.exercises[idx])
    }

    private func updateSet(_ ex: SessionExerciseDto, _ clientSetId: String, _ change: (inout SessionSetDto) -> Void) {
        updateExercise(ex.clientExerciseId) { exercise in
            guard let idx = exercise.sets.firstIndex(where: { $0.clientSetId == clientSetId }) else { return }
            change(&exercise.sets[idx])
        }
    }

    private func changeSetType(exercise ex: SessionExerciseDto, clientSetId: String, to setType: SetType) {
        updateExercise(ex.clientExerciseId) {
            $0.sets = SessionCalculator.changingSetType($0.sets, clientSetId: clientSetId, to: setType)
        }
    }
}
