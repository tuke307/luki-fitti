import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct HomeDashboardView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var muscleRange: String = "90d"

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(greeting)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.secondary)

                if let active = viewModel.store.activeSession {
                    resumeCard(active)
                } else {
                    startNextCard
                }

                weekCard
                overviewSection
                weeklyVolumeCard
                musclesCard
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(LukiColors.groupedBackground)
    }

    // MARK: Header & primary action

    private var greeting: String {
        let name = viewModel.store.currentUser?.name?.split(separator: " ").first.map(String.init) ?? "GymBuddy"
        return "Hi, \(name)"
    }

    private func resumeCard(_ active: WorkoutSessionDto) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Session In Progress")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(LukiColors.accent)
                Text(active.workoutNameSnapshot)
                    .font(.title2.bold())
                Text("\(active.totalSetsCompleted) sets · \(Int(active.totalVolumeKg)) kg")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Button {
                viewModel.selectedTab = .session
            } label: {
                Label("Resume", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
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
                Text("Ready when you are")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(suggestion?.template.name ?? "Pick a workout to get going.")
                    .font(.title2.bold())
                if let suggestion {
                    Text(suggestion.lastDate.map { "Last trained \($0.formatted(.dateTime.day().month()))" } ?? "Never trained")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 10) {
                if let suggestion {
                    Button {
                        viewModel.startSession(from: suggestion.template)
                        viewModel.selectedTab = .session
                    } label: {
                        Label("Start", systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                    .controlSize(.large)
                    .accessibilityIdentifier("ios.home.startSuggestedButton")
                }
                Button {
                    viewModel.selectedTab = .workouts
                } label: {
                    Text("Choose Workout")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
                .controlSize(.large)
                .accessibilityIdentifier("ios.home.chooseWorkoutButton")
            }
        }
        .padding(18)
        .background(cardShape)
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

    private var sessionsThisWeek: Int {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = .current
        guard let weekStart = calendar.dateInterval(of: .weekOfYear, for: Date())?.start else { return 0 }
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
                Text("This week")
                    .font(.headline)
                Text("\(done)")
                    .font(.system(.title, design: .rounded).weight(.semibold))
                    + Text(" / \(goal)")
                    .font(.system(.headline, design: .rounded))
                    .foregroundStyle(.secondary)
                Text(remaining == 0 ? "Weekly goal reached. Nice work." : "\(remaining) more to reach your goal")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .background(cardShape)
        .accessibilityElement(children: .combine)
    }

    // MARK: Overview

    private var overviewSection: some View {
        let history = viewModel.store.historySessions
        let cutoff = Date().addingTimeInterval(-30 * 86_400)
        let volume30d = history.filter { parseDate($0.startedAt) >= cutoff }.reduce(0.0) { $0 + $1.totalVolumeKg }
        let strength = history.filter { $0.totalVolumeKg > 0 }
        let perWorkout = strength.isEmpty ? 0 : Int(strength.reduce(0.0) { $0 + $1.totalVolumeKg } / Double(strength.count))

        return VStack(alignment: .leading, spacing: 8) {
            Text("Overview")
                .font(.title3.bold())
                .padding(.horizontal, 4)
            VStack(spacing: 0) {
                overviewRow("Last 30 days", "\(Int(volume30d).formatted()) kg lifted")
                Divider().padding(.leading, 18)
                overviewRow("Workouts", "\(history.count)")
                Divider().padding(.leading, 18)
                overviewRow("Per workout", "\(perWorkout.formatted()) kg on average")
            }
            .background(cardShape)
            Button {
                viewModel.selectedTab = .diary
            } label: {
                Label("History", systemImage: "chevron.right")
                    .labelStyle(TrailingIconLabelStyle())
                    .font(.subheadline.weight(.medium))
            }
            .padding(.horizontal, 4)
            .accessibilityIdentifier("ios.home.trainingDiaryButton")
        }
    }

    private func overviewRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 13)
    }

    // MARK: Charts

    private var weeklyVolumeCard: some View {
        let sessions = Array(viewModel.store.historySessions.prefix(10).reversed())
        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Weekly volume").font(.headline)
                Text("Recent workouts").font(.footnote).foregroundStyle(.secondary)
            }
            if sessions.isEmpty {
                Text("No workouts yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else {
                Chart {
                    ForEach(Array(sessions.enumerated()), id: \.offset) { idx, session in
                        BarMark(
                            x: .value("Workout", idx + 1),
                            y: .value("Volume (t)", session.totalVolumeKg / 1000.0)
                        )
                        .foregroundStyle(LukiColors.accent)
                        .clipShape(Capsule())
                    }
                }
                .chartXAxis(.hidden)
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
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Muscles trained").font(.headline)
                    Text("Working sets per muscle group").font(.footnote).foregroundStyle(.secondary)
                }
                Spacer()
                Picker("Range", selection: $muscleRange) {
                    Text("30d").tag("30d")
                    Text("90d").tag("90d")
                    Text("All").tag("all")
                }
                .pickerStyle(.segmented)
                .frame(width: 150)
            }
            if counts.isEmpty {
                Text("No sets logged in this period yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 80)
            } else {
                ForEach(counts.prefix(8), id: \.0) { muscle, sets in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(LukiI18n.muscleLabel(muscle))
                            Spacer()
                            Text("\(sets) sets")
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
                    }
                }
            }
        }
        .padding(18)
        .background(cardShape)
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

private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 2) {
            configuration.title
            configuration.icon.imageScale(.small)
        }
    }
}
