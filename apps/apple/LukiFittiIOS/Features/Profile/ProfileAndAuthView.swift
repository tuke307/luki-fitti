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
    @State private var generalAutosave = PreferencesAutosaver()
    @State private var notificationStatus: String?
    @Environment(\.lukiLocale) private var tr

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        @Bindable var store = viewModel.store
        return Form {
            if let tokenType = viewModel.deepLinkTokenType,
               let token = viewModel.deepLinkToken {
                Section {
                    deepLinkActionCard(tokenType: tokenType, token: token)
                }
            }

            Section(tr("Account")) {
                if let user = viewModel.store.currentUser {
                    authenticatedAccountRows(user)
                } else {
                    guestAuthRows
                }
            }

            Section {
                NavigationLink {
                    HealthDetailsView(viewModel: viewModel)
                } label: {
                    Label(tr("Health details"), systemImage: "heart.text.square")
                }
                .accessibilityIdentifier("ios.profile.healthDetailsRow")
                NavigationLink {
                    NutritionGoalsView(viewModel: viewModel)
                } label: {
                    LabeledContent {
                        Text(viewModel.store.preferences.dailyKcalGoal.map { tr("%d kcal", $0) } ?? tr("Not set"))
                            .monospacedDigit()
                    } label: {
                        Label(tr("Nutrition goals"), systemImage: "fork.knife")
                    }
                }
                .accessibilityIdentifier("ios.profile.nutritionGoalsRow")
            } header: {
                Text(tr("Health & nutrition"))
            } footer: {
                Text(tr("Used for calorie estimates. Stays private."))
            }

            if viewModel.store.currentUser != nil {
                Section {
                    NavigationLink {
                        AIUsageView(viewModel: viewModel)
                    } label: {
                        Label(tr("AI usage"), systemImage: "sparkles")
                    }
                    .accessibilityIdentifier("ios.profile.aiUsageRow")
                }
            }

            preferencesSection
            notificationsSection
            backupExportSection
        }
        .onChange(of: GeneralPreferences(store.preferences)) { _, values in
            generalAutosave.schedule { await saveGeneral(values) }
        }
        .onChange(of: store.preferences.notificationsEnabled) { viewModel.rescheduleWeighInReminders() }
        .onChange(of: store.preferences.weightUnit) { viewModel.rescheduleWeighInReminders() }
    }

    /// Settings saved straight from this page (the rest live on their own pages).
    private struct GeneralPreferences: Equatable {
        let language: LanguagePreference?
        let weeklyGoalSessions: Int
        let exerciseSuggestionsEnabled: Bool
        let notificationsEnabled: Bool
        let restTimerSound: Bool

        init(_ p: UserPreferencesDto) {
            language = p.language
            weeklyGoalSessions = p.weeklyGoalSessions
            exerciseSuggestionsEnabled = p.exerciseSuggestionsEnabled
            notificationsEnabled = p.notificationsEnabled
            restTimerSound = p.restTimerSound
        }
    }

    private func saveGeneral(_ values: GeneralPreferences) async -> String? {
        let dto = UpdatePreferencesDto(
            language: values.language,
            restTimerSound: values.restTimerSound,
            notificationsEnabled: values.notificationsEnabled,
            exerciseSuggestionsEnabled: values.exerciseSuggestionsEnabled,
            weeklyGoalSessions: values.weeklyGoalSessions
        )
        return await viewModel.savePreferences(viewModel.store.preferences, server: dto)
    }

    // MARK: - Deep-Link Token Completion Card (Reset Password / Confirm Delete Account)

    @ViewBuilder
    private func deepLinkActionCard(tokenType: String, token: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
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
                            viewModel.clearBodyWeightData()
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
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.profile.deepLinkCard")
    }

    // MARK: - Account

    @ViewBuilder
    private func authenticatedAccountRows(_ user: UserDto) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(tr("Signed in"))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LukiColors.accent)
                .accessibilityIdentifier("ios.profile.authenticatedBadge")
            Text(user.email)
                .font(.headline)
            if let statusMessage {
                Text(statusMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("ios.profile.statusMessage")
            }
        }
        .padding(.vertical, 2)

        Button(tr("Sign Out"), role: .destructive) {
            Task {
                await viewModel.store.apiClient.logout()
                viewModel.store.clearAllLocalData()
                viewModel.nutrition.clear()
                viewModel.clearBodyWeightData()
            }
        }
        .accessibilityIdentifier("ios.profile.signOutButton")

        Button(tr("Delete Account"), role: .destructive) {
            showingDeleteRequestField.toggle()
        }
        .accessibilityIdentifier("ios.profile.deleteAccountButton")

        if showingDeleteRequestField {
            SecureField(tr("Current Password"), text: $deleteAccountPassword)
                .accessibilityIdentifier("ios.profile.deletePasswordField")

            Button(role: .destructive) {
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
            }
            .accessibilityIdentifier("ios.profile.sendDeleteEmailButton")
        }
    }

    @ViewBuilder
    private var guestAuthRows: some View {
        Picker(tr("Mode"), selection: $authMode) {
            Text(tr("Sign In")).tag("login")
            Text(tr("Register Account")).tag("register")
        }
        .pickerStyle(.segmented)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())

        if authMode == "register" {
            TextField(tr("Your name"), text: $name)
                .textContentType(.name)
                .autocorrectionDisabled()
                .accessibilityIdentifier("ios.profile.nameField")
        }
        TextField(tr("Email address"), text: $email)
            .textContentType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.emailAddress)
            .accessibilityIdentifier("ios.profile.emailField")
        SecureField(tr("Password"), text: $password)
            .textContentType(authMode == "login" ? .password : .newPassword)
            .accessibilityIdentifier("ios.profile.passwordField")

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
                        await viewModel.syncBodyWeight()
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
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())
        .accessibilityIdentifier("ios.profile.submitAuthButton")

        if authMode == "login" {
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
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
            .accessibilityIdentifier("ios.profile.forgotPasswordButton")
        }
    }

    // MARK: - Settings

    private var preferencesSection: some View {
        @Bindable var store = viewModel.store
        return Section {
            Picker(tr("Language"), selection: Binding(
                get: { store.preferences.language ?? .system },
                set: { store.preferences.language = $0 }
            )) {
                Text(tr("System")).tag(LanguagePreference.system)
                Text("English").tag(LanguagePreference.en)
                Text("Deutsch").tag(LanguagePreference.de)
            }
            .accessibilityIdentifier("ios.profile.languagePicker")

            Stepper(value: $store.preferences.weeklyGoalSessions, in: 1...14) {
                LabeledContent(tr("Weekly goal"), value: tr("%d workouts", store.preferences.weeklyGoalSessions))
            }
            .accessibilityIdentifier("ios.profile.weeklyGoalStepper")

            Toggle(isOn: $store.preferences.exerciseSuggestionsEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(tr("Exercise suggestions"))
                    Text(tr("Suggests at most one exercise per workout"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(LukiColors.accent)
            .accessibilityIdentifier("ios.profile.exerciseSuggestionsToggle")
        } header: {
            Text(tr("Preferences"))
        } footer: {
            AutosaveStatusView(status: generalAutosave.status)
        }
    }

    private var notificationsSection: some View {
        @Bindable var store = viewModel.store
        return Section(tr("Notifications")) {
            Toggle(isOn: $store.preferences.notificationsEnabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(tr("Notifications"))
                    Text(tr("When rest is over or a workout is done"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(LukiColors.accent)
            .accessibilityIdentifier("ios.profile.notificationsToggle")

            Toggle(tr("Rest timer sound"), isOn: $store.preferences.restTimerSound)
                .tint(LukiColors.accent)
                .accessibilityIdentifier("ios.profile.restTimerSoundToggle")

            Button {
                Task {
                    notificationStatus = await viewModel.sendTestNotification()
                        ? tr("A test notification arrives in a second.")
                        : tr("Allow notifications for LukiFitti in Settings to get them.")
                }
            } label: {
                Label(tr("Send Test Notification"), systemImage: "bell.badge")
            }
            .accessibilityIdentifier("ios.profile.testNotificationButton")
            if let notificationStatus {
                Text(notificationStatus)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            WeighInReminderSection(viewModel: viewModel)
        }
    }

    private var backupExportSection: some View {
        Section {
            let jsonBackup = (try? String(data: JSONEncoder().encode(viewModel.store.historySessions), encoding: .utf8)) ?? "[]"
            ShareLink(item: jsonBackup, preview: SharePreview("luki-fitti-backup.json")) {
                Label(tr("Export Backup"), systemImage: "square.and.arrow.up")
            }
        } header: {
            Text(tr("Backup"))
        } footer: {
            Text(tr("Exports your workout history as a JSON file."))
        }
    }
}
