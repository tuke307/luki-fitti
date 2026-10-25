import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign

public struct DiaryAnalyticsView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var selectedPeriod: String = "month"
    @State private var filterMuscle: MuscleGroup?
    @State private var inspectingSession: WorkoutSessionDto?

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
        .background(LukiColors.darkBackground)
        .sheet(item: $inspectingSession) { session in
            sessionInspectorSheet(session)
        }
    }

    private var headerAndPeriodPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Training Diary & Progress Analytics")
                .font(.title2.bold())
                .foregroundStyle(.primary)
            Text("Calendar history, working-set volume, stretching time, muscle distribution, and PRs")
                .font(.caption)
                .foregroundStyle(.secondary)

            Picker("Period", selection: $selectedPeriod) {
                Text("This week").tag("week")
                Text("This month").tag("month")
                Text("This year").tag("year")
                Text("All Time").tag("all")
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
                    Text("All Muscles")
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(filterMuscle == nil ? LukiColors.neonLime : LukiColors.darkCard))
                        .foregroundStyle(filterMuscle == nil ? LukiColors.accentForeground : .primary)
                }
                .buttonStyle(.plain)

                ForEach(MuscleGroup.allCases, id: \.self) { muscle in
                    Button {
                        filterMuscle = muscle
                    } label: {
                        Text(LukiI18n.muscleLabel(muscle))
                            .font(.caption.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(filterMuscle == muscle ? LukiColors.neonLime : LukiColors.darkCard))
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
        let totalVolKg = Int(sessions.reduce(0.0) { $0 + $1.totalVolumeKg })
        let totalSets = sessions.reduce(0) { $0 + $1.totalSetsCompleted }
        let totalReps = sessions.reduce(0) { $0 + $1.totalRepsCompleted }
        let totalStretchMin = sessions.reduce(0) { $0 + $1.totalStretchSeconds } / 60

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            kpiCard(
                title: "Completed Sessions",
                value: "\(sessions.count)",
                subtitle: "\(strengthCount) strength • \(stretchCount) stretch",
                accent: LukiColors.neonLime
            )
            kpiCard(
                title: "Working Strength Volume",
                value: "\(totalVolKg) kg",
                subtitle: "Excludes warm-ups & stretches",
                accent: .primary
            )
            kpiCard(
                title: "Completed Sets & Reps",
                value: "\(totalSets) (\(totalReps) reps)",
                subtitle: "Logged across exercises",
                accent: .primary
            )
            kpiCard(
                title: "Stretching & Mobility",
                value: "\(totalStretchMin) min",
                subtitle: "Dedicated recovery time",
                accent: LukiColors.electricCyan
            )
        }
    }

    private func kpiCard(title: String, value: String, subtitle: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.title3.bold().monospacedDigit()).foregroundStyle(accent)
            Text(subtitle).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
    }

    private var periodActivityCard: some View {
        let title: String = switch selectedPeriod {
        case "week": "Last 7 Days Activity"
        case "month": "Last 30 Days Activity Calendar"
        case "year": "Last 12 Months Activity"
        default: "All-Time Yearly Training Activity"
        }

        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(title, systemImage: "calendar")
                    .font(.headline.bold())
                    .foregroundStyle(.primary)
                Spacer()
                Text("\(filteredSessions.count) sess.")
                    .font(.caption.bold().monospacedDigit())
                    .foregroundStyle(LukiColors.neonLime)
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
                                    .font(.caption2.bold().monospacedDigit())
                                if hasWorkout {
                                    Text("\(daySessions.count)x")
                                        .font(.system(size: 8, weight: .bold))
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 34)
                            .background(
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(hasWorkout ? LukiColors.neonLime.opacity(0.22) : LukiColors.fill)
                            )
                            .foregroundStyle(hasWorkout ? LukiColors.neonLime : .secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                // Year or All-Time bucket summary
                let buckets = buildBuckets()
                if buckets.isEmpty {
                    Text("No sessions found for this filter selection.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 8)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(buckets, id: \.label) { bucket in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(bucket.label)
                                        .font(.caption.bold())
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    Text("\(bucket.count) sess.")
                                        .font(.caption2.bold().monospacedDigit())
                                        .foregroundStyle(bucket.count > 0 ? LukiColors.neonLime : .secondary)
                                }
                                Text("\(bucket.sets) sets • \(String(format: "%.1f", Double(bucket.volumeKg) / 1000.0))t")
                                    .font(.system(size: 10))
                                    .foregroundStyle(.secondary)
                            }
                            .padding(10)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(bucket.count > 0 ? LukiColors.neonLime.opacity(0.15) : LukiColors.fill)
                            )
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18).fill(LukiColors.darkCard))
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
            Text("Session Volume & Working Sets Progression")
                .font(.headline.bold())
                .foregroundStyle(.primary)
            if strengthSessions.isEmpty {
                Text("No completed strength sessions match the current filter selection.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 12)
            } else {
                Chart {
                    ForEach(Array(strengthSessions.enumerated()), id: \.offset) { idx, s in
                        AreaMark(
                            x: .value("Workout", "#\(idx + 1)"),
                            y: .value("Volume (t)", s.totalVolumeKg / 1000.0)
                        )
                        .foregroundStyle(LukiColors.neonLime.opacity(0.3))

                        LineMark(
                            x: .value("Workout", "#\(idx + 1)"),
                            y: .value("Volume (t)", s.totalVolumeKg / 1000.0)
                        )
                        .foregroundStyle(LukiColors.neonLime)
                    }
                }
                .frame(height: 150)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18).fill(LukiColors.darkCard))
    }

    private var muscleAndPrGrid: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Muscle Group Distribution")
                .font(.headline.bold())
                .foregroundStyle(.primary)

            ForEach(MuscleGroup.allCases.prefix(6), id: \.self) { muscle in
                let sets = filteredSessions.reduce(0) { acc, sess in
                    acc + sess.exercises.filter { $0.primaryMuscleSnapshot == muscle }
                        .reduce(0) { $0 + $1.sets.filter(\.completed).count }
                }
                HStack {
                    Text(LukiI18n.muscleLabel(muscle))
                        .font(.caption.bold())
                        .foregroundStyle(.primary)
                    Spacer()
                    Text("\(sets) sets")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18).fill(LukiColors.darkCard))
    }

    private var timelineSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Workout Diary Timeline (\(filteredSessions.count))")
                .font(.headline.bold())
                .foregroundStyle(.primary)

            if filteredSessions.isEmpty {
                Text("No training sessions recorded in this period yet.")
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
                    .font(.headline.bold())
                    .foregroundStyle(.primary)
                Spacer()
                if session.sourceDevice == .APPLE_WATCH {
                    Label("Apple Watch", systemImage: "applewatch")
                        .font(.caption2.bold())
                        .foregroundStyle(LukiColors.heartRose)
                }
            }

            Text(String(session.startedAt.prefix(10)))
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                Text("\(session.totalSetsCompleted) sets")
                Text("\(Int(session.totalVolumeKg)) kg")
                if let kcal = session.activeCaloriesKcal, kcal > 0 {
                    Text("🔥 \(Int(kcal)) kcal")
                        .foregroundStyle(LukiColors.calorieAmber)
                }
                if let avgHr = session.avgHeartRateBpm {
                    Text("❤️ \(avgHr) avg bpm")
                        .foregroundStyle(LukiColors.heartRose)
                }
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)

            HStack {
                Button("Inspect / Edit") {
                    inspectingSession = session
                }
                .font(.caption.bold())
                Spacer()
                Button(role: .destructive) {
                    viewModel.store.deleteHistorySession(clientSessionId: session.clientSessionId)
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
    }

    private func sessionInspectorSheet(_ session: WorkoutSessionDto) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let samples = session.heartRateSamples, samples.count > 1 {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Apple Watch Heart Rate Curve (BPM)")
                                .font(.headline)
                                .foregroundStyle(LukiColors.heartRose)
                            Chart(samples, id: \.offsetSec) { pt in
                                LineMark(
                                    x: .value("Sec", pt.offsetSec),
                                    y: .value("BPM", pt.bpm)
                                )
                                .foregroundStyle(LukiColors.heartRose)
                            }
                            .frame(height: 150)
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
                    }

                    ForEach(session.exercises) { ex in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(ex.exerciseNameSnapshot)
                                .font(.headline)
                            ForEach(ex.sets) { set in
                                HStack {
                                    Text("Set \(set.setNumber)")
                                        .font(.caption.bold())
                                    Spacer()
                                    Text("\(String(format: "%g", set.weight ?? 0)) \(set.weightUnit.rawValue) × \(set.reps ?? 0)")
                                        .font(.caption.monospacedDigit())
                                    if let peak = set.peakHeartRateBpm {
                                        Text("❤️ \(peak) bpm")
                                            .font(.caption2.monospacedDigit())
                                            .foregroundStyle(LukiColors.heartRose)
                                    }
                                }
                            }
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 14).fill(LukiColors.darkCard))
                    }
                }
                .padding(16)
            }
            .navigationTitle(session.workoutNameSnapshot)
        }
    }
}
