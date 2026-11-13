import SwiftUI
import PhotosUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiStore

/// One-time-per-launch sheet while the user has no handle: pick a handle, an optional avatar,
/// the email-lookup switch and the push opt-in. Reopenable from the Social tab's own card.
struct SocialOnboardingSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    @Binding var isPresented: Bool
    @Environment(\.lukiLocale) private var tr

    @State private var handle = ""
    @State private var availability: HandleAvailabilityDto?
    @State private var checkingHandle = false
    @State private var handleCheckTask: Task<Void, Never>?
    @State private var discoverableByEmail = true
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var pendingAvatar: Data?
    @State private var saving = false
    @State private var pushEnabled = false

    private var social: SocialStore { viewModel.social }
    private var canFinish: Bool { !saving && availability?.available == true }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(tr("Pick a handle so friends can find you."))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    TextField(tr("Handle"), text: $handle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("ios.social.onboarding.handleField")
                        .onChange(of: handle) { _, value in
                            availability = nil
                            handleCheckTask?.cancel()
                            let normalized = value.lowercased()
                            guard normalized.count >= 3 else { return }
                            handleCheckTask = Task {
                                checkingHandle = true
                                defer { checkingHandle = false }
                                try? await Task.sleep(nanoseconds: 400_000_000)
                                guard !Task.isCancelled else { return }
                                availability = try? await viewModel.store.apiClient.handleAvailability(normalized)
                            }
                        }
                    if checkingHandle {
                        Text(tr("Checking…")).font(.footnote).foregroundStyle(.secondary)
                    } else if let availability {
                        if availability.available {
                            Label(tr("Available"), systemImage: "checkmark.circle.fill")
                                .font(.footnote).foregroundStyle(LukiColors.success)
                        } else {
                            Text(reasonText(availability.reason))
                                .font(.footnote).foregroundStyle(LukiColors.destructive)
                        }
                    }
                } footer: {
                    Text(tr("3–20 characters: a–z, 0–9, underscore."))
                }

                Section {
                    HStack(spacing: 12) {
                        if let pendingAvatar, let img = UIImage(data: pendingAvatar) {
                            Image(uiImage: img)
                                .resizable().scaledToFill()
                                .frame(width: 44, height: 44)
                                .clipShape(Circle())
                        }
                        PhotosPicker(selection: $pickedPhoto, matching: .images) {
                            Text(tr("Change photo"))
                        }
                        .onChange(of: pickedPhoto) { _, item in
                            guard let item else { return }
                            pickedPhoto = nil
                            Task {
                                if let data = try? await item.loadTransferable(type: Data.self) {
                                    pendingAvatar = SocialProfileSheet.downscaledJpeg(data)
                                }
                            }
                        }
                    }
                }

                Section {
                    Toggle(isOn: $discoverableByEmail) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tr("Find me by email"))
                            Text(tr("Friends who saved your email address can find you this way."))
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .tint(LukiColors.accent)
                    .accessibilityIdentifier("ios.social.onboarding.emailLookupToggle")
                }

                Section {
                    Button {
                        Task { pushEnabled = await viewModel.requestPushPermissionAndRegister() }
                    } label: {
                        Label(
                            pushEnabled ? tr("Push enabled on this device") : tr("Turn on notifications"),
                            systemImage: pushEnabled ? "bell.fill" : "bell"
                        )
                    }
                    .disabled(pushEnabled)
                    .accessibilityIdentifier("ios.social.onboarding.pushButton")
                    Text(tr("Get a heads-up when a friend request comes in or is accepted."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(tr("Find your friends"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Not now")) { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Done")) { Task { await finish() } }
                        .disabled(!canFinish)
                        .accessibilityIdentifier("ios.social.onboarding.doneButton")
                }
            }
            .tint(LukiColors.accent)
        }
        .presentationDetents([.large])
    }

    private func reasonText(_ reason: HandleUnavailableReason?) -> String {
        switch reason {
        case .taken: return tr("This handle is taken.")
        case .reserved: return tr("This handle is reserved.")
        case .blocked: return tr("This handle is not allowed.")
        default: return tr("3–20 characters: a–z, 0–9, underscore.")
        }
    }

    private func finish() async {
        saving = true
        defer { saving = false }
        do {
            _ = try await viewModel.store.apiClient.updateSocialMe(
                UpdateSocialProfileDto(handle: handle.lowercased(), discoverableByEmail: discoverableByEmail)
            )
            if let pendingAvatar {
                _ = try? await viewModel.store.apiClient.uploadAvatar(jpeg: pendingAvatar)
            }
            await social.fetchProfile()
            isPresented = false
        } catch {
            social.lastError = error.localizedDescription
        }
    }
}
