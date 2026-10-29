import SwiftUI

/// Compact − value + control for weight and reps, with 44 pt tap targets on both buttons.
public struct LukiValueStepper: View {
    let value: String
    let unit: String
    let minusLabel: String
    let plusLabel: String
    let onMinus: () -> Void
    let onPlus: () -> Void

    public init(
        value: String,
        unit: String,
        minusLabel: String,
        plusLabel: String,
        onMinus: @escaping () -> Void,
        onPlus: @escaping () -> Void
    ) {
        self.value = value
        self.unit = unit
        self.minusLabel = minusLabel
        self.plusLabel = plusLabel
        self.onMinus = onMinus
        self.onPlus = onPlus
    }

    public var body: some View {
        HStack(spacing: 0) {
            Button(action: onMinus) {
                Image(systemName: "minus")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.primary)
                    .frame(minWidth: 36, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(minusLabel)

            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(.body, design: .rounded).weight(.semibold).monospacedDigit())
                Text(unit)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)

            Button(action: onPlus) {
                Image(systemName: "plus")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.primary)
                    .frame(minWidth: 36, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(plusLabel)
        }
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(LukiColors.fill))
    }
}
