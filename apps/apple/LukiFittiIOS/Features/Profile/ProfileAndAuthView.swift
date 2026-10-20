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

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Profile & Preferences")
                    .font(.title2.bold())
                    .foregroundStyle(.white)

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
                backupExportSection
            }
            .padding(16)
        }
        .background(LukiColors.darkBackground)
    }

    // MARK: - Deep-Link Token Completion Card (Reset Password / Confirm Delete Account)

    @ViewBuilder
    private func deepLinkActionCard(tokenType: String, token: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if tokenType == "reset-password" {
                Text("Reset Your Password")
                    .font(.headline.bold())
                    .foregroundStyle(LukiColors.neonLime)
                SecureField("New Password (min. 8 chars)", text: $newResetPassword)
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
                            statusMessage = "Password has been reset successfully."
                        } catch {
                            statusMessage = error.localizedDescription
                        }
                    }
                } label: {
                    Text("Save New Password")
                        .font(.subheadline.bold())
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.neonLime))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ios.profile.confirmResetButton")
            } else if tokenType == "delete-account" {
                Text("Confirm Permanent Account Deletion")
                    .font(.headline.bold())
                    .foregroundStyle(.red)
                Text("Confirm that you want to permanently delete your LukiFitti account and all workout data.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button(role: .destructive) {
                    Task {
                        do {
                            try await viewModel.store.apiClient.confirmAccountDeletion(token: token)
                            viewModel.store.clearAllLocalData()
                            viewModel.deepLinkTokenType = nil
                            viewModel.deepLinkToken = nil
                            statusMessage = "Account Permanently Deleted"
                        } catch {
                            statusMessage = error.localizedDescription
                        }
                    }
                } label: {
                    Text("Yes, Permanently Delete My Account")
                        .font(.subheadline.bold())
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Color.red))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ios.profile.confirmDeleteAccountButton")
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.profile.deepLinkCard")
    }

    private func authenticatedAccountCard(_ user: UserDto) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Authenticated Server Session")
                .font(.caption.bold())
                .foregroundStyle(LukiColors.neonLime)
                .accessibilityIdentifier("ios.profile.authenticatedBadge")
            Text(user.email)
                .font(.headline)
                .foregroundStyle(.white)

            if let statusMessage {
                Text(statusMessage)
                    .font(.caption)
                    .foregroundStyle(LukiColors.neonLime)
                    .accessibilityIdentifier("ios.profile.statusMessage")
            }

            HStack(spacing: 12) {
                Button("Sign Out", role: .destructive) {
                    Task {
                        await viewModel.store.apiClient.logout()
                        viewModel.store.clearAllLocalData()
                    }
                }
                .font(.caption.bold())
                .accessibilityIdentifier("ios.profile.signOutButton")

                Button("Delete Account", role: .destructive) {
                    showingDeleteRequestField.toggle()
                }
                .font(.caption.bold())
                .accessibilityIdentifier("ios.profile.deleteAccountButton")
            }

            if showingDeleteRequestField {
                VStack(alignment: .leading, spacing: 8) {
                    SecureField("Current Password", text: $deleteAccountPassword)
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
                                statusMessage = "Deletion confirmation link sent to your email."
                            } catch {
                                statusMessage = error.localizedDescription
                            }
                        }
                    } label: {
                        Text("Send Deletion Confirmation Email")
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Color.red.opacity(0.85)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ios.profile.sendDeleteEmailButton")
                }
                .padding(.top, 4)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
    }

    private var guestAuthCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Mode", selection: $authMode) {
                Text("Sign In").tag("login")
                Text("Register Account").tag("register")
            }
            .pickerStyle(.segmented)

            if authMode == "register" {
                TextField("Your Name (e.g. GymBuddy)", text: $name)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("ios.profile.nameField")
            }
            TextField("Email address", text: $email)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
                .accessibilityIdentifier("ios.profile.emailField")
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("ios.profile.passwordField")

            if authMode == "login" {
                HStack {
                    Spacer()
                    Button("Forgot password?") {
                        Task {
                            do {
                                try await viewModel.store.apiClient.forgotPassword(email: email)
                                statusMessage = "If an account exists, a password reset link has been sent."
                            } catch {
                                statusMessage = error.localizedDescription
                            }
                        }
                    }
                    .font(.caption.bold())
                    .foregroundStyle(LukiColors.neonLime)
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ios.profile.forgotPasswordButton")
                }
            }

            if let statusMessage {
                Text(statusMessage)
                    .font(.caption)
                    .foregroundStyle(LukiColors.neonLime)
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
                            statusMessage = user.message ?? "Account created! Please check your email."
                        }
                    } catch {
                        statusMessage = error.localizedDescription
                    }
                }
            } label: {
                Text(authMode == "login" ? "Sign In" : "Create Account")
                    .font(.subheadline.bold())
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.neonLime))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ios.profile.submitAuthButton")
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
    }

    private var preferencesSection: some View {
        @Bindable var store = viewModel.store
        return VStack(alignment: .leading, spacing: 12) {
            Text("Gym & Unit Preferences")
                .font(.headline)
                .foregroundStyle(.white)

            Picker("Weight Unit", selection: $store.preferences.weightUnit) {
                ForEach(WeightUnit.allCases, id: \.self) { unit in
                    Text(unit.rawValue).tag(unit)
                }
            }
            .pickerStyle(.segmented)

            Stepper(
                "Weekly Goal: \(store.preferences.weeklyGoalSessions) sessions",
                value: $store.preferences.weeklyGoalSessions,
                in: 1...14
            )
            .font(.subheadline)
            .foregroundStyle(.white)

            Divider().overlay(Color.white.opacity(0.1))

            Toggle(isOn: $store.preferences.exerciseSuggestionsEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Smart Exercise Suggestions")
                        .font(.subheadline.bold())
                        .foregroundStyle(.white)
                    Text("Propose up to 1 rainbow exercise suggestion per workout")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(LukiColors.neonLime)
            .accessibilityIdentifier("ios.profile.exerciseSuggestionsToggle")

            Toggle(isOn: $store.preferences.notificationsEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Workout & Rest Notifications")
                        .font(.subheadline.bold())
                        .foregroundStyle(.white)
                    Text("Alert when rest timer finishes or workout completes")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(LukiColors.neonLime)
            .accessibilityIdentifier("ios.profile.notificationsToggle")

            Toggle(isOn: $store.preferences.restTimerSound) {
                Text("Rest Timer Chime Sound")
                    .font(.subheadline)
                    .foregroundStyle(.white)
            }
            .tint(LukiColors.neonLime)

            Button {
                viewModel.sendTestNotification()
                statusMessage = "Test notification scheduled!"
            } label: {
                Label("Test Notification", systemImage: "bell.badge.fill")
                    .font(.caption.bold())
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.neonLime))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ios.profile.testNotificationButton")
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
    }

    private var backupExportSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("JSON & CSV Workout Backup")
                .font(.headline)
                .foregroundStyle(.white)
            let jsonBackup = (try? String(data: JSONEncoder().encode(viewModel.store.historySessions), encoding: .utf8)) ?? "[]"
            ShareLink(item: jsonBackup, preview: SharePreview("luki-fitti-backup.json")) {
                Label("Export JSON Backup", systemImage: "square.and.arrow.up")
                    .font(.caption.bold())
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.08)))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
    }
}
