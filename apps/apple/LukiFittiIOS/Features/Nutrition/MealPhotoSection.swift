import SwiftUI
import PhotosUI
import UIKit
import LukiFittiModels
import LukiFittiDesign
import LukiFittiAPI

/// Photos of the meal inside the editor: saved photos, newly picked ones and the AI estimate.
struct MealPhotoSection: View {
    let savedPhotos: [MealPhotoDto]
    let mealLabel: String
    let timeLabel: String
    let isOnline: Bool
    let busy: Bool
    let api: APIClient
    /// Uploads the picked photos; returns an optional note/error and whether the estimate succeeded.
    let onEstimate: (_ images: [UIImage], _ hint: String) async -> (message: String?, success: Bool, usage: AiRunUsageDto?)
    let onDeleteSaved: (MealPhotoDto) async -> Bool

    @Environment(\.lukiLocale) private var tr
    @State private var picked: [LocalPhoto] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var hint = ""
    @State private var message: String?
    @State private var lastUsage: AiRunUsageDto?
    @State private var showsCamera = false
    @State private var viewerStart: ViewerStart?

    struct LocalPhoto: Identifiable {
        let id = UUID().uuidString
        let image: UIImage
    }

    private struct ViewerStart: Identifiable { let id: String }

    private var items: [MealPhotoItem] {
        savedPhotos.map { .saved($0) } + picked.map { .local(id: $0.id, image: $0.image) }
    }

    private var isFull: Bool { picked.count >= MealPhotoSheet.maxPhotos }

    var body: some View {
        Section {
            if !items.isEmpty { strip }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { pickButtons }
                VStack(alignment: .leading, spacing: 10) { pickButtons }
            }
            if !picked.isEmpty {
                TextField(tr("Anything to add? (optional)"), text: $hint, axis: .vertical)
                    .lineLimit(1...4)
                    .disabled(busy)
                    .accessibilityIdentifier("ios.nutrition.photoHint")
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
                .disabled(busy || !isOnline)
                .accessibilityIdentifier("ios.nutrition.estimateButton")
            }
            if let lastUsage {
                AICostLabel(usage: lastUsage)
                    .accessibilityIdentifier("ios.nutrition.aiCostLabel")
            }
            if !isOnline {
                Text(tr("You need to be online to estimate from photos."))
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
            Text(tr("Photos"))
        }
        .onChange(of: pickerItems) { _, items in Task { await load(items) } }
        .fullScreenCover(isPresented: $showsCamera) {
            CameraPicker { image in
                if picked.count < MealPhotoSheet.maxPhotos { picked.append(LocalPhoto(image: image)) }
            }
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $viewerStart) { start in
            MealPhotoViewer(
                items: items,
                startAt: start.id,
                mealLabel: mealLabel,
                timeLabel: timeLabel,
                api: api,
                onDelete: isOnline ? onDeleteSaved : nil
            )
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
        let result = await onEstimate(picked.map(\.image), hint.trimmingCharacters(in: .whitespacesAndNewlines))
        message = result.message
        if let usage = result.usage { lastUsage = usage }
        if result.success {
            picked = []
            hint = ""
        }
    }
}
