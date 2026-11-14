import SwiftUI
import LukiFittiModels
import LukiFittiDesign

/// Shield badge for a league arena — mirrors the web `ArenaBadge` (gradient + ring + tier pips).
/// Colours come from `ARENA_STYLE` in `packages/common/src/league/arena.ts`; keep in sync.
public struct ArenaBadge: View {
    let arena: Arena
    var size: CGFloat = 36

    private struct Style {
        var from: String
        var to: String
        var ring: String
    }

    /// Arena gradient as SwiftUI colours — shared with the celebration glow/headline.
    public static func gradientColors(for arena: Arena) -> [Color] {
        let s = style(for: arena)
        return [LukiColors.colorFromHex(s.from), LukiColors.colorFromHex(s.to)]
    }

    public static func ringColor(for arena: Arena) -> Color {
        LukiColors.colorFromHex(style(for: arena).ring)
    }

    private static func style(for arena: Arena) -> Style {
        switch arena {
        case .BRONZE: Style(from: "#C27C3E", to: "#8A4F22", ring: "#E8B27F")
        case .SILVER: Style(from: "#C9D1D9", to: "#8C96A0", ring: "#E6EBF0")
        case .GOLD: Style(from: "#FFD54A", to: "#E0A100", ring: "#FFE79A")
        case .PLATINUM: Style(from: "#8EF0E2", to: "#3BB7A6", ring: "#C8F7EF")
        case .DIAMOND: Style(from: "#8FD0FF", to: "#2F8CFF", ring: "#C4E2FF")
        case .OBSIDIAN: Style(from: "#8A6BD1", to: "#3D2766", ring: "#B9A3E6")
        case .TITAN: Style(from: "#FF7A59", to: "#C7362B", ring: "#FFB199")
        }
    }

    public init(arena: Arena, size: CGFloat = 36) {
        self.arena = arena
        self.size = size
    }

    public var body: some View {
        let style = Self.style(for: arena)
        ShieldShape()
            .fill(
                LinearGradient(
                    colors: [LukiColors.colorFromHex(style.from), LukiColors.colorFromHex(style.to)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .overlay {
                ShieldShape().stroke(LukiColors.colorFromHex(style.ring), lineWidth: max(1, size / 18))
            }
            .overlay(alignment: .bottom) {
                HStack(spacing: size / 18) {
                    ForEach(0..<arena.tierIndex, id: \.self) { _ in
                        Circle()
                            .fill(.white.opacity(0.9))
                            .frame(width: size / 12, height: size / 12)
                    }
                }
                .padding(.bottom, size / 4.5)
            }
            .frame(width: size, height: size)
            .accessibilityLabel(arena.rawValue.capitalized)
    }
}

/// Classic shield outline: flat top, rounded shoulders, tapering to a bottom point.
private struct ShieldShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let h = rect.height
        var p = Path()
        p.move(to: CGPoint(x: w * 0.5, y: 0))
        p.addLine(to: CGPoint(x: w * 0.92, y: h * 0.10))
        p.addQuadCurve(
            to: CGPoint(x: w * 0.5, y: h),
            control: CGPoint(x: w * 1.02, y: h * 0.62)
        )
        p.addQuadCurve(
            to: CGPoint(x: w * 0.08, y: h * 0.10),
            control: CGPoint(x: -w * 0.02, y: h * 0.62)
        )
        p.closeSubpath()
        return p
    }
}
