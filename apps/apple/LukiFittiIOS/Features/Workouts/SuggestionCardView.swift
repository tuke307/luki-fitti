import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

/// Smart exercise suggestion card shared by the workout list and the active session.
/// Shows one reason sentence plus a small evidence chip with the numbers behind it.
struct SuggestionCardView: View {
    let suggestion: WorkoutExerciseSuggestion
    let locale: SupportedLocale
    var compact = false
    var onAdd: (() -> Void)?
    /// Only offered for stall reasons, where the suggestion targets an existing exercise.
    var onReplace: (() -> Void)?
    var onDismiss: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: compact ? 8 : 10) {
                Image(systemName: "sparkles")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                VStack(alignment: .leading, spacing: compact ? 2 : 4) {
                    Text("\(SuggestionReasonFormatter.badge(locale: locale)) · \(suggestion.suggestedExercise.name)")
                        .font(compact ? .footnote : .subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text(SuggestionReasonFormatter.reason(for: suggestion, locale: locale))
                        .font(compact ? .caption2 : .footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(compact ? 2 : nil)
                    if let evidence = SuggestionReasonFormatter.evidence(for: suggestion, locale: locale) {
                        Text(evidence)
                            .font(.caption2.weight(.medium).monospacedDigit())
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(LukiColors.fill))
                            .accessibilityIdentifier("suggestion.evidence")
                    }
                }
                Spacer(minLength: 0)
                if let onDismiss {
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(LukiColors.fill))
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(locale == .de ? "Vorschlag ausblenden" : "Dismiss suggestion")
                    .accessibilityIdentifier("suggestion.dismiss")
                }
            }

            if onAdd != nil || showsReplace {
                HStack(spacing: 8) {
                    if let onAdd {
                        actionButton(
                            "+ \(SuggestionReasonFormatter.addButton(locale: locale))",
                            prominent: true,
                            action: onAdd
                        )
                        .accessibilityIdentifier("suggestion.add")
                    }
                    if showsReplace, let onReplace, let stalling = suggestion.stallingExerciseName {
                        actionButton(
                            SuggestionReasonFormatter.replaceButton(stalling, locale: locale),
                            systemImage: "arrow.triangle.swap",
                            prominent: false,
                            action: onReplace
                        )
                        .accessibilityIdentifier("suggestion.replace")
                    }
                }
            }
        }
        .padding(compact ? 9 : 12)
        .background(
            RoundedRectangle(cornerRadius: compact ? 10 : 22, style: .continuous)
                .fill(LukiColors.cardBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: compact ? 10 : 22, style: .continuous)
                        .stroke(LukiColors.separator, lineWidth: 1.5)
                )
        )
    }

    private var showsReplace: Bool {
        onReplace != nil && suggestion.reasonType.isStall && suggestion.stallingExerciseName != nil
    }

    private func actionButton(
        _ title: String,
        systemImage: String? = nil,
        prominent: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title).lineLimit(1)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(prominent ? LukiColors.accentForeground : .primary)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Capsule().fill(prominent ? LukiColors.accent : LukiColors.fill))
        }
        .buttonStyle(.plain)
    }
}
