import SwiftUI
import PhotosUI
import UIKit
import LukiFittiModels
import LukiFittiDesign
import LukiFittiAPI
import LukiFittiStore

/// Pick or take up to five photos of one meal; the server estimates foods, portions and macros.
struct MealPhotoSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    let day: Date
    let onAnalyzed: (MealEntryDto) -> Void

    static let maxPhotos = 5

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var images: [UIImage] = []
    @State private var hint = ""
    @State private var busy = false
    @State private var error: String?
    @State private var showsCamera = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(tr("Add up to %d photos of the same meal. Different angles help.", Self.maxPhotos))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if !images.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(Array(images.enumerated()), id: \.offset) { index, image in
                                    Image(uiImage: image)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 84, height: 84)
                                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        .overlay(alignment: .topTrailing) {
                                            Button {
                                                images.remove(at: index)
                                            } label: {
                                                Image(systemName: "xmark.circle.fill")
                                                    .symbolRenderingMode(.palette)
                                                    .foregroundStyle(.white, .black.opacity(0.6))
                                            }
                                            .accessibilityLabel(tr("Remove photo %d", index + 1))
                                            .disabled(busy)
                                        }
                                }
                            }
                        }
                    }
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button {
                            showsCamera = true
                        } label: {
                            Label(tr("Take photo"), systemImage: "camera")
                        }
                        .disabled(busy || images.count >= Self.maxPhotos)
                    }
                    PhotosPicker(
                        selection: $pickerItems,
                        maxSelectionCount: max(1, Self.maxPhotos - images.count),
                        matching: .images
                    ) {
                        Label(tr("Add photos"), systemImage: "photo.on.rectangle")
                    }
                    .disabled(busy || images.count >= Self.maxPhotos)
                }

                Section(tr("Anything to add? (optional)")) {
                    TextField(tr("e.g. about 200 g rice, cooked in olive oil"), text: $hint, axis: .vertical)
                        .lineLimit(2...4)
                        .disabled(busy)
                }

                if let error {
                    Section { Text(error).foregroundStyle(LukiColors.destructive) }
                }
            }
            .navigationTitle(tr("Estimate from photos"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { dismiss() }.disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView().accessibilityLabel(tr("Looking at your meal…"))
                    } else {
                        Button(tr("Estimate")) { Task { await analyze() } }
                            .disabled(images.isEmpty)
                    }
                }
            }
            .interactiveDismissDisabled(busy)
            .onChange(of: pickerItems) { _, items in
                Task { await load(items) }
            }
            .fullScreenCover(isPresented: $showsCamera) {
                CameraPicker { image in
                    if images.count < Self.maxPhotos { images.append(image) }
                }
                .ignoresSafeArea()
            }
        }
    }

    private func load(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        for item in items where images.count < Self.maxPhotos {
            if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                images.append(image)
            }
        }
        pickerItems = []
    }

    private func analyze() async {
        guard viewModel.store.currentUser != nil else {
            error = tr("You need to be online to estimate from photos.")
            return
        }
        busy = true
        error = nil
        defer { busy = false }
        let jpegs = images.compactMap { Self.uploadJPEG($0) }
        let hm = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let eatenAt = Calendar.current.date(bySettingHour: hm.hour ?? 12, minute: hm.minute ?? 0, second: 0, of: day) ?? Date()
        do {
            let result = try await viewModel.store.apiClient.analyzeMeal(
                jpegPhotos: jpegs,
                clientEntryId: NutritionStore.newClientId(),
                eatenAt: eatenAt,
                mealType: nil,
                hint: hint.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            onAnalyzed(result.entry)
            dismiss()
        } catch {
            self.error = Self.message(for: error, tr)
        }
    }

    /// Bounded JPEG (≤ 2048 px). Re-encoding from pixels drops EXIF, including GPS location.
    static func uploadJPEG(_ image: UIImage) -> Data? {
        let maxEdge: CGFloat = 2048
        let scale = min(1, maxEdge / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return rendered.jpegData(compressionQuality: 0.85)
    }

    static func message(for error: Error, _ tr: SupportedLocale) -> String {
        switch error as? APIClientError {
        case .offline: return tr("You need to be online to estimate from photos.")
        case .forbidden: return tr("This feature isn’t turned on for your account.")
        case .serverError(429, _): return tr("You’ve reached today’s limit. Try again tomorrow.")
        case .serverError(400, let msg): return msg
        default: return tr("The assistant isn’t available right now. Try again in a moment.")
        }
    }
}

/// Minimal camera capture wrapper (SwiftUI has no native camera picker).
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
