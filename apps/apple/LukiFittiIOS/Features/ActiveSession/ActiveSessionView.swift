import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct ActiveSessionView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var selectedExerciseIndex: Int = 0
    @State private var showingSwapSheet = false
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
                    restTimerCard(session)
                    exerciseSelectorStrip(session)

                    let safeIdx = min(max(0, selectedExerciseIndex), max(0, session.exercises.count - 1))
                    if !session.exercises.isEmpty {
                        activeExerciseCard(session: session, exercise: session.exercises[safeIdx], exerciseIndex: safeIdx)
                    }

                    sessionFooterActions
                }
            }
            .padding(16)
        }
        .background(LukiColors.darkBackground)
        .onReceive(Timer.publish(every: 1.0, on: .main, in: .common).autoconnect()) { tick in
            nowTick = tick
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
                .foregroundStyle(LukiColors.neonLime)
            Text("Session Saved & Queued for Sync")
                .font(.caption.bold())
                .foregroundStyle(LukiColors.neonLime)
            Text("\(session.workoutNameSnapshot) Complete!")
                .font(.title2.bold())
                .foregroundStyle(.white)

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
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.neonLime))
            }
            .buttonStyle(.plain)
        }
        .padding(20)
        .background(RoundedRectangle(cornerRadius: 20).fill(LukiColors.darkCard))
    }

    private func statPill(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.subheadline.bold().monospacedDigit()).foregroundStyle(.white)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.06)))
    }

    // MARK: - Live Telemetry Banner

    private func liveTelemetryBanner(_ session: WorkoutSessionDto) -> some View {
        let totalSets = session.exercises.reduce(0) { $0 + $1.sets.count }
        let doneSets = session.totalSetsCompleted
        let pct = totalSets > 0 ? Double(doneSets) / Double(totalSets) : 0

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(session.status == .PAUSED ? "PAUSED" : "LIVE SESSION")
                    .font(.caption2.bold())
                    .foregroundStyle(.black)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(session.status == .PAUSED ? LukiColors.calorieAmber : LukiColors.neonLime))

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
                    .foregroundStyle(.white)
                Spacer()
                Button(session.status == .PAUSED ? "Resume" : "Pause") {
                    viewModel.togglePauseActiveSession()
                }
                .font(.caption.bold())
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(Color.white.opacity(0.1)))
            }

            HStack {
                Text("Progress: \(Int((pct * 100).rounded()))% (\(doneSets)/\(totalSets) sets)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(Int(session.totalVolumeKg)) kg vol")
                    .font(.caption2.bold().monospacedDigit())
                    .foregroundStyle(LukiColors.neonLime)
            }
            ProgressView(value: pct)
                .tint(LukiColors.neonLime)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
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
                        .foregroundStyle(isActive ? .black : LukiColors.neonLime)
                        .frame(width: 38, height: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(isActive ? LukiColors.neonLime : Color.white.opacity(0.08))
                        )

                    VStack(alignment: .leading, spacing: 2) {
                        Text(statusTitle)
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundStyle(isActive ? LukiColors.neonLime : .secondary)

                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text(formatTimer(rest.remainingSeconds))
                                .font(.title2.bold().monospacedDigit())
                                .foregroundStyle(.white)
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
                                .font(.caption2.bold().monospacedDigit())
                                .padding(.horizontal, 9)
                                .padding(.vertical, 6)
                                .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.1)))
                                .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if isActive {
                if rest.totalSeconds > 0 {
                    ProgressView(value: Double(rest.remainingSeconds), total: Double(max(1, rest.totalSeconds)))
                        .tint(LukiColors.neonLime)
                }

                HStack(spacing: 8) {
                    Button {
                        viewModel.adjustRestTimer(deltaSeconds: -15)
                    } label: {
                        Text("-15s")
                            .font(.caption.bold().monospacedDigit())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.1)))
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)

                    Button {
                        viewModel.adjustRestTimer(deltaSeconds: 15)
                    } label: {
                        Text("+15s")
                            .font(.caption.bold().monospacedDigit())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.1)))
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)

                    Button {
                        viewModel.togglePauseRestTimer()
                    } label: {
                        Text(rest.isPaused ? "Resume" : "Pause")
                            .font(.caption.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.1)))
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    Button {
                        viewModel.skipRestTimer()
                    } label: {
                        Text("Skip Rest")
                            .font(.caption.bold())
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
            RoundedRectangle(cornerRadius: 16)
                .fill(isActive ? LukiColors.neonLime.opacity(0.12) : LukiColors.darkCard)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(isActive ? LukiColors.neonLime.opacity(0.45) : Color.clear, lineWidth: 1)
                )
        )
    }

    private func formatTimer(_ sec: Int) -> String {
        let s = max(0, sec)
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    // MARK: - Horizontal Exercise Selector Strip

    private func exerciseSelectorStrip(_ session: WorkoutSessionDto) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(session.exercises.enumerated()), id: \.element.clientExerciseId) { idx, ex in
                    let doneCount = ex.sets.filter(\.completed).count
                    let isSelected = selectedExerciseIndex == idx
                    Button {
                        selectedExerciseIndex = idx
                    } label: {
                        HStack(spacing: 6) {
                            Text("\(idx + 1)")
                                .font(.caption2.bold().monospacedDigit())
                                .foregroundStyle(isSelected ? .black : .white)
                                .frame(width: 20, height: 20)
                                .background(
                                    RoundedRectangle(cornerRadius: 6)
                                        .fill(isSelected ? LukiColors.neonLime : Color.white.opacity(0.12))
                                )
                            Text(ex.exerciseNameSnapshot)
                                .font(.caption.bold())
                                .lineLimit(1)
                            Text("\(doneCount)/\(ex.sets.count)")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(Color.black.opacity(0.25)))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(isSelected ? LukiColors.neonLime.opacity(0.2) : LukiColors.darkCard)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(isSelected ? LukiColors.neonLime : Color.clear, lineWidth: 1)
                                )
                        )
                        .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                }

                Button {
                    showingAddExerciseSheet = true
                } label: {
                    Label("Add Exercise", systemImage: "plus")
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.darkCard))
                        .foregroundStyle(LukiColors.neonLime)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Active Exercise Card & Ergonomic Set Rows (Matches Web App)

    private func activeExerciseCard(session: WorkoutSessionDto, exercise: SessionExerciseDto, exerciseIndex: Int) -> some View {
        let insight = ProgressionEngine.computeExerciseProgression(
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

        return VStack(alignment: .leading, spacing: 14) {
            // Exercise Header
            HStack(alignment: .top, spacing: 10) {
                ExerciseVectorVisualView(
                    exerciseName: exercise.exerciseNameSnapshot,
                    primaryMuscle: exercise.primaryMuscleSnapshot,
                    compact: true
                )

                VStack(alignment: .leading, spacing: 4) {
                    Text(exercise.exerciseNameSnapshot)
                        .font(.headline.bold())
                        .foregroundStyle(.white)
                    Text("\(LukiI18n.muscleLabel(exercise.primaryMuscleSnapshot)) • \(exercise.plannedSets) × \(exercise.targetRepsMin ?? 8)-\(exercise.targetRepsMax ?? 12) reps • \(exercise.restSeconds)s rest")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                    if let last = insight.lastSession {
                        Text("Last (\(last.workoutName)): \(last.workingSets.prefix(3).map { "\(String(format: "%g", $0.weightNormalized))kg×\($0.reps)" }.joined(separator: ", "))")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(LukiColors.neonLime)
                    }
                }
                Spacer()
            }

            // Exercise Action Bar: Swap / Alternative, Skip, Move Up / Down
            HStack(spacing: 8) {
                Button {
                    showingSwapSheet = true
                } label: {
                    Label("Swap / Alternative", systemImage: "arrow.triangle.swap")
                        .font(.caption2.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.08)))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                Button {
                    viewModel.toggleSkipExercise(clientExerciseId: exercise.clientExerciseId)
                } label: {
                    Label(exercise.status == .SKIPPED ? "Unskip" : "Skip", systemImage: "forward.end")
                        .font(.caption2.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.08)))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                Spacer()

                Button {
                    viewModel.reorderExerciseInSession(clientExerciseId: exercise.clientExerciseId, moveUp: true)
                    selectedExerciseIndex = max(0, exerciseIndex - 1)
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.caption.bold())
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: 7).fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)
                .disabled(exerciseIndex == 0)

                Button {
                    viewModel.reorderExerciseInSession(clientExerciseId: exercise.clientExerciseId, moveUp: false)
                    selectedExerciseIndex = min(session.exercises.count - 1, exerciseIndex + 1)
                } label: {
                    Image(systemName: "arrow.down")
                        .font(.caption.bold())
                        .frame(width: 28, height: 28)
                        .background(RoundedRectangle(cornerRadius: 7).fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)
                .disabled(exerciseIndex == session.exercises.count - 1)
            }

            // Ergonomic One-Handed Set Cards
            ForEach(Array(exercise.sets.enumerated()), id: \.element.clientSetId) { idx, set in
                let suggestion = idx < insight.setSuggestions.count ? insight.setSuggestions[idx] : nil
                setRowCard(
                    session: session,
                    exercise: exercise,
                    set: set,
                    setIndex: idx,
                    suggestion: suggestion
                )
            }

            // Add Set & Next Exercise Row
            HStack(spacing: 8) {
                Button {
                    viewModel.addSetToExercise(clientExerciseId: exercise.clientExerciseId, setType: .WORKING)
                } label: {
                    Label("Add Working Set", systemImage: "plus")
                        .font(.caption.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 9).fill(Color.white.opacity(0.08)))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                Button {
                    viewModel.addSetToExercise(clientExerciseId: exercise.clientExerciseId, setType: .WARMUP)
                } label: {
                    Text("+ Warm-up Set")
                        .font(.caption.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 9).fill(Color.white.opacity(0.05)))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)

                Spacer()

                if exerciseIndex < session.exercises.count - 1 {
                    Button {
                        selectedExerciseIndex = exerciseIndex + 1
                    } label: {
                        Text("Next →")
                            .font(.caption.bold())
                            .foregroundStyle(LukiColors.neonLime)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(LukiColors.darkCard))
        .sheet(isPresented: $showingSwapSheet) {
            SearchableExercisePickerSheet(
                title: "Replace \(exercise.exerciseNameSnapshot)",
                exercises: viewModel.store.catalog,
                selectedExerciseId: exercise.exerciseId
            ) { candidate in
                guard let currentSession = viewModel.store.activeSession else { return }
                let updated = SessionCalculator.substituteExerciseInSession(
                    session: currentSession,
                    clientExerciseId: exercise.clientExerciseId,
                    replacementExercise: candidate,
                    historySessions: viewModel.store.historySessions
                )
                viewModel.store.saveActiveSession(updated)
                viewModel.store.enqueueSessionSync(updated)
                viewModel.watchSyncCoordinator.broadcastActiveSessionSnapshot(updated)
                showingSwapSheet = false
            }
        }
    }

    private func setRowCard(
        session: WorkoutSessionDto,
        exercise: SessionExerciseDto,
        set: SessionSetDto,
        setIndex: Int,
        suggestion: SetProgressionSuggestion?
    ) -> some View {
        let currentWeight = set.weight ?? 0
        let currentReps = set.reps ?? 0
        let effortLabel = rpeEffortLabel(set.rpe)
        let nextRpe = nextCycleRpe(set.rpe)

        return VStack(alignment: .leading, spacing: 10) {
            // Row 1: Set Number Badge + Set Type Menu + Effort (RPE) Cycle Button + Delete Set
            HStack(spacing: 8) {
                Text("\(setIndex + 1)")
                    .font(.caption.bold().monospacedDigit())
                    .foregroundStyle(set.completed ? .black : LukiColors.neonLime)
                    .frame(width: 28, height: 28)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(set.completed ? LukiColors.neonLime : LukiColors.neonLime.opacity(0.15))
                    )

                Menu {
                    ForEach(SetType.allCases, id: \.self) { st in
                        Button(st.rawValue) {
                            viewModel.updateSet(
                                clientExerciseId: exercise.clientExerciseId,
                                clientSetId: set.clientSetId,
                                setType: st
                            )
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(set.setType.rawValue)
                            .font(.system(size: 10, weight: .bold))
                        Image(systemName: "chevron.down")
                            .font(.system(size: 8, weight: .bold))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(RoundedRectangle(cornerRadius: 7).fill(Color.white.opacity(0.08)))
                    .foregroundStyle(set.setType == .WARMUP ? LukiColors.calorieAmber : .white)
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
                            .font(.system(size: 10, weight: .bold))
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.08)))
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                Button(role: .destructive) {
                    viewModel.removeSetFromExercise(
                        clientExerciseId: exercise.clientExerciseId,
                        clientSetId: set.clientSetId
                    )
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundStyle(.red.opacity(0.85))
                        .frame(width: 26, height: 26)
                }
                .buttonStyle(.plain)
            }

            // Row 2: [-2.5 Weight +2.5] + [-1 Reps +1] + Large "Log Set" / "✓ Done" Button
            HStack(spacing: 8) {
                // Weight Stepper Pill
                HStack(spacing: 2) {
                    Button {
                        viewModel.updateSet(
                            clientExerciseId: exercise.clientExerciseId,
                            clientSetId: set.clientSetId,
                            weight: max(0, currentWeight - 2.5)
                        )
                    } label: {
                        Text("-2.5")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.secondary)
                            .frame(width: 32, height: 34)
                    }
                    .buttonStyle(.plain)

                    VStack(spacing: 0) {
                        Text(String(format: "%g", currentWeight))
                            .font(.system(size: 14, weight: .heavy, design: .monospaced))
                            .foregroundStyle(.white)
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
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(LukiColors.neonLime)
                            .frame(width: 32, height: 34)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 4)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.black.opacity(0.35)))

                // Reps Stepper Pill
                HStack(spacing: 2) {
                    Button {
                        viewModel.updateSet(
                            clientExerciseId: exercise.clientExerciseId,
                            clientSetId: set.clientSetId,
                            reps: max(0, currentReps - 1)
                        )
                    } label: {
                        Text("-1")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.secondary)
                            .frame(width: 26, height: 34)
                    }
                    .buttonStyle(.plain)

                    VStack(spacing: 0) {
                        Text("\(currentReps)")
                            .font(.system(size: 14, weight: .heavy, design: .monospaced))
                            .foregroundStyle(.white)
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
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(LukiColors.neonLime)
                            .frame(width: 26, height: 34)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 4)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.black.opacity(0.35)))

                // Large Full-Height Log Set / Done Button (Matches Web App)
                Button {
                    viewModel.toggleCompleteSet(
                        clientExerciseId: exercise.clientExerciseId,
                        clientSetId: set.clientSetId
                    )
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .black))
                        Text(set.completed ? "Done" : "Log Set")
                            .font(.system(size: 13, weight: .heavy))
                    }
                    .foregroundStyle(set.completed ? .black : .white)
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(set.completed ? LukiColors.neonLime : Color.white.opacity(0.14))
                    )
                }
                .buttonStyle(.plain)
            }

            // Optional Progressive Overload Suggestion Pill (Tap to Apply)
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
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(LukiColors.neonLime)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(LukiColors.neonLime.opacity(0.15)))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(set.completed ? LukiColors.neonLime.opacity(0.10) : Color.white.opacity(0.04))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(set.completed ? LukiColors.neonLime.opacity(0.45) : Color.white.opacity(0.08), lineWidth: 1)
                )
        )
    }

    private func rpeEffortLabel(_ rpe: Double?) -> String {
        guard let rpe else { return "Effort" }
        if rpe <= 7.5 { return "Light" }
        if rpe < 9.5 { return "Sweet Spot" }
        return "Limit"
    }

    private func nextCycleRpe(_ rpe: Double?) -> Double? {
        guard let rpe else { return 7.0 }
        if rpe <= 7.5 { return 8.0 }
        if rpe < 9.5 { return 9.5 }
        return nil
    }

    private var sessionFooterActions: some View {
        HStack(spacing: 12) {
            Button(role: .destructive) {
                viewModel.abandonActiveSession()
            } label: {
                Text("Abandon Session")
                    .font(.caption.bold())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.red.opacity(0.18)))
            }
            .buttonStyle(.plain)

            Button {
                Task { await viewModel.finishActiveSession() }
            } label: {
                Text("Finish & Save Workout")
                    .font(.caption.bold())
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.neonLime))
            }
            .buttonStyle(.plain)
        }
    }
}
