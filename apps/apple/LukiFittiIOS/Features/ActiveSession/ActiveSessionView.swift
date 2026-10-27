import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct ActiveSessionView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var selectedExerciseIndex: Int = 0
    @State private var swapTargetId: String?
    @State private var showingAddExerciseSheet = false
    @State private var nowTick: Date = Date()

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let completed = viewModel.completedSummarySession {
                    trophySummaryCard(completed)
                } else if let session = viewModel.store.activeSession {
                    liveTelemetryBanner(session)
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
        .sheet(isPresented: Binding(
            get: { swapTargetId != nil },
            set: { if !$0 { swapTargetId = nil } }
        )) {
            if let target = viewModel.store.activeSession?.exercises.first(where: { $0.clientExerciseId == swapTargetId }) {
                SearchableExercisePickerSheet(
                    title: "Replace \(target.exerciseNameSnapshot)",
                    exercises: viewModel.store.catalog,
                    selectedExerciseId: target.exerciseId
                ) { candidate in
                    viewModel.substituteExerciseInSession(clientExerciseId: target.clientExerciseId, with: candidate)
                    swapTargetId = nil
                }
            }
        }
        .sheet(isPresented: $showingAddExerciseSheet) {
            SearchableExercisePickerSheet(
                title: "Add Unplanned Exercise",
                exercises: viewModel.store.catalog,
                selectedExerciseId: nil
            ) { chosen in
                viewModel.addUnplannedExerciseToSession(chosen)
                if let count = viewModel.store.activeSession?.exercises.count, count > 0 {
                    selectedExerciseIndex = count - 1
                }
                showingAddExerciseSheet = false
            }
        }
    }

    // MARK: - Trophy Summary Card

    private func trophySummaryCard(_ session: WorkoutSessionDto) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 38))
                .foregroundStyle(LukiColors.accent)
            Text("Session Saved & Queued for Sync")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LukiColors.accent)
            Text("\(session.workoutNameSnapshot) Complete!")
                .font(.title2.bold())
                .foregroundStyle(.primary)

            HStack(spacing: 12) {
                statPill(label: "Sets", value: "\(session.totalSetsCompleted)")
                statPill(label: "Volume", value: "\(Int(session.totalVolumeKg)) kg")
                if let kcal = session.activeCaloriesKcal, kcal > 0 {
                    statPill(label: "Active Kcal", value: "\(Int(kcal))")
                }
                if let avgHr = session.avgHeartRateBpm {
                    statPill(label: "Avg HR", value: "\(avgHr) bpm")
                }
            }

            Button {
                viewModel.completedSummarySession = nil
                viewModel.selectedTab = .diary
            } label: {
                Text("View in Training Diary")
                    .font(.subheadline.bold())
                    .foregroundStyle(LukiColors.accentForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.accent))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ios.session.viewInDiaryButton")
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.session.trophyCard")
    }

    private func statPill(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.footnote).foregroundStyle(.secondary)
            Text(value).font(.subheadline.bold().monospacedDigit()).foregroundStyle(.primary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.fill))
    }

    // MARK: - Live Telemetry Banner

    private func liveTelemetryBanner(_ session: WorkoutSessionDto) -> some View {
        let totalSets = session.exercises.reduce(0) { $0 + $1.sets.count }
        let doneSets = session.totalSetsCompleted
        let pct = totalSets > 0 ? Double(doneSets) / Double(totalSets) : 0

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(session.status == .PAUSED ? "PAUSED" : "LIVE SESSION")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(LukiColors.accentForeground)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(session.status == .PAUSED ? LukiColors.calorieAmber : LukiColors.accent))

                Spacer()

                HStack(spacing: 10) {
                    Label(
                        "\(viewModel.healthCoordinator.currentHeartRateBpm.map(String.init) ?? "--") BPM",
                        systemImage: "heart.fill"
                    )
                    .font(.caption.bold().monospacedDigit())
                    .foregroundStyle(LukiColors.heartRose)

                    Label(
                        "\(Int(viewModel.healthCoordinator.activeCaloriesKcal)) KCal",
                        systemImage: "flame.fill"
                    )
                    .font(.caption.bold().monospacedDigit())
                    .foregroundStyle(LukiColors.calorieAmber)
                }
            }

            HStack {
                Text(session.workoutNameSnapshot)
                    .font(.title3.bold())
                    .foregroundStyle(.primary)
                Spacer()
                Button(session.status == .PAUSED ? "Resume" : "Pause") {
                    viewModel.togglePauseActiveSession()
                }
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(LukiColors.fill))
            }

            HStack {
                Text("Progress: \(Int((pct * 100).rounded()))% (\(doneSets)/\(totalSets) sets)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(Int(session.totalVolumeKg)) kg vol")
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(LukiColors.accent)
            }
            ProgressView(value: pct)
                .tint(LukiColors.accent)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    // MARK: - Persistent Rest Timer Card (Matches Web App `active-session-view.tsx`)

    private func restTimerCard(_ session: WorkoutSessionDto) -> some View {
        let rest = SessionCalculator.computeRemainingRestSeconds(session: session, now: nowTick)
        let isActive = rest.isRunning || rest.isPaused
        let statusTitle = rest.isRunning
            ? "REST TIMER ACTIVE"
            : rest.isPaused
                ? "REST TIMER PAUSED"
                : "REST TIMER READY"

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                HStack(spacing: 10) {
                    Image(systemName: "timer")
                        .font(.title3.bold())
                        .foregroundStyle(isActive ? LukiColors.accentForeground : LukiColors.accent)
                        .frame(width: 38, height: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(isActive ? LukiColors.accent : LukiColors.fill)
                        )

                    VStack(alignment: .leading, spacing: 2) {
                        Text(statusTitle)
                            .font(.footnote)
                            .foregroundStyle(isActive ? LukiColors.accent : .secondary)

                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text(formatTimer(rest.remainingSeconds))
                                .font(.title2.bold().monospacedDigit())
                                .foregroundStyle(.primary)
                            if rest.totalSeconds > 0 {
                                Text("/ \(formatTimer(rest.totalSeconds))")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Spacer()

                // Preset buttons (60s, 90s, 2m30s)
                HStack(spacing: 6) {
                    ForEach([(60, "60s"), (90, "90s"), (150, "2m30s")], id: \.0) { sec, label in
                        Button {
                            viewModel.startRestTimer(durationSeconds: sec)
                        } label: {
                            Text(label)
                                .font(.footnote.monospacedDigit())
                                .padding(.horizontal, 9)
                                .padding(.vertical, 6)
                                .background(RoundedRectangle(cornerRadius: 8).fill(LukiColors.fill))
                                .foregroundStyle(.primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if isActive {
                if rest.totalSeconds > 0 {
                    ProgressView(value: Double(rest.remainingSeconds), total: Double(max(1, rest.totalSeconds)))
                        .tint(LukiColors.accent)
                }

                HStack(spacing: 8) {
                    Button {
                        viewModel.adjustRestTimer(deltaSeconds: -15)
                    } label: {
                        Text("-15s")
                            .font(.caption.bold().monospacedDigit())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(RoundedRectangle(cornerRadius: 8).fill(LukiColors.fill))
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)

                    Button {
                        viewModel.adjustRestTimer(deltaSeconds: 15)
                    } label: {
                        Text("+15s")
                            .font(.caption.bold().monospacedDigit())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(RoundedRectangle(cornerRadius: 8).fill(LukiColors.fill))
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)

                    Button {
                        viewModel.togglePauseRestTimer()
                    } label: {
                        Text(rest.isPaused ? "Resume" : "Pause")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(RoundedRectangle(cornerRadius: 8).fill(LukiColors.fill))
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    Button {
                        viewModel.skipRestTimer()
                    } label: {
                        Text("Skip Rest")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Color.red.opacity(0.22)))
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(isActive ? LukiColors.accent.opacity(0.12) : LukiColors.cardBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(isActive ? LukiColors.accent.opacity(0.45) : Color.clear, lineWidth: 1)
                )
        )
    }

    private func formatTimer(_ sec: Int) -> String {
        let s = max(0, sec)
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    // MARK: - Vertical Collapsible Exercise Stack (Gymlife Supersets & Rainbow Suggestion)

    private func verticalExerciseStack(_ session: WorkoutSessionDto) -> some View {
        let safeIdx = min(max(0, selectedExerciseIndex), max(0, session.exercises.count - 1))
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
                Label("Add Exercise", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.cardBackground))
                    .foregroundStyle(LukiColors.accent)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Exercise Swipe Actions (swap / skip ← → remove)

    private func leadingExerciseActions(_ exercise: SessionExerciseDto) -> [LukiSwipeAction] {
        [
            LukiSwipeAction(id: "swap", label: locale == .de ? "Ersetzen" : "Replace", systemImage: "arrow.triangle.swap") {
                swapTargetId = exercise.clientExerciseId
            },
            LukiSwipeAction(
                id: "skip",
                label: exercise.status == .SKIPPED
                    ? (locale == .de ? "Aufnehmen" : "Unskip")
                    : (locale == .de ? "Überspringen" : "Skip"),
                systemImage: "forward.end",
                tone: .accent
            ) {
                viewModel.toggleSkipExercise(clientExerciseId: exercise.clientExerciseId)
            },
        ]
    }

    private func trailingExerciseActions(_ exercise: SessionExerciseDto) -> [LukiSwipeAction] {
        [
            LukiSwipeAction(id: "remove", label: locale == .de ? "Löschen" : "Delete", systemImage: "trash", tone: .destructive) {
                viewModel.removeExerciseFromSession(clientExerciseId: exercise.clientExerciseId)
            },
        ]
    }

    /// Reordering does not fit a swipe, so it stays in a compact menu.
    private func reorderMenu(session: WorkoutSessionDto, exercise: SessionExerciseDto, exerciseIndex: Int) -> some View {
        Menu {
            Button {
                viewModel.reorderExerciseInSession(clientExerciseId: exercise.clientExerciseId, moveUp: true)
                selectedExerciseIndex = max(0, exerciseIndex - 1)
            } label: {
                Label(locale == .de ? "Nach oben" : "Move earlier", systemImage: "arrow.up")
            }
            .disabled(exerciseIndex == 0)
            Button {
                viewModel.reorderExerciseInSession(clientExerciseId: exercise.clientExerciseId, moveUp: false)
                selectedExerciseIndex = min(session.exercises.count - 1, exerciseIndex + 1)
            } label: {
                Label(locale == .de ? "Nach unten" : "Move later", systemImage: "arrow.down")
            }
            .disabled(exerciseIndex == session.exercises.count - 1)
        } label: {
            Image(systemName: "arrow.up.arrow.down")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 32, height: 32)
        }
        .accessibilityLabel(locale == .de ? "Reihenfolge ändern" : "Reorder")
    }

    private func collapsedExerciseRow(exercise: SessionExerciseDto, index: Int) -> some View {
        let doneCount = exercise.sets.filter(\.completed).count
        let isCompleted = exercise.status == .COMPLETED
        return LukiSwipeRow(leading: leadingExerciseActions(exercise), trailing: trailingExerciseActions(exercise)) {
            Button {
                selectedExerciseIndex = index
            } label: {
                HStack(spacing: 10) {
                    Text(isCompleted ? "✓" : "\(index + 1)")
                        .font(.caption.bold().monospacedDigit())
                        .foregroundStyle(isCompleted ? LukiColors.accentForeground : .primary)
                        .frame(width: 26, height: 26)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(isCompleted ? LukiColors.accent : LukiColors.fill)
                        )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(exercise.exerciseNameSnapshot)
                            .font(.subheadline.bold())
                            .foregroundStyle(.primary)
                            .strikethrough(exercise.status == .SKIPPED)
                            .lineLimit(1)
                        Text("\(exercise.plannedSets)×\(exercise.targetRepsMin ?? 8)-\(exercise.targetRepsMax ?? 12) reps")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(LukiColors.accent)
                    }
                    Spacer()
                    Text("\(doneCount)/\(exercise.sets.count) sets")
                        .font(.footnote)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Color.black.opacity(0.3)))
                        .foregroundStyle(isCompleted ? LukiColors.accent : .secondary)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(LukiColors.cardBackground)
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Active Exercise Card & Ergonomic Set Rows (Matches Web App)

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
                Text("Last (\(last.workoutName)): \(last.workingSets.prefix(3).map { "\(String(format: "%g", $0.weightNormalized))kg×\($0.reps)" }.joined(separator: ", "))")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(LukiColors.accent)
            }
        }
    }

    private func activeExerciseCard(session: WorkoutSessionDto, exercise: SessionExerciseDto, exerciseIndex: Int) -> some View {
        let insight = insightFor(session: session, exercise: exercise)
        let suggestions = alignedSuggestions(exercise, insight: insight)
        let labels = LukiI18n.setBadgeLabels(exercise.sets.map(\.setType))

        return VStack(alignment: .leading, spacing: 14) {
            LukiSwipeRow(
                leading: leadingExerciseActions(exercise),
                trailing: trailingExerciseActions(exercise),
                cornerRadius: 14
            ) {
                HStack(alignment: .top, spacing: 10) {
                    ExerciseVectorVisualView(
                        exerciseName: exercise.exerciseNameSnapshot,
                        primaryMuscle: exercise.primaryMuscleSnapshot,
                        compact: true
                    )

                    VStack(alignment: .leading, spacing: 4) {
                        Text(exercise.exerciseNameSnapshot)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .strikethrough(exercise.status == .SKIPPED)
                        Text("\(LukiI18n.muscleLabel(exercise.primaryMuscleSnapshot)) • \(exercise.plannedSets) × \(exercise.targetRepsMin ?? 8)-\(exercise.targetRepsMax ?? 12) reps • \(exercise.restSeconds)s rest")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                        lastSessionLine(insight)
                    }
                    Spacer()
                    reorderMenu(session: session, exercise: exercise, exerciseIndex: exerciseIndex)
                }
                .padding(4)
                .background(LukiColors.cardBackground)
                .accessibilityIdentifier("ios.session.exerciseHeader.\(exerciseIndex + 1)")
            }

            ForEach(Array(exercise.sets.enumerated()), id: \.element.clientSetId) { idx, set in
                setRowCard(
                    session: session,
                    exercise: exercise,
                    set: set,
                    setIndex: idx,
                    badgeLabel: idx < labels.count ? labels[idx] : "\(idx + 1)",
                    suggestion: idx < suggestions.count ? suggestions[idx] : nil
                )
            }

            HStack(spacing: 8) {
                Button {
                    viewModel.addSetToExercise(clientExerciseId: exercise.clientExerciseId, setType: .WORKING)
                } label: {
                    Label(locale == .de ? "Satz hinzufügen" : "Add Set", systemImage: "plus")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 9).fill(LukiColors.fill))
                        .foregroundStyle(.primary)
                }
                .buttonStyle(.plain)

                Spacer()

                if exerciseIndex < session.exercises.count - 1 {
                    Button {
                        selectedExerciseIndex = exerciseIndex + 1
                    } label: {
                        Text("Next →")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LukiColors.accent)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    // MARK: - Superset Rounds (A1 + B1 together, then A2 + B2 …)

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
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text("Superset")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(LukiColors.accent)
                        Text("× \(block.rounds) ROUNDS")
                            .font(.caption.weight(.heavy).monospacedDigit())
                            .foregroundStyle(.primary)
                    }
                    Text("Rest 0 s between exercises · \(ProgressionEngine.formatRestDurationMinSec(block.roundRestSeconds)) between rounds")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Spacer()
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
                                    .frame(width: 28, height: 28)
                                    .background(Circle().fill(LukiColors.accent.opacity(0.15)))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(member.exercise.exerciseNameSnapshot)
                                        .font(.subheadline.bold())
                                        .strikethrough(member.exercise.status == .SKIPPED)
                                        .lineLimit(1)
                                    Text("\(LukiI18n.muscleLabel(member.exercise.primaryMuscleSnapshot)) • \(member.exercise.plannedSets)×\(member.exercise.targetRepsMin ?? 8)-\(member.exercise.targetRepsMax ?? 12)")
                                        .font(.caption2.monospacedDigit())
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                reorderMenu(session: session, exercise: member.exercise, exerciseIndex: member.index)
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
                        Text(locale == .de ? "Runde \(round + 1) von \(rounds)" : "Round \(round + 1) of \(rounds)")
                            .font(.footnote.weight(.semibold).monospacedDigit())
                            .foregroundStyle(.secondary)
                        ForEach(members, id: \.exercise.clientExerciseId) { member in
                            if round < member.exercise.sets.count {
                                let set = member.exercise.sets[round]
                                setRowCard(
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
                    Label(locale == .de ? "Runde hinzufügen" : "Add Round", systemImage: "plus")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 9).fill(LukiColors.cardBackground))
                        .foregroundStyle(.primary)
                }
                .buttonStyle(.plain)
            }
            .padding(10)
        }
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.fill))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(LukiColors.accent.opacity(0.45), lineWidth: 1)
        )
    }

    private func setRowCard(
        session: WorkoutSessionDto,
        exercise: SessionExerciseDto,
        set: SessionSetDto,
        setIndex: Int,
        badgeLabel: String,
        suggestion: SetProgressionSuggestion?,
        contextLabel: String? = nil,
        accessibilityId: String? = nil
    ) -> some View {
        let currentWeight = set.weight ?? 0
        let currentReps = set.reps ?? 0
        let effortLabel = rpeEffortLabel(set.rpe)
        let nextRpe = nextCycleRpe(set.rpe)
        let typeColor = LukiColors.setTypeColor(set.setType)

        return LukiSwipeRow(trailing: [
            LukiSwipeAction(id: "delete", label: locale == .de ? "Löschen" : "Delete", systemImage: "trash", tone: .destructive) {
                viewModel.removeSetFromExercise(clientExerciseId: exercise.clientExerciseId, clientSetId: set.clientSetId)
            },
        ]) {
            VStack(alignment: .leading, spacing: 10) {
                if let contextLabel {
                    Text(contextLabel)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                // Row 1: Set-type badge (tap to change type) + type label + effort cycle
                HStack(spacing: 8) {
                    Menu {
                        ForEach(SetType.allCases, id: \.self) { st in
                            Button(LukiI18n.setTypeLabel(st, locale: locale)) {
                                viewModel.updateSet(
                                    clientExerciseId: exercise.clientExerciseId,
                                    clientSetId: set.clientSetId,
                                    setType: st
                                )
                            }
                        }
                    } label: {
                        SetTypeBadge(setType: set.setType, label: badgeLabel, completed: set.completed)
                    }
                    .accessibilityIdentifier("ios.session.setType.\(setIndex + 1)")

                    if set.setType != .WORKING {
                        Text(LukiI18n.setTypeLabel(set.setType, locale: locale))
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(typeColor ?? .primary)
                    }

                    if let peakHr = set.peakHeartRateBpm {
                        Text("❤️ \(peakHr)")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(LukiColors.heartRose)
                    }

                    Spacer()

                    Button {
                        viewModel.updateSet(
                            clientExerciseId: exercise.clientExerciseId,
                            clientSetId: set.clientSetId,
                            rpe: .some(nextRpe)
                        )
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chart.bar.fill")
                                .font(.system(size: 9))
                            Text(effortLabel)
                                .font(.footnote)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(RoundedRectangle(cornerRadius: 8).fill(LukiColors.fill))
                        .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)
                }

                // Row 2: [-2.5 Weight +2.5] + [-1 Reps +1] + Large "Log Set" / "✓ Done" Button
                HStack(spacing: 8) {
                    HStack(spacing: 2) {
                        Button {
                            viewModel.updateSet(
                                clientExerciseId: exercise.clientExerciseId,
                                clientSetId: set.clientSetId,
                                weight: max(0, currentWeight - 2.5)
                            )
                        } label: {
                            Text("-2.5")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .frame(width: 32, height: 34)
                        }
                        .buttonStyle(.plain)

                        VStack(spacing: 0) {
                            Text(String(format: "%g", currentWeight))
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.primary)
                            Text(session.weightUnit.rawValue.lowercased())
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(.secondary)
                        }
                        .frame(minWidth: 34)

                        Button {
                            viewModel.updateSet(
                                clientExerciseId: exercise.clientExerciseId,
                                clientSetId: set.clientSetId,
                                weight: currentWeight + 2.5
                            )
                        } label: {
                            Text("+2.5")
                                .font(.footnote)
                                .foregroundStyle(LukiColors.accent)
                                .frame(width: 32, height: 34)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 4)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.black.opacity(0.35)))

                    HStack(spacing: 2) {
                        Button {
                            viewModel.updateSet(
                                clientExerciseId: exercise.clientExerciseId,
                                clientSetId: set.clientSetId,
                                reps: max(0, currentReps - 1)
                            )
                        } label: {
                            Text("-1")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .frame(width: 26, height: 34)
                        }
                        .buttonStyle(.plain)

                        VStack(spacing: 0) {
                            Text("\(currentReps)")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.primary)
                            Text("reps")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(.secondary)
                        }
                        .frame(minWidth: 28)

                        Button {
                            viewModel.updateSet(
                                clientExerciseId: exercise.clientExerciseId,
                                clientSetId: set.clientSetId,
                                reps: currentReps + 1
                            )
                        } label: {
                            Text("+1")
                                .font(.footnote)
                                .foregroundStyle(LukiColors.accent)
                                .frame(width: 26, height: 34)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 4)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.black.opacity(0.35)))

                    Button {
                        viewModel.toggleCompleteSet(
                            clientExerciseId: exercise.clientExerciseId,
                            clientSetId: set.clientSetId
                        )
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: set.completed ? "checkmark.circle.fill" : "checkmark")
                                .font(.system(size: 12, weight: .bold))
                            Text(set.completed ? "\(String(format: "%g", currentWeight))\(session.weightUnit.rawValue.lowercased())×\(currentReps) • Logged" : "Log Set")
                                .font(.system(size: 12, weight: .semibold))
                                .lineLimit(1)
                        }
                        .foregroundStyle(set.completed ? LukiColors.accentForeground : .primary)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(set.completed ? LukiColors.accent : LukiColors.fill)
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier(accessibilityId ?? "ios.session.completeSet.\(setIndex + 1)")
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
                        HStack(spacing: 4) {
                            Image(systemName: "sparkles")
                            Text("Suggested progression: \(wDelta) \(session.weightUnit.rawValue.lowercased()) (Tap to apply \(String(format: "%g", suggestedW)) \(session.weightUnit.rawValue.lowercased()))")
                        }
                        .font(.footnote)
                        .foregroundStyle(LukiColors.accent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(LukiColors.accent.opacity(0.15)))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LukiColors.fill)
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill((typeColor ?? LukiColors.accent).opacity(set.completed ? 0.10 : 0.0))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(set.completed ? (typeColor ?? LukiColors.accent).opacity(0.45) : LukiColors.fill, lineWidth: 1)
                    )
            )
        }
    }

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
               weightUnit: session.weightUnit
           ) {
            let stallingExercise = session.exercises.first {
                $0.exerciseId != nil && $0.exerciseId == suggestion.stallingExerciseId
            }
            SuggestionCardView(
                suggestion: suggestion,
                locale: locale,
                onAdd: {
                    viewModel.addUnplannedExerciseToSession(suggestion.suggestedExercise)
                    if let count = viewModel.store.activeSession?.exercises.count, count > 0 {
                        selectedExerciseIndex = count - 1
                    }
                },
                onReplace: stallingExercise.map { target in
                    {
                        viewModel.substituteExerciseInSession(
                            clientExerciseId: target.clientExerciseId,
                            with: suggestion.suggestedExercise
                        )
                        if let idx = session.exercises.firstIndex(where: { $0.clientExerciseId == target.clientExerciseId }) {
                            selectedExerciseIndex = idx
                        }
                    }
                }
            )
            .accessibilityIdentifier("ios.session.rainbowSuggestion")
        }
    }

    private var locale: SupportedLocale {
        SupportedLocale.resolve(viewModel.store.preferences.language)
    }

    private func rpeEffortLabel(_ rpe: Double?) -> String {
        LukiI18n.effortLabel(rpe: rpe, locale: locale)
    }

    private func nextCycleRpe(_ rpe: Double?) -> Double? {
        guard let rpe else { return 7.0 }
        if rpe <= 7.5 { return 8.0 }
        if rpe < ProgressionEngine.maxEffortRpe { return ProgressionEngine.maxEffortRpe }
        return nil
    }

    private var sessionFooterActions: some View {
        HStack(spacing: 12) {
            Button(role: .destructive) {
                viewModel.abandonActiveSession()
            } label: {
                Text("Abandon Session")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.red.opacity(0.18)))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ios.session.abandonButton")

            Button {
                Task { await viewModel.finishActiveSession() }
            } label: {
                Text("Finish & Save Workout")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LukiColors.accentForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.accent))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ios.session.finishButton")
        }
    }
}
