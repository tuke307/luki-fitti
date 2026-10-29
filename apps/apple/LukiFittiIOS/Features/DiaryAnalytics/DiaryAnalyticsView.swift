import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct DiaryAnalyticsView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var selectedPeriod: String = "month"
    @State private var filterMuscle: MuscleGroup?
    @State private var inspectingSession: WorkoutSessionDto?
    @State private var pendingDelete: WorkoutSessionDto?
    @Environment(\.lukiLocale) private var tr

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private static let isoFormatterWithFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoFormatterStandard = ISO8601DateFormatter()

    private func parseSessionDate(_ iso: String) -> Date {
        Self.isoFormatterWithFractional.date(from: iso)
            ?? Self.isoFormatterStandard.date(from: iso)
            ?? Date()
    }

    private var filteredSessions: [WorkoutSessionDto] {
        let now = Date()
        let cutoff: Date? = switch selectedPeriod {
        case "week": now.addingTimeInterval(-7 * 86_400)
        case "month": now.addingTimeInterval(-30 * 86_400)
        case "year": now.addingTimeInterval(-365 * 86_400)
        default: nil
        }

        return viewModel.store.historySessions.filter { session in
            if let cutoff {
                let sessionDate = parseSessionDate(session.startedAt)
                if sessionDate < cutoff { return false }
            }
            if let filterMuscle {
                if !session.exercises.contains(where: { $0.primaryMuscleSnapshot == filterMuscle }) {
                    return false
                }
            }
            return true
        }
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                headerAndPeriodPicker
                muscleFilterStrip
                kpiSummaryGrid
                periodActivityCard
                progressionChartCard
                muscleAndPrGrid
                timelineSection
            }
            .padding(16)
        }
        .background(LukiColors.groupedBackground)
        .sheet(item: $inspectingSession) { session in
            sessionInspectorSheet(session)
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
                Text(tr("This week")).tag("week")
                Text(tr("This month")).tag("month")
                Text(tr("This year")).tag("year")
                Text(tr("All Time")).tag("all")
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

    private var kpiSummaryGrid: some View {
        let sessions = filteredSessions
        let strengthCount = sessions.filter { $0.sessionType != .STRETCHING }.count
        let stretchCount = sessions.filter { $0.sessionType == .STRETCHING }.count
        let totalVolKg = sessions.reduce(0.0) { $0 + $1.totalVolumeKg }
        let totalSets = sessions.reduce(0) { $0 + $1.totalSetsCompleted }
        let totalReps = sessions.reduce(0) { $0 + $1.totalRepsCompleted }
        let totalStretchMin = sessions.reduce(0) { $0 + $1.totalStretchSeconds } / 60

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            kpiCard(
                title: tr("Workouts"),
                value: "\(sessions.count)",
                subtitle: tr("%d strength · %d stretching", strengthCount, stretchCount)
            )
            kpiCard(
                title: tr("Volume"),
                value: LukiFormat.volume(kg: totalVolKg, unit: unit),
                subtitle: tr("Without warm-ups")
            )
            kpiCard(
                title: tr("Sets & reps"),
                value: tr("%d · %d reps", totalSets, totalReps),
                subtitle: tr("All exercises")
            )
            kpiCard(
                title: tr("Stretching"),
                value: tr("%d min", totalStretchMin),
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

    private var periodActivityCard: some View {
        let title: String = switch selectedPeriod {
        case "week": tr("Last 7 days")
        case "month": tr("Last 30 days")
        case "year": tr("Last 12 months")
        default: tr("By year")
        }

        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(title, systemImage: "calendar")
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
                Text(tr("%d workouts", filteredSessions.count))
                    .font(.caption.bold().monospacedDigit())
                    .foregroundStyle(LukiColors.accent)
            }

            if selectedPeriod == "week" || selectedPeriod == "month" {
                let daysCount = selectedPeriod == "week" ? 7 : 28
                let cal = Calendar.current
                let today = cal.startOfDay(for: Date())
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 7), spacing: 6) {
                    ForEach(0..<daysCount, id: \.self) { offset in
                        let dayDate = cal.date(byAdding: .day, value: -(daysCount - 1 - offset), to: today) ?? today
                        let daySessions = filteredSessions.filter {
                            cal.isDate(parseSessionDate($0.startedAt), inSameDayAs: dayDate)
                        }
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
                let buckets = buildBuckets()
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

    private func buildBuckets() -> [(label: String, count: Int, sets: Int, volumeKg: Int)] {
        if selectedPeriod == "year" {
            let cal = Calendar.current
            let fmt = DateFormatter()
            fmt.dateFormat = "MMM yy"
            return (0..<12).reversed().map { offset in
                let d = cal.date(byAdding: .month, value: -offset, to: Date()) ?? Date()
                let comps = cal.dateComponents([.year, .month], from: d)
                let matching = filteredSessions.filter {
                    let sc = cal.dateComponents([.year, .month], from: parseSessionDate($0.startedAt))
                    return sc.year == comps.year && sc.month == comps.month
                }
                return (
                    label: fmt.string(from: d),
                    count: matching.count,
                    sets: matching.reduce(0) { $0 + $1.totalSetsCompleted },
                    volumeKg: Int(matching.reduce(0.0) { $0 + $1.totalVolumeKg })
                )
            }
        } else {
            let grouped = Dictionary(grouping: filteredSessions) { session in
                String(session.startedAt.prefix(4))
            }
            return grouped.keys.sorted().map { yr in
                let list = grouped[yr] ?? []
                return (
                    label: yr,
                    count: list.count,
                    sets: list.reduce(0) { $0 + $1.totalSetsCompleted },
                    volumeKg: Int(list.reduce(0.0) { $0 + $1.totalVolumeKg })
                )
            }
        }
    }

    private var progressionChartCard: some View {
        let strengthSessions = Array(filteredSessions.filter { $0.sessionType != .STRETCHING && $0.totalVolumeKg > 0 }.reversed().suffix(15))
        return VStack(alignment: .leading, spacing: 10) {
            Text(tr("Progress"))
                .font(.headline)
                .foregroundStyle(.primary)
            if strengthSessions.isEmpty {
                Text(tr("No strength workouts in this period."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 12)
            } else {
                Chart {
                    ForEach(Array(strengthSessions.enumerated()), id: \.offset) { idx, s in
                        AreaMark(
                            x: .value(tr("Workout"), "#\(idx + 1)"),
                            y: .value(tr("Volume"), LukiFormat.volumeValue(kg: s.totalVolumeKg, unit: unit))
                        )
                        .foregroundStyle(LukiColors.accent.opacity(0.3))

                        LineMark(
                            x: .value(tr("Workout"), "#\(idx + 1)"),
                            y: .value(tr("Volume"), LukiFormat.volumeValue(kg: s.totalVolumeKg, unit: unit))
                        )
                        .foregroundStyle(LukiColors.accent)
                    }
                }
                .chartYAxisLabel(LukiFormat.unitLabel(unit))
                .frame(height: 150)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    private var muscleAndPrGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(tr("Muscles trained"))
                .font(.headline)
                .foregroundStyle(.primary)

            ForEach(MuscleGroup.allCases.prefix(6), id: \.self) { muscle in
                let sets = filteredSessions.reduce(0) { acc, sess in
                    acc + sess.exercises.filter { $0.primaryMuscleSnapshot == muscle }
                        .reduce(0) { $0 + $1.sets.filter(\.completed).count }
                }
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

    private var timelineSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(tr("Workouts (%d)", filteredSessions.count))
                .font(.headline)
                .foregroundStyle(.primary)

            if filteredSessions.isEmpty {
                Text(tr("No workouts in this period."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 12)
            } else {
                ForEach(filteredSessions) { session in
                    sessionHistoryCard(session)
                }
            }
        }
    }

    private func sessionHistoryCard(_ session: WorkoutSessionDto) -> some View {
        VStack(alignment: .leading, spacing: 10) {
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

            Text(parseSessionDate(session.startedAt).formatted(date: .abbreviated, time: .shortened))
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                Text(tr("%d sets", session.totalSetsCompleted))
                Text(LukiFormat.volume(kg: session.totalVolumeKg, unit: session.weightUnit))
                if !notDoneExercises(session).isEmpty {
                    Text(tr("%d not done", notDoneExercises(session).count))
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

    private func sessionInspectorSheet(_ session: WorkoutSessionDto) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let samples = session.heartRateSamples, samples.count > 1 {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(tr("Heart rate"))
                                .font(.headline)
                                .foregroundStyle(LukiColors.heartRate)
                            Chart(samples, id: \.offsetSec) { pt in
                                LineMark(
                                    x: .value("Sec", pt.offsetSec),
                                    y: .value("BPM", pt.bpm)
                                )
                                .foregroundStyle(LukiColors.heartRate)
                            }
                            .frame(height: 150)
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
                    }

                    ForEach(session.exercises.filter(Self.isExerciseDone)) { ex in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(ex.exerciseNameSnapshot)
                                .font(.headline)
                            ForEach(ex.sets) { set in
                                HStack {
                                    Text(tr("Set %d", set.setNumber))
                                        .font(.subheadline.weight(.semibold))
                                    Spacer()
                                    Text("\(LukiFormat.weight(set.weight ?? 0)) \(LukiFormat.unitLabel(set.weightUnit)) × \(set.reps ?? 0)")
                                        .font(.caption.monospacedDigit())
                                    if let peak = set.peakHeartRateBpm {
                                        Label("\(peak) bpm", systemImage: "heart.fill")
                                            .font(.caption2.monospacedDigit())
                                            .foregroundStyle(LukiColors.heartRate)
                                    }
                                }
                            }
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
                    }

                    let notDone = notDoneExercises(session)
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
                .padding(16)
            }
            .navigationTitle(session.workoutNameSnapshot)
        }
    }

    /// Exercises without a logged set (unused variants, left out) are listed apart as "not done".
    private static func isExerciseDone(_ ex: SessionExerciseDto) -> Bool {
        ex.sets.contains(where: \.completed)
    }

    private func notDoneExercises(_ session: WorkoutSessionDto) -> [SessionExerciseDto] {
        session.exercises.filter { !Self.isExerciseDone($0) }
    }
}
