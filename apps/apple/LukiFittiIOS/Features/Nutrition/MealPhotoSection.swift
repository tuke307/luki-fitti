import SwiftUI
import PhotosUI
import UIKit
import LukiFittiModels
import LukiFittiDesign
import LukiFittiAPI

/// Photos and a written description of the meal inside the editor, plus the AI estimate.
/// Without photos the description alone proposes foods; with photos it is sent as a hint.
struct MealPhotoSection: View {
    let savedPhotos: [MealPhotoDto]
    let mealLabel: String
    let timeLabel: String
    let isOnline: Bool
    let busy: Bool
    let api: APIClient
    /// Estimates from the picked photos (or from the text alone when there are none); returns an
    /// optional error, whether it succeeded, the cost and the model's main assumptions.
    let onEstimate: (_ images: [UIImage], _ hint: String) async -> EstimateResult
    let onDeleteSaved: (MealPhotoDto) async -> Bool
    @Binding var picked: [LocalPhoto]
    @Binding var showsCamera: Bool
    @Binding var viewerStart: ViewerStart?

    @Environment(\.lukiLocale) private var tr
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var hint = ""
    @State private var message: String?
    @State private var lastUsage: AiRunUsageDto?
    @State private var note: String?

    struct EstimateResult {
        var message: String?
        var success: Bool
        var usage: AiRunUsageDto?
        var note: String?
    }

    struct LocalPhoto: Identifiable {
        let id = UUID().uuidString
        let image: UIImage
    }

    struct ViewerStart: Identifiable { let id: String }

    static func items(saved: [MealPhotoDto], picked: [LocalPhoto]) -> [MealPhotoItem] {
        saved.map { .saved($0) } + picked.map { .local(id: $0.id, image: $0.image) }
    }

    private var items: [MealPhotoItem] {
        Self.items(saved: savedPhotos, picked: picked)
    }

    private var isFull: Bool { picked.count >= MealPhotoSheet.maxPhotos }
    private var textOnly: Bool { picked.isEmpty }
    private var trimmedHint: String { hint.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canEstimate: Bool {
        !busy && isOnline && (!textOnly || trimmedHint.count >= MealTextAnalysisRequestDto.minLength)
    }

    var body: some View {
        Section {
            if !items.isEmpty { strip }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { pickButtons }
                VStack(alignment: .leading, spacing: 10) { pickButtons }
            }
            .onChange(of: pickerItems) { _, items in Task { await load(items) } }
            TextField(
                textOnly ? tr("Describe your meal") : tr("Anything to add? (optional)"),
                text: $hint,
                prompt: Text(textOnly
                    ? tr("e.g. muesli for breakfast, about 100 g, with 1/4 scoop protein powder, oat milk and a cappuccino")
                    : tr("Anything to add? (optional)")),
                axis: .vertical
            )
            .lineLimit(1...4)
            .disabled(busy || !isOnline)
            .onChange(of: hint) { _, value in
                if value.count > MealTextAnalysisRequestDto.maxLength {
                    hint = String(value.prefix(MealTextAnalysisRequestDto.maxLength))
                }
            }
            .accessibilityLabel(textOnly ? tr("Describe your meal") : tr("Anything to add? (optional)"))
            .accessibilityIdentifier("ios.nutrition.photoHint")
            if !textOnly || !trimmedHint.isEmpty {
                Button {
                    Task { await estimate() }
                } label: {
                    HStack {
                        if busy { ProgressView() } else { Image(systemName: "sparkles") }
                        Text(busy ? tr("Looking at your meal…") : tr("Estimate with AI"))
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canEstimate)
                .accessibilityIdentifier("ios.nutrition.estimateButton")
            }
            if let note {
                Text(note).font(.footnote).foregroundStyle(.secondary)
            }
            if let lastUsage {
                AICostLabel(usage: lastUsage)
                    .accessibilityIdentifier("ios.nutrition.aiCostLabel")
            }
            if !isOnline {
                Text(tr("You need to be online to estimate with AI."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if textOnly && savedPhotos.isEmpty {
                Text(tr("Without photos, AI suggests foods from your description. You can edit them before saving."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if !savedPhotos.isEmpty && picked.isEmpty {
                Text(tr("New photos re-estimate the meal. Foods you added yourself are kept."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let message {
                Text(message).font(.footnote).foregroundStyle(LukiColors.destructive)
            }
        } header: {
            Text(tr("Photos or description"))
        }
    }

    private var strip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    Button {
                        viewerStart = ViewerStart(id: item.id)
                    } label: {
                        MealPhotoImage(item: item, api: api)
                            .frame(width: 84, height: 84)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(tr("Photo %d of %d, %@, %@", index + 1, items.count, mealLabel, timeLabel))
                    .accessibilityIdentifier("ios.nutrition.photoThumbnail")
                    .overlay(alignment: .topTrailing) {
                        if case .local(let id, _) = item {
                            Button {
                                picked.removeAll { $0.id == id }
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .symbolRenderingMode(.palette)
                                    .foregroundStyle(.white, .black.opacity(0.6))
                                    .frame(width: 44, height: 44, alignment: .topTrailing)
                            }
                            .accessibilityLabel(tr("Remove photo %d", index + 1))
                            .disabled(busy)
                        }
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private var pickButtons: some View {
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            Button {
                showsCamera = true
            } label: {
                Label(tr("Take photo"), systemImage: "camera").frame(minHeight: 44)
            }
            .buttonStyle(.bordered)
            .disabled(busy || isFull || !isOnline)
            .accessibilityIdentifier("ios.nutrition.takePhotoButton")
        }
        let chooseTitle = savedPhotos.isEmpty ? tr("Choose photos") : tr("Add photo")
        PhotosPicker(
            selection: $pickerItems,
            maxSelectionCount: max(1, MealPhotoSheet.maxPhotos - picked.count),
            matching: .images
        ) {
            Label(chooseTitle, systemImage: "photo.on.rectangle").frame(minHeight: 44)
        }
        .buttonStyle(.bordered)
        .disabled(busy || isFull || !isOnline)
        .accessibilityIdentifier("ios.nutrition.choosePhotosButton")
    }

    private func load(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        for item in items where picked.count < MealPhotoSheet.maxPhotos {
            if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                picked.append(LocalPhoto(image: image))
            }
        }
        pickerItems = []
    }

    private func estimate() async {
        message = nil
        let result = await onEstimate(picked.map(\.image), trimmedHint)
        message = result.message
        if let usage = result.usage { lastUsage = usage }
        if result.success {
            note = result.note
            picked = []
            hint = ""
        }
    }
}
