import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct DiaryAnalyticsView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var selectedPeriod: HistoryPeriod = .month
    @State private var filterMuscle: MuscleGroup?
    @State private var filterExerciseId: String?
    @State private var inspectingSession: WorkoutSessionDto?
    @State private var pendingDelete: WorkoutSessionDto?
    @State private var memo = SnapshotMemo()
    @State private var visibleCount = Self.pageSize
    @Environment(\.lukiLocale) private var tr

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private static let pageSize = 20

    public var body: some View {
        let snapshot = memo.snapshot(
            sessions: viewModel.store.historySessions,
            period: selectedPeriod,
            muscle: filterMuscle,
            exerciseId: filterExerciseId
        )
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                headerAndPeriodPicker
                muscleFilterStrip
                kpiSummaryGrid(snapshot)
                periodActivityCard(snapshot)
                progressionChartCard(snapshot)
                muscleAndPrGrid(snapshot)
                timelineSection(snapshot)
            }
            .padding(16)
        }
        .onChange(of: selectedPeriod) { visibleCount = Self.pageSize }
        .onChange(of: filterMuscle) { visibleCount = Self.pageSize }
        .onChange(of: filterExerciseId) { visibleCount = Self.pageSize }
        .background(LukiColors.groupedBackground)
        .sheet(item: $inspectingSession) { session in
            HistorySessionEditorSheet(session: session) { viewModel.updateHistoricalSession($0) }
        }
        .alert(
            tr("Delete this workout?"),
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            presenting: pendingDelete
        ) { session in
            Button(tr("Delete Workout"), role: .destructive) {
                viewModel.deleteHistorySession(session)
            }
            Button(tr("Cancel"), role: .cancel) {}
        } message: { session in
            Text(tr("%@ will be removed from your history on all your devices. This can’t be undone.", session.workoutNameSnapshot))
        }
    }

    private var unit: WeightUnit { viewModel.store.preferences.weightUnit }

    private var headerAndPeriodPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(tr("Every workout, and how you’re progressing."))
                .font(.caption)
                .foregroundStyle(.secondary)

            Picker(tr("Period"), selection: $selectedPeriod) {
                Text(tr("This week")).tag(HistoryPeriod.week)
                Text(tr("This month")).tag(HistoryPeriod.month)
                Text(tr("This year")).tag(HistoryPeriod.year)
                Text(tr("All Time")).tag(HistoryPeriod.all)
            }
            .pickerStyle(.segmented)
        }
    }

    private var muscleFilterStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                exerciseFilterMenu

                Button {
                    filterMuscle = nil
                } label: {
                    Text(tr("All Muscles"))
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .background(Capsule().fill(filterMuscle == nil ? LukiColors.accent : LukiColors.cardBackground))
                        .foregroundStyle(filterMuscle == nil ? LukiColors.accentForeground : .primary)
                }
                .buttonStyle(.plain)

                ForEach(MuscleGroup.allCases, id: \.self) { muscle in
                    Button {
                        filterMuscle = muscle
                    } label: {
                        Text(LukiI18n.muscleLabel(muscle, locale: tr))
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 14)
                            .frame(minHeight: 44)
                            .background(Capsule().fill(filterMuscle == muscle ? LukiColors.accent : LukiColors.cardBackground))
                            .foregroundStyle(filterMuscle == muscle ? LukiColors.accentForeground : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// Web's "All Exercises" picker as a chip: lists the exercises the person has logged.
    private var exerciseFilterMenu: some View {
        let exercises = WorkoutHistorySnapshot.loggedExercises(in: viewModel.store.historySessions)
        let selectedName = exercises.first { $0.id == filterExerciseId }?.name
        return Menu {
            Picker(tr("Exercise"), selection: $filterExerciseId) {
                Text(tr("All Exercises")).tag(String?.none)
                ForEach(exercises, id: \.id) { ex in
                    Text(ex.name).tag(Optional(ex.id))
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "line.3.horizontal.decrease")
                    .accessibilityHidden(true)
                Text(selectedName ?? tr("All Exercises"))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.bold))
                    .accessibilityHidden(true)
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(Capsule().fill(selectedName != nil ? LukiColors.accent : LukiColors.cardBackground))
            .foregroundStyle(selectedName != nil ? LukiColors.accentForeground : .primary)
            .frame(maxWidth: 240)
        }
        .accessibilityLabel(tr("Filter by exercise"))
        .accessibilityValue(selectedName ?? tr("All Exercises"))
        .accessibilityIdentifier("ios.diary.exerciseFilter")
    }

    private func workoutCountText(_ count: Int) -> String {
        count == 1 ? tr("1 workout") : tr("%d workouts", count)
    }

    private func setCountText(_ count: Int) -> String {
        count == 1 ? tr("1 set") : tr("%d sets", count)
    }

    private func kpiSummaryGrid(_ snapshot: WorkoutHistorySnapshot) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            kpiCard(
                title: tr("Workouts"),
                value: "\(snapshot.count)",
                subtitle: tr("%d strength · %d stretching", snapshot.strengthCount, snapshot.stretchCount)
            )
            kpiCard(
                title: tr("Volume"),
                value: LukiFormat.volume(kg: snapshot.totalVolumeKg, unit: unit),
                subtitle: tr("Without warm-ups")
            )
            kpiCard(
                title: tr("Sets & reps"),
                value: tr("%d · %d reps", snapshot.totalSets, snapshot.totalReps),
                subtitle: tr("All exercises")
            )
            kpiCard(
                title: tr("Stretching"),
                value: tr("%d min", snapshot.totalStretchSeconds / 60),
                subtitle: tr("Time spent")
            )
        }
    }

    private func kpiCard(title: String, value: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.footnote).foregroundStyle(.secondary)
            Text(value).font(.title3.bold().monospacedDigit()).foregroundStyle(.primary)
            Text(subtitle).font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
        .accessibilityElement(children: .combine)
    }

    private func periodActivityCard(_ snapshot: WorkoutHistorySnapshot) -> some View {
        let title: String = switch selectedPeriod {
        case .week: tr("This week")
        case .month: tr("Last 30 days")
        case .year: tr("Last 12 months")
        case .all: tr("By year")
        }

        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(title, systemImage: "calendar")
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
                Text(workoutCountText(snapshot.count))
                    .font(.caption.bold().monospacedDigit())
                    .foregroundStyle(LukiColors.accent)
            }

            if selectedPeriod == .week || selectedPeriod == .month {
                let cal = Calendar.current
                let grid = HistoryCalendarGrid(span: selectedPeriod == .week ? .week : .month, calendar: cal)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
                    ForEach(Array(HistoryCalendarGrid.weekdaySymbols(locale: Locale(identifier: tr.rawValue)).enumerated()), id: \.offset) { _, symbol in
                        Text(symbol)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .accessibilityHidden(true)
                    }
                    ForEach(0..<grid.leadingBlanks, id: \.self) { _ in
                        Color.clear
                            .frame(minHeight: 44)
                            .accessibilityHidden(true)
                    }
                    ForEach(grid.days, id: \.self) { dayDate in
                        let daySessions = snapshot.sessions(on: dayDate, calendar: cal)
                        let hasWorkout = !daySessions.isEmpty
                        let dayNumber = cal.component(.day, from: dayDate)

                        Button {
                            if let first = daySessions.first {
                                inspectingSession = first
                            }
                        } label: {
                            VStack(spacing: 2) {
                                Text("\(dayNumber)")
                                    .font(.footnote.monospacedDigit())
                                if hasWorkout {
                                    Text("\(daySessions.count)×")
                                        .font(.caption2.bold())
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(hasWorkout ? LukiColors.accent.opacity(0.22) : LukiColors.fill)
                            )
                            .foregroundStyle(hasWorkout ? LukiColors.accent : .secondary)
                        }
                        .buttonStyle(.plain)
                        .disabled(!hasWorkout)
                        .accessibilityLabel("\(dayDate.formatted(.dateTime.weekday(.wide).day().month())): \(workoutCountText(daySessions.count))")
                    }
                }
            } else {
                // Year or All-Time bucket summary
                let buckets = buildBuckets(snapshot)
                if buckets.isEmpty {
                    Text(tr("No workouts in this period."))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 8)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(buckets, id: \.label) { bucket in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(bucket.label)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    Text("\(bucket.count)")
                                        .font(.footnote.monospacedDigit())
                                        .foregroundStyle(bucket.count > 0 ? LukiColors.accent : .secondary)
                                }
                                Text(setCountText(bucket.sets) + " · " + LukiFormat.volume(kg: Double(bucket.volumeKg), unit: unit))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(10)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(bucket.count > 0 ? LukiColors.accent.opacity(0.15) : LukiColors.fill)
                            )
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    private func buildBuckets(_ snapshot: WorkoutHistorySnapshot) -> [(label: String, count: Int, sets: Int, volumeKg: Int)] {
        if selectedPeriod == .year {
            let cal = Calendar.current
            let fmt = DateFormatter()
            fmt.dateFormat = "MMM yy"
            return (0..<12).reversed().map { offset in
                let d = cal.date(byAdding: .month, value: -offset, to: Date()) ?? Date()
                let bucket = snapshot.bucket(month: d, calendar: cal)
                return (label: fmt.string(from: d), count: bucket.count, sets: bucket.sets, volumeKg: Int(bucket.volumeKg))
            }
        } else {
            return snapshot.byYear.keys.sorted().map { year in
                let bucket = snapshot.byYear[year] ?? .init()
                return (label: String(year), count: bucket.count, sets: bucket.sets, volumeKg: Int(bucket.volumeKg))
            }
        }
    }

    private var selectedExerciseName: String? {
        guard let filterExerciseId else { return nil }
        return WorkoutHistorySnapshot.loggedExercises(in: viewModel.store.historySessions)
            .first { $0.id == filterExerciseId }?.name
    }

    /// Kilograms in the person's unit, one decimal at most.
    private func displayWeight(_ kg: Double) -> String {
        LukiFormat.weight(((unit == .LBS ? kg * ProgressionEngine.kgToLbs : kg) * 10).rounded() / 10)
    }

    private func progressionChartCard(_ snapshot: WorkoutHistorySnapshot) -> some View {
        let exerciseName = selectedExerciseName
        let isEmpty = exerciseName == nil ? snapshot.progression.isEmpty : snapshot.exerciseProgression.isEmpty
        let unitText = LukiFormat.unitLabel(unit)
        return VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(exerciseName ?? tr("Progress"))
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(exerciseName == nil
                    ? tr("Volume and sets over recent workouts")
                    : tr("Heaviest set and estimated max over recent workouts"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if isEmpty {
                Text(tr("No strength workouts in this period."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 12)
            } else {
                if exerciseName == nil {
                    sessionProgressChart(snapshot.progression)
                } else {
                    exerciseProgressChart(snapshot.exerciseProgression)
                }
                HStack(spacing: 14) {
                    legendItem(
                        exerciseName == nil ? tr("Volume (%@)", unitText) : tr("Est. max (%@)", unitText),
                        color: LukiColors.accent,
                        shape: Circle()
                    )
                    legendItem(
                        exerciseName == nil ? tr("Sets") : tr("Heaviest (%@)", unitText),
                        color: Self.barColor,
                        shape: RoundedRectangle(cornerRadius: 2)
                    )
                }
                .font(.caption.weight(.semibold))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
        .accessibilityIdentifier("ios.diary.progressCard")
    }

    private static let barColor = Color.secondary.opacity(0.35)

    /// Slim bars like web (max 18 pt); with many sessions they share the band instead.
    private static func barWidth(count: Int) -> MarkDimension {
        count < 8 ? .fixed(18) : .ratio(0.5)
    }

    private func legendItem(_ title: String, color: Color, shape: some Shape) -> some View {
        HStack(spacing: 5) {
            shape.fill(color).frame(width: 10, height: 10)
            Text(title).foregroundStyle(.secondary)
        }
    }

    /// Sessions are categories (several can share a day); a handful of them get a date label.
    private func sessionAxisLabels(_ ids: [String], dates: [String: Date]) -> some AxisContent {
        let stride = max(1, Int((Double(ids.count) / 4).rounded(.up)))
        let shown = ids.enumerated().filter { $0.offset % stride == 0 }.map(\.element)
        return AxisMarks(values: shown) { value in
            AxisValueLabel {
                if let id = value.as(String.self), let date = dates[id] {
                    Text(date.formatted(.dateTime.day().month(.abbreviated)))
                }
            }
        }
    }

    /// Web's combined chart: volume as an area line on the trailing axis, sets as bars read on the
    /// leading axis. Swift Charts has one y scale, so the bars are scaled onto the volume range.
    private func sessionProgressChart(_ points: [WorkoutHistorySnapshot.ProgressPoint]) -> some View {
        let volumes = points.map { Double(LukiFormat.volumeValue(kg: $0.volumeKg, unit: unit)) }
        let maxVolume = max(1, volumes.max() ?? 1)
        let maxSets = max(1, points.map(\.sets).max() ?? 1)
        let scale = maxVolume / Double(maxSets)
        let setStep = max(1, Int((Double(maxSets) / 3).rounded(.up)))
        let setTicks = Array(Swift.stride(from: 0, through: maxSets, by: setStep)).map { Double($0) * scale }
        let dates = Dictionary(uniqueKeysWithValues: points.map { ($0.id, $0.date) })
        let barWidth = Self.barWidth(count: points.count)
        return Chart {
            ForEach(Array(zip(points, volumes)), id: \.0.id) { point, volume in
                BarMark(
                    x: .value(tr("Workout"), point.id),
                    y: .value(tr("Sets"), Double(point.sets) * scale),
                    width: barWidth
                )
                .foregroundStyle(Self.barColor)
                .cornerRadius(3)
                .accessibilityLabel(point.date.formatted(date: .abbreviated, time: .omitted))
                .accessibilityValue(setCountText(point.sets))

                AreaMark(x: .value(tr("Workout"), point.id), y: .value(tr("Volume"), volume))
                    .foregroundStyle(LukiColors.accent.opacity(0.18))
                    .interpolationMethod(.monotone)
                LineMark(x: .value(tr("Workout"), point.id), y: .value(tr("Volume"), volume))
                    .foregroundStyle(LukiColors.accent)
                    .interpolationMethod(.monotone)
                    .lineStyle(StrokeStyle(lineWidth: 2.5))
                PointMark(x: .value(tr("Workout"), point.id), y: .value(tr("Volume"), volume))
                    .foregroundStyle(LukiColors.accent)
                    .symbolSize(24)
                    .accessibilityLabel(point.date.formatted(date: .abbreviated, time: .omitted))
                    .accessibilityValue(LukiFormat.volume(kg: point.volumeKg, unit: unit))
            }
        }
        .chartXAxis { sessionAxisLabels(points.map(\.id), dates: dates) }
        .chartYAxis {
            AxisMarks(position: .trailing)
            AxisMarks(position: .leading, values: setTicks) { value in
                AxisValueLabel {
                    Text("\(Int(((value.as(Double.self) ?? 0) / scale).rounded()))")
                }
            }
        }
        .chartYScale(domain: 0...(maxVolume * 1.1))
        .frame(height: 190)
    }

    private func exerciseProgressChart(_ points: [WorkoutHistorySnapshot.ExercisePoint]) -> some View {
        let toUnit: (Double) -> Double = { kg in self.unit == .LBS ? kg * ProgressionEngine.kgToLbs : kg }
        let dates = Dictionary(uniqueKeysWithValues: points.map { ($0.id, $0.date) })
        return Chart {
            ForEach(points) { point in
                BarMark(
                    x: .value(tr("Workout"), point.id),
                    y: .value(tr("Heaviest (%@)", LukiFormat.unitLabel(unit)), toUnit(point.maxWeightKg)),
                    width: Self.barWidth(count: points.count)
                )
                .foregroundStyle(Self.barColor)
                .cornerRadius(3)
                AreaMark(x: .value(tr("Workout"), point.id), y: .value(tr("Est. max"), toUnit(point.est1RM)))
                    .foregroundStyle(LukiColors.accent.opacity(0.18))
                    .interpolationMethod(.monotone)
                LineMark(x: .value(tr("Workout"), point.id), y: .value(tr("Est. max"), toUnit(point.est1RM)))
                    .foregroundStyle(LukiColors.accent)
                    .interpolationMethod(.monotone)
                    .lineStyle(StrokeStyle(lineWidth: 2.5))
                PointMark(x: .value(tr("Workout"), point.id), y: .value(tr("Est. max"), toUnit(point.est1RM)))
                    .foregroundStyle(LukiColors.accent)
                    .symbolSize(24)
            }
        }
        .chartXAxis { sessionAxisLabels(points.map(\.id), dates: dates) }
        .chartYAxis { AxisMarks(position: .trailing) }
        .frame(height: 190)
    }

    private func muscleAndPrGrid(_ snapshot: WorkoutHistorySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            musclesCard(snapshot.insights.muscles)
            personalBestsCard(snapshot.insights.personalBests)
        }
    }

    private func musclesCard(_ muscles: [HistoryInsights.MuscleShare]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(tr("Muscles trained"))
                .font(.headline)
                .foregroundStyle(.primary)

            if muscles.isEmpty {
                Text(tr("Finish a workout to see which muscles you trained."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            }
            ForEach(muscles) { share in
                let volume = LukiFormat.volume(kg: Double(share.volumeKg), unit: unit)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(LukiI18n.muscleLabel(share.muscle, locale: tr))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Spacer(minLength: 8)
                        Text(share.sets == 1
                            ? tr("1 set (%d%%) · %@", share.pct, volume)
                            : tr("%d sets (%d%%) · %@", share.sets, share.pct, volume))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.trailing)
                    }
                    ProgressView(value: Double(max(4, share.pct)), total: 100)
                        .tint(LukiColors.accent)
                        .accessibilityHidden(true)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
        .accessibilityIdentifier("ios.diary.musclesCard")
    }

    private func personalBestsCard(_ bests: [HistoryInsights.PersonalBest]) -> some View {
        let unitText = LukiFormat.unitLabel(unit)
        return VStack(alignment: .leading, spacing: 12) {
            Label(tr("Personal bests"), systemImage: "trophy")
                .font(.headline)
                .foregroundStyle(.primary)

            if bests.isEmpty {
                Text(tr("Your personal bests show up here after your first workouts."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            }
            ForEach(bests.prefix(6)) { best in
                let date = LukiISODate.parse(best.startedAt)?.formatted(.dateTime.day().month(.abbreviated)) ?? ""
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(best.exerciseName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Text("\(LukiI18n.muscleLabel(best.muscle, locale: tr)) · \(date)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(displayWeight(best.maxWeightKg)) \(unitText) × \(best.reps)")
                            .font(.subheadline.weight(.semibold).monospacedDigit())
                            .foregroundStyle(LukiColors.accent)
                        Text(tr("Est. max: %@", "\(displayWeight(best.est1RM)) \(unitText)"))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(LukiColors.fill))
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
        .accessibilityIdentifier("ios.diary.personalBestsCard")
    }

    private func timelineSection(_ snapshot: WorkoutHistorySnapshot) -> some View {
        let visible = snapshot.items.prefix(visibleCount)
        return VStack(alignment: .leading, spacing: 12) {
            Text(tr("Workouts (%d)", snapshot.count))
                .font(.headline)
                .foregroundStyle(.primary)

            if snapshot.items.isEmpty {
                Text(tr("No workouts in this period."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 12)
            } else {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(visible) { item in
                        sessionHistoryCard(item)
                    }
                    if visible.count < snapshot.count {
                        ProgressView()
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .onAppear { visibleCount += Self.pageSize }
                    }
                }
            }
        }
    }

    private func sessionHistoryCard(_ item: WorkoutHistorySnapshot.Item) -> some View {
        let session = item.session
        let notDone = notDoneExercises(session).count
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(session.workoutNameSnapshot)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
                if session.sourceDevice == .APPLE_WATCH {
                    Label("Apple Watch", systemImage: "applewatch")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }

            Text(item.date.formatted(date: .abbreviated, time: .shortened))
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                Label(tr("%d min", max(1, Int((Double(session.activeDurationSeconds) / 60).rounded()))), systemImage: "clock")
                    .accessibilityLabel(tr("Duration"))
                    .accessibilityValue(tr("%d min", max(1, Int((Double(session.activeDurationSeconds) / 60).rounded()))))
                Text(setCountText(session.totalSetsCompleted))
                Text(LukiFormat.volume(kg: session.totalVolumeKg, unit: session.weightUnit))
                if notDone > 0 {
                    Text(tr("%d not done", notDone))
                }
                if let kcal = session.activeCaloriesKcal, kcal > 0 {
                    Label("\(Int(kcal)) kcal", systemImage: "flame.fill")
                        .foregroundStyle(LukiColors.calories)
                }
                if let avgHr = session.avgHeartRateBpm {
                    Label(tr("%d bpm avg", avgHr), systemImage: "heart.fill")
                        .foregroundStyle(LukiColors.heartRate)
                }
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
            .labelStyle(.titleAndIcon)

            HStack {
                Button(tr("Details")) {
                    inspectingSession = session
                }
                .buttonStyle(.bordered)
                Spacer()
                Button(role: .destructive) {
                    pendingDelete = session
                } label: {
                    Image(systemName: "trash")
                        .foregroundStyle(LukiColors.destructive)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tr("Delete workout %@", session.workoutNameSnapshot))
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    /// Exercises without a logged set (unused variants, left out) are listed apart as "not done".
    private func notDoneExercises(_ session: WorkoutSessionDto) -> [SessionExerciseDto] {
        session.exercises.filter { !$0.hasLoggedSet }
    }
}

/// Recomputes the history snapshot only when its inputs change; array equality short-circuits on
/// shared storage, so unchanged renders cost one comparison.
@MainActor
private final class SnapshotMemo {
    private var key: (sessions: [WorkoutSessionDto], period: HistoryPeriod, muscle: MuscleGroup?, exerciseId: String?, day: Date)?
    private var value = WorkoutHistorySnapshot.empty

    func snapshot(sessions: [WorkoutSessionDto], period: HistoryPeriod, muscle: MuscleGroup?, exerciseId: String?) -> WorkoutHistorySnapshot {
        let day = Calendar.current.startOfDay(for: Date())
        if let key, key.period == period, key.muscle == muscle, key.exerciseId == exerciseId, key.day == day, key.sessions == sessions {
            return value
        }
        value = WorkoutHistorySnapshot(sessions: sessions, period: period, muscle: muscle, exerciseId: exerciseId)
        key = (sessions, period, muscle, exerciseId, day)
        return value
    }
}
