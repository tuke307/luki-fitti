import SwiftUI
import UIKit
import LukiFittiModels
import LukiFittiDesign

/// Full-screen week-result celebration shown once per week (PRODUCT.md "loud, once").
/// PROMOTED: big badge springs 0.3 → 1.15 → 1 over a radial glow with a shine sweep, the
/// old badge slides away, a dense confetti burst gives way to a light drizzle, success +
/// landing haptics. DEMOTED stays kind and calm; STAYED never reaches this view (toast
/// instead). Reduced motion swaps all of it for a plain cross-fade.
struct LeagueCelebrationOverlay: View {
    let result: LeaguePendingResultDto
    let onDismiss: () -> Void
    @Environment(\.lukiLocale) private var tr
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var badgeScale: CGFloat = 0.3
    @State private var badgeOpacity: Double = 0
    @State private var badgeRise: CGFloat = 40
    @State private var oldBadgeDrop: CGFloat = 0
    @State private var oldBadgeOpacity: Double = 1
    @State private var shineX: CGFloat = -1.2
    @State private var confettiStart = Date()
    @State private var successFeedback = 0
    @State private var landFeedback = 0

    private var promoted: Bool { result.outcome == .PROMOTED }
    private var arenaColors: [Color] { ArenaBadge.gradientColors(for: result.toArena) }

    var body: some View {
        ZStack {
            LukiColors.groupedBackground.ignoresSafeArea()

            if promoted && !reduceMotion {
                ConfettiView(start: confettiStart)
                    .ignoresSafeArea()
            }

            VStack(spacing: 24) {
                ZStack {
                    if promoted && !reduceMotion {
                        // Radial glow behind the new badge.
                        Circle()
                            .fill(
                                RadialGradient(
                                    colors: [arenaColors[0].opacity(0.55), .clear],
                                    center: .center,
                                    startRadius: 0,
                                    endRadius: 140
                                )
                            )
                            .frame(width: 280, height: 280)
                            .scaleEffect(badgeScale)
                    }

                    // Old badge: visible first, drops and fades as the new one lands.
                    ArenaBadge(arena: result.fromArena, size: 180)
                        .offset(y: oldBadgeDrop)
                        .opacity(oldBadgeOpacity)

                    ArenaBadge(arena: result.toArena, size: 180)
                        .scaleEffect(badgeScale)
                        .opacity(badgeOpacity)
                        .offset(y: badgeRise)
                        .overlay {
                            if promoted && !reduceMotion {
                                shineSweep
                            }
                        }
                }

                VStack(spacing: 8) {
                    Text(
                        promoted
                            ? tr("Promoted to %@", arenaName(result.toArena, tr))
                            : tr("Back to %@. Next week is a new chance.", arenaName(result.toArena, tr))
                    )
                    .font(promoted ? .largeTitle.weight(.heavy) : .title2.bold())
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.primary)
                    // Arena colour stays decorative — gradient text failed WCAG 3:1 on several arenas.
                    RoundedRectangle(cornerRadius: 2)
                        .fill(LinearGradient(colors: arenaColors, startPoint: .leading, endPoint: .trailing))
                        .frame(width: 96, height: 4)
                        .accessibilityHidden(true)
                    Text(tr("#%d with %d EP", result.rank, result.points))
                        .font(.title3)
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
                .opacity(badgeOpacity)
                .accessibilityIdentifier("ios.league.celebrationContinue")
            }
        }
        // Without .contain the identifier leaks onto a child element (the
        // Continue button ended up carrying "ios.league.celebration").
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.league.celebration")
        .sensoryFeedback(.success, trigger: successFeedback)
        .sensoryFeedback(.impact(weight: .light), trigger: landFeedback)
        .onAppear {
            if reduceMotion {
                withAnimation(.easeIn(duration: 0.25)) {
                    badgeOpacity = 1
                    badgeScale = 1
                    badgeRise = 0
                    oldBadgeOpacity = 0
                }
            } else {
                successFeedback += 1
                // Old badge slides away…
                withAnimation(.easeIn(duration: 0.45).delay(0.1)) {
                    oldBadgeDrop = 90
                    oldBadgeOpacity = 0
                }
                // …while the new one springs 0.3 → 1.15 → 1.
                withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                    badgeScale = 1.15
                    badgeOpacity = 1
                    badgeRise = 0
                }
                withAnimation(.spring(response: 0.4, dampingFraction: 0.5).delay(0.4)) {
                    badgeScale = 1
                }
                withAnimation(.linear(duration: 0.6).delay(0.55)) {
                    shineX = 1.2
                }
                Task {
                    try? await Task.sleep(nanoseconds: 750_000_000)
                    landFeedback += 1
                }
            }
        }
    }

    /// White sheen sweeping across the badge, clipped to the shield silhouette.
    private var shineSweep: some View {
        ArenaBadge(arena: result.toArena, size: 180)
            .scaleEffect(badgeScale)
            .offset(y: badgeRise)
            .opacity(0)
            .overlay {
                GeometryReader { geo in
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [.clear, .white.opacity(0.85), .clear],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * 0.45)
                        .rotationEffect(.degrees(20))
                        .offset(x: shineX * geo.size.width)
                }
                .mask { ArenaBadge(arena: result.toArena, size: 180).scaleEffect(badgeScale).offset(y: badgeRise) }
            }
            .allowsHitTesting(false)
    }
}

/// Deterministic confetti: a dense burst out of the badge (~120 pieces over the first
/// 2.5 s, then a light drizzle on a 3 s loop. Caller gates Reduce Motion. Shared with the
/// duel result celebration.
struct ConfettiView: View {
    let start: Date

    private struct Piece {
        var angle: CGFloat    // burst direction, radians
        var speed: CGFloat    // burst velocity, screens/second
        var x0: CGFloat       // drizzle horizontal start, 0…1
        var fallSpeed: CGFloat
        var drift: CGFloat
        var phase: CGFloat
        var size: CGFloat
        var rotation: CGFloat
        var colorIndex: Int
    }

    private static let colors: [Color] = [
        .red, .orange, .yellow, .green, .mint, .blue, .purple, .pink,
    ]

    private let burst: [Piece] = (0..<120).map { i in
        let f = { (n: Int) in CGFloat((i * 2_333 + n * 977) % 1_000) / 1_000 }
        return Piece(
            angle: f(0) * .pi * 2,
            speed: 0.45 + f(1) * 0.75,
            x0: 0,
            fallSpeed: 0,
            drift: (f(3) - 0.5) * 0.15,
            phase: f(4) * 0.35,
            size: 4 + f(5) * 6,
            rotation: f(6) * .pi * 2,
            colorIndex: i % ConfettiView.colors.count
        )
    }

    private let drizzle: [Piece] = (0..<36).map { i in
        let f = { (n: Int) in CGFloat((i * 3_191 + n * 631) % 1_000) / 1_000 }
        return Piece(
            angle: 0,
            speed: 0,
            x0: f(1),
            fallSpeed: 0.12 + f(2) * 0.14,
            drift: (f(3) - 0.5) * 0.12,
            phase: f(4) * 3,
            size: 3 + f(5) * 4,
            rotation: f(6) * .pi * 2,
            colorIndex: i % ConfettiView.colors.count
        )
    }

    var body: some View {
        TimelineView(.animation) { context in
            Canvas { g, size in
                let t = context.date.timeIntervalSince(start)
                let center = CGPoint(x: size.width / 2, y: size.height * 0.36)

                // Burst: radial spray with gravity, alive for ~2.5 s.
                for piece in burst {
                    let pt = max(0, t - Double(piece.phase))
                    guard pt > 0, pt < 2.5 else { continue }
                    let v = piece.speed * size.height
                    let x = center.x + cos(piece.angle) * v * pt
                    let y = center.y + sin(piece.angle) * v * pt + 0.5 * 1_400 * pt * pt
                    let fade = pt > 1.8 ? max(0, (2.5 - pt) / 0.7) : 1
                    draw(piece, at: CGPoint(x: x, y: y), t: t, opacity: fade, in: &g, size: size)
                }

                // Drizzle: gentle loop that keeps going after the burst.
                for piece in drizzle {
                    let cycle = (t + Double(piece.phase)).truncatingRemainder(dividingBy: 3) / 3
                    let y = CGFloat(cycle) * (1 + Double(piece.fallSpeed) * 3) * size.height
                    let x = (piece.x0 + sin(CGFloat(t) + piece.phase * 6) * piece.drift) * size.width
                    let opacity = cycle < 0.85 ? 0.9 : max(0, (1 - cycle) / 0.15) * 0.9
                    draw(piece, at: CGPoint(x: x, y: y - piece.size * 2), t: t, opacity: opacity, in: &g, size: size)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func draw(
        _ piece: Piece, at p: CGPoint, t: TimeInterval, opacity: Double,
        in g: inout GraphicsContext, size: CGSize
    ) {
        var rect = CGRect(x: p.x, y: p.y, width: piece.size, height: piece.size * 1.4)
        rect = rect.applying(
            CGAffineTransform(translationX: p.x, y: p.y)
                .rotated(by: piece.rotation + CGFloat(t))
                .translatedBy(x: -p.x, y: -p.y)
        )
        g.opacity = opacity
        g.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(Self.colors[piece.colorIndex]))
    }
}
