import SwiftUI
import LukiFittiModels
import LukiFittiDesign

/// Searchable Exercise Picker sheet matching `apps/web/components/gym/exercise-picker.tsx`:
/// supports instant filtering by English/German exercise name, muscle group chips, equipment, or German alias tags.
public struct SearchableExercisePickerSheet: View {
    public let title: String
    public let exercises: [ExerciseDto]
    public let selectedExerciseId: String?
    public let onSelect: (ExerciseDto) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var searchText: String = ""
    @State private var selectedMuscle: MuscleGroup?

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
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return exercises.filter { ex in
            if let selectedMuscle, ex.primaryMuscleGroup != selectedMuscle {
                return false
            }
            guard !query.isEmpty else { return true }
            if ex.name.lowercased().contains(query) { return true }
            if ex.slug.lowercased().contains(query) { return true }
            if ex.tags.contains(where: { $0.lowercased().contains(query) }) { return true }
            if LukiI18n.muscleLabel(ex.primaryMuscleGroup, locale: .en).lowercased().contains(query) { return true }
            if LukiI18n.muscleLabel(ex.primaryMuscleGroup, locale: .de).lowercased().contains(query) { return true }
            if LukiI18n.equipmentLabel(ex.equipment, locale: .en).lowercased().contains(query) { return true }
            if LukiI18n.equipmentLabel(ex.equipment, locale: .de).lowercased().contains(query) { return true }
            return false
        }
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search Bar + Muscle Group Filter Chips
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                        TextField("Search 130+ exercises by name, muscle, or DE alias...", text: $searchText)
                            .textInputAutocapitalization(.never)
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
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.08)))

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Button {
                                selectedMuscle = nil
                            } label: {
                                Text("All Muscles (\(exercises.count))")
                                    .font(.caption2.bold())
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(
                                        Capsule().fill(selectedMuscle == nil ? LukiColors.neonLime : Color.white.opacity(0.08))
                                    )
                                    .foregroundStyle(selectedMuscle == nil ? .black : .white)
                            }
                            .buttonStyle(.plain)

                            ForEach(MuscleGroup.allCases, id: \.self) { muscle in
                                Button {
                                    selectedMuscle = muscle
                                } label: {
                                    Text(LukiI18n.muscleLabel(muscle))
                                        .font(.caption2.bold())
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(
                                            Capsule().fill(selectedMuscle == muscle ? LukiColors.neonLime : Color.white.opacity(0.08))
                                        )
                                        .foregroundStyle(selectedMuscle == muscle ? .black : .white)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(12)
                .background(LukiColors.darkCard)

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
                                    .foregroundStyle(.white)
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
                                                .foregroundStyle(isSelected ? LukiColors.neonLime : .white)
                                                .multilineTextAlignment(.leading)

                                            Text("\(LukiI18n.muscleLabel(ex.primaryMuscleGroup)) • \(LukiI18n.equipmentLabel(ex.equipment))")
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }

                                        Spacer()

                                        if isSelected {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundStyle(LukiColors.neonLime)
                                        }
                                    }
                                    .padding(10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 12)
                                            .fill(isSelected ? LukiColors.neonLime.opacity(0.14) : LukiColors.darkCard)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(12)
                }
                .background(LukiColors.darkBackground)
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
