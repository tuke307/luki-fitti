import SwiftUI
import UIKit
import LukiFittiModels
import LukiFittiDesign
import LukiFittiAPI

/// Shared helpers for meal photo upload; the UI lives in `MealPhotoSection` inside the meal editor.
enum MealPhotoSheet {
    static let maxPhotos = 5

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
