import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct DiaryAnalyticsView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var selectedPeriod: HistoryPeriod = .month
    @State private var filterMuscle: MuscleGroup?
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
            muscle: filterMuscle
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
                viewModel.store.deleteHistorySession(clientSessionId: session.clientSessionId)
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
        case .week: tr("Last 7 days")
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
                Text(tr("%d workouts", snapshot.count))
                    .font(.caption.bold().monospacedDigit())
                    .foregroundStyle(LukiColors.accent)
            }

            if selectedPeriod == .week || selectedPeriod == .month {
                let daysCount = selectedPeriod == .week ? 7 : 28
                let cal = Calendar.current
                let today = cal.startOfDay(for: Date())
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
                    ForEach(0..<daysCount, id: \.self) { offset in
                        let dayDate = cal.date(byAdding: .day, value: -(daysCount - 1 - offset), to: today) ?? today
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
                        .accessibilityLabel(tr("%@: %d workouts", dayDate.formatted(.dateTime.weekday(.wide).day().month()), daySessions.count))
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
                                Text(tr("%d sets", bucket.sets) + " · " + LukiFormat.volume(kg: Double(bucket.volumeKg), unit: unit))
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

    private func progressionChartCard(_ snapshot: WorkoutHistorySnapshot) -> some View {
        let points = snapshot.progression
        return VStack(alignment: .leading, spacing: 10) {
            Text(tr("Progress"))
                .font(.headline)
                .foregroundStyle(.primary)
            if points.isEmpty {
                Text(tr("No strength workouts in this period."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 12)
            } else {
                Chart(points) { point in
                    AreaMark(
                        x: .value(tr("Date"), point.date),
                        y: .value(tr("Volume"), LukiFormat.volumeValue(kg: point.volumeKg, unit: unit))
                    )
                    .foregroundStyle(LukiColors.accent.opacity(0.3))

                    LineMark(
                        x: .value(tr("Date"), point.date),
                        y: .value(tr("Volume"), LukiFormat.volumeValue(kg: point.volumeKg, unit: unit))
                    )
                    .foregroundStyle(LukiColors.accent)

                    PointMark(
                        x: .value(tr("Date"), point.date),
                        y: .value(tr("Volume"), LukiFormat.volumeValue(kg: point.volumeKg, unit: unit))
                    )
                    .foregroundStyle(LukiColors.accent)
                    .symbolSize(24)
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine()
                        AxisValueLabel(format: .dateTime.day().month(.abbreviated))
                    }
                }
                .chartYAxisLabel(LukiFormat.unitLabel(unit))
                .frame(height: 150)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    private func muscleAndPrGrid(_ snapshot: WorkoutHistorySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(tr("Muscles trained"))
                .font(.headline)
                .foregroundStyle(.primary)

            ForEach(MuscleGroup.allCases.prefix(6), id: \.self) { muscle in
                let sets = snapshot.setsByMuscle[muscle] ?? 0
                HStack {
                    Text(LukiI18n.muscleLabel(muscle, locale: tr))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Spacer()
                    Text(tr("%d sets", sets))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
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
                Text(tr("%d sets", session.totalSetsCompleted))
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
    private var key: (sessions: [WorkoutSessionDto], period: HistoryPeriod, muscle: MuscleGroup?, day: Date)?
    private var value = WorkoutHistorySnapshot.empty

    func snapshot(sessions: [WorkoutSessionDto], period: HistoryPeriod, muscle: MuscleGroup?) -> WorkoutHistorySnapshot {
        let day = Calendar.current.startOfDay(for: Date())
        if let key, key.period == period, key.muscle == muscle, key.day == day, key.sessions == sessions {
            return value
        }
        value = WorkoutHistorySnapshot(sessions: sessions, period: period, muscle: muscle)
        key = (sessions, period, muscle, day)
        return value
    }
}
