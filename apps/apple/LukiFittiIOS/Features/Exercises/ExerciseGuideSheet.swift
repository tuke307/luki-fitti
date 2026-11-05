import SwiftUI
import LukiFittiModels
import LukiFittiDesign

/// How to do an exercise: picture, muscles and numbered steps. Opened from the running workout
/// and the library, so it never needs anything beyond the catalog entry.
struct ExerciseGuideSheet: View {
    /// Catalog entry; `nil` when the exercise is no longer in the catalog.
    let exercise: ExerciseDto?
    let fallbackName: String
    let fallbackMuscle: MuscleGroup
    let historySessions: [WorkoutSessionDto]
    let weightUnit: WeightUnit

    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    init(
        exercise: ExerciseDto?,
        fallbackName: String? = nil,
        fallbackMuscle: MuscleGroup? = nil,
        historySessions: [WorkoutSessionDto],
        weightUnit: WeightUnit
    ) {
        self.exercise = exercise
        self.fallbackName = exercise?.name ?? fallbackName ?? ""
        self.fallbackMuscle = exercise?.primaryMuscleGroup ?? fallbackMuscle ?? .FULL_BODY
        self.historySessions = historySessions
        self.weightUnit = weightUnit
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    media
                        .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 6) {
                        Text(fallbackName)
                            .font(.title2.bold())
                            .foregroundStyle(.primary)
                            .accessibilityAddTraits(.isHeader)
                        Text(muscleLine)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        if let secondary = secondaryLine {
                            Text(secondary)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        LateralityBadge(exercise?.laterality)
                    }

                    if let description = exercise?.description, !description.isEmpty {
                        Text(description)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    steps

                    ExerciseHistorySection(
                        exerciseId: exercise?.id,
                        exerciseName: fallbackName,
                        exerciseType: exercise?.exerciseType,
                        historySessions: historySessions,
                        weightUnit: weightUnit
                    )
                    .padding(.top, 4)
                }
                .padding(16)
            }
            .background(LukiColors.groupedBackground)
            .navigationTitle(tr("How to do it"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Done")) { dismiss() }
                        .accessibilityIdentifier("ios.exerciseGuide.doneButton")
                }
            }
            .accessibilityIdentifier("ios.exerciseGuide.sheet")
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var muscleLine: String {
        var parts = [LukiI18n.muscleLabel(fallbackMuscle, locale: tr)]
        if let exercise {
            parts.append(LukiI18n.equipmentLabel(exercise.equipment, locale: tr))
        }
        return parts.joined(separator: " · ")
    }

    private var secondaryLine: String? {
        guard let secondary = exercise?.secondaryMuscleGroups, !secondary.isEmpty else { return nil }
        let labels = secondary.map { LukiI18n.muscleLabel($0, locale: tr) }.joined(separator: ", ")
        return tr("Also works: %@", labels)
    }

    // MARK: - Media

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var frames: [CGImage]?
    @State private var framesFailed = false
    @State private var manualFrameIndex = 0

    private var frameCaptions: [String] {
        [tr("Start position"), tr("Finish position")]
    }

    @ViewBuilder
    private var media: some View {
        if let frames, !frames.isEmpty {
            frameView
                .frame(maxHeight: 220)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .accessibilityLabel("\(fallbackName), \(frameCaptions[min(1, displayedFrameIndex)])")
        } else if framesFailed {
            vectorVisual
        } else {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(LukiColors.fill)
                .frame(maxWidth: .infinity, maxHeight: 220)
                .accessibilityHidden(true)
                .task(id: ExerciseMediaFrames.imageURLs(for: exercise).map(\.absoluteString).joined()) {
                    await loadFrames()
                }
        }
    }

    private var displayedFrameIndex: Int {
        guard let frames, !frames.isEmpty else { return 0 }
        return min(manualFrameIndex, frames.count - 1)
    }

    @ViewBuilder
    private var frameView: some View {
        if reduceMotion || (frames?.count ?? 0) < 2 {
            // Reduce Motion: no auto loop — tap toggles start/finish.
            Image(decorative: frames![displayedFrameIndex], scale: 1)
                .resizable()
                .scaledToFit()
                .onTapGesture {
                    manualFrameIndex = (manualFrameIndex + 1) % (frames?.count ?? 1)
                }
        } else {
            // ~1.1 s per frame like the web detail variant.
            TimelineView(.periodic(from: .now, by: 1.1)) { context in
                let idx = Int(context.date.timeIntervalSinceReferenceDate / 1.1) % frames!.count
                ZStack {
                    Image(decorative: frames![idx], scale: 1)
                        .resizable()
                        .scaledToFit()
                        .transition(.opacity)
                        .id(idx)
                }
                .animation(.easeInOut(duration: 0.35), value: idx)
                .onTapGesture { manualFrameIndex = idx }
            }
        }
    }

    private func loadFrames() async {
        let urls = ExerciseMediaFrames.imageURLs(for: exercise)
        guard !urls.isEmpty else {
            framesFailed = true
            return
        }
        var loaded: [CGImage] = []
        for url in urls.prefix(2) {
            do {
                loaded.append(try await ExerciseImageLoader.shared.image(for: url, maxPixelSize: 1024))
            } catch is CancellationError {
                return
            } catch {
                break
            }
        }
        if loaded.isEmpty {
            framesFailed = true
        } else {
            frames = loaded
        }
    }

    private var vectorVisual: some View {
        ExerciseVectorVisualView(exerciseName: fallbackName, primaryMuscle: fallbackMuscle)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var steps: some View {
        let instructions = exercise?.instructions.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty } ?? []
        if instructions.isEmpty {
            Text(tr("No steps for this exercise yet."))
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LukiColors.cardBackground))
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(instructions.enumerated()), id: \.offset) { idx, step in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("\(idx + 1)")
                            .font(.footnote.bold().monospacedDigit())
                            .foregroundStyle(LukiColors.accentForeground)
                            .frame(minWidth: 24, minHeight: 24)
                            .background(Circle().fill(LukiColors.accent))
                        Text(step)
                            .font(.callout)
                            .foregroundStyle(.primary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LukiColors.cardBackground))
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("ios.exerciseGuide.step.\(idx + 1)")
                }
            }
        }
    }
}
