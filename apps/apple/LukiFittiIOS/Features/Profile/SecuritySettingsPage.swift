import AuthenticationServices
import CoreImage.CIFilterBuiltins
import SwiftUI
import LukiFittiDesign
import LukiFittiModels

/// Account security: linked providers, passkeys and optional TOTP 2FA — the iOS
/// counterpart of the web `/security` page.
struct SecuritySettingsPage: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.openURL) private var openURL

    @State private var status: SecurityStatusDto?
    @State private var message: String?
    @State private var busy = false

    @State private var passkeyName = ""
    @State private var passkeyPendingDelete: PasskeyDto?
    @State private var passkeyPendingRename: PasskeyDto?
    @State private var renameText = ""
    @State private var providerPendingUnlink: String?

    // 2FA flow state
    @State private var totpSetup: TwoFactorSetupDto?
    @State private var totpCode = ""
    @State private var newRecoveryCodes: [String]?
    @State private var codePrompt: CodePrompt?

    /// Which sensitive action the current code entry will confirm.
    private enum CodePrompt: Identifiable {
        case disable
        case regenerate
        var id: Int {
            switch self { case .disable: return 0; case .regenerate: return 1 }
        }
    }

    private var coordinator: AuthSecurityCoordinator {
        AuthSecurityCoordinator(apiClient: viewModel.store.apiClient)
    }

    var body: some View {
        List {
            if let message {
                Section {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("ios.security.statusMessage")
                }
            }

            signInMethodsSection
            passkeysSection
            twoFactorSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("Sign-in & security"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
        .confirmationDialog(
            tr("Remove this passkey?"),
            isPresented: Binding(
                get: { passkeyPendingDelete != nil },
                set: { if !$0 { passkeyPendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(tr("Remove"), role: .destructive) {
                if let passkey = passkeyPendingDelete {
                    Task { await run { try await viewModel.store.apiClient.deletePasskey(id: passkey.id) } }
                }
                passkeyPendingDelete = nil
            }
            Button(tr("Cancel"), role: .cancel) { passkeyPendingDelete = nil }
        }
        .alert(tr("Rename passkey"), isPresented: Binding(
            get: { passkeyPendingRename != nil },
            set: { if !$0 { passkeyPendingRename = nil } }
        )) {
            TextField(tr("Name"), text: $renameText)
            Button(tr("Save")) {
                if let passkey = passkeyPendingRename, !renameText.isEmpty {
                    Task {
                        await run {
                            try await viewModel.store.apiClient.renamePasskey(id: passkey.id, name: renameText)
                        }
                    }
                }
                passkeyPendingRename = nil
            }
            Button(tr("Cancel"), role: .cancel) { passkeyPendingRename = nil }
        }
        .confirmationDialog(
            tr("Unlink this sign-in method?"),
            isPresented: Binding(
                get: { providerPendingUnlink != nil },
                set: { if !$0 { providerPendingUnlink = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(tr("Unlink"), role: .destructive) {
                if let provider = providerPendingUnlink {
                    Task { await run { try await viewModel.store.apiClient.unlinkProvider(provider) } }
                }
                providerPendingUnlink = nil
            }
            Button(tr("Cancel"), role: .cancel) { providerPendingUnlink = nil }
        }
        .sheet(item: $codePrompt) { prompt in
            NavigationStack {
                TwoFactorCodePrompt(
                    title: prompt == .disable ? tr("Turn off 2FA") : tr("Regenerate recovery codes"),
                    onSubmit: { code in
                        switch prompt {
                        case .disable:
                            _ = try await viewModel.store.apiClient.twoFactorDisable(code: code)
                        case .regenerate:
                            newRecoveryCodes = try await viewModel.store.apiClient
                                .regenerateRecoveryCodes(code: code).recoveryCodes
                        }
                    },
                    onDone: { Task { await reload() } }
                )
                .navigationBarTitleDisplayMode(.inline)
            }
            .presentationDetents([.medium])
        }
    }

    // MARK: - Sections

    private var signInMethodsSection: some View {
        Section(tr("Sign-in methods")) {
            LabeledContent(tr("Password")) {
                Text(status?.hasPassword == true ? tr("Set") : tr("Not set"))
                    .foregroundStyle(.secondary)
            }
            if status?.hasPassword == false {
                Text(tr("Set a password via the reset link on the sign-in screen."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            providerRow("apple", label: "Apple")
            providerRow("google", label: "Google", canLink: coordinator.googleClientId != nil)
        }
        .disabled(busy)
    }

    @ViewBuilder
    private func providerRow(_ provider: String, label: String, canLink: Bool = true) -> some View {
        let linked = status?.providers.contains(provider) == true
        HStack {
            Text(label)
            Spacer()
            if linked {
                Label(tr("Linked"), systemImage: "checkmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(LukiColors.success)
                Button(tr("Unlink"), role: .destructive) {
                    providerPendingUnlink = provider
                }
                .buttonStyle(.borderless)
                .accessibilityIdentifier("ios.security.unlink.\(provider)")
            } else if canLink {
                Button(tr("Link")) {
                    Task { await linkProvider(provider) }
                }
                .buttonStyle(.borderless)
                .accessibilityIdentifier("ios.security.link.\(provider)")
            } else {
                Text(tr("Not linked"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier("ios.security.provider.\(provider)")
    }

    private var passkeysSection: some View {
        Section(tr("Passkeys")) {
            ForEach(status?.passkeys ?? []) { passkey in
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(passkey.name)
                        if passkey.backedUp {
                            Label(tr("Synced"), systemImage: "checkmark.icloud.fill")
                                .font(.caption2)
                                .foregroundStyle(LukiColors.success)
                        }
                    }
                    Text(passkeySubtitle(passkey))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .swipeActions {
                    Button(tr("Rename")) {
                        renameText = passkey.name
                        passkeyPendingRename = passkey
                    }
                    .tint(LukiColors.accent)
                    Button(tr("Remove"), role: .destructive) {
                        passkeyPendingDelete = passkey
                    }
                }
                .accessibilityIdentifier("ios.security.passkey.\(passkey.id)")
            }

            HStack {
                TextField(tr("Passkey name (optional)"), text: $passkeyName)
                    .autocorrectionDisabled()
                Button {
                    Task { await addPasskey() }
                } label: {
                    Label(tr("Add passkey"), systemImage: "key.fill")
                }
                .disabled(busy)
                .accessibilityIdentifier("ios.security.addPasskey")
            }
        }
        .disabled(busy)
    }

    private var twoFactorSection: some View {
        Section {
            if let codes = newRecoveryCodes {
                recoveryCodeList(codes)
                Button(tr("I saved them")) {
                    newRecoveryCodes = nil
                    Task { await reload() }
                }
                .accessibilityIdentifier("ios.security.recoveryCodesAck")
            } else if status?.twoFactorEnabled == true {
                LabeledContent(tr("Status")) {
                    Label(tr("On"), systemImage: "checkmark.shield.fill")
                        .foregroundStyle(LukiColors.success)
                }
                LabeledContent(tr("Recovery codes left")) {
                    Text("\(status?.recoveryCodesRemaining ?? 0)")
                        .monospacedDigit()
                }
                Button(tr("Regenerate recovery codes")) { codePrompt = .regenerate }
                    .accessibilityIdentifier("ios.security.regenerateCodes")
                Button(tr("Turn off"), role: .destructive) { codePrompt = .disable }
                    .accessibilityIdentifier("ios.security.disable2fa")
            } else if let totpSetup {
                totpSetupRows(totpSetup)
            } else {
                Text(tr("2FA adds a code from an authenticator app when you sign in."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button(tr("Turn on")) {
                    Task {
                        await run {
                            totpSetup = try await viewModel.store.apiClient.twoFactorSetup()
                        }
                    }
                }
                .accessibilityIdentifier("ios.security.setup2fa")
            }
        } header: {
            Text(tr("Two-factor authentication (optional)"))
        }
        .disabled(busy)
    }

    @ViewBuilder
    private func totpSetupRows(_ setup: TwoFactorSetupDto) -> some View {
        if let qrImage = Self.qrImage(for: setup.otpauthUrl) {
            HStack {
                Spacer()
                qrImage
                    .resizable()
                    .interpolation(.none)
                    .frame(width: 160, height: 160)
                    .padding(8)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Spacer()
            }
            .listRowBackground(Color.clear)
            .accessibilityIdentifier("ios.security.totpQr")
        }

        LabeledContent(tr("Secret")) {
            Text(setup.secret)
                .font(.footnote.monospaced())
                .textSelection(.enabled)
        }
        HStack {
            Button {
                UIPasteboard.general.string = setup.secret
            } label: {
                Label(tr("Copy secret"), systemImage: "doc.on.doc")
            }
            .accessibilityIdentifier("ios.security.copySecret")
            Spacer()
            if let url = URL(string: setup.otpauthUrl) {
                Button {
                    openURL(url)
                } label: {
                    Label(tr("Open in authenticator"), systemImage: "arrow.up.forward.app")
                }
                .accessibilityIdentifier("ios.security.openOtpauth")
            }
        }

        TextField(tr("Code from authenticator"), text: $totpCode)
            .textContentType(.oneTimeCode)
            .keyboardType(.numberPad)
            .autocorrectionDisabled()
            .accessibilityIdentifier("ios.security.totpCodeField")

        Button {
            Task {
                await run {
                    newRecoveryCodes = try await viewModel.store.apiClient
                        .twoFactorEnable(code: totpCode.trimmingCharacters(in: .whitespaces))
                        .recoveryCodes
                    totpCode = ""
                    self.totpSetup = nil
                }
            }
        } label: {
            Text(tr("Enable 2FA"))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .disabled(totpCode.trimmingCharacters(in: .whitespaces).isEmpty)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())
        .accessibilityIdentifier("ios.security.enable2fa")
    }

    @ViewBuilder
    private func recoveryCodeList(_ codes: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(tr("Save these recovery codes — they’re shown only once."))
                .font(.footnote.weight(.semibold))
            ForEach(codes, id: \.self) { code in
                Text(code)
                    .font(.footnote.monospaced())
                    .textSelection(.enabled)
            }
            HStack {
                Button {
                    UIPasteboard.general.string = codes.joined(separator: "\n")
                } label: {
                    Label(tr("Copy"), systemImage: "doc.on.doc")
                }
                .accessibilityIdentifier("ios.security.copyRecoveryCodes")
                ShareLink(item: codes.joined(separator: "\n")) {
                    Label(tr("Share"), systemImage: "square.and.arrow.up")
                }
                .accessibilityIdentifier("ios.security.shareRecoveryCodes")
            }
        }
        .padding(.vertical, 4)
        .accessibilityIdentifier("ios.security.recoveryCodes")
    }

    // MARK: - Actions

    private func reload() async {
        do {
            status = try await viewModel.store.apiClient.securityStatus()
        } catch {
            message = error.localizedDescription
        }
    }

    /// Runs one mutation: busy flag, error surface, then refresh.
    private func run(_ action: () async throws -> Void) async {
        busy = true
        defer { busy = false }
        do {
            try await action()
            message = nil
            await reload()
        } catch AuthSecurityCoordinator.FlowError.cancelled {
            // User dismissed the prompt — nothing to report.
        } catch {
            message = error.localizedDescription
        }
    }

    private func linkProvider(_ provider: String) async {
        await run {
            switch provider {
            case "apple": try await coordinator.linkApple()
            case "google": try await coordinator.linkGoogle()
            default: return
            }
        }
    }

    private func addPasskey() async {
        await run {
            _ = try await coordinator.registerPasskey(
                name: passkeyName.isEmpty ? nil : passkeyName
            )
            passkeyName = ""
        }
    }

    private func passkeySubtitle(_ passkey: PasskeyDto) -> String {
        var parts = [tr("Added %@", Self.shortDate(passkey.createdAt))]
        if let lastUsedAt = passkey.lastUsedAt {
            parts.append(tr("last used %@", Self.shortDate(lastUsedAt)))
        }
        return parts.joined(separator: " · ")
    }

    private static func shortDate(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: iso) else { return iso }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    /// QR of the otpauth URL rendered with CoreImage — no third-party dependency.
    static func qrImage(for string: String) -> Image? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        guard let cgImage = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
        return Image(uiImage: UIImage(cgImage: cgImage))
    }
}

/// Asks for one current TOTP or recovery code, then hands it to `onSubmit`.
private struct TwoFactorCodePrompt: View {
    let title: String
    let onSubmit: (String) async throws -> Void
    let onDone: () -> Void
    @State private var code = ""
    @State private var error: String?
    @State private var busy = false
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                TextField(tr("Two-factor code"), text: $code)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("ios.security.codePromptField")
            } footer: {
                Text(tr("Enter the code from your authenticator app, or a recovery code."))
            }
            if let error {
                Section {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(LukiColors.destructive)
                }
            }
            Section {
                Button {
                    Task {
                        busy = true
                        defer { busy = false }
                        do {
                            try await onSubmit(code.trimmingCharacters(in: .whitespaces))
                            onDone()
                            dismiss()
                        } catch {
                            self.error = error.localizedDescription
                        }
                    }
                } label: {
                    HStack {
                        if busy { ProgressView() }
                        Text(tr("Confirm"))
                            .frame(maxWidth: busy ? nil : .infinity)
                    }
                }
                .disabled(code.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                .accessibilityIdentifier("ios.security.codePromptConfirm")
            }
        }
        .navigationTitle(title)
    }
}
