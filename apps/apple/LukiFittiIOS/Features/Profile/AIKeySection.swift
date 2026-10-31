import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiAPI

/// The user's own OpenRouter key (bring-your-own-key). Write-only: the key lives only in this
/// view's transient `@State` until it is sent once over HTTPS; the API stores it encrypted and only
/// ever returns `…last4`. It is never written to UserDefaults, files or the Keychain on device.
struct AIKeySettingsPage: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var status: AiKeyStatusDto?
    @State private var keyInput = ""
    @State private var busy = false
    @State private var loadFailed = false
    @State private var message: (text: String, isError: Bool)?
    @State private var confirmRemove = false

    var body: some View {
        List {
            Section {
                Text(tr("AI features run on your own OpenRouter key. You pay OpenRouter directly for what you use; with your own key there is no daily limit."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if let url = URL(string: "https://openrouter.ai/settings/keys") {
                    Link(destination: url) {
                        Label(tr("Create a key at openrouter.ai"), systemImage: "arrow.up.right.square")
                    }
                }
            }

            if loadFailed && status == nil {
                Section {
                    Label(tr("Couldn’t load the key status."), systemImage: "exclamationmark.triangle")
                        .foregroundStyle(LukiColors.destructive)
                    Button(tr("Try again")) { Task { await load() } }
                }
            } else if let status, !status.available {
                Section {
                    Text(tr("Saving keys isn’t available on this server right now."))
                        .foregroundStyle(.secondary)
                }
            } else if let status {
                Section(tr("Status")) {
                    Text(statusText(status))
                        .accessibilityIdentifier("ios.aiKey.status")
                }
                Section {
                    SecureField(tr("sk-or-v1-…"), text: $keyInput)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .privacySensitive()
                        .disabled(busy)
                        .accessibilityLabel(tr("API key"))
                        .accessibilityIdentifier("ios.aiKey.input")
                    Button {
                        Task { await save() }
                    } label: {
                        if busy {
                            ProgressView().accessibilityLabel(tr("Checking key…"))
                        } else {
                            Text(status.own == nil ? tr("Save key") : tr("Replace key"))
                        }
                    }
                    .disabled(busy || keyInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("ios.aiKey.save")
                } header: {
                    Text(tr("API key"))
                } footer: {
                    Text(tr("Stored encrypted and never shown again. Only the last 4 characters are displayed."))
                }
                if status.own != nil {
                    Section {
                        Button(tr("Remove key"), role: .destructive) { confirmRemove = true }
                            .disabled(busy)
                            .accessibilityIdentifier("ios.aiKey.remove")
                    }
                }
            } else {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowBackground(Color.clear)
            }

            if let message {
                Section {
                    Text(message.text)
                        .font(.footnote)
                        .foregroundStyle(message.isError ? LukiColors.destructive : .secondary)
                }
            }
        }
        .navigationTitle(tr("OpenRouter API key"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog(
            tr("Remove your key? AI features stop working unless an admin assigned one."),
            isPresented: $confirmRemove,
            titleVisibility: .visible
        ) {
            Button(tr("Remove key"), role: .destructive) { Task { await remove() } }
        }
        // Never keep a typed key around once the page is gone.
        .onDisappear { keyInput = "" }
    }

    private func statusText(_ status: AiKeyStatusDto) -> String {
        if let own = status.own { return tr("Your key ending in …%@ is active.", own.last4) }
        if status.source == .ADMIN { return tr("An admin assigned a key to you. Your own key would be used instead.") }
        return tr("No key yet. Add one to use the AI features.")
    }

    private func load() async {
        guard viewModel.isSignedIn else { return }
        do {
            status = try await viewModel.store.apiClient.fetchAiKeyStatus()
            loadFailed = false
        } catch is CancellationError {
        } catch {
            loadFailed = true
        }
    }

    private func save() async {
        let candidate = keyInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard SetAiKeyDto.isValidFormat(candidate) else {
            message = (tr("That doesn’t look like a valid OpenRouter key (it starts with “sk-or-”)."), true)
            return
        }
        busy = true
        defer { busy = false }
        do {
            status = try await viewModel.store.apiClient.setAiKey(candidate)
            keyInput = ""
            message = (tr("Key saved"), false)
            await refreshFeatures()
        } catch {
            message = (errorText(error), true)
        }
    }

    private func remove() async {
        busy = true
        defer { busy = false }
        do {
            status = try await viewModel.store.apiClient.removeAiKey()
            message = (tr("Key removed"), false)
            await refreshFeatures()
        } catch {
            message = (errorText(error), true)
        }
    }

    /// AI entry points follow `UserDto.features`; refresh them without touching local preferences.
    private func refreshFeatures() async {
        guard let me = try? await viewModel.store.apiClient.getMe(),
              var user = viewModel.store.currentUser else { return }
        user.features = me.features
        user.preferences = viewModel.store.preferences
        viewModel.store.saveAuthenticatedUser(user)
    }

    private func errorText(_ error: Error) -> String {
        switch error as? APIClientError {
        case .serverError(400, _): return tr("OpenRouter rejected this key. Check it and try again.")
        case .serverError(429, _): return tr("Too many attempts. Wait a minute and try again.")
        case .serverError(503, _): return tr("Saving keys isn’t available on this server right now.")
        default: return tr("Couldn’t save the key. Try again.")
        }
    }
}
