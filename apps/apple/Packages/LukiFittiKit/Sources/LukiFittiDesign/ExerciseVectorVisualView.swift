import SwiftUI
import LukiFittiModels

/// Native SwiftUI anatomical dual-pose (1. START / 2. CONTRACT) vector illustration
/// matching `apps/web/components/gym/exercise-visual.tsx`.
public struct ExerciseVectorVisualView: View {
    public let exerciseName: String
    public let primaryMuscle: MuscleGroup
    public let compact: Bool

    public init(exerciseName: String, primaryMuscle: MuscleGroup, compact: Bool = false) {
        self.exerciseName = exerciseName
        self.primaryMuscle = primaryMuscle
        self.compact = compact
    }

    public var body: some View {
        HStack(spacing: compact ? 6 : 12) {
            poseFrame(isPeakContraction: false, caption: "1. START")
            poseFrame(isPeakContraction: true, caption: "2. CONTRACT")
        }
        .padding(compact ? 6 : 10)
        .background(
            RoundedRectangle(cornerRadius: compact ? 10 : 14)
                .fill(LukiColors.fill)
        )
    }

    @ViewBuilder
    private func poseFrame(isPeakContraction: Bool, caption: String) -> some View {
        VStack(spacing: compact ? 2 : 4) {
            Canvas { context, size in
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                let scale = min(size.width, size.height)
                let headRadius = scale * 0.11
                let headCenter = CGPoint(x: center.x, y: scale * 0.22)

                // Head
                let headRect = CGRect(
                    x: headCenter.x - headRadius,
                    y: headCenter.y - headRadius,
                    width: headRadius * 2,
                    height: headRadius * 2
                )
                context.stroke(Path(ellipseIn: headRect), with: .color(.white.opacity(0.85)), lineWidth: 2)

                // Torso
                var torso = Path()
                torso.move(to: CGPoint(x: center.x, y: headCenter.y + headRadius))
                torso.addLine(to: CGPoint(x: center.x, y: scale * 0.62))
                context.stroke(torso, with: .color(.white.opacity(0.85)), lineWidth: 2.5)

                // Highlighted Primary Muscle Region
                let muscleY: CGFloat = switch primaryMuscle {
                case .CHEST, .SHOULDERS, .BACK: scale * 0.38
                case .BICEPS, .TRICEPS, .FOREARMS: scale * 0.34
                case .ABS_CORE, .HIP_FLEXORS: scale * 0.52
                case .QUADRICEPS, .HAMSTRINGS, .GLUTES, .CALVES, .FULL_BODY: scale * 0.70
                }
                let glowRect = CGRect(
                    x: center.x - scale * 0.16,
                    y: muscleY - scale * 0.08,
                    width: scale * 0.32,
                    height: scale * 0.16
                )
                context.fill(
                    Path(ellipseIn: glowRect),
                    with: .color(LukiColors.accent.opacity(isPeakContraction ? 0.85 : 0.45))
                )

                // Arms (Start vs Contracted angle)
                var arms = Path()
                let shoulderY = scale * 0.35
                let handY = isPeakContraction ? scale * 0.16 : scale * 0.44
                let handSpread = isPeakContraction ? scale * 0.26 : scale * 0.34
                arms.move(to: CGPoint(x: center.x - handSpread, y: handY))
                arms.addLine(to: CGPoint(x: center.x - scale * 0.16, y: shoulderY))
                arms.addLine(to: CGPoint(x: center.x + scale * 0.16, y: shoulderY))
                arms.addLine(to: CGPoint(x: center.x + handSpread, y: handY))
                context.stroke(arms, with: .color(LukiColors.accent), lineWidth: 2)

                // Barbell / Load indicator
                var bar = Path()
                bar.move(to: CGPoint(x: center.x - scale * 0.38, y: handY))
                bar.addLine(to: CGPoint(x: center.x + scale * 0.38, y: handY))
                context.stroke(bar, with: .color(.white.opacity(0.75)), lineWidth: 2)

                // Legs
                var legs = Path()
                let hipY = scale * 0.62
                let kneeBend: CGFloat = (!isPeakContraction && (primaryMuscle == .QUADRICEPS || primaryMuscle == .GLUTES || primaryMuscle == .HAMSTRINGS)) ? scale * 0.12 : 0
                legs.move(to: CGPoint(x: center.x - scale * 0.18, y: scale * 0.88))
                legs.addLine(to: CGPoint(x: center.x - scale * 0.14 - kneeBend, y: scale * 0.74))
                legs.addLine(to: CGPoint(x: center.x, y: hipY))
                legs.addLine(to: CGPoint(x: center.x + scale * 0.14 + kneeBend, y: scale * 0.74))
                legs.addLine(to: CGPoint(x: center.x + scale * 0.18, y: scale * 0.88))
                context.stroke(legs, with: .color(.white.opacity(0.85)), lineWidth: 2)
            }
            .frame(width: compact ? 38 : 64, height: compact ? 38 : 64)

            if !compact {
                Text(caption)
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
        }
    }
}
