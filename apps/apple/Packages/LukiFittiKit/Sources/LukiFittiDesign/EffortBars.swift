import SwiftUI

/// Three rising bars filled up to the effort level in its scale colour (mirrors the web set row).
public struct EffortBars: View {
    let level: Int
    @ScaledMetric(relativeTo: .body) private var unit: CGFloat = 4

    public init(level: Int) {
        self.level = level
    }

    public var body: some View {
        let active = LukiColors.effortColor(level: level)
        HStack(alignment: .bottom, spacing: unit * 0.6) {
            ForEach(1...3, id: \.self) { bar in
                Capsule()
                    .fill(bar <= level ? active : Color.secondary.opacity(0.3))
                    .frame(width: unit, height: unit * CGFloat(bar + 1))
            }
        }
        .accessibilityHidden(true)
    }
}
