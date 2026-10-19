import SwiftUI
import Charts
import LukiFittiModels
import LukiFittiDesign

public struct DiaryAnalyticsView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var selectedPeriod: String = "month"
    @State private var inspectingSession: WorkoutSessionDto?

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Text("Training Diary & Analytics")
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                    Spacer()
                    Picker("Period", selection: $selectedPeriod) {
                        Text("Week").tag("week")
                        Text("Month").tag("month")
                        Text("Year").tag("year")
                        Text("All").tag("all")
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 190)
                }

                ForEach(viewModel.store.historySessions) { session in
                    sessionHistoryCard(session)
                }
            }
            .padding(16)
        }
        .background(LukiColors.darkBackground)
        .sheet(item: $inspectingSession) { session in
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

    private func sessionHistoryCard(_ session: WorkoutSessionDto) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(session.workoutNameSnapshot)
                    .font(.headline.bold())
                    .foregroundStyle(.white)
                Spacer()
                if session.sourceDevice == .APPLE_WATCH {
                    Label("Apple Watch", systemImage: "applewatch")
                        .font(.caption2.bold())
                        .foregroundStyle(LukiColors.heartRose)
                }
            }

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
}
