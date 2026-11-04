import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiWatchSync

public struct WatchActiveWorkoutView: View {
    @Bindable public var viewModel: WatchWorkoutViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    @State private var showingFinishConfirmation = false
    /// The Digital Crown only changes the weight after a tap on it, so wrist movement during a
    /// lift can't change it by accident; it locks again after a few idle seconds.
    @State private var isEditingWeight = false
    @State private var crownWeight: Double = 0
    @State private var weightLockTask: Task<Void, Never>?
    @State private var showingRepsSheet = false
    @State private var showingHowTo = false
    @FocusState private var weightFocused: Bool

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
        .confirmationDialog(tr("End this workout?"), isPresented: $showingFinishConfirmation) {
            Button(tr("End Workout"), role: .destructive) {
                Task { await viewModel.finishWorkout() }
            }
            .accessibilityIdentifier("watch.finish.confirm")
            Button(tr("Cancel"), role: .cancel) {}
        }
        .onChange(of: isLuminanceReduced) { _, dimmed in
            if dimmed { lockWeight() }
        }
    }

    private var session: WorkoutSessionDto? { viewModel.store.activeSession }

    private var currentExercise: SessionExerciseDto? {
        let exercises = session?.exercises ?? []
        guard !exercises.isEmpty else { return nil }
        return exercises[min(max(0, viewModel.currentExerciseIndex), exercises.count - 1)]
    }

    private var unit: WeightUnit { session?.weightUnit ?? .KG }

    // MARK: - Page 1: controls (Apple Workout style)

    private var controlsPage: some View {
        let isPaused = session?.status == .PAUSED
        return VStack(spacing: 8) {
            elapsedTime
                .font(.system(.title, design: .rounded).weight(.semibold).monospacedDigit())
                .foregroundStyle(isPaused ? .secondary : LukiColors.accent)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("watch.controls.elapsed")

            liveMetrics
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)

            HStack(alignment: .top, spacing: 12) {
                roundButton(
                    id: "pause",
                    title: isPaused ? tr("Resume") : tr("Pause"),
                    systemImage: isPaused ? "play.fill" : "pause.fill",
                    tint: LukiColors.accent
                ) {
                    viewModel.togglePause()
                }
                roundButton(
                    id: "finish",
                    title: tr("End"),
                    accessibilityTitle: tr("End Workout"),
                    systemImage: "xmark",
                    tint: LukiColors.destructive
                ) {
                    showingFinishConfirmation = true
                }
            }

            Button {
                viewModel.showingChangeExerciseSheet = true
            } label: {
                Label(tr("Change Exercise"), systemImage: "arrow.triangle.swap")
                    .font(.footnote.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 40)
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("watch.action.change")
        }
        .padding(.horizontal, 4)
    }

    /// Elapsed workout time, counted by the system so it keeps running in Always On.
    @ViewBuilder
    private var elapsedTime: some View {
        if let session, session.status == .PAUSED {
            Text(LukiFormat.clock(session.activeDurationSeconds))
        } else if let started = session.flatMap({ LukiISODate.parse($0.startedAt) }) {
            Text(timerInterval: started...Date.distantFuture, countsDown: false)
        } else {
            Text(LukiFormat.clock(0))
        }
    }

    /// Heart rate and active energy; heart rate is health data, so it's hidden while dimmed.
    @ViewBuilder
    private var liveMetrics: some View {
        let kcal = Int(viewModel.healthCoordinator.activeCaloriesKcal)
        let bpm = isLuminanceReduced ? nil : viewModel.healthCoordinator.currentHeartRateBpm
        if bpm != nil || kcal > 0 {
            HStack(spacing: 10) {
                if let bpm {
                    Label("\(bpm)", systemImage: "heart.fill")
                        .foregroundStyle(LukiColors.heartRate)
                        .accessibilityLabel(tr("%d bpm", bpm))
                }
                if kcal > 0 {
                    Text(verbatim: "\(kcal) kcal")
                }
            }
            .font(.body.monospacedDigit())
        }
    }

    private func roundButton(
        id: String,
        title: String,
        accessibilityTitle: String? = nil,
        systemImage: String,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(tint)
                    .frame(width: 48, height: 48)
                    .background(Circle().fill(tint.opacity(0.22)))
                Text(title)
                    .font(.footnote)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityTitle ?? title)
        .accessibilityIdentifier("watch.action.\(id)")
    }

    // MARK: - Page 2: current set or rest

    private var executionPage: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let rest = SessionCalculator.computeRemainingRestSeconds(session: session, now: context.date)
            let resting = rest.isRunning || rest.isPaused
            // A fresh view per state, so rest doesn't inherit the set page's state.
            Group {
                if resting {
                    restView(rest)
                } else {
                    setView
                }
            }
            .padding(.horizontal, 4)
            .id(resting)
        }
    }

    private var setView: some View {
        let exercise = currentExercise
        let sets = exercise?.sets ?? []
        let completed = sets.filter(\.completed).count
        let total = max(1, sets.count)
        let activeSet = sets.first(where: { !$0.completed }) ?? sets.last
        let isStretch = activeSet?.setType == .STRETCH || exercise?.exerciseTypeSnapshot == .STRETCHING

        return VStack(alignment: .leading, spacing: 4) {
            Text(exercise?.exerciseNameSnapshot ?? tr("Workout"))
                .font(.headline)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            statusRow(completed: completed, total: total)

            if isStretch {
                Text(verbatim: "\(activeSet?.durationSeconds ?? 45) \(tr("sec"))")
                    .font(.system(.title, design: .rounded).weight(.semibold).monospacedDigit())
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    weightControl(activeSet?.weight ?? exercise?.targetWeight ?? 0)
                    Button {
                        showingRepsSheet = true
                    } label: {
                        Text(tr("× %d reps", activeSet?.reps ?? exercise?.targetRepsMin ?? 0))
                            .font(.body.monospacedDigit())
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .buttonStyle(.plain)
                    .disabled(isLuminanceReduced)
                    .accessibilityHint(tr("Change reps"))
                    .accessibilityIdentifier("watch.execution.reps")
                }
                .sheet(isPresented: $showingRepsSheet) {
                    repsSheet
                }
            }

            Spacer(minLength: 0)

            if !isLuminanceReduced {
                Button {
                    lockWeight()
                    viewModel.tapCompleteCurrentSetOrSkipRest()
                } label: {
                    Text(tr("Complete Set"))
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(LukiColors.accent)
                .accessibilityIdentifier("watch.execution.ringButton")

                nextUpLine
            }
        }
    }

    /// Set dots + compact "2/5" counter; the heart-rate chip only shows when it fits next to them.
    private func statusRow(completed: Int, total: Int) -> some View {
        let current = min(completed + 1, total)
        let counter = Text(verbatim: "\(current)/\(total)")
            .font(.subheadline.monospacedDigit())
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .fixedSize()
            .accessibilityLabel(tr("Set %d of %d", current, total))
        let bpm = isLuminanceReduced ? nil : viewModel.healthCoordinator.currentHeartRateBpm

        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 6) {
                SetDots(total: total, completed: completed)
                counter
                Spacer(minLength: 0)
                if let bpm {
                    Label("\(bpm)", systemImage: "heart.fill")
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(LukiColors.heartRate)
                        .labelStyle(.titleAndIcon)
                        .lineLimit(1)
                        .accessibilityLabel(tr("%d bpm", bpm))
                }
            }
            HStack(spacing: 6) {
                SetDots(total: total, completed: completed)
                counter
                Spacer(minLength: 0)
            }
        }
    }

    /// The "Next: …" hint is the first thing to go on small watches: `ViewThatFits` drops it
    /// entirely when it would push the primary button off screen.
    @ViewBuilder
    private var nextUpLine: some View {
        ViewThatFits(in: .vertical) {
            nextUpContent
            Color.clear.frame(height: 0)
        }
    }

    @ViewBuilder
    private var nextUpContent: some View {
        if let next = nextUpText() {
            Text(next)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func weightControl(_ weight: Double) -> some View {
        let step = LukiFormat.weightStep(unit)
        let shown = isEditingWeight ? crownWeight : weight
        return Button {
            isEditingWeight ? lockWeight() : unlockWeight(current: weight)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(LukiFormat.weight(shown))
                    .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
                    .lineLimit(1)
                Text(LukiFormat.unitLabel(unit))
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .fixedSize()
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(LukiColors.accent, lineWidth: isEditingWeight ? 2 : 0)
            )
            .overlay(alignment: .topTrailing) {
                if isEditingWeight {
                    Image(systemName: "digitalcrown.arrow.clockwise")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(LukiColors.accent)
                        .padding(2)
                        .background(Circle().fill(.black))
                        .offset(x: 6, y: -6)
                        .accessibilityHidden(true)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(isLuminanceReduced)
        .focusable(isEditingWeight)
        .focused($weightFocused)
        .digitalCrownRotation(
            $crownWeight,
            from: 0,
            through: 500,
            by: step,
            sensitivity: .medium,
            isContinuous: false,
            isHapticFeedbackEnabled: true
        )
        .onChange(of: crownWeight) { _, newValue in
            guard isEditingWeight else { return }
            viewModel.updateNextSet(weight: newValue)
            scheduleWeightLock()
        }
        .accessibilityLabel(tr("Weight"))
        .accessibilityValue("\(LukiFormat.weight(shown)) \(LukiFormat.unitLabel(unit))")
        .accessibilityHint(tr("Double-tap, then turn the Digital Crown"))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: viewModel.updateNextSet(weight: weight + step)
            case .decrement: viewModel.updateNextSet(weight: max(0, weight - step))
            @unknown default: break
            }
        }
        .accessibilityIdentifier("watch.execution.weight")
    }

    /// Reps stepper as a sheet: the inline row no longer fits next to weight + reps on small
    /// watches, so the −/+ controls get their own glanceable view with the value in the middle.
    private var repsSheet: some View {
        let exercise = currentExercise
        let activeSet = exercise?.sets.first(where: { !$0.completed }) ?? exercise?.sets.last
        let reps = activeSet?.reps ?? exercise?.targetRepsMin ?? 0
        return VStack(spacing: 8) {
            Text(tr("× %d reps", reps))
                .font(.system(.title, design: .rounded).weight(.semibold).monospacedDigit())
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            HStack(spacing: 12) {
                Button {
                    viewModel.updateNextSet(repsDelta: -1)
                } label: {
                    Image(systemName: "minus").frame(maxWidth: .infinity, minHeight: 44)
                }
                .accessibilityLabel(tr("Fewer reps"))
                Button {
                    viewModel.updateNextSet(repsDelta: 1)
                } label: {
                    Image(systemName: "plus").frame(maxWidth: .infinity, minHeight: 44)
                }
                .accessibilityLabel(tr("More reps"))
            }
        }
        .accessibilityIdentifier("watch.execution.repsSheet")
    }

    private func restView(_ rest: RestTimerStatus) -> some View {
        let progress = rest.totalSeconds > 0 ? Double(rest.remainingSeconds) / Double(rest.totalSeconds) : 0
        let endsAt = LukiDate.parseISO(session?.restTimerEndsAt)
        return VStack(spacing: 6) {
            Text(tr("Rest"))
                .font(.headline)
                .foregroundStyle(LukiColors.accent)
                .frame(maxWidth: .infinity, alignment: .leading)

            ZStack {
                Circle()
                    .stroke(LukiColors.fill, lineWidth: 7)
                Circle()
                    .trim(from: 0, to: max(0.02, min(1, progress)))
                    .stroke(LukiColors.accent, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Group {
                    if rest.isRunning, let endsAt, endsAt > Date() {
                        Text(timerInterval: Date()...endsAt, countsDown: true)
                    } else {
                        Text(LukiFormat.clock(rest.remainingSeconds))
                    }
                }
                .font(.system(.title3, design: .rounded).weight(.semibold).monospacedDigit())
                .multilineTextAlignment(.center)
            }
            .frame(width: 64, height: 64)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(tr("Rest"))
            .accessibilityValue(LukiFormat.clock(rest.remainingSeconds))

            Spacer(minLength: 0)

            if !isLuminanceReduced {
                Button {
                    viewModel.skipRest()
                } label: {
                    Text(tr("Skip Rest"))
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(LukiColors.accent)
                .accessibilityIdentifier("watch.execution.ringButton")

                HStack(spacing: 12) {
                    Button {
                        viewModel.adjustRest(by: -15)
                    } label: {
                        Text(verbatim: "−15 s").frame(maxWidth: .infinity, minHeight: 36)
                    }
                    .accessibilityIdentifier("watch.rest.minus")
                    Button {
                        viewModel.adjustRest(by: 15)
                    } label: {
                        Text(verbatim: "+15 s").frame(maxWidth: .infinity, minHeight: 36)
                    }
                    .accessibilityIdentifier("watch.rest.plus")
                }
                .font(.body.monospacedDigit())

                nextUpLine
            }
        }
    }

    /// "Next: set 3 · 50 kg × 6", or the next exercise after the last set.
    private func nextUpText() -> String? {
        guard let session, let exercise = currentExercise else { return nil }
        let open = exercise.sets.filter { !$0.completed }
        let resting = SessionCalculator.computeRemainingRestSeconds(session: session).isRunning
        // While resting, the first open set is the next one; otherwise it's the one after it.
        let upcoming = resting ? open.first : open.dropFirst().first
        if let upcoming, let index = exercise.sets.firstIndex(where: { $0.clientSetId == upcoming.clientSetId }) {
            let detail = upcoming.setType == .STRETCH || exercise.exerciseTypeSnapshot == .STRETCHING
                ? "\(upcoming.durationSeconds ?? 45) \(tr("sec"))"
                : "\(LukiFormat.weight(upcoming.weight ?? 0)) \(LukiFormat.unitLabel(unit)) × \(upcoming.reps ?? 0)"
            return tr("Next: set %d · %@", index + 1, detail)
        }
        let idx = min(max(0, viewModel.currentExerciseIndex), session.exercises.count - 1)
        if let nextExercise = session.exercises.dropFirst(idx + 1).first(where: { $0.status != .COMPLETED }) {
            return tr("Next: %@", nextExercise.exerciseNameSnapshot)
        }
        return open.count <= 1 ? tr("Last set") : nil
    }

    private func unlockWeight(current: Double) {
        crownWeight = current
        isEditingWeight = true
        weightFocused = true
        scheduleWeightLock()
    }

    private func lockWeight() {
        weightLockTask?.cancel()
        isEditingWeight = false
        weightFocused = false
    }

    private func scheduleWeightLock() {
        weightLockTask?.cancel()
        weightLockTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            lockWeight()
        }
    }

    // MARK: - Page 3: how to

    private var formGuidePage: some View {
        let catalogInfo = viewModel.store.catalog.first { $0.id == currentExercise?.exerciseId }

        return VStack(alignment: .leading, spacing: 6) {
            if let currentExercise {
                // The visual shrinks through `scaleEffect` (a plain frame would only clip it)
                // so the page still fits on a 41 mm watch.
                ViewThatFits(in: .vertical) {
                    guideVisual(currentExercise, scale: 1)
                    guideVisual(currentExercise, scale: 0.75)
                    guideVisual(currentExercise, scale: 0.55)
                }
                .frame(maxWidth: .infinity)

                Text(currentExercise.exerciseNameSnapshot)
                    .font(.headline)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)

                let muscles = ([currentExercise.primaryMuscleSnapshot] + (catalogInfo?.secondaryMuscleGroups ?? []))
                    .map { LukiI18n.muscleLabel($0, locale: tr) }
                    .joined(separator: ", ")
                Text(muscles)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Spacer(minLength: 0)

                Button {
                    showingHowTo = true
                } label: {
                    Label(tr("How to"), systemImage: "list.number")
                        .font(.footnote.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 40)
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("watch.howto.button")
            }
        }
        .padding(.horizontal, 4)
        .sheet(isPresented: $showingHowTo) {
            howToSheet(catalogInfo: catalogInfo)
        }
    }

    private func guideVisual(_ exercise: SessionExerciseDto, scale: CGFloat) -> some View {
        let size = ExerciseVectorVisualView.outerSize(compact: true)
        return ExerciseVectorVisualView(
            exerciseName: exercise.exerciseNameSnapshot,
            primaryMuscle: exercise.primaryMuscleSnapshot,
            compact: true
        )
        .scaleEffect(scale)
        .frame(width: size.width * scale, height: size.height * scale)
        .accessibilityHidden(true)
    }

    /// The instruction steps are the only scrolling content on this page — in a sheet, so the
    /// page itself always fits.
    private func howToSheet(catalogInfo: ExerciseDto?) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(catalogInfo?.instructions ?? [tr("Keep the movement controlled through the full range of motion.")], id: \.self) { step in
                    Text(step)
                        .font(.footnote)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 4)
        }
        .accessibilityIdentifier("watch.howto.sheet")
    }

    // MARK: - Change exercise

    private var changeExerciseSheet: some View {
        let exercises = session?.exercises ?? []
        return NavigationStack {
            List {
                ForEach(Array(exercises.enumerated()), id: \.element.clientExerciseId) { idx, ex in
                    let done = ex.sets.filter(\.completed).count
                    let isCurrent = idx == viewModel.currentExerciseIndex
                    let isFinished = !ex.sets.isEmpty && done == ex.sets.count
                    Button {
                        viewModel.currentExerciseIndex = idx
                        viewModel.showingChangeExerciseSheet = false
                        viewModel.activePageTab = 2
                    } label: {
                        HStack(spacing: 8) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(idx + 1). \(ex.exerciseNameSnapshot)")
                                    .font(.body.weight(isCurrent ? .semibold : .regular))
                                    .foregroundStyle(isCurrent ? LukiColors.accent : .primary)
                                    .lineLimit(2)
                                Text(verbatim: "\(done)/\(ex.sets.count)")
                                    .font(.footnote.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 4)
                            if isFinished {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(LukiColors.success)
                                    .accessibilityLabel(tr("Done"))
                            }
                        }
                    }
                    .accessibilityValue(isCurrent ? tr("Current") : "")
                }
            }
            .navigationTitle(tr("Exercises"))
        }
    }
}

/// Filled dots for completed sets, an outlined dot for each remaining one.
private struct SetDots: View {
    let total: Int
    let completed: Int

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<min(total, 8), id: \.self) { index in
                Circle()
                    .fill(index < completed ? LukiColors.accent : .clear)
                    .overlay(Circle().stroke(index < completed ? LukiColors.accent : Color.secondary, lineWidth: 1))
                    .frame(width: 6, height: 6)
            }
        }
        .accessibilityHidden(true)
    }
}
