import SwiftUI
import LukiFittiModels

/// Exercise photo thumbnail with the exact outer size of `ExerciseVectorVisualView`: neutral fill
/// while loading, first catalog frame once decoded, vector visual as placeholder/fallback.
/// Decorative only — the row's text carries the meaning.
public struct ExerciseThumbnailView: View {
    public let exercise: ExerciseDto?
    public let fallbackName: String
    public let fallbackMuscle: MuscleGroup
    public let compact: Bool

    @State private var phase: Phase = .loading

    private enum Phase {
        case loading
        case loaded(Image)
        case failed
    }

    public init(
        exercise: ExerciseDto?,
        fallbackName: String? = nil,
        fallbackMuscle: MuscleGroup? = nil,
        compact: Bool = false
    ) {
        self.exercise = exercise
        self.fallbackName = exercise?.name ?? fallbackName ?? ""
        self.fallbackMuscle = exercise?.primaryMuscleGroup ?? fallbackMuscle ?? .FULL_BODY
        self.compact = compact
    }

    private var urls: [URL] { ExerciseMediaFrames.imageURLs(for: exercise) }
    private var size: CGSize { ExerciseVectorVisualView.outerSize(compact: compact) }
    private var radius: CGFloat { ExerciseVectorVisualView.cornerRadius(compact: compact) }
    private var pixelSize: Int { Int(max(size.width, size.height)) * 3 }

    public var body: some View {
        Group {
            switch phase {
            case .loading where urls.isEmpty, .failed:
                vectorFallback
            case .loading:
                placeholder
            case .loaded(let image):
                image
                    .resizable()
                    .scaledToFill()
                    .frame(width: size.width, height: size.height)
                    .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            }
        }
        .accessibilityHidden(true)
        .task(id: urls.first) {
            // Reset before the guard so a reused row can't keep the previous exercise's photo.
            phase = .loading
            guard let url = urls.first else { return }
            do {
                let cgImage = try await ExerciseImageLoader.shared.image(for: url, maxPixelSize: pixelSize)
                phase = .loaded(Image(decorative: cgImage, scale: 1))
            } catch is CancellationError {
                return
            } catch {
                phase = .failed
            }
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(LukiColors.fill)
            .frame(width: size.width, height: size.height)
    }

    private var vectorFallback: some View {
        ExerciseVectorVisualView(
            exerciseName: fallbackName,
            primaryMuscle: fallbackMuscle,
            compact: compact
        )
    }
}
