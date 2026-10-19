import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct ActiveSessionView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var selectedExerciseIndex: Int = 0
    @State private var showingSwapSheet = false

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
                    restTimerBanner(session)
                    exerciseSelectorStrip(session)

                    let safeIdx = min(max(0, selectedExerciseIndex), max(0, session.exercises.count - 1))
                    if !session.exercises.isEmpty {
                        activeExerciseCard(session: session, exercise: session.exercises[safeIdx])
                    }

                    sessionFooterActions
                }
            }
            .padding(16)
        }
        .background(LukiColors.darkBackground)
    }

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

            HStack(spacing: 16) {
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

    private func liveTelemetryBanner(_ session: WorkoutSessionDto) -> some View {
        VStack(alignment: .leading, spacing: 10) {
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
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
    }

    @ViewBuilder
    private func restTimerBanner(_ session: WorkoutSessionDto) -> some View {
        let rest = SessionCalculator.computeRemainingRestSeconds(session: session)
        if rest.isRunning || rest.isPaused {
            HStack {
                Label(
                    String(format: "Rest: %d:%02d", rest.remainingSeconds / 60, rest.remainingSeconds % 60),
                    systemImage: "timer"
                )
                .font(.subheadline.bold().monospacedDigit())
                .foregroundStyle(LukiColors.neonLime)
                Spacer()
                Button("Skip Rest") {
                    guard var active = viewModel.store.activeSession else { return }
                    active.restTimerEndsAt = nil
                    active.restTimerDurationSec = nil
                    active.restTimerPausedRemSec = nil
                    viewModel.store.saveActiveSession(active)
                }
                .font(.caption.bold())
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.neonLime.opacity(0.15)))
        }
    }

    private func exerciseSelectorStrip(_ session: WorkoutSessionDto) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(session.exercises.enumerated()), id: \.element.clientExerciseId) { idx, ex in
                    Button {
                        selectedExerciseIndex = idx
                    } label: {
                        Text("\(idx + 1). \(ex.exerciseNameSnapshot)")
                            .font(.caption.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                Capsule().fill(
                                    selectedExerciseIndex == idx
                                        ? LukiColors.neonLime
                                        : LukiColors.darkCard
                                )
                            )
                            .foregroundStyle(selectedExerciseIndex == idx ? .black : .white)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func activeExerciseCard(session: WorkoutSessionDto, exercise: SessionExerciseDto) -> some View {
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

        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                ExerciseVectorVisualView(
                    exerciseName: exercise.exerciseNameSnapshot,
                    primaryMuscle: exercise.primaryMuscleSnapshot,
                    compact: true
                )
                VStack(alignment: .leading, spacing: 4) {
                    Text(exercise.exerciseNameSnapshot)
                        .font(.headline.bold())
                        .foregroundStyle(.white)
                    Text("\(LukiI18n.muscleLabel(exercise.primaryMuscleSnapshot)) • Phase: \(insight.phase.rawValue)")
                        .font(.caption2)
                        .foregroundStyle(LukiColors.neonLime)
                }
                Spacer()
                Button("Swap") {
                    showingSwapSheet = true
                }
                .font(.caption.bold())
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Capsule().fill(Color.white.opacity(0.08)))
            }

            ForEach(Array(exercise.sets.enumerated()), id: \.element.clientSetId) { idx, set in
                let suggestion = idx < insight.setSuggestions.count ? insight.setSuggestions[idx] : nil
                HStack(spacing: 10) {
                    Text("#\(set.setNumber)")
                        .font(.caption.bold().monospacedDigit())
                        .frame(width: 26, alignment: .leading)

                    Text("\(String(format: "%g", set.weight ?? 0)) \(session.weightUnit.rawValue)")
                        .font(.subheadline.bold().monospacedDigit())

                    if let wDelta = suggestion.flatMap({ ProgressionEngine.formatCompactDelta($0.weightDelta) }) {
                        Text(wDelta)
                            .font(.caption2.bold().monospacedDigit())
                            .foregroundStyle(LukiColors.neonLime)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(LukiColors.neonLime.opacity(0.18)))
                    }

                    Text("× \(set.reps ?? 0) reps")
                        .font(.subheadline.monospacedDigit())

                    Spacer()

                    if let peakHr = set.peakHeartRateBpm {
                        Text("❤️ \(peakHr)")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(LukiColors.heartRose)
                    }

                    Button {
                        viewModel.toggleCompleteSet(
                            clientExerciseId: exercise.clientExerciseId,
                            clientSetId: set.clientSetId
                        )
                    } label: {
                        Image(systemName: set.completed ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(set.completed ? LukiColors.neonLime : .secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.05)))
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(LukiColors.darkCard))
        .sheet(isPresented: $showingSwapSheet) {
            NavigationStack {
                List(viewModel.store.catalog) { candidate in
                    Button {
                        guard let currentSession = viewModel.store.activeSession else { return }
                        let updated = SessionCalculator.substituteExerciseInSession(
                            session: currentSession,
                            clientExerciseId: exercise.clientExerciseId,
                            replacementExercise: candidate,
                            historySessions: viewModel.store.historySessions
                        )
                        viewModel.store.saveActiveSession(updated)
                        viewModel.store.enqueueSessionSync(updated)
                        showingSwapSheet = false
                    } label: {
                        VStack(alignment: .leading) {
                            Text(candidate.name).font(.subheadline.bold())
                            Text(LukiI18n.muscleLabel(candidate.primaryMuscleGroup))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .navigationTitle("Replace Exercise")
            }
        }
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
