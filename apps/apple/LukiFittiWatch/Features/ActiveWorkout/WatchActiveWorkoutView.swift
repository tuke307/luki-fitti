import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiWatchSync

public struct WatchActiveWorkoutView: View {
    @Bindable public var viewModel: WatchWorkoutViewModel

    public init(viewModel: WatchWorkoutViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        TabView(selection: $viewModel.activePageTab) {
            page1ActionGrid
                .tag(1)

            page2ExerciseExecution
                .tag(2)

            page3FormGuide
                .tag(3)
        }
        .tabViewStyle(.page)
        .background(Color.black)
        .sheet(isPresented: $viewModel.showingChangeExerciseSheet) {
            changeExerciseSheet
        }
        .sheet(isPresented: $viewModel.showingEditSetSheet) {
            editCurrentSetSheet
        }
    }

    // MARK: - Page 1 (Left Dot): 2×2 Pastel Action Grid (Change, Edit, Pause, Finish)

    private var page1ActionGrid: some View {
        let isPaused = viewModel.store.activeSession?.status == .PAUSED
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            actionTile(
                title: "Change",
                systemImage: "arrow.triangle.swap",
                fill: LukiColors.watchActionChangeLavender
            ) {
                viewModel.showingChangeExerciseSheet = true
            }

            actionTile(
                title: "Edit",
                systemImage: "pencil",
                fill: LukiColors.watchActionEditCream
            ) {
                viewModel.showingEditSetSheet = true
            }

            actionTile(
                title: isPaused ? "Resume" : "Pause",
                systemImage: isPaused ? "play.fill" : "pause",
                fill: LukiColors.watchActionPauseSky
            ) {
                viewModel.togglePause()
            }

            actionTile(
                title: "Finish",
                systemImage: "checkmark",
                fill: LukiColors.watchActionFinishMint
            ) {
                Task { await viewModel.finishWorkout() }
            }
        }
        .padding(8)
    }

    private func actionTile(
        title: String,
        systemImage: String,
        fill: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(fill)
                        .frame(height: 54)
                    Image(systemName: systemImage)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.black)
                }
                Text(title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Page 2 (Center Dot, Default): Exercise Execution & "Tap when done" Neon-Lime Ring

    private var page2ExerciseExecution: some View {
        let session = viewModel.store.activeSession
        let exercises = session?.exercises ?? []
        let safeIdx = min(max(0, viewModel.currentExerciseIndex), max(0, exercises.count - 1))
        let currentExercise = exercises.isEmpty ? nil : exercises[safeIdx]
        let completedSetsCount = currentExercise?.sets.filter(\.completed).count ?? 0
        let totalSetsCount = max(1, currentExercise?.sets.count ?? 1)
        let activeSet = currentExercise?.sets.first(where: { !$0.completed }) ?? currentExercise?.sets.last
        let restStatus = SessionCalculator.computeRemainingRestSeconds(session: session)
        let ringProgress = restStatus.isRunning && restStatus.totalSeconds > 0
            ? Double(restStatus.remainingSeconds) / Double(restStatus.totalSeconds)
            : Double(completedSetsCount) / Double(totalSetsCount)

        return VStack(spacing: 6) {
            // Top Row: Dual-Pose Exercise Visual (Left) + Timer & SETS/REPS (Right)
            HStack(alignment: .top, spacing: 8) {
                if let currentExercise {
                    ExerciseVectorVisualView(
                        exerciseName: currentExercise.exerciseNameSnapshot,
                        primaryMuscle: currentExercise.primaryMuscleSnapshot,
                        compact: true
                    )
                }

                VStack(alignment: .trailing, spacing: 2) {
                    Text(
                        restStatus.isRunning
                            ? String(format: "%d:%02d", restStatus.remainingSeconds / 60, restStatus.remainingSeconds % 60)
                            : formattedElapsed(session?.activeDurationSeconds ?? 10)
                    )
                    .font(.system(size: 13, weight: .black, design: .monospaced))
                    .foregroundStyle(LukiColors.neonLime)

                    Text(currentExercise?.exerciseNameSnapshot ?? "Workout")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.trailing)

                    HStack(spacing: 10) {
                        VStack(alignment: .trailing, spacing: 0) {
                            Text("SETS")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(.secondary)
                            Text("\(min(completedSetsCount + 1, totalSetsCount))/\(totalSetsCount)")
                                .font(.system(size: 13, weight: .heavy, design: .monospaced))
                                .foregroundStyle(.white)
                        }
                        VStack(alignment: .trailing, spacing: 0) {
                            Text("REPS")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(.secondary)
                            Text("\(activeSet?.reps ?? currentExercise?.targetRepsMin ?? 12)")
                                .font(.system(size: 13, weight: .heavy, design: .monospaced))
                                .foregroundStyle(.white)
                        }
                    }
                }
            }

            // Bottom Row: Interactive Neon-Lime Weight & Completion Ring (Left) + Live Heart Rate (Right)
            HStack(alignment: .bottom, spacing: 10) {
                Button {
                    viewModel.tapCompleteCurrentSetOrSkipRest()
                } label: {
                    VStack(spacing: 3) {
                        ZStack {
                            Circle()
                                .stroke(Color.white.opacity(0.18), lineWidth: 6)
                            Circle()
                                .trim(from: 0, to: max(0.08, min(1.0, ringProgress)))
                                .stroke(
                                    LukiColors.neonLime,
                                    style: StrokeStyle(lineWidth: 6, lineCap: .round)
                                )
                                .rotationEffect(.degrees(-90))

                            VStack(spacing: 0) {
                                Text(activeSet?.setType == .STRETCH ? "SEC" : (session?.weightUnit.rawValue ?? "KG"))
                                    .font(.system(size: 8, weight: .bold))
                                    .foregroundStyle(.secondary)
                                Text(
                                    activeSet?.setType == .STRETCH
                                        ? "\(activeSet?.durationSeconds ?? 45)"
                                        : String(format: "%g", activeSet?.weight ?? currentExercise?.targetWeight ?? 50)
                                )
                                .font(.system(size: 16, weight: .black, design: .monospaced))
                                .foregroundStyle(.white)
                            }
                        }
                        .frame(width: 58, height: 58)

                        Text(restStatus.isRunning ? "Tap to skip rest" : "Tap when done")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                }
                .buttonStyle(.plain)

                Spacer()

                HStack(spacing: 4) {
                    Text("❤️")
                        .font(.system(size: 13))
                    Text(viewModel.healthCoordinator.currentHeartRateBpm.map(String.init) ?? "-")
                        .font(.system(size: 15, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white)
                }
                .padding(.bottom, 4)
            }
        }
        .padding(.horizontal, 8)
    }

    // MARK: - Page 3 (Right Dot): Exercise Form Guide & Target Muscles

    private var page3FormGuide: some View {
        let session = viewModel.store.activeSession
        let exercises = session?.exercises ?? []
        let safeIdx = min(max(0, viewModel.currentExerciseIndex), max(0, exercises.count - 1))
        let currentExercise = exercises.isEmpty ? nil : exercises[safeIdx]
        let catalogInfo = viewModel.store.catalog.first { $0.id == currentExercise?.exerciseId }

        return ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                if let currentExercise {
                    HStack {
                        Spacer()
                        ExerciseVectorVisualView(
                            exerciseName: currentExercise.exerciseNameSnapshot,
                            primaryMuscle: currentExercise.primaryMuscleSnapshot,
                            compact: true
                        )
                        Spacer()
                    }

                    Text(currentExercise.exerciseNameSnapshot.uppercased())
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(LukiColors.neonLime)

                    let secondaryText = (catalogInfo?.secondaryMuscleGroups ?? [])
                        .map { LukiI18n.muscleLabel($0) }
                        .joined(separator: ", ")
                    Text(
                        secondaryText.isEmpty
                            ? LukiI18n.muscleLabel(currentExercise.primaryMuscleSnapshot)
                            : "\(LukiI18n.muscleLabel(currentExercise.primaryMuscleSnapshot)) · \(secondaryText)"
                    )
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white)

                    Rectangle()
                        .fill(Color.white)
                        .frame(height: 1)

                    ForEach(catalogInfo?.instructions ?? ["Maintain controlled form through the full range of motion."], id: \.self) { step in
                        Text("• \(step)")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.9))
                    }
                }
            }
            .padding(.horizontal, 8)
        }
    }

    // MARK: - Sheets for Change & Edit

    private var changeExerciseSheet: some View {
        let exercises = viewModel.store.activeSession?.exercises ?? []
        return List {
            ForEach(Array(exercises.enumerated()), id: \.element.clientExerciseId) { idx, ex in
                Button {
                    viewModel.currentExerciseIndex = idx
                    viewModel.showingChangeExerciseSheet = false
                    viewModel.activePageTab = 2
                } label: {
                    HStack {
                        Text("\(idx + 1). \(ex.exerciseNameSnapshot)")
                            .font(.caption.bold())
                        Spacer()
                        if idx == viewModel.currentExerciseIndex {
                            Image(systemName: "checkmark")
                                .foregroundStyle(LukiColors.neonLime)
                        }
                    }
                }
            }
        }
    }

    private var editCurrentSetSheet: some View {
        let exercises = viewModel.store.activeSession?.exercises ?? []
        let safeIdx = min(max(0, viewModel.currentExerciseIndex), max(0, exercises.count - 1))
        let currentEx = exercises.isEmpty ? nil : exercises[safeIdx]
        let setIdx = currentEx?.sets.firstIndex(where: { !$0.completed }) ?? 0
        let currentWeight = currentEx?.sets[safeIdx < exercises.count && setIdx < (currentEx?.sets.count ?? 0) ? setIdx : 0].weight ?? 50
        let currentReps = currentEx?.sets[safeIdx < exercises.count && setIdx < (currentEx?.sets.count ?? 0) ? setIdx : 0].reps ?? 10

        return VStack(spacing: 8) {
            Text("Edit Set #\(setIdx + 1)")
                .font(.caption.bold())
                .foregroundStyle(LukiColors.neonLime)

            HStack {
                Button("-2.5") { adjustSet(weightDelta: -2.5, repsDelta: 0) }
                Text("\(String(format: "%g", currentWeight)) kg")
                    .font(.caption.bold().monospacedDigit())
                Button("+2.5") { adjustSet(weightDelta: 2.5, repsDelta: 0) }
            }

            HStack {
                Button("-1") { adjustSet(weightDelta: 0, repsDelta: -1) }
                Text("\(currentReps) reps")
                    .font(.caption.bold().monospacedDigit())
                Button("+1") { adjustSet(weightDelta: 0, repsDelta: 1) }
            }

            Button("Done") {
                viewModel.showingEditSetSheet = false
                viewModel.activePageTab = 2
            }
            .foregroundStyle(LukiColors.neonLime)
        }
        .padding(8)
    }

    private func adjustSet(weightDelta: Double, repsDelta: Int) {
        guard var session = viewModel.store.activeSession else { return }
        let exIdx = min(max(0, viewModel.currentExerciseIndex), max(0, session.exercises.count - 1))
        guard !session.exercises.isEmpty else { return }
        let setIdx = session.exercises[exIdx].sets.firstIndex(where: { !$0.completed }) ?? 0
        guard setIdx < session.exercises[exIdx].sets.count else { return }

        let oldW = session.exercises[exIdx].sets[setIdx].weight ?? 20
        let oldR = session.exercises[exIdx].sets[setIdx].reps ?? 10
        session.exercises[exIdx].sets[setIdx].weight = max(0, oldW + weightDelta)
        session.exercises[exIdx].sets[setIdx].reps = max(1, oldR + repsDelta)
        session.version += 1

        let recalculated = SessionCalculator.recalculateSessionTotals(session)
        viewModel.store.saveActiveSession(recalculated)
        viewModel.store.enqueueSessionSync(recalculated)
        viewModel.watchSyncCoordinator.broadcastActiveSessionSnapshot(recalculated)

        let set = recalculated.exercises[exIdx].sets[setIdx]
        let packet = SessionMutationPacket(
            clientSessionId: recalculated.clientSessionId,
            clientExerciseId: recalculated.exercises[exIdx].clientExerciseId,
            clientSetId: set.clientSetId,
            weight: set.weight,
            reps: set.reps,
            rpe: set.rpe,
            completed: set.completed,
            avgHeartRateBpm: set.avgHeartRateBpm,
            peakHeartRateBpm: set.peakHeartRateBpm,
            restEndHeartRateBpm: set.restEndHeartRateBpm,
            restTimerEndsAt: recalculated.restTimerEndsAt,
            restTimerDurationSec: recalculated.restTimerDurationSec,
            newVersion: recalculated.version
        )
        viewModel.watchSyncCoordinator.broadcastSetMutation(packet)

        Task { await viewModel.store.flushSyncQueue() }
    }

    private func formattedElapsed(_ sec: Int) -> String {
        let h = sec / 3600
        let m = (sec % 3600) / 60
        let s = sec % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d:%02d", 0, m, s)
    }
}
