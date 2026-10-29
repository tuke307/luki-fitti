import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct ActiveSessionView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var swapTargetId: String?
    @State private var guideTargetId: String?
    @State private var showingAddExerciseSheet = false
    @State private var showingDiscardConfirmation = false
    @State private var nowTick: Date = Date()

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let completed = viewModel.completedSummarySession {
                    summaryCard(completed)
                } else if let session = viewModel.store.activeSession {
                    sessionHeader(session)
                    verticalExerciseStack(session)
                    sessionFooterActions
                }
            }
            .padding(16)
        }
        .safeAreaInset(edge: .bottom) {
            if viewModel.completedSummarySession == nil,
               let session = viewModel.store.activeSession {
                restTimerCard(session)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
            }
        }
        .background(LukiColors.groupedBackground)
        .onReceive(Timer.publish(every: 1.0, on: .main, in: .common).autoconnect()) { tick in
            nowTick = tick
        }
        .onAppear { viewModel.pinFocusedExercise() }
        .onChange(of: viewModel.store.activeSession?.exercises.map(\.clientExerciseId)) {
            viewModel.pinFocusedExercise()
        }
        .sheet(isPresented: Binding(
            get: { swapTargetId != nil },
            set: { if !$0 { swapTargetId = nil } }
        )) {
            if let target = viewModel.store.activeSession?.exercises.first(where: { $0.clientExerciseId == swapTargetId }) {
                SearchableExercisePickerSheet(
                    title: tr("Replace %@", target.exerciseNameSnapshot),
                    exercises: viewModel.store.catalog,
                    selectedExerciseId: target.exerciseId
                ) { candidate in
                    viewModel.substituteExerciseInSession(clientExerciseId: target.clientExerciseId, with: candidate)
                    swapTargetId = nil
                }
            }
        }
        .sheet(isPresented: Binding(
            get: { guideTargetId != nil },
            set: { if !$0 { guideTargetId = nil } }
        )) {
            if let target = viewModel.store.activeSession?.exercises.first(where: { $0.clientExerciseId == guideTargetId }) {
                ExerciseGuideSheet(
                    exercise: viewModel.store.catalog.first { $0.id == target.exerciseId },
                    fallbackName: target.exerciseNameSnapshot,
                    fallbackMuscle: target.primaryMuscleSnapshot
                )
            }
        }
        .sheet(isPresented: $showingAddExerciseSheet) {
            SearchableExercisePickerSheet(
                title: tr("Add Exercise"),
                exercises: viewModel.store.catalog,
                selectedExerciseId: nil
            ) { chosen in
                viewModel.addUnplannedExerciseToSession(chosen)
                showingAddExerciseSheet = false
            }
        }
        .confirmationDialog(
            tr("Discard this workout?"),
            isPresented: $showingDiscardConfirmation,
            titleVisibility: .visible
        ) {
            Button(tr("Discard Workout"), role: .destructive) {
                viewModel.abandonActiveSession()
            }
            .accessibilityIdentifier("ios.session.confirmDiscardButton")
            Button(tr("Keep Training"), role: .cancel) {}
        } message: {
            Text(tr("It won’t be saved to your history. Your plan stays the same."))
        }
    }

    private var unit: WeightUnit {
        viewModel.store.activeSession?.weightUnit ?? viewModel.store.preferences.weightUnit
    }

    // MARK: - Summary

    private func summaryCard(_ session: WorkoutSessionDto) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark.seal.fill")
                .font(.largeTitle)
                .foregroundStyle(LukiColors.accent)
                .accessibilityHidden(true)
            VStack(spacing: 4) {
                Text(tr("Workout saved"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(tr("%@ done", session.workoutNameSnapshot))
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                Text(tr("Nice work. It’s in your history now."))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            ViewThatFits {
                HStack(spacing: 12) { summaryStats(session) }
                VStack(spacing: 8) { summaryStats(session) }
            }

            Button {
                viewModel.completedSummarySession = nil
                viewModel.selectedTab = .diary
            } label: {
                Text(tr("View in History"))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityIdentifier("ios.session.viewInDiaryButton")
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.session.trophyCard")
    }

    @ViewBuilder
    private func summaryStats(_ session: WorkoutSessionDto) -> some View {
        statPill(label: tr("Sets"), value: "\(session.totalSetsCompleted)")
        statPill(label: tr("Volume"), value: LukiFormat.volume(kg: session.totalVolumeKg, unit: session.weightUnit))
        if let kcal = session.activeCaloriesKcal, kcal > 0 {
            statPill(label: tr("Active energy"), value: "\(Int(kcal)) kcal")
        }
        if let avgHr = session.avgHeartRateBpm {
            statPill(label: tr("Avg heart rate"), value: "\(avgHr) bpm")
        }
    }

    private func statPill(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(.secondary)
            Text(value).font(.subheadline.bold().monospacedDigit()).foregroundStyle(.primary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.fill))
        .accessibilityElement(children: .combine)
    }

    // MARK: - Header

    private func sessionHeader(_ session: WorkoutSessionDto) -> some View {
        let totalSets = session.exercises.reduce(0) { $0 + $1.sets.count }
        let doneSets = session.totalSetsCompleted
        let pct = totalSets > 0 ? Double(doneSets) / Double(totalSets) : 0
        let isPaused = session.status == .PAUSED

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(isPaused ? tr("Paused") : tr("In Progress"))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(isPaused ? Color.secondary : LukiColors.accent)
                    Text(session.workoutNameSnapshot)
                        .font(.title3.bold())
                }
                Spacer()
                Button {
                    viewModel.togglePauseActiveSession()
                } label: {
                    Label(isPaused ? tr("Resume") : tr("Pause"), systemImage: isPaused ? "play.fill" : "pause.fill")
                }
                .buttonStyle(.bordered)
            }

            HStack(spacing: 14) {
                Label(
                    "\(viewModel.healthCoordinator.currentHeartRateBpm.map(String.init) ?? "–") bpm",
                    systemImage: "heart.fill"
                )
                .foregroundStyle(LukiColors.heartRate)
                Label("\(Int(viewModel.healthCoordinator.activeCaloriesKcal)) kcal", systemImage: "flame.fill")
                    .foregroundStyle(LukiColors.calories)
                Spacer()
                Text(LukiFormat.volume(kg: session.totalVolumeKg, unit: session.weightUnit))
                    .foregroundStyle(.secondary)
            }
            .font(.footnote.weight(.medium).monospacedDigit())
            .labelStyle(.titleAndIcon)

            ProgressView(value: pct) {
                Text(tr("%d of %d sets", doneSets, totalSets))
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            .tint(LukiColors.accent)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    // MARK: - Rest timer

    private func restTimerCard(_ session: WorkoutSessionDto) -> some View {
        let rest = SessionCalculator.computeRemainingRestSeconds(session: session, now: nowTick)
        let isActive = rest.isRunning || rest.isPaused

        return VStack(alignment: .leading, spacing: 8) {
            if isActive {
                if rest.totalSeconds > 0 {
                    ProgressView(value: Double(rest.remainingSeconds), total: Double(max(1, rest.totalSeconds)))
                        .tint(LukiColors.accent)
                }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        restClock(rest)
                        Spacer(minLength: 4)
                        restControls(rest)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        restClock(rest)
                        HStack(spacing: 8) { restControls(rest) }
                    }
                }
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        Label(tr("Start rest"), systemImage: "timer")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 4)
                        restPresets
                    }
                    HStack(spacing: 8) { restPresets }
                }
            }
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func restClock(_ rest: RestTimerStatus) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(rest.isPaused ? tr("Rest paused") : tr("Rest"))
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
            Text(LukiFormat.clock(rest.remainingSeconds))
                .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func restControls(_ rest: RestTimerStatus) -> some View {
        Button("-15s") { viewModel.adjustRestTimer(deltaSeconds: -15) }
            .buttonStyle(.bordered)
            .controlSize(.large)
        Button("+15s") { viewModel.adjustRestTimer(deltaSeconds: 15) }
            .buttonStyle(.bordered)
            .controlSize(.large)
        Button {
            viewModel.togglePauseRestTimer()
        } label: {
            Image(systemName: rest.isPaused ? "play.fill" : "pause.fill")
                .frame(minWidth: 24, minHeight: 28)
        }
        .buttonStyle(.bordered)
        .accessibilityLabel(rest.isPaused ? tr("Resume") : tr("Pause"))
        Button {
            viewModel.skipRestTimer()
        } label: {
            Image(systemName: "forward.end.fill")
                .frame(minWidth: 24, minHeight: 28)
        }
        .buttonStyle(.borderedProminent)
        .accessibilityLabel(tr("Skip Rest"))
    }

    private var restPresets: some View {
        HStack(spacing: 6) {
            ForEach([(60, "60s"), (90, "90s"), (150, "2:30")], id: \.0) { sec, label in
                Button(label) { viewModel.startRestTimer(durationSeconds: sec) }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .monospacedDigit()
            }
        }
    }

    // MARK: - Exercise stack

    private func verticalExerciseStack(_ session: WorkoutSessionDto) -> some View {
        let safeIdx = viewModel.focusedExerciseIndex
        let blocks = ProgressionEngine.groupSessionExercisesIntoBlocks(session.exercises)

        return VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                if block.isSuperset {
                    supersetBlock(session: session, block: block)
                } else if let firstItem = block.items.first {
                    if firstItem.globalIndex == safeIdx {
                        activeExerciseCard(
                            session: session,
                            exercise: firstItem.item,
                            exerciseIndex: firstItem.globalIndex
                        )
                    } else {
                        collapsedExerciseRow(exercise: firstItem.item, index: firstItem.globalIndex)
                    }
                }
            }

            sessionSuggestionCard(session)

            Button {
                showingAddExerciseSheet = true
            } label: {
                Label(tr("Add Exercise"), systemImage: "plus")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
    }

    // MARK: - Exercise actions (swipe, VoiceOver actions and the ⋯ menu share these)

    private func leadingExerciseActions(_ exercise: SessionExerciseDto) -> [LukiSwipeAction] {
        [
            LukiSwipeAction(id: "swap", label: tr("Replace"), systemImage: "arrow.triangle.swap") {
                swapTargetId = exercise.clientExerciseId
            },
        ]
    }

    private func trailingExerciseActions(_ exercise: SessionExerciseDto) -> [LukiSwipeAction] {
        [
            LukiSwipeAction(id: "remove", label: tr("Delete"), systemImage: "trash", tone: .destructive) {
                viewModel.removeExerciseFromSession(clientExerciseId: exercise.clientExerciseId)
            },
        ]
    }

    private func exerciseMenu(session: WorkoutSessionDto, exercise: SessionExerciseDto, exerciseIndex: Int) -> some View {
        Menu {
            Button {
                guideTargetId = exercise.clientExerciseId
            } label: {
                Label(tr("How to do it"), systemImage: "book")
            }
            Button {
                swapTargetId = exercise.clientExerciseId
            } label: {
                Label(tr("Replace"), systemImage: "arrow.triangle.swap")
            }
            Button {
                viewModel.reorderExerciseInSession(clientExerciseId: exercise.clientExerciseId, moveUp: true)
                viewModel.focusExercise(clientExerciseId: exercise.clientExerciseId)
            } label: {
                Label(tr("Move Earlier"), systemImage: "arrow.up")
            }
            .disabled(exerciseIndex == 0)
            Button {
                viewModel.reorderExerciseInSession(clientExerciseId: exercise.clientExerciseId, moveUp: false)
                viewModel.focusExercise(clientExerciseId: exercise.clientExerciseId)
            } label: {
                Label(tr("Move Later"), systemImage: "arrow.down")
            }
            .disabled(exerciseIndex == session.exercises.count - 1)
            Divider()
            Button(role: .destructive) {
                viewModel.removeExerciseFromSession(clientExerciseId: exercise.clientExerciseId)
            } label: {
                Label(tr("Remove from this workout"), systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.body.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(tr("More actions for %@", exercise.exerciseNameSnapshot))
    }

    /// Small picture that opens the how-to. Always a sibling of the row button, never inside it.
    private func guideThumbnailButton(_ exercise: SessionExerciseDto) -> some View {
        Button {
            guideTargetId = exercise.clientExerciseId
        } label: {
            Image(systemName: "figure.strengthtraining.traditional")
                .font(.body.weight(.semibold))
                .foregroundStyle(LukiColors.accent)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(LukiColors.fill))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tr("How to do %@", exercise.exerciseNameSnapshot))
    }

    private func repsTarget(_ exercise: SessionExerciseDto) -> String {
        let minReps = exercise.targetRepsMin ?? 8
        let maxReps = exercise.targetRepsMax ?? 12
        return minReps == maxReps ? "\(exercise.plannedSets)×\(minReps)" : "\(exercise.plannedSets)×\(minReps)–\(maxReps)"
    }

    private func collapsedExerciseRow(exercise: SessionExerciseDto, index: Int) -> some View {
        let doneCount = exercise.sets.filter(\.completed).count
        let isCompleted = exercise.status == .COMPLETED
        return LukiSwipeRow(leading: leadingExerciseActions(exercise), trailing: trailingExerciseActions(exercise)) {
            HStack(spacing: 0) {
                guideThumbnailButton(exercise)
                    .padding(.leading, 8)
                Button {
                    viewModel.focusExercise(at: index)
                } label: {
                    HStack(spacing: 10) {
                        Group {
                            if isCompleted {
                                Image(systemName: "checkmark")
                                    .font(.footnote.bold())
                                    .foregroundStyle(LukiColors.onTint)
                            } else {
                                Text("\(index + 1)")
                                    .font(.footnote.bold().monospacedDigit())
                                    .foregroundStyle(.primary)
                            }
                        }
                        .frame(minWidth: 28, minHeight: 28)
                        .background(Circle().fill(isCompleted ? LukiColors.success : LukiColors.fill))
                        .accessibilityHidden(true)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(exercise.exerciseNameSnapshot)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            Text("\(LukiI18n.muscleLabel(exercise.primaryMuscleSnapshot, locale: tr)) · \(repsTarget(exercise))")
                                .font(.footnote.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                        Text("\(doneCount)/\(exercise.sets.count)")
                            .font(.footnote.monospacedDigit())
                            .foregroundStyle(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                            .accessibilityHidden(true)
                    }
                    .padding(.vertical, 12)
                    .padding(.leading, 6)
                    .padding(.trailing, 12)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityValue(tr("%d of %d sets", doneCount, exercise.sets.count))
                .accessibilityIdentifier("ios.session.exerciseRow.\(index + 1)")
            }
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LukiColors.cardBackground)
            )
        }
    }

    // MARK: - Active exercise card

    private func insightFor(session: WorkoutSessionDto, exercise: SessionExerciseDto) -> ExerciseProgressionInsight {
        ProgressionEngine.computeExerciseProgression(
            exerciseId: exercise.exerciseId,
            exerciseName: exercise.exerciseNameSnapshot,
            historySessions: viewModel.store.historySessions,
            catalogExercise: viewModel.store.catalog.first { $0.id == exercise.exerciseId },
            plannedSets: exercise.plannedSets,
            targetRepsMin: exercise.targetRepsMin,
            targetRepsMax: exercise.targetRepsMax,
            targetWeight: exercise.targetWeight,
            weightUnit: session.weightUnit,
            currentSets: exercise.sets
        )
    }

    /// Progression suggestions only apply to working-type sets; warm-ups and stretches get none.
    private func alignedSuggestions(_ exercise: SessionExerciseDto, insight: ExerciseProgressionInsight) -> [SetProgressionSuggestion?] {
        var workingIdx = 0
        return exercise.sets.map { set in
            if set.setType == .WARMUP || set.setType == .STRETCH || exercise.exerciseTypeSnapshot == .STRETCHING {
                return nil
            }
            defer { workingIdx += 1 }
            if workingIdx < insight.setSuggestions.count { return insight.setSuggestions[workingIdx] }
            return insight.setSuggestions.last
        }
    }

    private func lastSessionLine(_ insight: ExerciseProgressionInsight) -> some View {
        Group {
            if let last = insight.lastSession {
                let sets = last.workingSets.prefix(4)
                    .map { "\(LukiFormat.weight($0.weightNormalized)) \(LukiFormat.unitLabel(unit)) × \($0.reps)" }
                    .joined(separator: " · ")
                Text("\(tr("Last time (%@)", last.workoutName)): \(sets)")
            } else {
                Text(tr("First time doing this exercise"))
            }
        }
        .font(.footnote.monospacedDigit())
        .foregroundStyle(.secondary)
    }

    private func activeExerciseCard(session: WorkoutSessionDto, exercise: SessionExerciseDto, exerciseIndex: Int) -> some View {
        let insight = insightFor(session: session, exercise: exercise)
        let suggestions = alignedSuggestions(exercise, insight: insight)
        let labels = LukiI18n.setBadgeLabels(exercise.sets.map(\.setType))
        let goal = [
            LukiI18n.muscleLabel(exercise.primaryMuscleSnapshot, locale: tr),
            repsTarget(exercise),
            exercise.restSeconds > 0 ? tr("%d s rest", exercise.restSeconds) : nil,
        ].compactMap { $0 }.joined(separator: " · ")

        return VStack(alignment: .leading, spacing: 12) {
            LukiSwipeRow(
                leading: leadingExerciseActions(exercise),
                trailing: trailingExerciseActions(exercise),
                cornerRadius: 14
            ) {
                HStack(alignment: .top, spacing: 10) {
                    Button {
                        guideTargetId = exercise.clientExerciseId
                    } label: {
                        ExerciseVectorVisualView(
                            exerciseName: exercise.exerciseNameSnapshot,
                            primaryMuscle: exercise.primaryMuscleSnapshot,
                            compact: true
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(tr("How to do %@", exercise.exerciseNameSnapshot))
                    .accessibilityIdentifier("ios.session.guideButton.\(exerciseIndex + 1)")

                    VStack(alignment: .leading, spacing: 4) {
                        Button {
                            guideTargetId = exercise.clientExerciseId
                        } label: {
                            Text(exercise.exerciseNameSnapshot)
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.leading)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityHint(tr("How to do it"))
                        Text(goal)
                            .font(.footnote.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    exerciseMenu(session: session, exercise: exercise, exerciseIndex: exerciseIndex)
                }
                .padding(4)
                .background(LukiColors.cardBackground)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("ios.session.exerciseHeader.\(exerciseIndex + 1)")
            }

            lastSessionLine(insight)

            VStack(spacing: 0) {
                ForEach(Array(exercise.sets.enumerated()), id: \.element.clientSetId) { idx, set in
                    if idx > 0 { Divider() }
                    setRow(
                        session: session,
                        exercise: exercise,
                        set: set,
                        setIndex: idx,
                        badgeLabel: idx < labels.count ? labels[idx] : "\(idx + 1)",
                        suggestion: idx < suggestions.count ? suggestions[idx] : nil
                    )
                }
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { exerciseFooter(session: session, exercise: exercise, exerciseIndex: exerciseIndex) }
                VStack(alignment: .leading, spacing: 8) { exerciseFooter(session: session, exercise: exercise, exerciseIndex: exerciseIndex) }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    @ViewBuilder
    private func exerciseFooter(session: WorkoutSessionDto, exercise: SessionExerciseDto, exerciseIndex: Int) -> some View {
        Button {
            viewModel.addSetToExercise(clientExerciseId: exercise.clientExerciseId, setType: .WORKING)
        } label: {
            Label(tr("Add Set"), systemImage: "plus")
        }
        .buttonStyle(.bordered)
        .controlSize(.large)

        Spacer(minLength: 0)

        if exerciseIndex < session.exercises.count - 1 {
            Button {
                viewModel.focusExercise(at: exerciseIndex + 1)
            } label: {
                Label(tr("Next: %@", session.exercises[exerciseIndex + 1].exerciseNameSnapshot), systemImage: "arrow.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .lineLimit(1)
            }
            .font(.subheadline.weight(.semibold))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
    }

    // MARK: - Superset rounds (A1 + B1 together, then A2 + B2 …)

    private func supersetBlock(session: WorkoutSessionDto, block: ExerciseRenderBlock<SessionExerciseDto>) -> some View {
        let members: [(exercise: SessionExerciseDto, index: Int, letter: String, insight: ExerciseProgressionInsight, labels: [String], suggestions: [SetProgressionSuggestion?])] =
            block.items.enumerated().map { offset, item in
                let insight = insightFor(session: session, exercise: item.item)
                return (
                    item.item,
                    item.globalIndex,
                    String(UnicodeScalar(UInt8(65 + offset))),
                    insight,
                    LukiI18n.setBadgeLabels(item.item.sets.map(\.setType)),
                    alignedSuggestions(item.item, insight: insight)
                )
            }
        let rounds = members.map(\.exercise.sets.count).max() ?? 0

        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(tr("Superset · %d rounds", block.rounds))
                    .font(.subheadline.weight(.semibold))
                Text(tr("No rest between exercises · %@ between rounds", ProgressionEngine.formatRestDurationMinSec(block.roundRestSeconds)))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(12)

            VStack(spacing: 8) {
                ForEach(members, id: \.exercise.clientExerciseId) { member in
                    LukiSwipeRow(
                        leading: leadingExerciseActions(member.exercise),
                        trailing: trailingExerciseActions(member.exercise),
                        cornerRadius: 16
                    ) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 10) {
                                Text(member.letter)
                                    .font(.subheadline.bold())
                                    .foregroundStyle(LukiColors.accent)
                                    .frame(minWidth: 28, minHeight: 28)
                                    .background(Circle().fill(LukiColors.accent.opacity(0.12)))
                                guideThumbnailButton(member.exercise)
                                VStack(alignment: .leading, spacing: 2) {
                                    Button {
                                        guideTargetId = member.exercise.clientExerciseId
                                    } label: {
                                        Text(member.exercise.exerciseNameSnapshot)
                                            .font(.subheadline.bold())
                                            .foregroundStyle(.primary)
                                            .lineLimit(1)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityHint(tr("How to do it"))
                                    Text("\(LukiI18n.muscleLabel(member.exercise.primaryMuscleSnapshot, locale: tr)) · \(repsTarget(member.exercise))")
                                        .font(.footnote.monospacedDigit())
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                exerciseMenu(session: session, exercise: member.exercise, exerciseIndex: member.index)
                            }
                            lastSessionLine(member.insight)
                        }
                        .padding(10)
                        .background(LukiColors.cardBackground)
                        .accessibilityIdentifier("ios.session.superset.exercise.\(member.letter)")
                    }
                }

                ForEach(0..<rounds, id: \.self) { round in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(tr("Round %d of %d", round + 1, rounds))
                            .font(.footnote.weight(.semibold).monospacedDigit())
                            .foregroundStyle(.secondary)
                        ForEach(members, id: \.exercise.clientExerciseId) { member in
                            if round < member.exercise.sets.count {
                                let set = member.exercise.sets[round]
                                setRow(
                                    session: session,
                                    exercise: member.exercise,
                                    set: set,
                                    setIndex: round,
                                    badgeLabel: round < member.labels.count ? member.labels[round] : "\(round + 1)",
                                    suggestion: round < member.suggestions.count ? member.suggestions[round] : nil,
                                    contextLabel: "\(member.letter) · \(member.exercise.exerciseNameSnapshot)",
                                    accessibilityId: "ios.session.superset.set.\(member.letter)\(round + 1)"
                                )
                            } else {
                                Text("\(member.letter) · \(member.exercise.exerciseNameSnapshot) · –")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .padding(.vertical, 6)
                            }
                        }
                    }
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LukiColors.cardBackground))
                    .accessibilityIdentifier("ios.session.superset.round.\(round + 1)")
                }

                Button {
                    for member in members {
                        viewModel.addSetToExercise(clientExerciseId: member.exercise.clientExerciseId, setType: .WORKING)
                    }
                } label: {
                    Label(tr("Add Round"), systemImage: "plus")
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            .padding(10)
        }
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.fill))
    }

    // MARK: - Set row

    private func setRow(
        session: WorkoutSessionDto,
        exercise: SessionExerciseDto,
        set: SessionSetDto,
        setIndex: Int,
        badgeLabel: String,
        suggestion: SetProgressionSuggestion?,
        contextLabel: String? = nil,
        accessibilityId: String? = nil
    ) -> some View {
        let n = setIndex + 1
        let currentWeight = set.weight ?? 0
        let currentReps = set.reps ?? 0
        let step = LukiFormat.weightStep(set.weightUnit)
        let unitText = LukiFormat.unitLabel(set.weightUnit)
        let typeColor = LukiColors.setTypeColor(set.setType)
        let update: (Double?, Int?) -> Void = { weight, reps in
            viewModel.updateSet(
                clientExerciseId: exercise.clientExerciseId,
                clientSetId: set.clientSetId,
                weight: weight,
                reps: reps
            )
        }
        let deleteSet = {
            viewModel.removeSetFromExercise(clientExerciseId: exercise.clientExerciseId, clientSetId: set.clientSetId)
        }

        return LukiSwipeRow(trailing: [
            LukiSwipeAction(id: "delete", label: tr("Delete"), systemImage: "trash", tone: .destructive, action: deleteSet),
        ]) {
            VStack(alignment: .leading, spacing: 6) {
                if let contextLabel {
                    Text(contextLabel)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                HStack(spacing: 8) {
                    // Badge opens the set menu: type picker and Delete, so nothing is swipe-only.
                    Menu {
                        Picker(tr("Set type"), selection: Binding(
                            get: { set.setType },
                            set: { newType in
                                viewModel.updateSet(
                                    clientExerciseId: exercise.clientExerciseId,
                                    clientSetId: set.clientSetId,
                                    setType: newType
                                )
                            }
                        )) {
                            ForEach(SetType.allCases, id: \.self) { st in
                                Text(LukiI18n.setTypeLabel(st, locale: tr)).tag(st)
                            }
                        }
                        Divider()
                        Button(role: .destructive, action: deleteSet) {
                            Label(tr("Delete Set"), systemImage: "trash")
                        }
                    } label: {
                        SetTypeBadge(setType: set.setType, label: badgeLabel, completed: set.completed)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel(tr("Set %d: %@", n, LukiI18n.setTypeLabel(set.setType, locale: tr)))
                    .accessibilityIdentifier("ios.session.setType.\(n)")

                    if set.completed {
                        HStack(spacing: 6) {
                            if set.setType != .WORKING {
                                Text(LukiI18n.setTypeLabel(set.setType, locale: tr))
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(typeColor ?? .primary)
                            }
                            Text("\(LukiFormat.weight(currentWeight)) \(unitText) × \(currentReps)")
                                .font(.body.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        Button {
                            viewModel.updateSet(
                                clientExerciseId: exercise.clientExerciseId,
                                clientSetId: set.clientSetId,
                                rpe: .some(nextCycleRpe(set.rpe))
                            )
                        } label: {
                            Label(LukiI18n.effortLabel(rpe: set.rpe, locale: tr), systemImage: "chart.bar.fill")
                                .font(.footnote)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                    } else {
                        stepper(
                            value: LukiFormat.weight(currentWeight),
                            unit: unitText,
                            minusLabel: tr("Decrease weight by %@, set %d", LukiFormat.weight(step), n),
                            plusLabel: tr("Increase weight by %@, set %d", LukiFormat.weight(step), n),
                            onMinus: { update(max(0, currentWeight - step), nil) },
                            onPlus: { update(currentWeight + step, nil) }
                        )
                        .layoutPriority(1)
                        stepper(
                            value: "\(currentReps)",
                            unit: tr("reps"),
                            minusLabel: tr("Decrease reps, set %d", n),
                            plusLabel: tr("Increase reps, set %d", n),
                            onMinus: { update(nil, max(0, currentReps - 1)) },
                            onPlus: { update(nil, currentReps + 1) }
                        )
                    }

                    Button {
                        viewModel.toggleCompleteSet(
                            clientExerciseId: exercise.clientExerciseId,
                            clientSetId: set.clientSetId
                        )
                    } label: {
                        Image(systemName: "checkmark")
                            .font(.body.weight(.bold))
                            .foregroundStyle(set.completed ? LukiColors.onTint : LukiColors.accent)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(set.completed ? LukiColors.success : LukiColors.accent.opacity(0.12)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(set.completed ? tr("Mark set %d not done", n) : tr("Complete set %d", n))
                    .accessibilityIdentifier(accessibilityId ?? "ios.session.completeSet.\(n)")
                }

                if !set.completed,
                   let suggestion,
                   let wDelta = ProgressionEngine.formatCompactDelta(suggestion.weightDelta),
                   let suggestedW = suggestion.suggestedWeight {
                    Button {
                        viewModel.updateSet(
                            clientExerciseId: exercise.clientExerciseId,
                            clientSetId: set.clientSetId,
                            weight: suggestedW,
                            reps: suggestion.suggestedReps
                        )
                    } label: {
                        Label(tr("Try %@ %@ (%@)", LukiFormat.weight(suggestedW), unitText, wDelta), systemImage: "sparkles")
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(LukiColors.accent)
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                    .padding(.leading, 52)
                    .accessibilityHint(tr("Applies the suggested weight to this set"))
                }
            }
            .padding(.vertical, 4)
            .background(
                (typeColor ?? LukiColors.success).opacity(set.completed ? 0.06 : 0)
            )
            .background(LukiColors.cardBackground)
        }
    }

    private func stepper(
        value: String,
        unit: String,
        minusLabel: String,
        plusLabel: String,
        onMinus: @escaping () -> Void,
        onPlus: @escaping () -> Void
    ) -> some View {
        LukiValueStepper(
            value: value,
            unit: unit,
            minusLabel: minusLabel,
            plusLabel: plusLabel,
            onMinus: onMinus,
            onPlus: onPlus
        )
    }

    // MARK: - Suggestion

    @ViewBuilder
    private func sessionSuggestionCard(_ session: WorkoutSessionDto) -> some View {
        if viewModel.store.preferences.exerciseSuggestionsEnabled,
           let suggestion = ProgressionEngine.computeWorkoutExerciseSuggestion(
               workoutName: session.workoutNameSnapshot,
               exercises: session.exercises.map {
                   WorkoutSuggestionInputExercise(
                       exerciseId: $0.exerciseId,
                       exerciseName: $0.exerciseNameSnapshot,
                       primaryMuscleGroup: $0.primaryMuscleSnapshot,
                       plannedSets: $0.plannedSets
                   )
               },
               catalog: viewModel.store.catalog,
               historySessions: viewModel.store.historySessions,
               weightUnit: session.weightUnit,
               dismissed: dismissedSuggestions(session)
           ) {
            let stallingExercise = session.exercises.first {
                $0.exerciseId != nil && $0.exerciseId == suggestion.stallingExerciseId
            }
            SuggestionCardView(
                suggestion: suggestion,
                locale: tr,
                onAdd: {
                    dismiss(suggestion, in: session)
                    viewModel.addUnplannedExerciseToSession(suggestion.suggestedExercise)
                },
                onReplace: stallingExercise.map { target in
                    {
                        dismiss(suggestion, in: session)
                        viewModel.substituteExerciseInSession(
                            clientExerciseId: target.clientExerciseId,
                            with: suggestion.suggestedExercise
                        )
                        viewModel.focusExercise(clientExerciseId: target.clientExerciseId)
                    }
                },
                onDismiss: { dismiss(suggestion, in: session) }
            )
            .accessibilityIdentifier("ios.session.rainbowSuggestion")
        }
    }

    private func dismissedSuggestions(_ session: WorkoutSessionDto) -> [DismissedWorkoutSuggestion] {
        _ = viewModel.store.dismissedSuggestionsRevision
        return viewModel.store.dismissedSuggestions(clientSessionId: session.clientSessionId)
    }

    private func dismiss(_ suggestion: WorkoutExerciseSuggestion, in session: WorkoutSessionDto) {
        let next = dismissedSuggestions(session) + [ProgressionEngine.toDismissedSuggestion(suggestion)]
        viewModel.store.setDismissedSuggestions(next, clientSessionId: session.clientSessionId)
    }

    private func nextCycleRpe(_ rpe: Double?) -> Double? {
        guard let rpe else { return 7.0 }
        if rpe <= 7.5 { return 8.0 }
        if rpe < ProgressionEngine.maxEffortRpe { return ProgressionEngine.maxEffortRpe }
        return nil
    }

    // MARK: - Footer

    private var sessionFooterActions: some View {
        VStack(spacing: 10) {
            Button {
                Task { await viewModel.finishActiveSession() }
            } label: {
                Label(tr("Finish Workout"), systemImage: "checkmark.circle.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityIdentifier("ios.session.finishButton")

            Button(role: .destructive) {
                showingDiscardConfirmation = true
            } label: {
                Text(tr("Discard Workout"))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderless)
            .tint(LukiColors.destructive)
            .controlSize(.large)
            .accessibilityIdentifier("ios.session.abandonButton")
        }
    }
}

/// "Next: Bench Press →" with the icon after the title.
struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.title
            configuration.icon.imageScale(.small)
        }
    }
}
