import SwiftUI
import LukiFittiModels
import LukiFittiDesign

public struct WatchWorkoutSummaryView: View {
    public let session: WorkoutSessionDto
    public let onDismiss: () -> Void

    public init(session: WorkoutSessionDto, onDismiss: @escaping () -> Void) {
        self.session = session
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                // Hero Header: Neon-lime circle badge with dark checkmark + Workout Completed! + Duration
                HStack(spacing: 8) {
                    ZStack {
                        Circle()
                            .fill(LukiColors.neonLime)
                            .frame(width: 26, height: 26)
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .black))
                            .foregroundStyle(.black)
                    }
                    Text("Workout Completed!")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                }

                Text(formattedDuration(session.activeDurationSeconds))
                    .font(.system(size: 20, weight: .black, design: .monospaced))
                    .foregroundStyle(LukiColors.neonLime)

                dividerLine

                // STRENGTH VOLUME
                VStack(spacing: 3) {
                    Text("STRENGTH VOLUME")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                    Text("\(Int(session.totalVolumeKg)) kg • \(session.totalSetsCompleted) sets")
                        .font(.system(size: 14, weight: .black, design: .monospaced))
                        .foregroundStyle(LukiColors.neonLime)
                }

                dividerLine

                // CARDIO / STRETCHING
                VStack(spacing: 3) {
                    Text("CARDIO")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                    HStack(spacing: 6) {
                        Image(systemName: "figure.run")
                            .foregroundStyle(LukiColors.electricCyan)
                        Text(formattedDuration(session.totalStretchSeconds))
                            .font(.system(size: 14, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white)
                    }
                }

                dividerLine

                // CALORIES BURNED
                VStack(spacing: 3) {
                    Text("CALORIES BURNED")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                    HStack(spacing: 6) {
                        Image(systemName: "flame.fill")
                            .foregroundStyle(LukiColors.electricCyan)
                        Text("\(Int(session.activeCaloriesKcal ?? 0)) KCal")
                            .font(.system(size: 14, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white)
                    }
                }

                dividerLine

                // HEART RATE
                VStack(spacing: 3) {
                    Text("HEART RATE")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                    Text("❤️ \(session.avgHeartRateBpm.map(String.init) ?? "-") avg · \(session.maxHeartRateBpm.map(String.init) ?? "-") max")
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundStyle(LukiColors.heartRose)
                }

                Button(action: onDismiss) {
                    Text("Done")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 14).fill(LukiColors.neonLime))
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
            .padding(.horizontal, 8)
        }
        .background(Color.black)
    }

    private var dividerLine: some View {
        Rectangle()
            .fill(Color.white)
            .frame(height: 1)
    }

    private func formattedDuration(_ sec: Int) -> String {
        let s = max(0, sec)
        let h = s / 3600
        let m = (s % 3600) / 60
        let rem = s % 60
        return String(format: "%d:%02d:%02d", h, m, rem)
    }
}
