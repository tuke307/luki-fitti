import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiStore

/// Report a user for moderation: reason picker + optional details (≤ 500 chars).
struct SocialReportSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    let target: SocialCardDto
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    @State private var reason: ReportReason = .SPAM
    @State private var details = ""
    @State private var sending = false
    @State private var sent = false

    private func label(for reason: ReportReason) -> String {
        switch reason {
        case .SPAM: return tr("Spam")
        case .HARASSMENT: return tr("Harassment")
        case .INAPPROPRIATE_NAME: return tr("Inappropriate name")
        case .INAPPROPRIATE_AVATAR: return tr("Inappropriate photo")
        case .OTHER: return tr("Other")
        }
    }

    var body: some View {
        Form {
            if sent {
                Section {
                    Text(tr("Report sent. Thank you."))
                        .foregroundStyle(LukiColors.success)
                }
            } else {
                Section {
                    Picker(tr("Reason"), selection: $reason) {
                        ForEach(ReportReason.allCases, id: \.self) { r in
                            Text(label(for: r)).tag(r)
                        }
                    }
                    .accessibilityIdentifier("ios.social.report.reasonPicker")
                }
                Section {
                    TextField(tr("Details (optional)"), text: $details, axis: .vertical)
                        .lineLimit(3...6)
                        .onChange(of: details) { _, value in
                            if value.count > 500 { details = String(value.prefix(500)) }
                        }
                        .accessibilityIdentifier("ios.social.report.detailsField")
                }
            }
        }
        .navigationTitle(tr("Report @%@", target.handle))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(tr("Cancel")) { dismiss() }
            }
            if !sent {
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Send report")) {
                        Task {
                            sending = true
                            let trimmed = details.trimmingCharacters(in: .whitespacesAndNewlines)
                            sent = await viewModel.social.report(
                                target.userId,
                                reason: reason,
                                details: trimmed.isEmpty ? nil : trimmed
                            )
                            sending = false
                        }
                    }
                    .disabled(sending)
                    .accessibilityIdentifier("ios.social.report.submit")
                }
            } else {
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Done")) { dismiss() }
                }
            }
        }
    }
}
