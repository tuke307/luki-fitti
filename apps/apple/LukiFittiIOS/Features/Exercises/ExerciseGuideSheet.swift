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

    @Environment(\.lukiLocale) private var tr
    @Environment(\.dismiss) private var dismiss

    init(exercise: ExerciseDto?, fallbackName: String? = nil, fallbackMuscle: MuscleGroup? = nil) {
        self.exercise = exercise
        self.fallbackName = exercise?.name ?? fallbackName ?? ""
        self.fallbackMuscle = exercise?.primaryMuscleGroup ?? fallbackMuscle ?? .FULL_BODY
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
                    }

                    if let description = exercise?.description, !description.isEmpty {
                        Text(description)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    steps
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

    /// First photo from the catalog when there is one, otherwise the drawn start/finish poses.
    private var imageURL: URL? {
        guard let item = exercise?.media?.first(where: { ["IMAGE", "GIF"].contains($0.mediaType) }),
              let url = URL(string: item.url),
              url.scheme == "https" else { return nil }
        return url
    }

    @ViewBuilder
    private var media: some View {
        if let imageURL {
            AsyncImage(url: imageURL) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                } else {
                    vectorVisual
                }
            }
            .frame(maxHeight: 220)
            .accessibilityLabel(fallbackName)
        } else {
            vectorVisual
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
