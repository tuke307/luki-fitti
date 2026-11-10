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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Keeps "12 reps" readable: the reps stepper never shrinks below this share of the row.
    @ScaledMetric(relativeTo: .body) private var repsMinWidth: CGFloat = 124

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
                    Text(subtitleText)
                        .font(.caption)
                        .monospacedDigit()
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
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(draft.workoutNameSnapshot)
                        .font(.headline)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.6)
                }
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
                // Number pads have no return key; Done ends typing and commits the value.
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button(tr("Done")) {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }

    private var doneExercises: [SessionExerciseDto] { draft.exercises.filter(\.hasLoggedSet) }

    /// "May 1, 2026 at 10:24 · Fix the set type…" — same line as the web dialog subtitle.
    private var subtitleText: String {
        let desc = tr("Fix the set type, weight or reps, then save.")
        guard let started = LukiDate.parseISO(draft.startedAt) else { return desc }
        let locale = Locale(identifier: tr.rawValue)
        let stamp = started.formatted(
            .dateTime.day().month(.abbreviated).year().hour().minute().locale(locale)
        )
        return "\(stamp) · \(desc)"
    }

    @ViewBuilder
    private var heartRateCard: some View {
        let samples = draft.heartRateSamples ?? []
        if draft.activeCaloriesKcal != nil || draft.avgHeartRateBpm != nil || !samples.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Label {
                    Text(tr("Heart rate"))
                } icon: {
                    Image(systemName: "heart.fill")
                }
                .font(.caption.weight(.bold))
                .foregroundStyle(LukiColors.heartRate)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        heartRateChips
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        heartRateChips
                    }
                }
                .font(.caption.weight(.bold))
                .monospacedDigit()

                if samples.count > 1 {
                    let bpms = samples.map(\.bpm)
                    Chart(samples, id: \.offsetSec) { pt in
                        AreaMark(
                            x: .value("Time", pt.offsetSec),
                            y: .value("BPM", pt.bpm)
                        )
                        .foregroundStyle(LinearGradient(
                            colors: [LukiColors.heartRate.opacity(0.55), LukiColors.heartRate.opacity(0.05)],
                            startPoint: .top,
                            endPoint: .bottom
                        ))
                        LineMark(
                            x: .value("Time", pt.offsetSec),
                            y: .value("BPM", pt.bpm)
                        )
                        .foregroundStyle(LukiColors.heartRate)
                    }
                    .chartYScale(domain: (bpms.min() ?? 40) - 10 ... (bpms.max() ?? 200) + 10)
                    .chartXAxis {
                        AxisMarks { value in
                            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5, dash: [3, 3]))
                                .foregroundStyle(.secondary.opacity(0.3))
                            AxisValueLabel {
                                if let sec = value.as(Int.self) {
                                    Text(LukiFormat.clock(sec))
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .chartYAxis {
                        AxisMarks { _ in
                            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5, dash: [3, 3]))
                                .foregroundStyle(.secondary.opacity(0.3))
                            AxisValueLabel()
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(height: 150)
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(LukiColors.heartRate.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(LukiColors.heartRate.opacity(0.3))
                    )
            )
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
            HStack(alignment: .firstTextBaseline) {
                Text("\(number). \(ex.exerciseNameSnapshot)")
                    .font(.headline)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(LukiI18n.muscleLabel(ex.primaryMuscleSnapshot, locale: tr))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
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

        let setLabel = set.setType == .WORKING
            ? tr("Set %@", badgeLabel)
            : LukiI18n.setTypeLabel(set.setType, locale: tr)

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if isStretch {
                    SetTypeBadge(setType: set.setType, label: badgeLabel, completed: set.completed)
                        .frame(minWidth: 44, minHeight: 44)
                } else {
                    setTypeMenu(exercise: ex, set: set, badgeLabel: badgeLabel, id: id, number: n)
                }
                Text(setLabel)
                    .font(.subheadline.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(LukiColors.setTypeColor(set.setType) ?? Color.primary)
                if set.peakHeartRateBpm != nil || set.restEndHeartRateBpm != nil {
                    Label(setHeartRateText(set), systemImage: "heart.fill")
                        .font(.caption2.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(LukiColors.heartRate)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(LukiColors.heartRate.opacity(0.15), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                Spacer(minLength: 0)
            }
            if isStretch {
                Text("\(set.durationSeconds ?? 0) s")
                    .font(.body.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                strengthSteppers(exercise: ex, set: set, weight: weight, reps: reps, step: step, n: n)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.diary.setRow.\(id)")
    }

    @ViewBuilder
    private var heartRateChips: some View {
        if let kcal = draft.activeCaloriesKcal {
            Text("\(Int(kcal.rounded())) kcal")
                .foregroundStyle(LukiColors.warning)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(LukiColors.warning.opacity(0.15), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        if let avg = draft.avgHeartRateBpm {
            Text(tr("Avg HR: %d bpm", avg))
                .foregroundStyle(LukiColors.heartRate)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(LukiColors.heartRate.opacity(0.15), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        if let maxHr = draft.maxHeartRateBpm {
            Text(tr("Max HR: %d bpm", maxHr))
                .foregroundStyle(LukiColors.heartRate)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(LukiColors.heartRate.opacity(0.15), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
    }

    /// "142 bpm peak · 118 bpm recovery" — same copy as the web chip.
    private func setHeartRateText(_ set: SessionSetDto) -> String {
        var text = set.peakHeartRateBpm.map { "\($0) bpm peak" }
            ?? "\(set.avgHeartRateBpm.map { "\($0)" } ?? "-") bpm"
        if let restEnd = set.restEndHeartRateBpm {
            text += " · \(restEnd) bpm recovery"
        }
        return text
    }

    private func setTypeMenu(exercise ex: SessionExerciseDto, set: SessionSetDto, badgeLabel: String, id: String, number n: Int) -> some View {
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
    }

    private func strengthSteppers(exercise ex: SessionExerciseDto, set: SessionSetDto, weight: Double, reps: Int, step: Double, n: Int) -> some View {
        let weightStepper = LukiValueStepper(
            value: LukiFormat.weight(weight),
            unit: LukiFormat.unitLabel(set.weightUnit),
            minusLabel: tr("Decrease weight by %@, set %d", LukiFormat.weight(step), n),
            plusLabel: tr("Increase weight by %@, set %d", LukiFormat.weight(step), n),
            editLabel: tr("Weight, set %d", n),
            keyboard: .decimal,
            onMinus: { updateSet(ex, set.clientSetId) { $0.weight = max(0, weight - step) } },
            onPlus: { updateSet(ex, set.clientSetId) { $0.weight = weight + step } },
            onSubmit: { text in
                if let v = LukiFormat.parseDecimal(text) {
                    updateSet(ex, set.clientSetId) { $0.weight = max(0, v) }
                }
            }
        )
        let repsStepper = LukiValueStepper(
            value: "\(reps)",
            unit: tr("reps"),
            minusLabel: tr("Decrease reps, set %d", n),
            plusLabel: tr("Increase reps, set %d", n),
            editLabel: tr("Reps, set %d", n),
            keyboard: .integer,
            onMinus: { updateSet(ex, set.clientSetId) { $0.reps = max(0, reps - 1) } },
            onPlus: { updateSet(ex, set.clientSetId) { $0.reps = reps + 1 } },
            onSubmit: { text in
                if let v = Int(text.trimmingCharacters(in: .whitespaces)) {
                    updateSet(ex, set.clientSetId) { $0.reps = max(0, v) }
                }
            }
        )
        // Accessibility sizes stack the steppers; side by side the reps keep a fixed share so
        // the weight stepper can't squeeze the count away.
        return Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 8) {
                    weightStepper
                    repsStepper
                }
            } else {
                HStack(spacing: 8) {
                    weightStepper
                    repsStepper
                        .frame(minWidth: min(repsMinWidth, 160), maxWidth: 160)
                }
            }
        }
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
