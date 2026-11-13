import SwiftUI
import LukiFittiModels
import LukiFittiDesign

/// Full-screen duel result shown once per finished duel (PRODUCT.md "loud, once").
/// WON gets the trophy + glow + confetti burst and a success haptic; TIE stays shared;
/// LOST stays kind and offers a Rematch. Reduced motion swaps all of it for a cross-fade.
struct DuelCelebrationOverlay: View {
    let result: DuelItemDto
    let onDismiss: () -> Void
    /// Rematch issues a fresh challenge to the same opponent, then dismisses.
    let onRematch: () -> Void
    @Environment(\.lukiLocale) private var tr
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var trophyScale: CGFloat = 0.3
    @State private var contentOpacity: Double = 0
    @State private var confettiStart = Date()
    @State private var successFeedback = 0

    private var won: Bool { result.outcome == .WON }
    private var tie: Bool { result.outcome == .TIE }
    private var loud: Bool { won && !reduceMotion }
    private var title: String {
        if won {
            return tr("You beat @%@", result.opponent.handle)
        } else if tie {
            return tr("Even match")
        }
        return tr("@%@ won this one", result.opponent.handle)
    }
    private var score: String {
        won || tie ? "\(result.you)–\(result.them)" : "\(result.them)–\(result.you)"
    }

    var body: some View {
        ZStack {
            LukiColors.groupedBackground.ignoresSafeArea()

            if loud {
                ConfettiView(start: confettiStart)
                    .ignoresSafeArea()
            }

            VStack(spacing: 24) {
                ZStack {
                    if loud {
                        Circle()
                            .fill(
                                RadialGradient(
                                    colors: [Color.yellow.opacity(0.5), .clear],
                                    center: .center,
                                    startRadius: 0,
                                    endRadius: 140
                                )
                            )
                            .frame(width: 280, height: 280)
                            .scaleEffect(trophyScale)
                    }
                    if won {
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 150))
                            .foregroundStyle(.yellow)
                            .scaleEffect(trophyScale)
                            .accessibilityHidden(true)
                    } else {
                        Image(systemName: tie ? "hands.clap.fill" : "figure.fencing")
                            .font(.system(size: 90))
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                    }
                }
                .frame(height: 220)

                VStack(spacing: 8) {
                    Text(title)
                        .font(won ? .largeTitle.weight(.heavy) : .title2.bold())
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.primary)
                    Text(score)
                        .font(.title3.monospacedDigit())
                        .foregroundStyle(.secondary)
                    if result.outcome == .LOST {
                        Text(tr("Want a rematch?"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .opacity(contentOpacity)

                HStack(spacing: 12) {
                    if result.outcome == .LOST {
                        Button {
                            onRematch()
                        } label: {
                            Text(tr("Rematch"))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .accessibilityIdentifier("ios.duel.rematch")
                    }
                    Button {
                        onDismiss()
                    } label: {
                        Text(tr("Continue"))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .accessibilityIdentifier("ios.duel.celebrationContinue")
                }
                .padding(.horizontal, 40)
                .opacity(contentOpacity)
            }
        }
        // Without .contain the identifier leaks onto a child element.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.duel.celebration")
        .sensoryFeedback(.success, trigger: successFeedback)
        .onAppear {
            if reduceMotion {
                withAnimation(.easeIn(duration: 0.25)) {
                    trophyScale = 1
                    contentOpacity = 1
                }
            } else {
                if won { successFeedback += 1 }
                withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                    trophyScale = 1.15
                    contentOpacity = 1
                }
                withAnimation(.spring(response: 0.4, dampingFraction: 0.5).delay(0.4)) {
                    trophyScale = 1
                }
            }
        }
    }
}
