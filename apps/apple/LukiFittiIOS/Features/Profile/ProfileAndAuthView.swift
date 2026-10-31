import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiWatchSync

public struct ProfileAndAuthView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var authMode: String = "login"
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var name: String = ""
    @State private var statusMessage: String?

    @State private var newResetPassword: String = ""
    @State private var generalAutosave = PreferencesAutosaver()
    @Environment(\.lukiLocale) private var tr

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        @Bindable var store = viewModel.store
        return List {
            if let tokenType = viewModel.deepLinkTokenType,
               let token = viewModel.deepLinkToken {
                Section {
                    deepLinkActionCard(tokenType: tokenType, token: token)
                }
            }

            Section(tr("Account")) {
                if let user = viewModel.store.currentUser {
                    if viewModel.store.syncState == .AUTH_EXPIRED {
                        ReauthenticateRows(viewModel: viewModel, email: user.email)
                    }
                    NavigationLink {
                        AccountSettingsPage(viewModel: viewModel, statusMessage: $statusMessage)
                    } label: {
                        SettingsRow(
                            tr("Profile & account"),
                            systemImage: "person.crop.circle.fill",
                            tint: LukiColors.accent,
                            subtitle: user.email
                        )
                    }
                    .accessibilityIdentifier("ios.profile.row.account")
                } else {
                    guestAuthRows
                }
            }

            personalizationSection

            if viewModel.store.currentUser != nil {
                Section(tr("AI")) {
                    NavigationLink {
                        AIUsageView(viewModel: viewModel)
                    } label: {
                        SettingsRow(tr("AI usage"), systemImage: "sparkles", tint: LukiColors.setDropset)
                    }
                    .accessibilityIdentifier("ios.profile.aiUsageRow")
                }
            }

            dataSection
        }
        .listStyle(.insetGrouped)
        .onChange(of: GeneralPreferences(store.preferences)) { _, values in
            generalAutosave.schedule { await saveGeneral(values) }
        }
        .onChange(of: store.preferences.notificationsEnabled) { viewModel.rescheduleWeighInReminders() }
        .onChange(of: store.preferences.weightUnit) { viewModel.rescheduleWeighInReminders() }
    }

    /// Settings bound straight to the store by the Training, Notifications and Language & units
    /// pages. Watched here so they save whichever page is open.
    private struct GeneralPreferences: Equatable {
        let language: LanguagePreference?
        let weightUnit: WeightUnit
        let weeklyGoalSessions: Int
        let exerciseSuggestionsEnabled: Bool
        let notificationsEnabled: Bool
        let restTimerSound: Bool

        init(_ p: UserPreferencesDto) {
            language = p.language
            weightUnit = p.weightUnit
            weeklyGoalSessions = p.weeklyGoalSessions
            exerciseSuggestionsEnabled = p.exerciseSuggestionsEnabled
            notificationsEnabled = p.notificationsEnabled
            restTimerSound = p.restTimerSound
        }
    }

    private func saveGeneral(_ values: GeneralPreferences) async -> String? {
        var dto = UpdatePreferencesDto(
            language: values.language,
            restTimerSound: values.restTimerSound,
            notificationsEnabled: values.notificationsEnabled,
            exerciseSuggestionsEnabled: values.exerciseSuggestionsEnabled,
            weeklyGoalSessions: values.weeklyGoalSessions
        )
        dto.weightUnit = values.weightUnit
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

    private var personalizationSection: some View {
        let prefs = viewModel.store.preferences
        return Section(tr("Personalization")) {
            NavigationLink {
                TrainingSettingsPage(viewModel: viewModel, autosave: generalAutosave)
            } label: {
                SettingsRow(
                    tr("Training"),
                    systemImage: "dumbbell.fill",
                    tint: LukiColors.accent,
                    value: tr("%d workouts", prefs.weeklyGoalSessions)
                )
            }
            .accessibilityIdentifier("ios.profile.row.training")

            NavigationLink {
                NutritionGoalsView(viewModel: viewModel)
            } label: {
                SettingsRow(
                    tr("Nutrition goals"),
                    systemImage: "fork.knife",
                    tint: LukiColors.success,
                    value: prefs.dailyKcalGoal.map { tr("%d kcal", $0) } ?? tr("Not set")
                )
            }
            .accessibilityIdentifier("ios.profile.nutritionGoalsRow")

            NavigationLink {
                HealthDetailsView(viewModel: viewModel)
            } label: {
                SettingsRow(tr("Health details"), systemImage: "heart.text.square.fill", tint: LukiColors.destructive)
            }
            .accessibilityIdentifier("ios.profile.healthDetailsRow")

            NavigationLink {
                NotificationSettingsPage(viewModel: viewModel, autosave: generalAutosave)
            } label: {
                SettingsRow(tr("Notifications"), systemImage: "bell.badge.fill", tint: LukiColors.warning)
            }
            .accessibilityIdentifier("ios.profile.row.notifications")

            NavigationLink {
                LanguageUnitsSettingsPage(viewModel: viewModel, autosave: generalAutosave)
            } label: {
                SettingsRow(
                    tr("Language & units"),
                    systemImage: "globe",
                    tint: LukiColors.setWarmup,
                    value: "\(LanguageUnitsSettingsPage.languageName(prefs.language, tr: tr)) · \(LukiFormat.unitLabel(prefs.weightUnit))"
                )
            }
            .accessibilityIdentifier("ios.profile.row.languageUnits")

            NavigationLink {
                AppleWatchSettingsPage(viewModel: viewModel)
            } label: {
                SettingsRow(
                    tr("Apple Watch"),
                    systemImage: "applewatch",
                    tint: LukiColors.setStretch,
                    value: AppleWatchSettingsPage.summary(viewModel.watchSyncCoordinator.status, tr: tr)
                )
            }
            .accessibilityIdentifier("ios.profile.row.appleWatch")
        }
    }

    private var dataSection: some View {
        Section {
            let jsonBackup = (try? String(data: JSONEncoder().encode(viewModel.store.historySessions), encoding: .utf8)) ?? "[]"
            ShareLink(item: jsonBackup, preview: SharePreview("luki-fitti-backup.json")) {
                SettingsRow(tr("Export Backup"), systemImage: "square.and.arrow.up", tint: LukiColors.setStretch)
            }
            .accessibilityIdentifier("ios.profile.row.exportBackup")
        } header: {
            Text(tr("Data"))
        } footer: {
            Text(tr("Exports your workout history as a JSON file."))
        }
    }
}

// MARK: - Sub-pages

/// Pops a settings sub-page when a reset-password / delete-account link arrives, so the action
/// card at the top of Profile is visible.
private struct PopOnDeepLink: ViewModifier {
    let viewModel: LukiAppViewModel
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        content.onChange(of: viewModel.deepLinkTokenType) { _, type in
            if type != nil { dismiss() }
        }
    }
}

private struct AccountSettingsPage: View {
    @Bindable var viewModel: LukiAppViewModel
    @Binding var statusMessage: String?
    @State private var deleteAccountPassword: String = ""
    @State private var showingDeleteRequestField: Bool = false
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            if let user = viewModel.store.currentUser {
                Section {
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
                }

                Section {
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
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("Profile & account"))
        .navigationBarTitleDisplayMode(.inline)
        .modifier(PopOnDeepLink(viewModel: viewModel))
        .onChange(of: viewModel.store.currentUser == nil) { _, signedOut in
            if signedOut { dismiss() }
        }
    }
}

private struct TrainingSettingsPage: View {
    @Bindable var viewModel: LukiAppViewModel
    let autosave: PreferencesAutosaver
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        @Bindable var store = viewModel.store
        return List {
            Section {
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
            } footer: {
                AutosaveStatusView(status: autosave.status)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("Training"))
        .navigationBarTitleDisplayMode(.inline)
        .modifier(PopOnDeepLink(viewModel: viewModel))
    }
}

/// Shown when the server rejected the session: signs in again with the same account without
/// clearing anything stored on this iPhone, then uploads what's waiting.
private struct ReauthenticateRows: View {
    @Bindable var viewModel: LukiAppViewModel
    let email: String
    @State private var password = ""
    @State private var signingIn = false
    @State private var message: String?
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(tr("Sign in again to sync"), systemImage: "person.crop.circle.badge.exclamationmark")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(LukiColors.warning)
            Text(tr("Your session ended. Everything on this iPhone is kept and uploads after you sign in."))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("ios.profile.reauthBanner")

        SecureField(tr("Password"), text: $password)
            .textContentType(.password)
            .submitLabel(.go)
            .onSubmit { Task { await signIn() } }
            .accessibilityIdentifier("ios.profile.reauthPasswordField")

        Button {
            Task { await signIn() }
        } label: {
            HStack {
                if signingIn { ProgressView() }
                Text(tr("Sign In"))
            }
        }
        .disabled(password.isEmpty || signingIn)
        .accessibilityIdentifier("ios.profile.reauthButton")

        if let message {
            Text(message)
                .font(.footnote)
                .foregroundStyle(LukiColors.destructive)
        }
    }

    private func signIn() async {
        guard !password.isEmpty else { return }
        signingIn = true
        defer { signingIn = false }
        do {
            let user = try await viewModel.store.apiClient.login(email: email, password: password)
            password = ""
            message = nil
            viewModel.store.saveAuthenticatedUser(user)
            await viewModel.store.refreshFromServerAfterAuth()
            await viewModel.syncBodyWeight()
        } catch {
            message = error.localizedDescription
        }
    }
}

/// Watch connection status and a manual "send now", so sync problems are visible and fixable.
private struct AppleWatchSettingsPage: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr

    static func summary(_ status: WatchConnectionStatus, tr: SupportedLocale) -> String {
        status.isPaired ? tr("Paired") : tr("Not paired")
    }

    private var status: WatchConnectionStatus { viewModel.watchSyncCoordinator.status }

    var body: some View {
        List {
            Section {
                statusRow(tr("Paired"), status.isPaired)
                LabeledContent(tr("Last sent")) {
                    Text(status.lastSentAt.map { $0.formatted(date: .omitted, time: .standard) } ?? "–")
                        .monospacedDigit()
                }
                LabeledContent(tr("Last request from Watch")) {
                    Text(status.lastReceivedAt.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "–")
                        .monospacedDigit()
                }
                LabeledContent(tr("Signed in as")) {
                    Text(viewModel.store.currentUser?.email ?? tr("Not signed in"))
                        .lineLimit(1)
                }
            } footer: {
                Text(tr("The Watch gets your sign-in and workouts from this iPhone. Open LukiFitti on the Watch too, then send."))
            }

            Section {
                Button {
                    viewModel.pushContextToWatch()
                } label: {
                    Label(tr("Send to Apple Watch now"), systemImage: "arrow.triangle.2.circlepath")
                }
                .disabled(viewModel.store.currentUser == nil)
                .accessibilityIdentifier("ios.profile.watch.sendButton")
                if let error = status.lastError {
                    Text(tr(error))
                        .font(.footnote)
                        .foregroundStyle(LukiColors.destructive)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("Apple Watch"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            // WatchConnectivity has no change callback for every field, so poll while visible.
            while !Task.isCancelled {
                viewModel.watchSyncCoordinator.refreshStatus()
                try? await Task.sleep(for: .seconds(2))
            }
        }
        .modifier(PopOnDeepLink(viewModel: viewModel))
    }

    private func statusRow(_ title: String, _ ok: Bool) -> some View {
        LabeledContent(title) {
            Image(systemName: ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(ok ? LukiColors.success : LukiColors.destructive)
                .accessibilityLabel(ok ? tr("Yes") : tr("No"))
        }
    }
}

private struct NotificationSettingsPage: View {
    @Bindable var viewModel: LukiAppViewModel
    let autosave: PreferencesAutosaver
    @State private var notificationStatus: String?
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        @Bindable var store = viewModel.store
        return List {
            Section {
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
            } footer: {
                AutosaveStatusView(status: autosave.status)
            }

            Section {
                WeighInReminderSection(viewModel: viewModel)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("Notifications"))
        .navigationBarTitleDisplayMode(.inline)
        .modifier(PopOnDeepLink(viewModel: viewModel))
    }
}

private struct LanguageUnitsSettingsPage: View {
    @Bindable var viewModel: LukiAppViewModel
    let autosave: PreferencesAutosaver
    @Environment(\.lukiLocale) private var tr

    static func languageName(_ language: LanguagePreference?, tr: SupportedLocale) -> String {
        switch language ?? .system {
        case .system: return tr("System")
        case .en: return "English"
        case .de: return "Deutsch"
        }
    }

    var body: some View {
        @Bindable var store = viewModel.store
        return List {
            Section {
                Picker(tr("Language"), selection: Binding(
                    get: { store.preferences.language ?? .system },
                    set: { store.preferences.language = $0 }
                )) {
                    ForEach([LanguagePreference.system, .en, .de], id: \.self) { language in
                        Text(Self.languageName(language, tr: tr)).tag(language)
                    }
                }
                .accessibilityIdentifier("ios.profile.languagePicker")

                Picker(tr("Weight unit"), selection: $store.preferences.weightUnit) {
                    ForEach(WeightUnit.allCases, id: \.self) { Text(LukiFormat.unitLabel($0)).tag($0) }
                }
                .accessibilityIdentifier("ios.profile.weightUnitPicker")
            } footer: {
                AutosaveStatusView(status: autosave.status)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("Language & units"))
        .navigationBarTitleDisplayMode(.inline)
        .modifier(PopOnDeepLink(viewModel: viewModel))
    }
}
