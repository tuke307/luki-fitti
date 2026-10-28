import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiWatchSync

public struct WatchActiveWorkoutView: View {
    @Bindable public var viewModel: WatchWorkoutViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var showingFinishConfirmation = false

    public init(viewModel: WatchWorkoutViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        TabView(selection: $viewModel.activePageTab) {
            controlsPage
                .tag(1)

            executionPage
                .tag(2)

            formGuidePage
                .tag(3)
        }
        .tabViewStyle(.page)
        .sheet(isPresented: $viewModel.showingChangeExerciseSheet) {
            changeExerciseSheet
        }
        .sheet(isPresented: $viewModel.showingEditSetSheet) {
            WatchEditSetSheet(viewModel: viewModel)
        }
        .confirmationDialog(tr("End this workout?"), isPresented: $showingFinishConfirmation) {
            Button(tr("End Workout")) {
                Task { await viewModel.finishWorkout() }
            }
            .accessibilityIdentifier("watch.finish.confirm")
            Button(tr("Cancel"), role: .cancel) {}
        }
    }

    private var session: WorkoutSessionDto? { viewModel.store.activeSession }

    private var currentExercise: SessionExerciseDto? {
        let exercises = session?.exercises ?? []
        guard !exercises.isEmpty else { return nil }
        return exercises[min(max(0, viewModel.currentExerciseIndex), exercises.count - 1)]
    }

    // MARK: - Page 1: controls

    private var controlsPage: some View {
        let isPaused = session?.status == .PAUSED
        return ScrollView {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                controlButton(id: "change", title: tr("Change"), systemImage: "arrow.triangle.swap") {
                    viewModel.showingChangeExerciseSheet = true
                }
                controlButton(id: "edit", title: tr("Edit"), systemImage: "pencil") {
                    viewModel.showingEditSetSheet = true
                }
                controlButton(
                    id: "pause",
                    title: isPaused ? tr("Resume") : tr("Pause"),
                    systemImage: isPaused ? "play.fill" : "pause.fill"
                ) {
                    viewModel.togglePause()
                }
                controlButton(id: "finish", title: tr("End"), systemImage: "xmark", tint: LukiColors.destructive) {
                    showingFinishConfirmation = true
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private func controlButton(
        id: String,
        title: String,
        systemImage: String,
        tint: Color = LukiColors.accent,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(tint)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.fill))
                Text(title)
                    .font(.footnote)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityIdentifier("watch.action.\(id)")
    }

    // MARK: - Page 2: current set

    private var executionPage: some View {
        let exercise = currentExercise
        let completedSets = exercise?.sets.filter(\.completed).count ?? 0
        let totalSets = max(1, exercise?.sets.count ?? 1)
        let activeSet = exercise?.sets.first(where: { !$0.completed }) ?? exercise?.sets.last
        let rest = SessionCalculator.computeRemainingRestSeconds(session: session)
        let ringProgress = rest.isRunning && rest.totalSeconds > 0
            ? Double(rest.remainingSeconds) / Double(rest.totalSeconds)
            : Double(completedSets) / Double(totalSets)
        let isStretch = activeSet?.setType == .STRETCH || exercise?.exerciseTypeSnapshot == .STRETCHING
        let valueText = isStretch
            ? "\(activeSet?.durationSeconds ?? 45)"
            : LukiFormat.weight(activeSet?.weight ?? exercise?.targetWeight ?? 0)
        let unitText = isStretch ? tr("sec") : LukiFormat.unitLabel(session?.weightUnit ?? .KG)

        return ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(rest.isRunning ? tr("Rest") : tr("Set %d of %d", min(completedSets + 1, totalSets), totalSets))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(rest.isRunning ? LukiColors.accent : .secondary)
                    Spacer()
                    if let bpm = viewModel.healthCoordinator.currentHeartRateBpm {
                        Label("\(bpm)", systemImage: "heart.fill")
                            .font(.footnote.weight(.semibold).monospacedDigit())
                            .foregroundStyle(LukiColors.heartRate)
                            .accessibilityLabel("\(bpm) bpm")
                    }
                }

                Text(exercise?.exerciseNameSnapshot ?? tr("Workout"))
                    .font(.headline)
                    .lineLimit(2)

                Button {
                    viewModel.tapCompleteCurrentSetOrSkipRest()
                } label: {
                    HStack(spacing: 10) {
                        ZStack {
                            Circle()
                                .stroke(LukiColors.fill, lineWidth: 6)
                            Circle()
                                .trim(from: 0, to: max(0.04, min(1.0, ringProgress)))
                                .stroke(LukiColors.accent, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                            Group {
                                if rest.isRunning {
                                    Text(LukiFormat.clock(rest.remainingSeconds))
                                } else {
                                    Image(systemName: "checkmark")
                                }
                            }
                            .font(.headline.monospacedDigit())
                        }
                        .frame(width: 56, height: 56)

                        VStack(alignment: .leading, spacing: 0) {
                            HStack(alignment: .firstTextBaseline, spacing: 2) {
                                Text(valueText)
                                    .font(.system(.title3, design: .rounded).weight(.semibold).monospacedDigit())
                                Text(unitText)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if !isStretch {
                                Text(tr("%d reps", activeSet?.reps ?? exercise?.targetRepsMin ?? 0))
                                    .font(.footnote.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                            Text(rest.isRunning ? tr("Tap to skip rest") : tr("Tap when done"))
                                .font(.footnote)
                                .foregroundStyle(LukiColors.accent)
                                .accessibilityIdentifier("watch.execution.ringSubtitle")
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(rest.isRunning ? tr("Skip rest") : tr("Complete set"))
                .accessibilityValue("\(valueText) \(unitText)")
                .accessibilityIdentifier("watch.execution.ringButton")
            }
            .padding(.horizontal, 4)
        }
    }

    // MARK: - Page 3: how to

    private var formGuidePage: some View {
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
                        .accessibilityHidden(true)
                        Spacer()
                    }

                    Text(currentExercise.exerciseNameSnapshot)
                        .font(.headline)

                    let muscles = ([currentExercise.primaryMuscleSnapshot] + (catalogInfo?.secondaryMuscleGroups ?? []))
                        .map { LukiI18n.muscleLabel($0, locale: tr) }
                        .joined(separator: ", ")
                    Text(muscles)
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    Divider()

                    ForEach(catalogInfo?.instructions ?? [tr("Keep the movement controlled through the full range of motion.")], id: \.self) { step in
                        Text(step)
                            .font(.footnote)
                    }
                }
            }
            .padding(.horizontal, 4)
        }
    }

    // MARK: - Change exercise

    private var changeExerciseSheet: some View {
        let exercises = session?.exercises ?? []
        return List {
            ForEach(Array(exercises.enumerated()), id: \.element.clientExerciseId) { idx, ex in
                Button {
                    viewModel.currentExerciseIndex = idx
                    viewModel.showingChangeExerciseSheet = false
                    viewModel.activePageTab = 2
                } label: {
                    HStack {
                        Text("\(idx + 1). \(ex.exerciseNameSnapshot)")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        if idx == viewModel.currentExerciseIndex {
                            Image(systemName: "checkmark")
                                .foregroundStyle(LukiColors.accent)
                                .accessibilityLabel(tr("Current"))
                        }
                    }
                }
            }
        }
    }
}

/// Edit the next set: the Digital Crown sets the weight, buttons adjust reps.
private struct WatchEditSetSheet: View {
    @Bindable var viewModel: WatchWorkoutViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var crownWeight: Double = 0
    @State private var didLoad = false

    private var target: (exIdx: Int, setIdx: Int)? {
        guard let session = viewModel.store.activeSession, !session.exercises.isEmpty else { return nil }
        let exIdx = min(max(0, viewModel.currentExerciseIndex), session.exercises.count - 1)
        let sets = session.exercises[exIdx].sets
        guard !sets.isEmpty else { return nil }
        return (exIdx, sets.firstIndex(where: { !$0.completed }) ?? 0)
    }

    private var unit: WeightUnit { viewModel.store.activeSession?.weightUnit ?? .KG }

    var body: some View {
        let set = target.flatMap { t in viewModel.store.activeSession?.exercises[t.exIdx].sets[t.setIdx] }
        let step = LukiFormat.weightStep(unit)
        VStack(spacing: 8) {
            Text(tr("Set %d", (target?.setIdx ?? 0) + 1))
                .font(.headline)

            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(LukiFormat.weight(crownWeight))
                    .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
                Text(LukiFormat.unitLabel(unit))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .focusable()
            .digitalCrownRotation($crownWeight, from: 0, through: 500, by: step, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
            .accessibilityLabel(tr("Weight"))
            .accessibilityValue("\(LukiFormat.weight(crownWeight)) \(LukiFormat.unitLabel(unit))")
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: crownWeight += step
                case .decrement: crownWeight = max(0, crownWeight - step)
                @unknown default: break
                }
            }
            Text(tr("Turn the Digital Crown"))
                .font(.caption2)
                .foregroundStyle(.secondary)

            HStack {
                Button {
                    apply(repsDelta: -1)
                } label: {
                    Image(systemName: "minus")
                }
                .accessibilityLabel(tr("Fewer reps"))
                Text(tr("%d reps", set?.reps ?? 0))
                    .font(.headline.monospacedDigit())
                    .frame(minWidth: 60)
                Button {
                    apply(repsDelta: 1)
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(tr("More reps"))
            }

            Button(tr("Done")) {
                viewModel.showingEditSetSheet = false
                viewModel.activePageTab = 2
            }
            .tint(LukiColors.accent)
        }
        .padding(.horizontal, 4)
        .onAppear {
            guard !didLoad else { return }
            didLoad = true
            crownWeight = set?.weight ?? 0
        }
        .onChange(of: crownWeight) { _, newValue in
            apply(weight: newValue)
        }
    }

    private func apply(weight: Double? = nil, repsDelta: Int = 0) {
        guard var session = viewModel.store.activeSession, let t = target else { return }
        var set = session.exercises[t.exIdx].sets[t.setIdx]
        if let weight { set.weight = max(0, weight) }
        if repsDelta != 0 { set.reps = max(1, (set.reps ?? 10) + repsDelta) }
        guard set != session.exercises[t.exIdx].sets[t.setIdx] else { return }
        session.exercises[t.exIdx].sets[t.setIdx] = set
        session.version += 1

        let recalculated = SessionCalculator.recalculateSessionTotals(session)
        viewModel.store.saveActiveSession(recalculated)
        viewModel.store.enqueueSessionSync(recalculated)
        viewModel.watchSyncCoordinator.broadcastActiveSessionSnapshot(recalculated)

        let saved = recalculated.exercises[t.exIdx].sets[t.setIdx]
        viewModel.watchSyncCoordinator.broadcastSetMutation(
            SessionMutationPacket(
                clientSessionId: recalculated.clientSessionId,
                clientExerciseId: recalculated.exercises[t.exIdx].clientExerciseId,
                clientSetId: saved.clientSetId,
                weight: saved.weight,
                reps: saved.reps,
                rpe: saved.rpe,
                completed: saved.completed,
                avgHeartRateBpm: saved.avgHeartRateBpm,
                peakHeartRateBpm: saved.peakHeartRateBpm,
                restEndHeartRateBpm: saved.restEndHeartRateBpm,
                restTimerEndsAt: recalculated.restTimerEndsAt,
                restTimerDurationSec: recalculated.restTimerDurationSec,
                newVersion: recalculated.version
            )
        )
        Task { await viewModel.store.flushSyncQueue() }
    }
}
