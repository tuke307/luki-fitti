import SwiftUI
import LukiFittiModels
import LukiFittiDomain

extension ExerciseSearchIndex {
    /// Catalog search index with muscle group and equipment labels in every language.
    public static func catalogWithLabels(_ exercises: [ExerciseDto]) -> ExerciseSearchIndex {
        .catalog(exercises) { ex in
            [SupportedLocale.en, .de].flatMap { locale in
                [LukiI18n.muscleLabel(ex.primaryMuscleGroup, locale: locale),
                 LukiI18n.equipmentLabel(ex.equipment, locale: locale)]
            }
        }
    }
}

/// Searchable Exercise Picker sheet matching `apps/web/components/gym/exercise-picker.tsx`: ranked,
/// typo-tolerant search by English/German name, alias, muscle group or equipment, plus muscle chips.
public struct SearchableExercisePickerSheet: View {
    public let title: String
    public let exercises: [ExerciseDto]
    public let selectedExerciseId: String?
    public let onSelect: (ExerciseDto) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var searchText: String = ""
    @State private var selectedMuscle: MuscleGroup?
    @State private var searchIndex: ExerciseSearchIndex?

    public init(
        title: String = "Select Exercise",
        exercises: [ExerciseDto],
        selectedExerciseId: String? = nil,
        onSelect: @escaping (ExerciseDto) -> Void
    ) {
        self.title = title
        self.exercises = exercises
        self.selectedExerciseId = selectedExerciseId
        self.onSelect = onSelect
    }

    private var filteredExercises: [ExerciseDto] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let matches = query.isEmpty
            ? exercises
            : (searchIndex ?? .catalogWithLabels(exercises)).search(query).map(\.exercise)
        guard let selectedMuscle else { return matches }
        return matches.filter { $0.primaryMuscleGroup == selectedMuscle }
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search Bar + Muscle Group Filter Chips
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                        TextField("Search exercises by name, muscle or equipment…", text: $searchText)
                            #if !os(macOS)
                            .textInputAutocapitalization(.never)
                            #endif
                            .autocorrectionDisabled()
                        if !searchText.isEmpty {
                            Button {
                                searchText = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.fill))

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Button {
                                selectedMuscle = nil
                            } label: {
                                Text("All Muscles (\(exercises.count))")
                                    .font(.footnote.weight(.medium))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(
                                        Capsule().fill(selectedMuscle == nil ? LukiColors.accent : LukiColors.fill)
                                    )
                                    .foregroundStyle(selectedMuscle == nil ? LukiColors.accentForeground : .primary)
                            }
                            .buttonStyle(.plain)

                            ForEach(MuscleGroup.allCases, id: \.self) { muscle in
                                Button {
                                    selectedMuscle = muscle
                                } label: {
                                    Text(LukiI18n.muscleLabel(muscle))
                                        .font(.footnote.weight(.medium))
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(
                                            Capsule().fill(selectedMuscle == muscle ? LukiColors.accent : LukiColors.fill)
                                        )
                                        .foregroundStyle(selectedMuscle == muscle ? LukiColors.accentForeground : .primary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(12)
                .background(LukiColors.cardBackground)

                // Filtered Exercise Results
                ScrollView {
                    LazyVStack(spacing: 8) {
                        if filteredExercises.isEmpty {
                            VStack(spacing: 6) {
                                Image(systemName: "magnifyingglass")
                                    .font(.title2)
                                    .foregroundStyle(.secondary)
                                Text("No matching exercises found")
                                    .font(.subheadline.bold())
                                    .foregroundStyle(.primary)
                            }
                            .padding(.top, 40)
                        } else {
                            ForEach(filteredExercises) { ex in
                                let isSelected = ex.id == selectedExerciseId
                                Button {
                                    onSelect(ex)
                                    dismiss()
                                } label: {
                                    HStack(spacing: 12) {
                                        ExerciseVectorVisualView(
                                            exerciseName: ex.name,
                                            primaryMuscle: ex.primaryMuscleGroup,
                                            compact: true
                                        )

                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(ex.name)
                                                .font(.subheadline.bold())
                                                .foregroundStyle(isSelected ? LukiColors.accent : .primary)
                                                .multilineTextAlignment(.leading)

                                            Text("\(LukiI18n.muscleLabel(ex.primaryMuscleGroup)) • \(LukiI18n.equipmentLabel(ex.equipment))")
                                                .font(.footnote)
                                                .foregroundStyle(.secondary)
                                        }

                                        Spacer()

                                        if isSelected {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundStyle(LukiColors.accent)
                                        }
                                    }
                                    .padding(10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 12)
                                            .fill(isSelected ? LukiColors.accent.opacity(0.14) : LukiColors.cardBackground)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(12)
                }
                .background(LukiColors.groupedBackground)
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            // Build the search index once per catalog instead of on every keystroke.
            .task(id: exercises.count) { searchIndex = .catalogWithLabels(exercises) }
        }
    }
}
