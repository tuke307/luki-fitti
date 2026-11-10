import SwiftUI
import PhotosUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Pinned "Progress target" card at the top of the progress list: intro, consent, pick a
/// front photo, generate, then save or discard the AI_TARGET result.
public struct ProgressTargetCard: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var showFlow = false

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        Section {
            Button { showFlow = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: "sparkles")
                        .foregroundStyle(LukiColors.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tr("AI progress target"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Text(tr("See a realistic version of yourself after reaching your goal."))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ios.progress.targetCard")
        }
        .sheet(isPresented: $showFlow) {
            ProgressTargetFlowView(viewModel: viewModel)
        }
    }
}

/// Pinned AI_TARGET photos above the dated timeline, with the "KI-Ziel" badge.
public struct ProgressTargetSection: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private var photos: [ProgressPhotoDto] { viewModel.progress.targetPhotos }

    public var body: some View {
        if !photos.isEmpty {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Label(tr("AI target"), systemImage: "sparkles")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LukiColors.accent)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(photos) { photo in
                                ProgressTargetThumb(viewModel: viewModel, photo: photo)
                                    .frame(width: 110)
                                    .aspectRatio(2.0 / 3.0, contentMode: .fit)
                                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    .overlay(alignment: .topLeading) {
                                        Text(tr("AI target"))
                                            .font(.caption2.weight(.semibold))
                                            .padding(4)
                                            .background(.ultraThinMaterial)
                                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                            .padding(4)
                                    }
                            }
                        }
                    }
                }
            }
        }
    }
}

private struct ProgressTargetThumb: View {
    let viewModel: LukiAppViewModel
    let photo: ProgressPhotoDto
    @State private var image: UIImage? = nil

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                RoundedRectangle(cornerRadius: 10, style: .continuous).fill(LukiColors.fill)
            }
        }
        .task {
            if let data = await viewModel.progress.photoData(photo, isSignedIn: viewModel.isSignedIn) {
                image = UIImage(data: data)
            }
        }
        .accessibilityLabel(Text(photo.pose == .FRONT ? "AI target photo" : "AI target photo"))
    }
}

// MARK: - Flow

private enum TargetStep {
    case intro
    case consent
    case photo
    case generating
    case result
}

public struct ProgressTargetFlowView: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    @State private var step: TargetStep = .intro
    @State private var goal: BodyGoal?
    @State private var horizon: Int?
    @State private var refPhoto: ProgressPhotoDto? = nil
    @State private var refImage: UIImage? = nil
    @State private var resultImage: UIImage? = nil
    @State private var resultModel = ""
    @State private var slider: CGFloat = 0.5
    @State private var error: String? = nil
    @State private var consentBusy = false
    @State private var showsAiKeyAlert = false

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
        let prefs = viewModel.store.preferences
        _goal = State(initialValue: prefs.bodyGoal)
        _horizon = State(initialValue: prefs.goalHorizonMonths)
    }

    public var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .intro: introView
                case .consent: consentView
                case .photo: photoView
                case .generating: generatingView
                case .result: resultView
                }
            }
            .navigationTitle(tr("AI progress target"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { dismiss() }
                }
            }
        }
        .alert(tr("OpenRouter key required"), isPresented: $showsAiKeyAlert) {
            Button(tr("Add key")) {
                dismiss()
                viewModel.selectedTab = .profile
            }
            Button(tr("Cancel"), role: .cancel) {}
        } message: {
            Text(tr("AI features run on your own OpenRouter API key. Add it in your profile to use them."))
        }
        .accessibilityIdentifier("ios.progress.targetFlow")
    }

    private var introView: some View {
        Form {
            Section {
                Text(tr("LukiFitti creates an AI-edited version of your front photo that shows a realistic result at your goal."))
                Text(tr("AI-generated illustration, not a prediction."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Section {
                Button(tr("Continue")) {
                    Task {
                        guard await viewModel.ensureAiKeyConfigured() else {
                            showsAiKeyAlert = true
                            return
                        }
                        step = viewModel.store.preferences.progressAiConsentAt != nil ? .photo : .consent
                    }
                }
                .accessibilityIdentifier("ios.progress.targetContinue")
            }
        }
    }

    private var consentView: some View {
        Form {
            Section {
                Text(tr("Your front photo, goal, horizon, height, weight, body fat, sex and age are sent to the AI model you selected, via OpenRouter. LukiFitti doesn't store the photo for this."))
            }
            Section {
                Button {
                    consentBusy = true
                    Task {
                        do {
                            let stamp = try await viewModel.store.apiClient.grantProgressTargetConsent()
                            var prefs = viewModel.store.preferences
                            prefs.progressAiConsentAt = stamp
                            viewModel.store.savePreferences(prefs)
                            step = .photo
                        } catch let consentError {
                            self.error = friendly(consentError, fallback: tr("Could not save consent. Please try again."))
                        }
                        consentBusy = false
                    }
                } label: {
                    consentBusy ? AnyView(ProgressView()) : AnyView(Text(tr("I understand, continue")))
                }
                .disabled(consentBusy)
                .accessibilityIdentifier("ios.progress.targetConsentAccept")
                if let error { Text(error).foregroundStyle(LukiColors.destructive).font(.footnote) }
            }
        }
    }

    private var frontPhotos: [ProgressPhotoDto] {
        viewModel.progress.checkIns
            .filter { $0.clientEntryId != ProgressPhotoStore.targetClientEntryId }
            .flatMap { $0.photos.filter { $0.pose == .FRONT && $0.kind == .PHOTO } }
    }

    private var photoView: some View {
        Form {
            Section {
                Picker(tr("Goal"), selection: $goal) {
                    Text(tr("Not set")).tag(BodyGoal?.none)
                    ForEach(BodyGoal.allCases, id: \.self) { g in
                        Text(goalLabel(g)).tag(Optional(g))
                    }
                }
                .onChange(of: goal) { _, g in
                    var prefs = viewModel.store.preferences
                    prefs.bodyGoal = g
                    viewModel.store.savePreferences(prefs)
                }
                Picker(tr("Horizon"), selection: $horizon) {
                    Text(tr("Not set")).tag(Int?.none)
                    ForEach([3, 6, 12], id: \.self) { m in
                        Text(tr("%d months", m)).tag(Optional(m))
                    }
                }
                .onChange(of: horizon) { _, m in
                    var prefs = viewModel.store.preferences
                    prefs.goalHorizonMonths = m
                    viewModel.store.savePreferences(prefs)
                }
            }
            Section {
                Text(tr("Front photo"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if frontPhotos.isEmpty {
                    Text(tr("Add a front photo to a check-in first."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(frontPhotos.prefix(6)) { photo in
                        Button {
                            refPhoto = photo
                            Task { await loadRef() }
                        } label: {
                            HStack {
                                if refPhoto?.id == photo.id {
                                    Image(systemName: "checkmark.circle.fill").foregroundStyle(LukiColors.accent)
                                } else {
                                    Image(systemName: "circle").foregroundStyle(.secondary)
                                }
                                Text(tr("Photo %d", frontPhotos.firstIndex(where: { $0.id == photo.id })! + 1))
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            Section {
                Button(tr("Generate target")) { Task { await generate() } }
                    .disabled(refPhoto == nil || goal == nil || horizon == nil)
                    .accessibilityIdentifier("ios.progress.targetGenerate")
            }
        }
    }

    private var generatingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text(tr("Creating your target image…"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var resultView: some View {
        Form {
            if let refImage, let resultImage {
                Section {
                    ZStack(alignment: .leading) {
                        Image(uiImage: resultImage).resizable().scaledToFit()
                        Image(uiImage: refImage).resizable().scaledToFit()
                            .mask(
                                GeometryReader { geo in
                                    Rectangle().frame(width: geo.size.width * slider)
                                }
                            )
                    }
                    .aspectRatio(2.0 / 3.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    Slider(value: $slider, in: 0...1)
                        .accessibilityLabel(tr("Compare before and after"))
                    Text(tr("Model: %@. AI-generated illustration, not a prediction.", resultModel))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            Section {
                Button(tr("Save to progress photos")) { Task { await save() } }
                    .accessibilityIdentifier("ios.progress.targetSave")
                Button(tr("Discard"), role: .destructive) { dismiss() }
            }
        }
    }

    private func goalLabel(_ g: BodyGoal) -> String {
        switch g {
        case .BUILD_MUSCLE: return tr("Build muscle")
        case .LOSE_FAT: return tr("Lose fat")
        case .RECOMP: return tr("Recomp")
        case .MAINTAIN: return tr("Maintain")
        }
    }

    private func loadRef() async {
        guard let photo = refPhoto else { return }
        if let data = await viewModel.progress.photoData(photo, isSignedIn: viewModel.isSignedIn) {
            refImage = UIImage(data: data)
        }
    }

    private func generate() async {
        guard let photo = refPhoto, let goal, let horizon else { return }
        if refImage == nil { await loadRef() }
        guard let refImage,
              let jpeg = downscaledJpeg(refImage) else {
            error = tr("The photo could not be read.")
            step = .photo
            return
        }
        step = .generating
        do {
            let res = try await viewModel.store.apiClient.generateProgressTarget(
                imageBase64: jpeg.base64EncodedString(),
                goal: goal,
                horizonMonths: horizon
            )
            resultModel = res.model
            resultImage = UIImage(data: Data(base64Encoded: res.imageBase64) ?? Data())
            step = .result
        } catch let genError {
            step = .photo
            error = friendly(genError)
        }
    }

    private func save() async {
        guard let resultImage, let jpeg = resultImage.jpegData(compressionQuality: 0.85),
              let goal, let horizon else { return }
        _ = await viewModel.progress.addTargetPhoto(
            data: jpeg, aiModel: resultModel, aiGoal: goal, aiHorizonMonths: horizon,
            isSignedIn: viewModel.isSignedIn
        )
        dismiss()
    }

    /// 1536 px long edge, JPEG 0.85.
    private func downscaledJpeg(_ image: UIImage) -> Data? {
        let maxEdge: CGFloat = 1536
        var size = image.size
        let longest = max(size.width, size.height)
        if longest > maxEdge {
            let scale = maxEdge / longest
            size = CGSize(width: size.width * scale, height: size.height * scale)
        }
        // Scale 1: the default renderer scale is the screen's (3x), which would triple the pixels.
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.jpegData(compressionQuality: 0.85)
    }

    private func friendly(_ err: Error, fallback: String? = nil) -> String {
        let text = String(describing: err)
        if text.contains("AI_KEY_REQUIRED") || text.contains("AI_KEY_MISSING") { return tr("Add your OpenRouter key in the profile first.") }
        if text.contains("AGE_RESTRICTED") { return tr("This feature is only available to adults.") }
        if text.contains("AI_QUOTA_EXCEEDED") { return tr("Daily AI limit reached. Try again tomorrow.") }
        if text.contains("FEATURE_DISABLED") || text.contains("AI_PROGRESS_TARGET") { return tr("This feature is currently disabled.") }
        if text.contains("AI_KEY_INVALID") { return tr("OpenRouter rejected the API key. Check it in your profile.") }
        if text.contains("AI_KEY_NO_CREDITS") { return tr("The OpenRouter account has insufficient credits.") }
        return fallback ?? tr("Could not create the target image. Please try again.")
    }
}
