import SwiftUI
import LukiFittiModels

/// Locale-aware AI cost formatting. USD exactly as reported by OpenRouter (no conversion).
public enum AICostFormat {
    public static func usd(_ value: Double, locale: SupportedLocale) -> String {
        let style = FloatingPointFormatStyle<Double>.Currency(code: "USD")
            .precision(.fractionLength(2...4))
            .locale(Locale(identifier: locale.rawValue))
        if value > 0, value < 0.0001 { return "< \(0.0001.formatted(style))" }
        return value.formatted(style)
    }

    public static func usd(_ value: Double?, _ tr: SupportedLocale) -> String {
        guard let value else { return tr("Cost not available") }
        return usd(value, locale: tr)
    }

    public static func count(_ value: Int, locale: SupportedLocale) -> String {
        value.formatted(.number.locale(Locale(identifier: locale.rawValue)))
    }

    /// "3,120 tokens · $0.0041" / "3.120 Tokens · Kosten nicht verfügbar".
    public static func line(_ usage: AiRunUsageDto, _ tr: SupportedLocale) -> String {
        "\(tr("%@ tokens", count(usage.totalTokens, locale: tr))) · \(usd(usage.costUsd, tr))"
    }
}

/// Footnote under an AI result showing tokens and the cost of that request.
public struct AICostLabel: View {
    let usage: AiRunUsageDto
    @Environment(\.lukiLocale) private var tr

    public init(usage: AiRunUsageDto) {
        self.usage = usage
    }

    public var body: some View {
        let text = AICostFormat.line(usage, tr)
        Label(text, systemImage: "sparkles")
            .font(.footnote)
            .monospacedDigit()
            .foregroundStyle(.secondary)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(tr("AI request cost: %@", text))
    }
}
