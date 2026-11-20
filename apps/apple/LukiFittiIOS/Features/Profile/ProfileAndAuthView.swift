import SwiftUI
import AuthenticationServices
import LukiFittiAPI
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
    @State private var showsNoMailAlert = false
    /// Set when the API answered `{mfaRequired: true}` — the form swaps to the code step.
    @State private var mfaToken: String?
    @State private var mfaCode: String = ""
    /// Raw nonce for the current Apple sign-in attempt (set in onRequest).
    @State private var appleRawNonce: String = ""

    @State private var newResetPassword: String = ""
    @State private var generalAutosave = PreferencesAutosaver()
    @Environment(\.lukiLocale) private var tr
    @Environment(\.openURL) private var openURL

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
                        AIKeySettingsPage(viewModel: viewModel)
                    } label: {
                        SettingsRow(
                            tr("OpenRouter API key"),
                            systemImage: "key.fill",
                            tint: LukiColors.accent,
                            subtitle: viewModel.store.currentUser?.aiKeyConfigured != true
                                ? tr("Add your OpenRouter key")
                                : nil
                        )
                    }
                    .accessibilityIdentifier("ios.profile.aiKeyRow")
                    NavigationLink {
                        AIModelsSettingsView(viewModel: viewModel)
                    } label: {
                        SettingsRow(tr("AI models"), systemImage: "cpu", tint: LukiColors.setDropset)
                    }
                    .accessibilityIdentifier("ios.profile.aiModelsRow")
                    NavigationLink {
                        AIUsageView(viewModel: viewModel)
                    } label: {
                        SettingsRow(tr("AI usage"), systemImage: "sparkles", tint: LukiColors.setDropset)
                    }
                    .accessibilityIdentifier("ios.profile.aiUsageRow")
                }
            }

            dataSection

            Section(tr("Feedback")) {
                Button {
                    requestFeature()
                } label: {
                    SettingsRow(
                        tr("Request a feature"),
                        systemImage: "lightbulb",
                        tint: LukiColors.accent
                    )
                }
                .accessibilityIdentifier("ios.profile.featureRequestRow")
            }

            legalSection

            Section {
                Text(tr("Version %@", AppVersionInfo.display))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .alert(tr("No mail app found"), isPresented: $showsNoMailAlert) {
            Button(tr("Copy address")) {
                UIPasteboard.general.string = FeedbackMail.feedbackEmail
            }
            Button(tr("OK"), role: .cancel) {}
        } message: {
            Text(FeedbackMail.feedbackEmail)
        }
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
        let effortTrackingEnabled: Bool
        let notificationsEnabled: Bool
        let restTimerSound: Bool
        let defaultRestSeconds: Int
        let theme: String
        let trainingGoal: TrainingGoal?

        init(_ p: UserPreferencesDto) {
            language = p.language
            weightUnit = p.weightUnit
            weeklyGoalSessions = p.weeklyGoalSessions
            exerciseSuggestionsEnabled = p.exerciseSuggestionsEnabled
            effortTrackingEnabled = p.effortTrackingEnabled
            notificationsEnabled = p.notificationsEnabled
            restTimerSound = p.restTimerSound
            defaultRestSeconds = p.defaultRestSeconds
            theme = p.theme
            trainingGoal = p.trainingGoal
        }
    }

    /// Opens the prefilled feature-request mail; without a configured mail app we offer the
    /// address to copy instead.
    private func requestFeature() {
        guard let url = FeedbackMail.featureRequestURL(
            locale: tr.rawValue,
            appVersion: AppVersionInfo.display,
            os: AppVersionInfo.osDescription
        ) else { return }
        UIApplication.shared.open(url) { success in
            if !success { showsNoMailAlert = true }
        }
    }

    private func saveGeneral(_ values: GeneralPreferences) async -> String? {
        var dto = UpdatePreferencesDto(
            language: values.language,
            restTimerSound: values.restTimerSound,
            notificationsEnabled: values.notificationsEnabled,
            exerciseSuggestionsEnabled: values.exerciseSuggestionsEnabled,
            effortTrackingEnabled: values.effortTrackingEnabled,
            weeklyGoalSessions: values.weeklyGoalSessions
        )
        dto.weightUnit = values.weightUnit
        dto.defaultRestSeconds = values.defaultRestSeconds
        dto.theme = values.theme
        dto.setOrClear(\.trainingGoal, values.trainingGoal, key: .trainingGoal)
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

    /// Top/bottom corner of the visible field block — the section's first/last rows
    /// are the transparent picker and button, so the filled rows round themselves.
    private func fieldRowBackground(top: Bool = false, bottom: Bool = false) -> some View {
        UnevenRoundedRectangle(
            topLeadingRadius: top ? 10 : 0,
            bottomLeadingRadius: bottom ? 10 : 0,
            bottomTrailingRadius: bottom ? 10 : 0,
            topTrailingRadius: top ? 10 : 0
        )
        .fill(Color(.secondarySystemGroupedBackground))
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
                .listRowBackground(fieldRowBackground(top: true))
                .accessibilityIdentifier("ios.profile.nameField")
        }
        TextField(tr("Email address"), text: $email)
            .textContentType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.emailAddress)
            .listRowBackground(fieldRowBackground(top: authMode == "login"))
            .accessibilityIdentifier("ios.profile.emailField")
        SecureField(tr("Password"), text: $password)
            // The strong-password AutoFill panel hides the keyboard — suppressed in the
            // App Review walkthrough so the UI test can type a password.
            .textContentType(
                authMode == "login" || ProcessInfo.processInfo.arguments.contains("--uitesting-review")
                    ? .password
                    : .newPassword
            )
            .listRowBackground(fieldRowBackground(bottom: statusMessage == nil))
            .accessibilityIdentifier("ios.profile.passwordField")

        if let statusMessage {
            Text(statusMessage)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .listRowBackground(fieldRowBackground(bottom: true))
                .accessibilityIdentifier("ios.profile.statusMessage")
        }

        if mfaToken != nil {
            mfaStepRows
        } else {
            Button {
                Task {
                    do {
                        if authMode == "login" {
                            await signInWithPassword()
                        } else {
                            do {
                                let user = try await viewModel.store.apiClient.register(
                                    email: email,
                                    password: password,
                                    name: name.isEmpty ? nil : name,
                                    weightUnit: viewModel.store.preferences.weightUnit
                                )
                                viewModel.analytics.event(.signup, ["status": .string(user.message == nil ? "success" : "pending_confirmation")])
                                statusMessage = tr("Account created. Check your email to confirm it.")
                                #if DEBUG
                                viewModel.pollMailpitForReview(to: email, route: "verify-email")
                                #endif
                            } catch {
                                viewModel.analytics.event(.signup, ["status": .string("error")])
                                throw error
                            }
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
                        viewModel.analytics.event(.passwordResetRequest)
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

            providerRows
        }
    }

    /// Second factor after the API answered mfaRequired: TOTP or a recovery code.
    @ViewBuilder
    private var mfaStepRows: some View {
        TextField(tr("Two-factor code"), text: $mfaCode)
            .textContentType(.oneTimeCode)
            .keyboardType(.numberPad)
            .autocorrectionDisabled()
            .listRowBackground(Color.clear)
            .accessibilityIdentifier("ios.profile.mfaCodeField")
        Text(tr("Enter the code from your authenticator app, or a recovery code."))
            .font(.footnote)
            .foregroundStyle(.secondary)
            .listRowBackground(Color.clear)

        Button {
            Task { await verifyMfaCode() }
        } label: {
            Text(tr("Verify"))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(mfaCode.trimmingCharacters(in: .whitespaces).isEmpty)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())
        .accessibilityIdentifier("ios.profile.mfaVerifyButton")

        Button(tr("Back")) {
            mfaToken = nil
            mfaCode = ""
        }
        .frame(maxWidth: .infinity)
        .listRowBackground(Color.clear)
        .accessibilityIdentifier("ios.profile.mfaBackButton")
    }

    /// Apple (native button), Google (when configured) and passkey sign-in — they also register.
    @ViewBuilder
    private var providerRows: some View {
        SignInWithAppleButton(.signIn) { request in
            request.requestedScopes = [.fullName, .email]
            // Apple hashes this into the id_token; the API accepts the raw value we keep.
            appleRawNonce = OAuthNonce.makeRaw()
            request.nonce = OAuthNonce.sha256Hex(appleRawNonce)
        } onCompletion: { result in
            Task { await finishAppleSignIn(result) }
        }
        .signInWithAppleButtonStyle(.black)
        .frame(height: 44)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())
        .accessibilityIdentifier("ios.profile.signInWithAppleButton")

        if AuthSecurityCoordinator(apiClient: viewModel.store.apiClient).googleClientId != nil {
            Button {
                Task { await signInWithGoogle() }
            } label: {
                Text(tr("Continue with Google"))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
            .accessibilityIdentifier("ios.profile.signInWithGoogleButton")
        }

        Button {
            Task { await signInWithPasskey() }
        } label: {
            Text(tr("Sign in with a passkey"))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())
        .accessibilityIdentifier("ios.profile.signInWithPasskeyButton")
    }

    // MARK: - Auth actions

    /// Adopts a signed-in user or parks the MFA challenge; returns after the post-login refresh.
    private func adoptLoginResult(_ result: LoginResult) async {
        switch result {
        case .signedIn(let user):
            viewModel.analytics.event(.login, ["status": .string("success")])
            viewModel.store.saveAuthenticatedUser(user)
            await viewModel.store.refreshFromServerAfterAuth()
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--uitesting-review") {
                LukiAppViewModel.seedDemoMeal(vm: viewModel, store: viewModel.store)
            }
            #endif
            await viewModel.syncBodyWeight()
        case .mfaRequired(let token):
            viewModel.analytics.event(.login, ["status": .string("mfa_required")])
            mfaCode = ""
            mfaToken = token
        }
    }

    private func signInWithPassword() async {
        do {
            let result = try await viewModel.store.apiClient.login(email: email, password: password)
            await adoptLoginResult(result)
        } catch {
            viewModel.analytics.event(.login, ["status": .string("error")])
            statusMessage = error.localizedDescription
        }
    }

    private func verifyMfaCode() async {
        guard let mfaToken else { return }
        do {
            let user = try await viewModel.store.apiClient.verifyTwoFactor(
                mfaToken: mfaToken,
                code: mfaCode.trimmingCharacters(in: .whitespaces)
            )
            self.mfaToken = nil
            mfaCode = ""
            await adoptLoginResult(.signedIn(user))
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func finishAppleSignIn(_ result: Result<ASAuthorization, Error>) async {
        do {
            let authorization = try result.get()
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8) else {
                return
            }
            let parts = [credential.fullName?.givenName, credential.fullName?.familyName]
                .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            let loginResult = try await viewModel.store.apiClient.oauthSignIn(
                provider: "apple",
                idToken: idToken,
                nonce: appleRawNonce,
                name: parts.isEmpty ? nil : parts.joined(separator: " ")
            )
            await adoptLoginResult(loginResult)
        } catch let error as ASAuthorizationError where error.code == .canceled {
            // User dismissed the sheet — nothing to report.
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func signInWithGoogle() async {
        do {
            let result = try await AuthSecurityCoordinator(apiClient: viewModel.store.apiClient)
                .signInWithGoogle()
            await adoptLoginResult(result)
        } catch AuthSecurityCoordinator.FlowError.cancelled {
            // User dismissed the browser — nothing to report.
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func signInWithPasskey() async {
        do {
            let user = try await AuthSecurityCoordinator(apiClient: viewModel.store.apiClient)
                .signInWithPasskey()
            await adoptLoginResult(.signedIn(user))
        } catch AuthSecurityCoordinator.FlowError.cancelled {
            // User dismissed the prompt — nothing to report.
        } catch {
            statusMessage = error.localizedDescription
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
                let goalValue = prefs.dailyKcalGoal.map { tr("%d kcal", $0) } ?? tr("Not set")
                // A long value ("Nicht angegeben") would hyphenate the title; then it moves under it.
                ViewThatFits(in: .horizontal) {
                    SettingsRow(tr("Nutrition goals"), systemImage: "fork.knife", tint: LukiColors.success, value: goalValue)
                    SettingsRow(tr("Nutrition goals"), systemImage: "fork.knife", tint: LukiColors.success, subtitle: goalValue)
                }
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
            NavigationLink {
                ImportDataView(viewModel: viewModel)
            } label: {
                SettingsRow(tr("Data import"), systemImage: "square.and.arrow.down", tint: LukiColors.setStretch)
            }
            .accessibilityIdentifier("ios.profile.row.importFile")

            NavigationLink {
                DataExportView(viewModel: viewModel)
            } label: {
                SettingsRow(tr("Export & backup"), systemImage: "square.and.arrow.up", tint: LukiColors.setStretch)
            }
            .accessibilityIdentifier("ios.profile.row.dataExport")

            NavigationLink {
                DataSourcesView()
            } label: {
                SettingsRow(tr("Data sources"), systemImage: "books.vertical", tint: LukiColors.accent)
            }
            .accessibilityIdentifier("ios.profile.row.dataSources")

            if viewModel.store.currentUser != nil {
                NavigationLink {
                    ApiKeysView(viewModel: viewModel)
                } label: {
                    SettingsRow(tr("API keys"), systemImage: "key.horizontal", tint: LukiColors.setStretch)
                }
                .accessibilityIdentifier("ios.profile.row.apiKeys")
            }
        } header: {
            Text(tr("Data"))
        }
    }

    /// Impressum / Datenschutz / Nutzungsbedingungen on the marketing site — German paths
    /// unless the app language is English.
    private var legalSection: some View {
        let german = tr.rawValue.hasPrefix("de")
        let rows: [(String, String, String)] = [
            (german ? "/impressum" : "/en/imprint", tr("Imprint"), "doc.plaintext"),
            (german ? "/datenschutz" : "/en/privacy", tr("Privacy policy"), "hand.raised"),
            (german ? "/nutzungsbedingungen" : "/en/terms", tr("Terms of use"), "doc.text"),
        ]
        return Section(tr("Legal")) {
            ForEach(rows, id: \.0) { path, label, icon in
                Button {
                    if let url = URL(string: "https://luki-fitti.tony-luke.de\(path)") {
                        openURL(url)
                    }
                } label: {
                    SettingsRow(label, systemImage: icon, tint: LukiColors.accent)
                }
            }
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
    @State private var showingSignOutAllConfirmation = false
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    /// Removes this device's APNs registration before tokens are cleared locally.
    private func unregisterPush() async {
        await viewModel.unregisterPushDevice()
    }

    private func signOutLocally() {
        viewModel.social.clearSignedInState()
        viewModel.store.clearAllLocalData()
        viewModel.nutrition.clear()
        viewModel.clearBodyWeightData()
    }

    var body: some View {
        List {
            if viewModel.socialEnabled {
                // Re-init the field state once the social profile lands (it may still be
                // loading when this page opens before the Social tab was visited).
                SocialProfileSections(viewModel: viewModel)
                    .id(viewModel.social.profile == nil)
            }
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

                    NavigationLink {
                        SecuritySettingsPage(viewModel: viewModel)
                    } label: {
                        SettingsRow(
                            tr("Sign-in & security"),
                            systemImage: "lock.shield.fill",
                            tint: LukiColors.accent
                        )
                    }
                    .accessibilityIdentifier("ios.profile.securityRow")

                    Button(tr("Sign Out"), role: .destructive) {
                        Task {
                            await unregisterPush()
                            await viewModel.store.apiClient.logout()
                            signOutLocally()
                        }
                    }
                    .accessibilityIdentifier("ios.profile.signOutButton")

                    Button(tr("Sign out of all devices"), role: .destructive) {
                        showingSignOutAllConfirmation = true
                    }
                    .accessibilityIdentifier("ios.profile.signOutAllButton")
                    .confirmationDialog(
                        tr("Sign out of all devices?"),
                        isPresented: $showingSignOutAllConfirmation,
                        titleVisibility: .visible
                    ) {
                        Button(tr("Sign out of all devices"), role: .destructive) {
                            Task {
                                await unregisterPush()
                                await viewModel.store.apiClient.logoutAllDevices()
                                signOutLocally()
                            }
                        }
                        .accessibilityIdentifier("ios.profile.confirmSignOutAllButton")
                        Button(tr("Cancel"), role: .cancel) {}
                    } message: {
                        Text(tr("You’ll be signed out on all devices, including the web and Apple Watch."))
                    }
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
                                viewModel.analytics.event(.accountDeleteRequest)
                                do {
                                    try await viewModel.store.apiClient.requestAccountDeletion(
                                        password: deleteAccountPassword
                                    )
                                    showingDeleteRequestField = false
                                    deleteAccountPassword = ""
                                    statusMessage = tr("Check your email to confirm the deletion.")
                                    #if DEBUG
                                    viewModel.pollMailpitForReview(to: user.email, route: "delete-account")
                                    #endif
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
        .task {
            if viewModel.socialEnabled, viewModel.social.profile == nil {
                await viewModel.social.fetchProfile()
            }
        }
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
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 2) { Text(tr("Training goal")); TrainingGoalInfoButton() }
                        Text(store.preferences.trainingGoal
                            .map { TrainingGoalLabels.caption($0, tr) }
                            ?? tr("Default rep ranges and rest times"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    Picker(tr("Training goal"), selection: $store.preferences.trainingGoal) {
                        Text(tr("Not set")).tag(TrainingGoal?.none)
                        ForEach(TrainingGoal.allCases, id: \.self) { goal in
                            Text(TrainingGoalLabels.name(goal, tr)).tag(TrainingGoal?.some(goal))
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("ios.profile.trainingGoalPicker")
                }

                Picker(selection: $store.preferences.defaultRestSeconds) {
                    ForEach(Self.restOptions(current: store.preferences.defaultRestSeconds), id: \.self) { seconds in
                        Text(tr("%d s", seconds)).tag(seconds)
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tr("Default rest"))
                        Text(tr("For new exercises. Each exercise can set its own rest."))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityIdentifier("ios.profile.defaultRestPicker")

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

                Toggle(isOn: $store.preferences.effortTrackingEnabled) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tr("Rate effort"))
                        Text(tr("Ask how hard each set felt after completing it."))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(LukiColors.accent)
                .accessibilityIdentifier("ios.profile.effortTrackingToggle")
            } footer: {
                AutosaveStatusView(status: autosave.status)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("Training"))
        .navigationBarTitleDisplayMode(.inline)
        .modifier(PopOnDeepLink(viewModel: viewModel))
    }

    /// The web's choices; a value set elsewhere (e.g. by the API) stays selectable.
    static func restOptions(current: Int) -> [Int] {
        let options = [60, 75, 90, 120, 150, 180]
        return options.contains(current) ? options : (options + [current]).sorted()
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
    @State private var mfaToken: String?
    @State private var mfaCode = ""
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

        if mfaToken != nil {
            TextField(tr("Two-factor code"), text: $mfaCode)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .submitLabel(.go)
                .onSubmit { Task { await verifyMfa() } }
                .accessibilityIdentifier("ios.profile.reauthMfaField")
            Text(tr("Enter the code from your authenticator app, or a recovery code."))
                .font(.footnote)
                .foregroundStyle(.secondary)
            Button {
                Task { await verifyMfa() }
            } label: {
                HStack {
                    if signingIn { ProgressView() }
                    Text(tr("Verify"))
                }
            }
            .disabled(mfaCode.trimmingCharacters(in: .whitespaces).isEmpty || signingIn)
            .accessibilityIdentifier("ios.profile.reauthMfaButton")
        }

        if let message {
            Text(message)
                .font(.footnote)
                .foregroundStyle(LukiColors.destructive)
        }
    }

    private func adopt(_ user: UserDto) async {
        password = ""
        mfaCode = ""
        mfaToken = nil
        message = nil
        viewModel.store.saveAuthenticatedUser(user)
        await viewModel.store.refreshFromServerAfterAuth()
        await viewModel.syncBodyWeight()
    }

    private func signIn() async {
        guard !password.isEmpty else { return }
        signingIn = true
        defer { signingIn = false }
        do {
            switch try await viewModel.store.apiClient.login(email: email, password: password) {
            case .signedIn(let user):
                await adopt(user)
            case .mfaRequired(let token):
                mfaToken = token
            }
        } catch {
            message = error.localizedDescription
        }
    }

    private func verifyMfa() async {
        guard let mfaToken else { return }
        signingIn = true
        defer { signingIn = false }
        do {
            let user = try await viewModel.store.apiClient.verifyTwoFactor(
                mfaToken: mfaToken,
                code: mfaCode.trimmingCharacters(in: .whitespaces)
            )
            await adopt(user)
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
    @State private var pushPrefs: PushPreferencesDto?
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

                if viewModel.socialEnabled {
                    ForEach(NotificationCategories.all, id: \.id) { category in
                        NavigationLink {
                            if let prefs = pushPrefs {
                                PushCategorySettingsView(
                                    viewModel: viewModel,
                                    category: category,
                                    prefs: prefs
                                )
                            } else {
                                ProgressView()
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tr(categoryTitle(category.id)))
                                Text(tr(categorySubtitle(category.id)))
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityIdentifier("ios.profile.\(category.id.rawValue)PushRow")
                    }
                }

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
        .task {
            if viewModel.socialEnabled, pushPrefs == nil {
                pushPrefs = try? await viewModel.store.apiClient.fetchPushPreferences()
            }
        }
    }

    private func categoryTitle(_ id: NotificationCategoryId) -> String {
        switch id {
        case .friends: return "Friends"
        case .nudges: return "Friend nudges"
        case .leagues: return "Leagues"
        case .duels: return "Duels"
        case .streaks: return "Streaks"
        case .raids: return "Raids"
        }
    }

    private func categorySubtitle(_ id: NotificationCategoryId) -> String {
        switch id {
        case .friends: return "Friend requests and accepted requests."
        case .nudges: return "When a friend pulls ahead of you this week."
        case .leagues: return "Promotion, demotion and end-of-week reminders."
        case .duels: return "Challenges, standings and results."
        case .streaks: return "Streak invites, freezes and broken streaks."
        case .raids: return "Boss phases, defeats and squad invites."
        }
    }
}

/// Drill-in for one push category: the master toggle mirrors the
/// `push<Friends|Leagues|…>` preference, kind toggles write `disabledKinds`
/// and are disabled while the category is off. Same model as the web
/// push-settings card; category order comes from `NotificationCategories`.
private struct PushCategorySettingsView: View {
    @Bindable var viewModel: LukiAppViewModel
    let category: NotificationCategory
    @State private var prefs: PushPreferencesDto
    @Environment(\.lukiLocale) private var tr

    init(viewModel: LukiAppViewModel, category: NotificationCategory, prefs: PushPreferencesDto) {
        self.viewModel = viewModel
        self.category = category
        _prefs = State(initialValue: prefs)
    }

    private var masterOn: Bool {
        switch category.pref {
        case .pushFriends: return prefs.friends
        case .pushNudges: return prefs.nudges
        case .pushLeagues: return prefs.leagues
        case .pushDuels: return prefs.duels
        case .pushStreaks: return prefs.streaks
        case .pushRaids: return prefs.raids
        }
    }

    var body: some View {
        List {
            Section {
                Toggle(tr("Allow Notifications"), isOn: Binding(
                    get: { masterOn },
                    set: { enabled in setMaster(enabled) }
                ))
                .tint(LukiColors.accent)
                .accessibilityIdentifier("ios.profile.pushCategory.\(category.id.rawValue).master")
            }
            Section {
                ForEach(category.kinds, id: \.self) { kind in
                    Toggle(tr(Self.kindLabel(kind)), isOn: Binding(
                        get: { masterOn && !prefs.disabledKinds.contains(kind.rawValue) },
                        set: { enabled in toggleKind(kind, enabled: enabled) }
                    ))
                    .tint(LukiColors.accent)
                    .disabled(!masterOn)
                    .accessibilityIdentifier("ios.profile.pushKind.\(kind.rawValue)")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr(Self.categoryTitle(category.id)))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func setMaster(_ enabled: Bool) {
        var dto = UpdatePushPreferencesDto()
        switch category.pref {
        case .pushFriends: dto.friends = enabled; prefs.friends = enabled
        case .pushNudges: dto.nudges = enabled; prefs.nudges = enabled
        case .pushLeagues: dto.leagues = enabled; prefs.leagues = enabled
        case .pushDuels: dto.duels = enabled; prefs.duels = enabled
        case .pushStreaks: dto.streaks = enabled; prefs.streaks = enabled
        case .pushRaids: dto.raids = enabled; prefs.raids = enabled
        }
        Task { await send(dto) }
    }

    private func toggleKind(_ kind: SocialNotificationKind, enabled: Bool) {
        var disabled = prefs.disabledKinds.filter { $0 != kind.rawValue }
        if !enabled { disabled.append(kind.rawValue) }
        prefs.disabledKinds = disabled
        Task { await send(UpdatePushPreferencesDto(disabledKinds: disabled)) }
    }

    private func send(_ dto: UpdatePushPreferencesDto) async {
        if let updated = try? await viewModel.store.apiClient.updatePushPreferences(dto) {
            prefs = updated
        }
    }

    private static func categoryTitle(_ id: NotificationCategoryId) -> String {
        switch id {
        case .friends: return "Friends"
        case .nudges: return "Friend nudges"
        case .leagues: return "Leagues"
        case .duels: return "Duels"
        case .streaks: return "Streaks"
        case .raids: return "Raids"
        }
    }

    /// English keys translated via `LukiStrings.german` — same labels as the
    /// web `social.pushKinds` table.
    static func kindLabel(_ kind: SocialNotificationKind) -> String {
        switch kind {
        case .FRIEND_REQUEST: return "Friend requests"
        case .FRIEND_ACCEPTED: return "Accepted requests"
        case .LEAGUE_PROMOTED: return "Promotions"
        case .LEAGUE_DEMOTED: return "Demotions"
        case .LEAGUE_ENDING: return "Week ending reminder"
        case .DUEL_INVITE: return "Challenges"
        case .DUEL_ACCEPTED: return "Accepted challenges"
        case .DUEL_STANDINGS: return "Daily standings"
        case .DUEL_RESULT: return "Results"
        case .STREAK_INVITE: return "Streak invites"
        case .STREAK_STARTED: return "Streak started"
        case .STREAK_REMINDER: return "Sunday reminder"
        case .STREAK_FROZEN: return "Freeze used"
        case .STREAK_BROKEN: return "Streak reset"
        case .RAID_SPAWNED: return "New boss"
        case .RAID_PHASE: return "Boss enraged"
        case .RAID_DEFEATED: return "Boss defeated"
        case .RAID_ESCAPED: return "Boss escaped"
        case .SQUAD_INVITE: return "Squad invites"
        case .SQUAD_RAID_STARTED: return "Squad raid started"
        case .FRIEND_PULLED_AHEAD: return "Friend pulled ahead"
        }
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

                Picker(tr("Appearance"), selection: Binding(
                    get: { LukiAppearance(rawValue: store.preferences.theme) ?? .system },
                    set: { store.preferences.theme = $0.rawValue }
                )) {
                    ForEach(LukiAppearance.allCases, id: \.self) { Text(tr($0.title)).tag($0) }
                }
                .accessibilityIdentifier("ios.profile.appearancePicker")

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
