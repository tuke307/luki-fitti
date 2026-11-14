import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiStore

/// `/invite/<token>` universal link: inviter preview + Accept. Presented by AppShellView
/// whenever `viewModel.pendingInviteToken` is set and the user is signed in.
struct SocialInviteSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    @State private var inviter: SocialCardDto?
    @State private var loadFailed = false
    @State private var accepting = false
    @State private var accepted = false

    private var token: String? { viewModel.pendingInviteToken }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Spacer()
                if accepted {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(LukiColors.success)
                    Text(tr("You're friends now."))
                        .font(.headline)
                } else if loadFailed {
                    Image(systemName: "link.badge.plus")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                    Text(tr("This invite is no longer valid."))
                        .font(.headline)
                } else if let inviter {
                    SocialAvatarView(
                        userId: inviter.userId,
                        handle: inviter.handle,
                        name: inviter.name,
                        avatarUrl: inviter.avatarUrl,
                        social: viewModel.social,
                        size: 72
                    )
                    Text(tr("@%@ invited you to be friends on LukiFitti", inviter.handle))
                        .font(.headline)
                        .multilineTextAlignment(.center)
                    Button(tr("Accept invite")) {
                        Task { await accept() }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(accepting)
                    .accessibilityIdentifier("ios.social.invite.accept")
                } else {
                    ProgressView()
                }
                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { close() }
                }
                if accepted || loadFailed {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(tr("Done")) { close() }
                    }
                }
            }
        }
        .presentationDetents([.medium])
        .task { await loadPreview() }
    }

    private func loadPreview() async {
        guard let token else { loadFailed = true; return }
        inviter = try? await viewModel.store.apiClient.previewInvite(token: token)
        if inviter == nil { loadFailed = true }
    }

    private func accept() async {
        guard let token else { return }
        accepting = true
        do {
            try await viewModel.store.apiClient.acceptInvite(token: token)
            accepted = true
            await viewModel.social.refreshFriends()
        } catch {
            loadFailed = true
        }
        accepting = false
    }

    private func close() {
        viewModel.pendingInviteToken = nil
        dismiss()
    }
}
