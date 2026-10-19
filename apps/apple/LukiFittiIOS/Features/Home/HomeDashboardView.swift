import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct HomeDashboardView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var muscleRange: String = "30d"

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                headerSection

                if let active = viewModel.store.activeSession {
                    activeSessionBanner(active)
                }

                kpiGridSection
                weeklyVolumeChartCard
                muscleBalanceChartCard
            }
            .padding(16)
        }
        .background(LukiColors.darkBackground)
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Hey, \(viewModel.store.currentUser?.name ?? "GymBuddy")")
                .font(.title2.bold())
                .foregroundStyle(.white)
            Text("Your training consistency, weekly load progression, and muscle split balance")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                Button {
                    viewModel.selectedTab = .diary
                } label: {
                    Label("Training Diary", systemImage: "calendar")
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.darkCard))
                }
                .buttonStyle(.plain)

                Button {
                    viewModel.selectedTab = .workouts
                } label: {
                    Label("Choose Workout", systemImage: "play.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.black)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.neonLime))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func activeSessionBanner(_ active: WorkoutSessionDto) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("SESSION IN PROGRESS")
                    .font(.caption2.bold())
                    .foregroundStyle(LukiColors.neonLime)
                Text(active.workoutNameSnapshot)
                    .font(.headline.bold())
                    .foregroundStyle(.white)
                Text("\(active.totalSetsCompleted) sets logged • \(Int(active.totalVolumeKg)) kg volume")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                viewModel.selectedTab = .session
            } label: {
                Text("Resume")
                    .font(.caption.bold())
                    .foregroundStyle(.black)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(LukiColors.neonLime))
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(LukiColors.neonLime.opacity(0.12))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(LukiColors.neonLime.opacity(0.45), lineWidth: 1))
        )
    }

    private var kpiGridSection: some View {
        let history = viewModel.store.historySessions
        let totalVol30d = history.reduce(0.0) { $0 + $1.totalVolumeKg }
        let avgLoad = history.isEmpty ? 0 : Int(totalVol30d / Double(history.count))

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            kpiCard(
                title: "7-Day Frequency",
                value: "\(min(history.count, viewModel.store.preferences.weeklyGoalSessions))/\(viewModel.store.preferences.weeklyGoalSessions)",
                subtitle: "Weekly session target",
                accent: LukiColors.neonLime
            )
            kpiCard(
                title: "30-Day Volume",
                value: String(format: "%.1f t", totalVol30d / 1000.0),
                subtitle: "\(Int(totalVol30d)) kg moved",
                accent: .white
            )
            kpiCard(
                title: "Total Workouts",
                value: "\(history.count)",
                subtitle: "Completed sessions",
                accent: LukiColors.electricCyan
            )
            kpiCard(
                title: "Avg. Session Load",
                value: "\(avgLoad) kg",
                subtitle: "Working load / workout",
                accent: .white
            )
        }
    }

    private func kpiCard(title: String, value: String, subtitle: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.bold().monospacedDigit())
                .foregroundStyle(accent)
            Text(subtitle)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
    }

    private var weeklyVolumeChartCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Weekly Volume & Session Trend")
                .font(.headline)
                .foregroundStyle(.white)
            Chart {
                ForEach(Array(viewModel.store.historySessions.prefix(10).reversed().enumerated()), id: \.offset) { idx, sess in
                    BarMark(
                        x: .value("Session", "#\(idx + 1)"),
                        y: .value("Volume (t)", sess.totalVolumeKg / 1000.0)
                    )
                    .foregroundStyle(LukiColors.neonLime)
                }
            }
            .frame(height: 150)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18).fill(LukiColors.darkCard))
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

    private var muscleRangeFilteredSessions: [WorkoutSessionDto] {
        let now = Date()
        let cutoff: Date? = switch muscleRange {
        case "30d": now.addingTimeInterval(-30 * 86_400)
        case "90d": now.addingTimeInterval(-90 * 86_400)
        default: nil
        }
        return viewModel.store.historySessions.filter { session in
            guard let cutoff else { return true }
            return parseSessionDate(session.startedAt) >= cutoff
        }
    }

    private var muscleBalanceChartCard: some View {
        let sessionsInRange = muscleRangeFilteredSessions
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Muscle Group Set Balance")
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text("Working sets (\(muscleRange.uppercased()) • \(sessionsInRange.count) sessions)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Picker("Range", selection: $muscleRange) {
                    Text("30d").tag("30d")
                    Text("90d").tag("90d")
                    Text("All").tag("all")
                }
                .pickerStyle(.segmented)
                .frame(width: 140)
            }
            ForEach(MuscleGroup.allCases.prefix(6), id: \.self) { muscle in
                let sets = sessionsInRange.reduce(0) { acc, sess in
                    acc + sess.exercises.filter { $0.primaryMuscleSnapshot == muscle }
                        .reduce(0) { $0 + $1.sets.filter(\.completed).count }
                }
                HStack {
                    Text(LukiI18n.muscleLabel(muscle))
                        .font(.caption)
                        .foregroundStyle(.white)
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
}
