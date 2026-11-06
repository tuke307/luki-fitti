import SwiftUI
import LukiFittiModels
import LukiFittiDomain
import LukiFittiDesign

/// "New Exercise" form, mirroring the web custom-exercise dialog (`exercises-view.tsx`). Before
/// saving it points to catalog exercises that probably mean the same.
struct CustomExerciseSheet: View {
    let catalog: [ExerciseDto]
    let onSave: (ExerciseDto) -> Void
    /// The person picked an existing exercise from "Did you mean?" instead.
    let onShowExisting: (ExerciseDto) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var name = ""
    @State private var exerciseType: ExerciseType = .STRENGTH
    @State private var primaryMuscle: MuscleGroup = .CHEST
    @State private var secondaryMuscles: Set<MuscleGroup> = []
    @State private var equipment: EquipmentType = .DUMBBELL
    @State private var movementPattern: MovementPattern?
    @State private var oneSide = false
    @State private var holdSeconds = 45
    @State private var details = ""
    @State private var instructions = ""
    @State private var searchIndex: ExerciseSearchIndex?

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    /// The server needs 2–120 characters.
    private var canSave: Bool { (2...120).contains(trimmedName.count) }

    private var similarExercises: [ExerciseDto] {
        guard trimmedName.count >= 3, let searchIndex else { return [] }
        return searchIndex.search(trimmedName, limit: 3, matchAllWords: false).map(\.exercise)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(tr("e.g. Pendlay Row"), text: $name)
                        .textInputAutocapitalization(.words)
                        .accessibilityLabel(tr("Name"))
                        .accessibilityIdentifier("ios.customExercise.name")
                } header: {
                    Text(tr("Name"))
                } footer: {
                    Text(tr("Add your own exercise to use in any workout."))
                }

                if !similarExercises.isEmpty {
                    Section {
                        ForEach(similarExercises) { exercise in
                            Button {
                                onShowExisting(exercise)
                            } label: {
                                HStack(spacing: 12) {
                                    ExerciseThumbnailView(exercise: exercise, compact: true)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(exercise.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                                        Text("\(LukiI18n.muscleLabel(exercise.primaryMuscleGroup, locale: tr)) · \(LukiI18n.equipmentLabel(exercise.equipment, locale: tr))")
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .accessibilityIdentifier("ios.customExercise.similar.\(exercise.id)")
                        }
                    } header: {
                        Text(tr("Did you mean?"))
                    } footer: {
                        Text(tr("Not the right one? Just create it as your own exercise."))
                    }
                }

                Section {
                    Picker(tr("Exercise Type"), selection: $exerciseType) {
                        ForEach(ExerciseType.allCases, id: \.self) { Text(LukiI18n.exerciseTypeLabel($0, locale: tr)).tag($0) }
                    }
                    .accessibilityIdentifier("ios.customExercise.type")
                    Picker(tr("Primary Muscle"), selection: $primaryMuscle) {
                        ForEach(MuscleGroup.allCases, id: \.self) { Text(LukiI18n.muscleLabel($0, locale: tr)).tag($0) }
                    }
                    .accessibilityIdentifier("ios.customExercise.primaryMuscle")
                    Picker(tr("Equipment"), selection: $equipment) {
                        ForEach(EquipmentType.allCases, id: \.self) { Text(LukiI18n.equipmentLabel($0, locale: tr)).tag($0) }
                    }
                    .accessibilityIdentifier("ios.customExercise.equipment")
                    NavigationLink {
                        SecondaryMusclePicker(selection: $secondaryMuscles, excluded: primaryMuscle)
                    } label: {
                        LabeledContent(tr("Secondary Muscles"), value: secondaryLabel)
                    }
                    .accessibilityIdentifier("ios.customExercise.secondaryMuscles")
                }

                if exerciseType == .STRENGTH {
                    Section {
                        Picker(tr("Movement"), selection: $movementPattern) {
                            Text(tr("Not set")).tag(MovementPattern?.none)
                            ForEach(MovementPattern.allCases, id: \.self) {
                                Text(LukiI18n.movementPatternLabel($0, locale: tr)).tag(MovementPattern?.some($0))
                            }
                        }
                        .accessibilityIdentifier("ios.customExercise.movement")
                        Toggle(tr("One side at a time"), isOn: $oneSide)
                            .tint(LukiColors.accent)
                            .disabled(movementPattern == nil)
                            .accessibilityIdentifier("ios.customExercise.oneSide")
                    } footer: {
                        Text(tr("With a movement, the exercise shows up as an alternative for similar ones."))
                    }
                }

                if exerciseType == .STRETCHING {
                    Section {
                        Stepper(value: $holdSeconds, in: 10...600, step: 5) {
                            LabeledContent(tr("Hold"), value: tr("%d s", holdSeconds))
                        }
                        .accessibilityIdentifier("ios.customExercise.hold")
                    }
                }

                Section(tr("Description")) {
                    TextField(tr("Optional"), text: $details, axis: .vertical)
                        .lineLimit(2...5)
                        .accessibilityIdentifier("ios.customExercise.description")
                }

                Section {
                    TextField(tr("One step per line"), text: $instructions, axis: .vertical)
                        .lineLimit(3...10)
                        .accessibilityIdentifier("ios.customExercise.instructions")
                } header: {
                    Text(tr("Instructions"))
                }
            }
            .navigationTitle(tr("New Exercise"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Save")) { save() }
                        .disabled(!canSave)
                        .accessibilityIdentifier("ios.customExercise.save")
                }
            }
            .onChange(of: movementPattern) { _, pattern in if pattern == nil { oneSide = false } }
            .task {
                let system = catalog.filter(\.isSystem)
                searchIndex = await Task.detached(priority: .userInitiated) {
                    ExerciseSearchIndex.catalogWithLabels(system)
                }.value
            }
        }
        .accessibilityIdentifier("ios.customExercise.sheet")
    }

    private var secondaryLabel: String {
        let picked = MuscleGroup.allCases.filter { secondaryMuscles.contains($0) && $0 != primaryMuscle }
        return picked.isEmpty ? tr("None") : picked.map { LukiI18n.muscleLabel($0, locale: tr) }.joined(separator: ", ")
    }

    private func save() {
        guard canSave else { return }
        let isStretch = exerciseType == .STRETCHING
        let trimmedDetails = details.trimmingCharacters(in: .whitespacesAndNewlines)
        let usesMovement = exerciseType == .STRENGTH && movementPattern != nil
        onSave(ExerciseDto(
            id: "",
            slug: "",
            name: trimmedName,
            description: trimmedDetails.isEmpty ? "\(trimmedName) custom exercise" : trimmedDetails,
            instructions: instructions.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty },
            category: isStretch ? .STRETCH : .COMPOUND,
            exerciseType: exerciseType,
            primaryMuscleGroup: primaryMuscle,
            secondaryMuscleGroups: MuscleGroup.allCases.filter { secondaryMuscles.contains($0) && $0 != primaryMuscle },
            equipment: equipment,
            recommendedDurationSeconds: isStretch ? holdSeconds : nil,
            movementPattern: usesMovement ? movementPattern : nil,
            laterality: usesMovement ? (oneSide ? .UNILATERAL : .BILATERAL) : nil
        ))
        dismiss()
    }
}

private struct SecondaryMusclePicker: View {
    @Binding var selection: Set<MuscleGroup>
    let excluded: MuscleGroup
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        List(MuscleGroup.allCases.filter { $0 != excluded }, id: \.self) { muscle in
            Button {
                if selection.contains(muscle) { selection.remove(muscle) } else { selection.insert(muscle) }
            } label: {
                HStack {
                    Text(LukiI18n.muscleLabel(muscle, locale: tr)).foregroundStyle(.primary)
                    Spacer()
                    if selection.contains(muscle) {
                        Image(systemName: "checkmark").foregroundStyle(LukiColors.accent)
                    }
                }
            }
            .accessibilityAddTraits(selection.contains(muscle) ? .isSelected : [])
        }
        .navigationTitle(tr("Secondary Muscles"))
        .navigationBarTitleDisplayMode(.inline)
    }
}
