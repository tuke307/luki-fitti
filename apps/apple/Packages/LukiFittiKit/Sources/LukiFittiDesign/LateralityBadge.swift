import SwiftUI
import LukiFittiModels

extension Laterality {
    /// "One side" / "Both sides", matching `laterality.oneSide` / `laterality.bothSides` on the web.
    public func label(_ tr: SupportedLocale) -> String {
        self == .UNILATERAL ? tr("One side") : tr("Both sides")
    }

    public var symbolName: String {
        self == .UNILATERAL ? "arrow.right" : "arrow.left.and.right"
    }
}

/// Subtle "One side" / "Both sides" chip, mirroring `apps/web/components/gym/laterality-badge.tsx`.
/// Renders nothing when the side is unknown.
public struct LateralityBadge: View {
    public let laterality: Laterality?
    @Environment(\.lukiLocale) private var tr

    public init(_ laterality: Laterality?) {
        self.laterality = laterality
    }

    public var body: some View {
        if let laterality {
            Label(laterality.label(tr), systemImage: laterality.symbolName)
                .labelStyle(.titleAndIcon)
                .font(.caption2.weight(.medium))
                .imageScale(.small)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(Capsule().fill(LukiColors.fill))
                .fixedSize()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(laterality.label(tr))
                .accessibilityIdentifier("ios.laterality.\(laterality.rawValue)")
        }
    }
}
