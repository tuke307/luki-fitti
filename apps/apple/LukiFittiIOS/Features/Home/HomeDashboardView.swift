import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct HomeDashboardView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var muscleRange: String = "90d"

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private var unit: WeightUnit { viewModel.store.preferences.weightUnit }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let greeting {
                    Text(greeting)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.secondary)
                }

                if let active = viewModel.store.activeSession {
                    resumeCard(active)
                } else {
                    startNextCard
                }

                WeightHomeCard(viewModel: viewModel)
                weekCard
                weeklyVolumeCard
                musclesCard
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(LukiColors.groupedBackground)
        .navigationDestination(isPresented: $viewModel.isWeightPresented) {
            WeightView(viewModel: viewModel)
        }
    }

    // MARK: Header & primary action

    /// Only greets people by name; guests just see the Today title.
    private var greeting: String? {
        guard let name = viewModel.store.currentUser?.name?.split(separator: " ").first else { return nil }
        return tr("Hi, %@", String(name))
    }

    private func resumeCard(_ active: WorkoutSessionDto) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(tr("In Progress"))
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(LukiColors.accent)
                Text(active.workoutNameSnapshot)
                    .font(.title2.bold())
                Text(tr("%d sets · %@", active.totalSetsCompleted, LukiFormat.volume(kg: active.totalVolumeKg, unit: active.weightUnit)))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Button {
                viewModel.selectedTab = .session
            } label: {
                Label(tr("Resume"), systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityIdentifier("ios.home.resumeSessionButton")
        }
        .padding(18)
        .background(cardShape)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.home.activeSessionBanner")
    }

    private var startNextCard: some View {
        let suggestion = suggestedTemplate
        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(tr("Ready when you are"))
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(suggestion?.template.name ?? tr("Pick a workout to get going."))
                    .font(.title2.bold())
                if let suggestion {
                    Text(suggestion.lastDate.map { tr("Last trained %@", $0.formatted(.dateTime.day().month())) } ?? tr("Never trained"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { startButtons(suggestion) }
                VStack(spacing: 10) { startButtons(suggestion) }
            }
        }
        .padding(18)
        .background(cardShape)
    }

    @ViewBuilder
    private func startButtons(_ suggestion: (template: WorkoutTemplateDto, lastDate: Date?)?) -> some View {
        if let suggestion {
            Button {
                viewModel.startSession(from: suggestion.template)
                viewModel.selectedTab = .session
            } label: {
                Label(tr("Start"), systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityIdentifier("ios.home.startSuggestedButton")
        }
        Button {
            viewModel.selectedTab = .workouts
        } label: {
            Text(tr("Choose Workout"))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .accessibilityIdentifier("ios.home.chooseWorkoutButton")
    }

    private var suggestedTemplate: (template: WorkoutTemplateDto, lastDate: Date?)? {
        let templates = viewModel.store.folders.flatMap(\.templates) + viewModel.store.unfiledTemplates
        guard !templates.isEmpty else { return nil }
        func lastDate(_ tpl: WorkoutTemplateDto) -> Date? {
            viewModel.store.historySessions
                .first { $0.templateId == tpl.id || $0.workoutNameSnapshot.caseInsensitiveCompare(tpl.name) == .orderedSame }
                .map { parseDate($0.startedAt) }
        }
        let sorted = templates.sorted { (lastDate($0) ?? .distantPast) < (lastDate($1) ?? .distantPast) }
        return sorted.first.map { ($0, lastDate($0)) }
    }

    // MARK: Weekly goal

    private static var isoCalendar: Calendar {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = .current
        return calendar
    }

    private var sessionsThisWeek: Int {
        guard let weekStart = Self.isoCalendar.dateInterval(of: .weekOfYear, for: Date())?.start else { return 0 }
        return viewModel.store.historySessions.filter { parseDate($0.startedAt) >= weekStart }.count
    }

    private var weekCard: some View {
        let goal = max(1, viewModel.store.preferences.weeklyGoalSessions)
        let done = sessionsThisWeek
        let remaining = max(0, goal - done)
        return HStack(spacing: 18) {
            ZStack {
                Circle()
                    .stroke(LukiColors.accent.opacity(0.18), lineWidth: 9)
                Circle()
                    .trim(from: 0, to: min(1, Double(done) / Double(goal)))
                    .stroke(LukiColors.accent, style: StrokeStyle(lineWidth: 9, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.smooth, value: done)
            }
            .frame(width: 72, height: 72)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(tr("This week"))
                    .font(.headline)
                Text("\(Text("\(done)").font(.system(.title, design: .rounded).weight(.semibold))) \(Text("/ \(goal)").font(.system(.headline, design: .rounded)).foregroundStyle(.secondary))")
                Text(remaining == 0 ? tr("Weekly goal reached. Nice work.") : tr("%d more to reach your goal", remaining))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .background(cardShape)
        .accessibilityElement(children: .combine)
    }

    // MARK: Charts

    /// Volume per ISO week for the last 8 weeks, in the person's unit (thousands).
    private var weeklyVolume: [(weekStart: Date, value: Double)] {
        let calendar = Self.isoCalendar
        guard let thisWeek = calendar.dateInterval(of: .weekOfYear, for: Date())?.start else { return [] }
        return (0..<8).reversed().compactMap { offset in
            guard let start = calendar.date(byAdding: .weekOfYear, value: -offset, to: thisWeek),
                  let end = calendar.date(byAdding: .weekOfYear, value: 1, to: start) else { return nil }
            let kg = viewModel.store.historySessions
                .filter { let d = parseDate($0.startedAt); return d >= start && d < end }
                .reduce(0.0) { $0 + $1.totalVolumeKg }
            return (start, Double(LukiFormat.volumeValue(kg: kg, unit: unit)) / 1000.0)
        }
    }

    private var weeklyVolumeCard: some View {
        let weeks = weeklyVolume
        let bigUnit = unit == .LBS ? "k lb" : "t"
        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(tr("Weekly volume")).font(.headline)
                Text(tr("Last 8 weeks")).font(.footnote).foregroundStyle(.secondary)
            }
            if viewModel.store.historySessions.isEmpty {
                Text(tr("No workouts yet."))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else {
                Chart(weeks, id: \.weekStart) { week in
                    BarMark(
                        x: .value(tr("Week"), week.weekStart, unit: .weekOfYear),
                        y: .value(tr("Volume (%@)", bigUnit), week.value)
                    )
                    .foregroundStyle(LukiColors.accent)
                    .clipShape(Capsule())
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .weekOfYear, count: 2)) {
                        AxisValueLabel(format: .dateTime.day().month(.abbreviated))
                    }
                }
                .chartYAxisLabel(bigUnit)
                .frame(height: 150)
            }
        }
        .padding(18)
        .background(cardShape)
    }

    private var musclesCard: some View {
        let cutoff: Date? = switch muscleRange {
        case "30d": Date().addingTimeInterval(-30 * 86_400)
        case "90d": Date().addingTimeInterval(-90 * 86_400)
        default: nil
        }
        let sessions = viewModel.store.historySessions.filter { cutoff == nil || parseDate($0.startedAt) >= cutoff! }
        let counts: [(MuscleGroup, Int)] = MuscleGroup.allCases.compactMap { muscle in
            let sets = sessions.reduce(0) { acc, sess in
                acc + sess.exercises.filter { $0.primaryMuscleSnapshot == muscle }
                    .reduce(0) { $0 + $1.sets.filter(\.completed).count }
            }
            return sets > 0 ? (muscle, sets) : nil
        }
        .sorted { $0.1 > $1.1 }
        let maxSets = counts.first?.1 ?? 1

        return VStack(alignment: .leading, spacing: 14) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top) {
                    musclesTitle
                    Spacer()
                    musclesRangePicker.fixedSize()
                }
                VStack(alignment: .leading, spacing: 10) {
                    musclesTitle
                    musclesRangePicker
                }
            }
            if counts.isEmpty {
                Text(tr("No sets logged in this period yet."))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 80)
            } else {
                ForEach(counts.prefix(8), id: \.0) { muscle, sets in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(LukiI18n.muscleLabel(muscle, locale: tr))
                            Spacer()
                            Text(tr("%d sets", sets))
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                        .font(.subheadline)
                        GeometryReader { geo in
                            Capsule()
                                .fill(LukiColors.fill)
                                .overlay(alignment: .leading) {
                                    Capsule()
                                        .fill(LukiColors.accent)
                                        .frame(width: geo.size.width * CGFloat(sets) / CGFloat(maxSets))
                                }
                        }
                        .frame(height: 6)
                        .accessibilityHidden(true)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .padding(18)
        .background(cardShape)
    }

    private var musclesTitle: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(tr("Muscles trained")).font(.headline)
            Text(tr("Working sets per muscle group")).font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var musclesRangePicker: some View {
        Picker(tr("Range"), selection: $muscleRange) {
            Text("30d").tag("30d")
            Text("90d").tag("90d")
            Text(tr("All")).tag("all")
        }
        .pickerStyle(.segmented)
    }

    // MARK: Helpers

    private var cardShape: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground)
    }

    private static let isoFormatterWithFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoFormatterStandard = ISO8601DateFormatter()

    private func parseDate(_ iso: String) -> Date {
        Self.isoFormatterWithFractional.date(from: iso)
            ?? Self.isoFormatterStandard.date(from: iso)
            ?? Date()
    }
}
