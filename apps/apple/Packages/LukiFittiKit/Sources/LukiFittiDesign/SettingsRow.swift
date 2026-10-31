import SwiftUI

/// Grouped-settings row: tinted icon tile, title, optional subtitle and trailing value.
/// Wrap it in a `NavigationLink` to get the chevron.
public struct SettingsRow: View {
    let title: String
    let systemImage: String
    let tint: Color
    let value: String?
    let subtitle: String?

    public init(
        _ title: String,
        systemImage: String,
        tint: Color,
        value: String? = nil,
        subtitle: String? = nil
    ) {
        self.title = title
        self.systemImage = systemImage
        self.tint = tint
        self.value = value
        self.subtitle = subtitle
    }

    public var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 30, height: 30)
                .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .foregroundStyle(.primary)
                if let subtitle {
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }

            Spacer(minLength: 8)

            if let value {
                Text(value)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(1)
            }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
