import SwiftUI
import LukiFittiModels

/// How to do an exercise: picture, muscles and numbered steps. Opened from the running workout
/// and the library, so it never needs anything beyond the catalog entry.
public struct ExerciseGuideSheet: View {
    /// Catalog entry; `nil` when the exercise is no longer in the catalog.
    let exercise: ExerciseDto?
    let fallbackName: String
    let fallbackMuscle: MuscleGroup
    let historySessions: [WorkoutSessionDto]
    let weightUnit: WeightUnit
    /// Resolves the alternatives; empty hides them.
    let catalog: [ExerciseDto]

    public init(
        exercise: ExerciseDto?,
        fallbackName: String? = nil,
        fallbackMuscle: MuscleGroup? = nil,
        historySessions: [WorkoutSessionDto],
        weightUnit: WeightUnit,
        catalog: [ExerciseDto] = []
    ) {
        self.exercise = exercise
        self.fallbackName = exercise?.name ?? fallbackName ?? ""
        self.fallbackMuscle = exercise?.primaryMuscleGroup ?? fallbackMuscle ?? .FULL_BODY
        self.historySessions = historySessions
        self.weightUnit = weightUnit
        self.catalog = catalog
    }

    public var body: some View {
        NavigationStack {
            page(exercise: exercise, name: fallbackName, muscle: fallbackMuscle)
                // Tapping an alternative pushes its guide; Back returns to this one.
                .navigationDestination(for: ExerciseDto.self) { alternative in
                    page(exercise: alternative, name: alternative.name, muscle: alternative.primaryMuscleGroup)
                }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func page(exercise: ExerciseDto?, name: String, muscle: MuscleGroup) -> some View {
        ExerciseGuidePage(
            exercise: exercise,
            fallbackName: name,
            fallbackMuscle: muscle,
            historySessions: historySessions,
            weightUnit: weightUnit,
            catalog: catalog
        )
        .id(exercise?.id ?? name)
    }
}

private struct ExerciseGuidePage: View {
    let exercise: ExerciseDto?
    let fallbackName: String
    let fallbackMuscle: MuscleGroup
    let historySessions: [WorkoutSessionDto]
    let weightUnit: WeightUnit
    let catalog: [ExerciseDto]

    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    var body: some View {
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
                    LateralityBadge(exercise?.laterality)
                }

                if let description = exercise?.description, !description.isEmpty {
                    Text(description)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                musclesCard

                steps

                ExerciseHistorySection(
                    exerciseId: exercise?.id,
                    exerciseName: fallbackName,
                    exerciseType: exercise?.exerciseType,
                    historySessions: historySessions,
                    weightUnit: weightUnit
                )
                .padding(.top, 4)

                alternativesSection
            }
            .padding(16)
        }
        .background(LukiColors.groupedBackground)
        .navigationTitle(tr("How to do it"))
        #if !os(macOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(tr("Done")) { dismiss() }
                    .accessibilityIdentifier("ios.exerciseGuide.doneButton")
            }
        }
        .accessibilityIdentifier("ios.exerciseGuide.sheet")
    }

    private var muscleLine: String {
        var parts = [LukiI18n.muscleLabel(fallbackMuscle, locale: tr)]
        if let exercise {
            parts.append(LukiI18n.equipmentLabel(exercise.equipment, locale: tr))
            parts.append(LukiI18n.exerciseTypeLabel(exercise.exerciseType, locale: tr))
        }
        return parts.joined(separator: " · ")
    }

    // MARK: - Muscles & links

    private var musclesCard: some View {
        let secondary = (exercise?.secondaryMuscleGroups ?? []).filter { $0 != fallbackMuscle }
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.title2)
                    .foregroundStyle(LukiColors.accent)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(LukiColors.accent.opacity(0.14)))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(tr("Muscles"))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(tr("Main: %@", LukiI18n.muscleLabel(fallbackMuscle, locale: tr)))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LukiColors.accent)
                    if !secondary.isEmpty {
                        Text(tr("Secondary: %@", secondary.map { LukiI18n.muscleLabel($0, locale: tr) }.joined(separator: ", ")))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { linkButtons }
                VStack(alignment: .leading, spacing: 8) { linkButtons }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LukiColors.cardBackground))
        .accessibilityIdentifier("ios.exerciseGuide.muscles")
    }

    @ViewBuilder
    private var linkButtons: some View {
        if let url = ExerciseExternalLinks.youtube(name: fallbackName, exercise: exercise) {
            linkButton(tr("Watch on YouTube"), systemImage: "play.rectangle.fill", url: url)
                .accessibilityIdentifier("ios.exerciseGuide.youtubeLink")
        }
        if let url = ExerciseExternalLinks.muscleWiki(name: fallbackName) {
            linkButton(tr("Open MuscleWiki"), systemImage: "figure.arms.open", url: url)
                .accessibilityIdentifier("ios.exerciseGuide.muscleWikiLink")
        }
    }

    /// `Link` hands the URL to the system, so it opens in the browser / YouTube app, not in-app.
    private func linkButton(_ title: String, systemImage: String, url: URL) -> some View {
        Link(destination: url) {
            HStack(spacing: 6) {
                Image(systemName: systemImage).foregroundStyle(LukiColors.accent)
                Text(title).lineLimit(1)
                Image(systemName: "arrow.up.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.primary)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Capsule().fill(LukiColors.fill))
            .fixedSize()
        }
        .accessibilityHint(tr("Opens outside the app"))
    }

    // MARK: - Alternatives

    @ViewBuilder
    private var alternativesSection: some View {
        let alternatives = (exercise?.alternativeExerciseIds ?? []).compactMap { id in catalog.first { $0.id == id } }
        if !alternatives.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(tr("Alternatives"))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                ForEach(alternatives) { alt in
                    NavigationLink(value: alt) {
                        HStack(spacing: 12) {
                            ExerciseThumbnailView(exercise: alt, compact: true)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(alt.name)
                                    .font(.subheadline.bold())
                                    .foregroundStyle(.primary)
                                    .multilineTextAlignment(.leading)
                                Text("\(LukiI18n.muscleLabel(alt.primaryMuscleGroup, locale: tr)) · \(LukiI18n.equipmentLabel(alt.equipment, locale: tr))")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(.tertiary)
                                .accessibilityHidden(true)
                        }
                        .padding(10)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(LukiColors.cardBackground))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ios.exerciseGuide.alternative.\(alt.id)")
                }
            }
            .padding(.top, 4)
        }
    }

    // MARK: - Media

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var frames: [CGImage]?
    @State private var framesFailed = false
    @State private var manualFrameIndex = 0
    /// Loops start ↔ finish until the person picks a frame or pauses (never with Reduce Motion).
    @State private var isPlaying = true

    private var frameCaptions: [String] {
        [tr("Start position"), tr("Finish position")]
    }

    @ViewBuilder
    private var media: some View {
        if let frames, !frames.isEmpty {
            VStack(spacing: 8) {
                frameView
                    .frame(maxHeight: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .accessibilityLabel("\(fallbackName), \(frameCaptions[min(1, displayedFrameIndex)])")
                if frames.count > 1 { frameStrip(frames) }
            }
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

    private var loops: Bool { isPlaying && !reduceMotion && (frames?.count ?? 0) >= 2 }

    @ViewBuilder
    private var frameView: some View {
        if !loops {
            // Paused or Reduce Motion: no auto loop — tap toggles start/finish.
            framePane(displayedFrameIndex)
                .onTapGesture {
                    manualFrameIndex = (manualFrameIndex + 1) % (frames?.count ?? 1)
                }
        } else {
            // ~1.1 s per frame like the web detail variant.
            TimelineView(.periodic(from: .now, by: 1.1)) { context in
                let idx = Int(context.date.timeIntervalSinceReferenceDate / 1.1) % frames!.count
                ZStack {
                    framePane(idx)
                        .transition(.opacity)
                        .id(idx)
                }
                .animation(.easeInOut(duration: 0.35), value: idx)
                .onTapGesture {
                    manualFrameIndex = idx
                    isPlaying = false
                }
            }
        }
    }

    private func framePane(_ idx: Int) -> some View {
        Image(decorative: frames![idx], scale: 1)
            .resizable()
            .scaledToFit()
            .overlay(alignment: .topLeading) {
                Label(tr("Preview"), systemImage: "sparkles")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LukiColors.accentForeground)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(LukiColors.accent))
                    .padding(8)
                    .accessibilityHidden(true)
            }
            .overlay(alignment: .bottomLeading) {
                Text(frameCaptions[min(1, idx)])
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(.regularMaterial))
                    .padding(8)
                    .accessibilityHidden(true)
            }
            .overlay(alignment: .topTrailing) {
                if !reduceMotion, (frames?.count ?? 0) >= 2 {
                    Button {
                        isPlaying.toggle()
                    } label: {
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.primary)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(.regularMaterial))
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(2)
                    .accessibilityLabel(isPlaying ? tr("Pause preview") : tr("Play preview"))
                    .accessibilityIdentifier("ios.exerciseGuide.previewToggle")
                }
            }
    }

    /// Start and finish side by side; tapping one pauses on it, like the web frame strip.
    private func frameStrip(_ frames: [CGImage]) -> some View {
        HStack(spacing: 8) {
            ForEach(Array(frames.prefix(2).enumerated()), id: \.offset) { idx, frame in
                let selected = !loops && displayedFrameIndex == idx
                Button {
                    manualFrameIndex = idx
                    isPlaying = false
                } label: {
                    Image(decorative: frame, scale: 1)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity)
                        .frame(height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(selected ? LukiColors.accent : .clear, lineWidth: 2)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(frameCaptions[min(1, idx)])
                .accessibilityAddTraits(selected ? .isSelected : [])
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
