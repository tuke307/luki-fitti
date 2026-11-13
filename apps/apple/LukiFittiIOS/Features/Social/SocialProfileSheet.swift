import SwiftUI
import PhotosUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiStore

/// Edit social profile: avatar (PhotosPicker, downscaled to ≤512 px JPEG), handle with live
/// availability, display name, "find me by email" and pause. Shared by the edit sheet and
/// (read-only fields) the onboarding sheet.
struct SocialProfileSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    @State private var handle: String
    @State private var name: String
    @State private var discoverableByEmail: Bool
    @State private var socialPaused: Bool
    @State private var availability: HandleAvailabilityDto?
    @State private var checkingHandle = false
    @State private var handleCheckTask: Task<Void, Never>?
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var saving = false
    @State private var error: String?

    private let lockedUntil: Date?

    init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
        let p = viewModel.social.profile
        _handle = State(initialValue: p?.handle ?? "")
        _name = State(initialValue: p?.name ?? "")
        _discoverableByEmail = State(initialValue: p?.discoverableByEmail ?? true)
        _socialPaused = State(initialValue: p?.socialPaused ?? false)
        lockedUntil = p?.handleChangeAvailableAt.flatMap { LukiDate.parseISO($0) }
    }

    private var social: SocialStore { viewModel.social }
    private var handleLocked: Bool { (lockedUntil ?? .distantPast) > Date() }
    private var handleChanged: Bool { handle.lowercased() != (social.profile?.handle ?? "") }
    private var canSave: Bool {
        guard !saving else { return false }
        if handleChanged && (handleLocked || availability?.available != true) { return false }
        return true
    }

    var body: some View {
        Form {
            avatarSection

            Section {
                TextField(tr("Handle"), text: $handle)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .disabled(handleLocked)
                    .accessibilityIdentifier("ios.social.handleField")
                    .onChange(of: handle) { _, value in
                        availability = nil
                        handleCheckTask?.cancel()
                        let normalized = value.lowercased()
                        guard normalized.count >= 3, handleChanged else { return }
                        handleCheckTask = Task {
                            checkingHandle = true
                            defer { checkingHandle = false }
                            try? await Task.sleep(nanoseconds: 400_000_000)
                            guard !Task.isCancelled else { return }
                            availability = try? await viewModel.store.apiClient.handleAvailability(normalized)
                        }
                    }
                handleStatus
            } footer: {
                if handleLocked, let lockedUntil {
                    Text(tr("You can change your handle again on %@.", lockedUntil.formatted(date: .abbreviated, time: .omitted)))
                } else {
                    Text(tr("3–20 characters: a–z, 0–9, underscore."))
                }
            }

            Section {
                TextField(tr("Name"), text: $name)
                    .accessibilityIdentifier("ios.social.nameField")
            }

            Section {
                Toggle(isOn: $discoverableByEmail) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tr("Find me by email"))
                        Text(tr("Friends who saved your email address can find you this way."))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(LukiColors.accent)
                .accessibilityIdentifier("ios.social.emailLookupToggle")

                Toggle(isOn: $socialPaused) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tr("Pause friends features"))
                        Text(tr("You disappear from search and leagues while paused."))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(LukiColors.accent)
                .accessibilityIdentifier("ios.social.pauseToggle")
            }

            if let error {
                Section { Text(error).foregroundStyle(LukiColors.destructive).font(.footnote) }
            }
        }
        .navigationTitle(tr("Profile"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(tr("Cancel")) { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(tr("Save")) { Task { await save() } }
                    .disabled(!canSave)
                    .accessibilityIdentifier("ios.social.saveProfileButton")
            }
        }
        .tint(LukiColors.accent)
    }

    @ViewBuilder
    private var handleStatus: some View {
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
    }

    private func reasonText(_ reason: HandleUnavailableReason?) -> String {
        switch reason {
        case .taken: return tr("This handle is taken.")
        case .reserved: return tr("This handle is reserved.")
        case .blocked: return tr("This handle is not allowed.")
        default: return tr("3–20 characters: a–z, 0–9, underscore.")
        }
    }

    private var avatarSection: some View {
        Section {
            HStack(spacing: 12) {
                SocialAvatarView(
                    userId: viewModel.store.currentUser?.id ?? "me",
                    handle: social.profile?.handle ?? "",
                    name: name,
                    avatarUrl: social.profile?.avatarUrl,
                    social: social,
                    size: 52
                )
                PhotosPicker(selection: $pickedPhoto, matching: .images) {
                    Text(tr("Change photo"))
                }
                .accessibilityIdentifier("ios.social.changePhotoButton")
                if social.profile?.avatarUrl != nil {
                    Button(tr("Remove photo"), role: .destructive) {
                        Task {
                            _ = try? await viewModel.store.apiClient.deleteAvatar()
                            await social.fetchProfile()
                        }
                    }
                    .font(.subheadline)
                }
            }
            .onChange(of: pickedPhoto) { _, item in
                guard let item else { return }
                pickedPhoto = nil
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let jpeg = Self.downscaledJpeg(data) {
                        _ = try? await viewModel.store.apiClient.uploadAvatar(jpeg: jpeg)
                        await social.fetchProfile()
                    }
                }
            }
        }
    }

    /// ≤ 512 px JPEG — the server re-encodes anyway, this just keeps the upload small.
    static func downscaledJpeg(_ data: Data, maxSide: CGFloat = 512) -> Data? {
        guard let source = UIImage(data: data) else { return nil }
        let side = max(source.size.width, source.size.height)
        guard side > maxSide else { return source.jpegData(compressionQuality: 0.85) }
        let scale = maxSide / side
        let size = CGSize(width: source.size.width * scale, height: source.size.height * scale)
        let rendered = UIGraphicsImageRenderer(size: size).image { _ in
            source.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.jpegData(compressionQuality: 0.85)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        var dto = UpdateSocialProfileDto()
        let normalizedHandle = handle.lowercased()
        if handleChanged && !normalizedHandle.isEmpty { dto.handle = normalizedHandle }
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        if trimmedName != (social.profile?.name ?? "") {
            dto.name = trimmedName.isEmpty ? nil : trimmedName
        }
        dto.discoverableByEmail = discoverableByEmail
        dto.socialPaused = socialPaused
        do {
            _ = try await viewModel.store.apiClient.updateSocialMe(dto)
            await social.fetchProfile()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
