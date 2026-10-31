import SwiftUI

/// Compact − value + control for weight and reps, with 44 pt tap targets on both buttons.
/// Pass `onSubmit` to make the value tappable: it turns into a text field with a number pad.
public struct LukiValueStepper: View {
    public enum Keyboard { case decimal, integer }

    let value: String
    let unit: String
    let minusLabel: String
    let plusLabel: String
    let editLabel: String?
    let keyboard: Keyboard
    let onMinus: () -> Void
    let onPlus: () -> Void
    let onSubmit: ((String) -> Void)?

    @State private var draft = ""
    @State private var isEditing = false
    @FocusState private var isFocused: Bool

    public init(
        value: String,
        unit: String,
        minusLabel: String,
        plusLabel: String,
        editLabel: String? = nil,
        keyboard: Keyboard = .decimal,
        onMinus: @escaping () -> Void,
        onPlus: @escaping () -> Void,
        onSubmit: ((String) -> Void)? = nil
    ) {
        self.value = value
        self.unit = unit
        self.minusLabel = minusLabel
        self.plusLabel = plusLabel
        self.editLabel = editLabel
        self.keyboard = keyboard
        self.onMinus = onMinus
        self.onPlus = onPlus
        self.onSubmit = onSubmit
    }

    public var body: some View {
        HStack(spacing: 0) {
            stepButton("minus", label: minusLabel, action: onMinus)

            Group {
                if isEditing {
                    editor
                } else if onSubmit != nil {
                    Button(action: beginEditing) { valueLabel }
                        .buttonStyle(.plain)
                        .accessibilityLabel(editLabel ?? value)
                        .accessibilityValue(unit.isEmpty ? value : "\(value) \(unit)")
                } else {
                    valueLabel
                        .accessibilityElement(children: .combine)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44)

            stepButton("plus", label: plusLabel, action: onPlus)
        }
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(LukiColors.fill))
        .overlay {
            if isEditing {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(LukiColors.accent, lineWidth: 1.5)
            }
        }
        .onChange(of: isFocused) { _, focused in
            if !focused, isEditing { commit() }
        }
    }

    private var valueLabel: some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(value)
                .font(.system(.body, design: .rounded).weight(.semibold).monospacedDigit())
                .foregroundStyle(.primary)
            if !unit.isEmpty {
                Text(unit)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
    }

    private var editor: some View {
        TextField(value, text: $draft)
            .font(.system(.body, design: .rounded).weight(.semibold).monospacedDigit())
            .multilineTextAlignment(.center)
            .focused($isFocused)
            .submitLabel(.done)
            .onSubmit(commit)
            #if os(iOS)
            .keyboardType(keyboard == .decimal ? .decimalPad : .numberPad)
            #endif
            .accessibilityLabel(editLabel ?? value)
            .onAppear { isFocused = true }
    }

    private func stepButton(_ systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.footnote.weight(.bold))
                .foregroundStyle(.primary)
                .frame(minWidth: 32, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// Starts empty with the current value as placeholder, so typing replaces it.
    private func beginEditing() {
        draft = ""
        isEditing = true
    }

    private func commit() {
        guard isEditing else { return }
        isEditing = false
        isFocused = false
        let trimmed = draft.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty, trimmed != value { onSubmit?(trimmed) }
    }
}
