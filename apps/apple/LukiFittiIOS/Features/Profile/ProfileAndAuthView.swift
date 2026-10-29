import SwiftUI
import LukiFittiModels
import LukiFittiDesign

public struct ProfileAndAuthView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var authMode: String = "login"
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var name: String = ""
    @State private var statusMessage: String?

    @State private var newResetPassword: String = ""
    @State private var deleteAccountPassword: String = ""
    @State private var showingDeleteRequestField: Bool = false
    @Environment(\.lukiLocale) private var tr

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let tokenType = viewModel.deepLinkTokenType,
                   let token = viewModel.deepLinkToken {
                    deepLinkActionCard(tokenType: tokenType, token: token)
                }

                if let user = viewModel.store.currentUser {
                    authenticatedAccountCard(user)
                } else {
                    guestAuthCard
                }

                preferencesSection
                if viewModel.store.currentUser != nil {
                    BodyNutritionSection(viewModel: viewModel)
                }
                backupExportSection
            }
            .padding(16)
        }
        .background(LukiColors.groupedBackground)
    }

    // MARK: - Deep-Link Token Completion Card (Reset Password / Confirm Delete Account)

    @ViewBuilder
    private func deepLinkActionCard(tokenType: String, token: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if tokenType == "reset-password" {
                Text(tr("Reset Your Password"))
                    .font(.headline)
                    .foregroundStyle(LukiColors.accent)
                SecureField(tr("New Password (min. 8 chars)"), text: $newResetPassword)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("ios.profile.newPasswordField")

                Button {
                    Task {
                        do {
                            try await viewModel.store.apiClient.resetPassword(
                                token: token,
                                newPassword: newResetPassword
                            )
                            viewModel.deepLinkTokenType = nil
                            viewModel.deepLinkToken = nil
                            newResetPassword = ""
                            authMode = "login"
                            statusMessage = tr("Your password has been reset. Sign in with the new one.")
                        } catch {
                            statusMessage = error.localizedDescription
                        }
                    }
                } label: {
                    Text(tr("Save New Password"))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .accessibilityIdentifier("ios.profile.confirmResetButton")
            } else if tokenType == "delete-account" {
                Text(tr("Delete your account?"))
                    .font(.headline)
                    .foregroundStyle(LukiColors.destructive)
                Text(tr("Your LukiFitti account and all workout data will be deleted. This can’t be undone."))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button(role: .destructive) {
                    Task {
                        do {
                            try await viewModel.store.apiClient.confirmAccountDeletion(token: token)
                            viewModel.store.clearAllLocalData()
                            viewModel.nutrition.clear()
                            viewModel.deepLinkTokenType = nil
                            viewModel.deepLinkToken = nil
                            statusMessage = tr("Your account has been deleted.")
                        } catch {
                            statusMessage = error.localizedDescription
                        }
                    }
                } label: {
                    Text(tr("Delete Account"))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(LukiColors.destructive)
                .controlSize(.large)
                .accessibilityIdentifier("ios.profile.confirmDeleteAccountButton")
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.profile.deepLinkCard")
    }

    private func authenticatedAccountCard(_ user: UserDto) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(tr("Signed in"))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LukiColors.accent)
                .accessibilityIdentifier("ios.profile.authenticatedBadge")
            Text(user.email)
                .font(.headline)
                .foregroundStyle(.primary)

            if let statusMessage {
                Text(statusMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("ios.profile.statusMessage")
            }

            HStack(spacing: 12) {
                Button(tr("Sign Out"), role: .destructive) {
                    Task {
                        await viewModel.store.apiClient.logout()
                        viewModel.store.clearAllLocalData()
                            viewModel.nutrition.clear()
                    }
                }
                .font(.subheadline.weight(.semibold))
                .accessibilityIdentifier("ios.profile.signOutButton")

                Button(tr("Delete Account"), role: .destructive) {
                    showingDeleteRequestField.toggle()
                }
                .font(.subheadline.weight(.semibold))
                .accessibilityIdentifier("ios.profile.deleteAccountButton")
            }

            if showingDeleteRequestField {
                VStack(alignment: .leading, spacing: 8) {
                    SecureField(tr("Current Password"), text: $deleteAccountPassword)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("ios.profile.deletePasswordField")

                    Button {
                        Task {
                            do {
                                try await viewModel.store.apiClient.requestAccountDeletion(
                                    password: deleteAccountPassword
                                )
                                showingDeleteRequestField = false
                                deleteAccountPassword = ""
                                statusMessage = tr("Check your email to confirm the deletion.")
                            } catch {
                                statusMessage = error.localizedDescription
                            }
                        }
                    } label: {
                        Text(tr("Email Me a Confirmation Link"))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(LukiColors.destructive)
                    .controlSize(.large)
                    .accessibilityIdentifier("ios.profile.sendDeleteEmailButton")
                }
                .padding(.top, 4)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    private var guestAuthCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker(tr("Mode"), selection: $authMode) {
                Text(tr("Sign In")).tag("login")
                Text(tr("Register Account")).tag("register")
            }
            .pickerStyle(.segmented)

            if authMode == "register" {
                TextField(tr("Your name"), text: $name)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("ios.profile.nameField")
            }
            TextField(tr("Email address"), text: $email)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .accessibilityIdentifier("ios.profile.emailField")
            SecureField(tr("Password"), text: $password)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("ios.profile.passwordField")

            if authMode == "login" {
                HStack {
                    Spacer()
                    Button(tr("Forgot password?")) {
                        Task {
                            do {
                                try await viewModel.store.apiClient.forgotPassword(email: email)
                                statusMessage = tr("If an account exists for this email, we’ve sent a reset link.")
                            } catch {
                                statusMessage = error.localizedDescription
                            }
                        }
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LukiColors.accent)
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ios.profile.forgotPasswordButton")
                }
            }

            if let statusMessage {
                Text(statusMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("ios.profile.statusMessage")
            }

            Button {
                Task {
                    do {
                        if authMode == "login" {
                            let user = try await viewModel.store.apiClient.login(email: email, password: password)
                            viewModel.store.saveAuthenticatedUser(user)
                            await viewModel.store.refreshFromServerAfterAuth()
                        } else {
                            let user = try await viewModel.store.apiClient.register(
                                email: email,
                                password: password,
                                name: name.isEmpty ? nil : name,
                                weightUnit: viewModel.store.preferences.weightUnit
                            )
                            statusMessage = user.message ?? tr("Account created. Check your email to confirm it.")
                        }
                    } catch {
                        statusMessage = error.localizedDescription
                    }
                }
            } label: {
                Text(authMode == "login" ? tr("Sign In") : tr("Create Account"))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityIdentifier("ios.profile.submitAuthButton")
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    private var preferencesSection: some View {
        @Bindable var store = viewModel.store
        return VStack(alignment: .leading, spacing: 12) {
            Text(tr("Preferences"))
                .font(.headline)
                .foregroundStyle(.primary)

            Picker(tr("Language"), selection: Binding(
                get: { store.preferences.language ?? .system },
                set: { store.preferences.language = $0 }
            )) {
                Text(tr("System")).tag(LanguagePreference.system)
                Text("English").tag(LanguagePreference.en)
                Text("Deutsch").tag(LanguagePreference.de)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("ios.profile.languagePicker")

            Picker(tr("Weight unit"), selection: $store.preferences.weightUnit) {
                ForEach(WeightUnit.allCases, id: \.self) { unit in
                    Text(LukiFormat.unitLabel(unit)).tag(unit)
                }
            }
            .pickerStyle(.segmented)

            Stepper(
                tr("Weekly goal: %d workouts", store.preferences.weeklyGoalSessions),
                value: $store.preferences.weeklyGoalSessions,
                in: 1...14
            )
            .font(.subheadline)
            .foregroundStyle(.primary)

            Divider()

            Toggle(isOn: $store.preferences.exerciseSuggestionsEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(tr("Exercise suggestions"))
                        .font(.subheadline.bold())
                        .foregroundStyle(.primary)
                    Text(tr("Suggests at most one exercise per workout"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(LukiColors.accent)
            .accessibilityIdentifier("ios.profile.exerciseSuggestionsToggle")

            Toggle(isOn: $store.preferences.notificationsEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(tr("Notifications"))
                        .font(.subheadline.bold())
                        .foregroundStyle(.primary)
                    Text(tr("When rest is over or a workout is done"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(LukiColors.accent)
            .accessibilityIdentifier("ios.profile.notificationsToggle")

            Toggle(isOn: $store.preferences.restTimerSound) {
                Text(tr("Rest timer sound"))
                    .font(.subheadline)
                    .foregroundStyle(.primary)
            }
            .tint(LukiColors.accent)

            Button {
                viewModel.sendTestNotification()
                statusMessage = tr("A test notification arrives in a second.")
            } label: {
                Label(tr("Send Test Notification"), systemImage: "bell.badge")
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("ios.profile.testNotificationButton")
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    private var backupExportSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(tr("Backup"))
                .font(.headline)
                .foregroundStyle(.primary)
            let jsonBackup = (try? String(data: JSONEncoder().encode(viewModel.store.historySessions), encoding: .utf8)) ?? "[]"
            ShareLink(item: jsonBackup, preview: SharePreview("luki-fitti-backup.json")) {
                Label(tr("Export Backup"), systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.bordered)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }
}
