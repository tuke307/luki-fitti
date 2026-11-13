import SwiftUI
import UIKit
import LukiFittiModels
import LukiFittiDesign

/// Full-screen week-result overlay shown once per week (PRODUCT.md "loud, once").
/// PROMOTED springs the new badge in over confetti with a success haptic; DEMOTED stays
/// kind and quiet; STAYED never reaches this view (toast instead). Reduced motion swaps
/// the spring/confetti for a plain cross-fade.
struct LeagueCelebrationOverlay: View {
    let result: LeaguePendingResultDto
    let onDismiss: () -> Void
    @Environment(\.lukiLocale) private var tr
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var badgeScale: CGFloat = 0.3
    @State private var badgeOpacity: Double = 0
    @State private var confettiStart = Date()

    private var promoted: Bool { result.outcome == .PROMOTED }

    var body: some View {
        ZStack {
            LukiColors.groupedBackground.ignoresSafeArea()

            if promoted && !reduceMotion {
                ConfettiView(start: confettiStart)
                    .ignoresSafeArea()
            }

            VStack(spacing: 18) {
                ArenaBadge(arena: result.toArena, size: 110)
                    .scaleEffect(badgeScale)
                    .opacity(badgeOpacity)

                VStack(spacing: 6) {
                    Text(
                        promoted
                            ? tr("Promoted to %@", arenaName(result.toArena, tr))
                            : tr("Back to %@. Next week is a new chance.", arenaName(result.toArena, tr))
                    )
                    .font(.title2.bold())
                    .multilineTextAlignment(.center)
                    Text(tr("#%d with %d EP", result.rank, result.points))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .opacity(badgeOpacity)

                Button {
                    onDismiss()
                } label: {
                    Text(tr("Continue"))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.horizontal, 40)
                .accessibilityIdentifier("ios.league.celebrationContinue")
            }
        }
        .accessibilityIdentifier("ios.league.celebration")
        .onAppear {
            if promoted {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
            if reduceMotion {
                withAnimation(.easeIn(duration: 0.25)) {
                    badgeOpacity = 1
                    badgeScale = 1
                }
            } else {
                withAnimation(.spring(response: 0.55, dampingFraction: 0.6)) {
                    badgeScale = 1
                    badgeOpacity = 1
                }
            }
        }
    }
}

/// Deterministic confetti field: ~60 pieces drifting down on a 3 s loop, drawn with
/// `Canvas` + `TimelineView` (no particles when Reduce Motion is on — caller gates it).
private struct ConfettiView: View {
    let start: Date

    private struct Piece {
        var x0: CGFloat      // 0…1 horizontal start
        var speed: CGFloat   // fall speed, screens/second
        var drift: CGFloat   // horizontal sway amplitude
        var phase: CGFloat   // start offset
        var size: CGFloat
        var rotation: CGFloat
        var colorIndex: Int
    }

    private static let colors: [Color] = [
        .red, .orange, .yellow, .green, .mint, .blue, .purple, .pink,
    ]

    private let pieces: [Piece] = (0..<60).map { i in
        let f = { (n: Int) in CGFloat((i * 2_333 + n * 977) % 1_000) / 1_000 }
        return Piece(
            x0: f(1),
            speed: 0.25 + f(2) * 0.35,
            drift: (f(3) - 0.5) * 0.12,
            phase: f(4) * 3,
            size: 4 + f(5) * 5,
            rotation: f(6) * .pi * 2,
            colorIndex: i % ConfettiView.colors.count
        )
    }

    var body: some View {
        TimelineView(.animation) { context in
            Canvas { g, size in
                let t = context.date.timeIntervalSince(start)
                for piece in pieces {
                    let cycle = (t + Double(piece.phase)).truncatingRemainder(dividingBy: 3) / 3
                    let y = CGFloat(cycle) * (1 + Double(piece.speed) * 3) * size.height * 0.4
                    let x = (piece.x0 + sin(CGFloat(t) + piece.phase * 6) * piece.drift) * size.width
                    var rect = CGRect(
                        x: x, y: y - piece.size * 2,
                        width: piece.size, height: piece.size * 1.4
                    )
                    rect = rect.applying(
                        CGAffineTransform(translationX: x, y: y).rotated(by: piece.rotation + CGFloat(t))
                            .translatedBy(x: -x, y: -y)
                    )
                    let opacity = cycle < 0.85 ? 1.0 : max(0, (1 - cycle) / 0.15)
                    g.opacity = opacity
                    g.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(Self.colors[piece.colorIndex]))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
