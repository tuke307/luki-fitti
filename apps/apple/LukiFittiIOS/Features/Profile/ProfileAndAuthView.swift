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

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Profile & Preferences")
                    .font(.title2.bold())
                    .foregroundStyle(.white)

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

    private func authenticatedAccountCard(_ user: UserDto) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Authenticated Server Session")
                .font(.caption.bold())
                .foregroundStyle(LukiColors.neonLime)
            Text(user.email)
                .font(.headline)
                .foregroundStyle(.white)
            Button("Sign Out", role: .destructive) {
                Task {
                    await viewModel.store.apiClient.logout()
                    viewModel.store.clearAllLocalData()
                }
            }
            .font(.caption.bold())
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
            }
            TextField("Email address", text: $email)
                .textFieldStyle(.roundedBorder)
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)

            if let statusMessage {
                Text(statusMessage)
                    .font(.caption)
                    .foregroundStyle(LukiColors.neonLime)
            }

            Button {
                Task {
                    do {
                        if authMode == "login" {
                            let user = try await viewModel.store.apiClient.login(email: email, password: password)
                            viewModel.store.currentUser = user
                            await viewModel.store.flushSyncQueue()
                        } else {
                            let user = try await viewModel.store.apiClient.register(
                                email: email,
                                password: password,
                                name: name.isEmpty ? nil : name,
                                weightUnit: viewModel.store.preferences.weightUnit
                            )
                            statusMessage = user.message ?? "Registered successfully"
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
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
    }

    private var preferencesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Gym & Unit Preferences")
                .font(.headline)
                .foregroundStyle(.white)

            Picker("Weight Unit", selection: $viewModel.store.preferences.weightUnit) {
                ForEach(WeightUnit.allCases, id: \.self) { unit in
                    Text(unit.rawValue).tag(unit)
                }
            }
            .pickerStyle(.segmented)

            Stepper(
                "Weekly Goal: \(viewModel.store.preferences.weeklyGoalSessions) sessions",
                value: $viewModel.store.preferences.weeklyGoalSessions,
                in: 1...14
            )
            .font(.subheadline)
            .foregroundStyle(.white)
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
