import SwiftUI
import LukiFittiModels
import LukiFittiDesign

/// Create or edit a stretching routine, mirroring the web "New Routine" dialog: name, target
/// area, description and timed stretches (sets × hold, transition).
struct StretchingRoutineEditorSheet: View {
    /// `nil` creates a new routine.
    let routine: StretchingRoutineDto?
    let catalog: [ExerciseDto]
    let historySessions: [WorkoutSessionDto]
    let weightUnit: WeightUnit
    let onSave: (StretchingRoutineDto) -> Void
    let onDelete: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var name: String
    @State private var targetArea: String
    @State private var details: String
    @State private var items: [StretchingRoutineExerciseDto]
    @State private var pickingItemId: String?
    @State private var addingStretch = false
    @State private var confirmingDelete = false

    init(
        routine: StretchingRoutineDto?,
        catalog: [ExerciseDto],
        historySessions: [WorkoutSessionDto],
        weightUnit: WeightUnit,
        onSave: @escaping (StretchingRoutineDto) -> Void,
        onDelete: (() -> Void)? = nil
    ) {
        self.routine = routine
        self.catalog = catalog
        self.historySessions = historySessions
        self.weightUnit = weightUnit
        self.onSave = onSave
        self.onDelete = onDelete
        _name = State(initialValue: routine?.name ?? "")
        _targetArea = State(initialValue: routine?.targetArea ?? "")
        _details = State(initialValue: routine?.description ?? "")
        // A new routine starts with one stretch, like the web.
        let first = catalog.first { $0.exerciseType == .STRETCHING }
        _items = State(initialValue: routine?.exercises ?? first.map {
            [Self.item(for: $0, routineId: "new", orderIndex: 0)]
        } ?? [])
    }

    private static func item(for exercise: ExerciseDto, routineId: String, orderIndex: Int) -> StretchingRoutineExerciseDto {
        StretchingRoutineExerciseDto(
            routineId: routineId,
            exerciseId: exercise.id,
            orderIndex: orderIndex,
            sets: 2,
            durationSeconds: exercise.recommendedDurationSeconds ?? 45,
            transitionSeconds: 15,
            exercise: exercise
        )
    }

    /// Stretches first, then everything else (a routine may mix in mobility drills).
    private var pickerCatalog: [ExerciseDto] {
        catalog.filter { $0.exerciseType == .STRETCHING } + catalog.filter { $0.exerciseType != .STRETCHING }
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSave: Bool { !trimmedName.isEmpty && trimmedName.count <= 100 && !items.isEmpty }
    private var estimateMinutes: Int {
        Int((Double(StretchingRoutineDto.estimatedSeconds(items)) / 60).rounded())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(tr("Evening Hip Mobility"), text: $name)
                        .textInputAutocapitalization(.sentences)
                        .accessibilityLabel(tr("Name"))
                        .accessibilityIdentifier("ios.routineEditor.name")
                    TextField(tr("Full Body & Mobility"), text: $targetArea)
                        .accessibilityLabel(tr("Target Area"))
                        .accessibilityIdentifier("ios.routineEditor.targetArea")
                    TextField(tr("Description (optional)"), text: $details, axis: .vertical)
                        .lineLimit(1...4)
                        .accessibilityIdentifier("ios.routineEditor.description")
                } footer: {
                    Text(tr("Build a stretching routine with timed holds."))
                }

                Section {
                    ForEach($items) { $item in
                        itemRow($item)
                    }
                    .onDelete { items.remove(atOffsets: $0) }
                    .onMove { items.move(fromOffsets: $0, toOffset: $1) }

                    Button {
                        addingStretch = true
                    } label: {
                        Label(tr("Add Stretch"), systemImage: "plus.circle.fill")
                    }
                    .accessibilityIdentifier("ios.routineEditor.addStretch")
                } header: {
                    Text(tr("Stretches"))
                } footer: {
                    Text(items.isEmpty ? tr("Add at least one stretch.") : tr("About %d min", max(1, estimateMinutes)))
                        .accessibilityIdentifier("ios.routineEditor.estimate")
                }

                if let onDelete {
                    Section {
                        Button(tr("Delete Routine"), role: .destructive) { confirmingDelete = true }
                            .frame(maxWidth: .infinity)
                            .accessibilityIdentifier("ios.routineEditor.delete")
                            .confirmationDialog(
                                tr("Delete this routine?"),
                                isPresented: $confirmingDelete,
                                titleVisibility: .visible
                            ) {
                                Button(tr("Delete Routine"), role: .destructive) {
                                    onDelete()
                                    dismiss()
                                }
                                Button(tr("Cancel"), role: .cancel) {}
                            } message: {
                                Text(tr("%@ will be removed. Stretching sessions you already did stay in your history.", trimmedName))
                            }
                    }
                }
            }
            .navigationTitle(routine == nil ? tr("New Routine") : tr("Edit Routine"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Save")) { save() }
                        .disabled(!canSave)
                        .accessibilityIdentifier("ios.routineEditor.save")
                }
            }
            .sheet(isPresented: $addingStretch) {
                picker(selected: nil) { exercise in
                    items.append(Self.item(for: exercise, routineId: routine?.id ?? "new", orderIndex: items.count))
                }
            }
            .sheet(item: Binding(
                get: { pickingItemId.map(PickingItem.init) },
                set: { pickingItemId = $0?.id }
            )) { picking in
                picker(selected: items.first { $0.id == picking.id }?.exerciseId) { exercise in
                    guard let idx = items.firstIndex(where: { $0.id == picking.id }) else { return }
                    items[idx].exerciseId = exercise.id
                    items[idx].exercise = exercise
                    if exercise.exerciseType == .STRETCHING, let hold = exercise.recommendedDurationSeconds {
                        items[idx].durationSeconds = hold
                    }
                }
            }
        }
        .accessibilityIdentifier("ios.routineEditor.sheet")
    }

    private struct PickingItem: Identifiable { let id: String }

    private func picker(selected: String?, onSelect: @escaping (ExerciseDto) -> Void) -> some View {
        SearchableExercisePickerSheet(
            title: tr("Add Stretch"),
            exercises: pickerCatalog,
            selectedExerciseId: selected,
            historySessions: historySessions,
            weightUnit: weightUnit,
            onSelect: onSelect
        )
    }

    private func itemRow(_ item: Binding<StretchingRoutineExerciseDto>) -> some View {
        let exercise = item.wrappedValue.exercise ?? catalog.first { $0.id == item.wrappedValue.exerciseId }
        let index = (items.firstIndex { $0.id == item.wrappedValue.id } ?? 0) + 1
        return VStack(alignment: .leading, spacing: 8) {
            Button {
                pickingItemId = item.wrappedValue.id
            } label: {
                HStack(spacing: 10) {
                    ExerciseThumbnailView(exercise: exercise, fallbackName: tr("Stretch"), compact: true)
                    Text("\(index). \(exercise?.name ?? tr("Stretch"))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.footnote)
                        .foregroundStyle(.tertiary)
                        .accessibilityHidden(true)
                }
            }
            .buttonStyle(.plain)
            .accessibilityHint(tr("Change Exercise"))
            .accessibilityIdentifier("ios.routineEditor.item.\(index)")

            Stepper(value: item.sets, in: 1...10) {
                LabeledContent(tr("Sets"), value: "\(item.wrappedValue.sets)")
            }
            Stepper(value: Binding(
                get: { item.wrappedValue.durationSeconds ?? 45 },
                set: { item.wrappedValue.durationSeconds = $0 }
            ), in: 10...600, step: 5) {
                LabeledContent(tr("Hold"), value: tr("%d s", item.wrappedValue.durationSeconds ?? 45))
            }
            Stepper(value: item.transitionSeconds, in: 0...120, step: 5) {
                LabeledContent(tr("Transition"), value: tr("%d s", item.wrappedValue.transitionSeconds))
            }
        }
        .padding(.vertical, 4)
    }

    private func save() {
        guard canSave else { return }
        let trimmedDetails = details.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedArea = targetArea.trimmingCharacters(in: .whitespacesAndNewlines)
        var next = routine ?? StretchingRoutineDto(name: trimmedName)
        next.name = String(trimmedName.prefix(100))
        next.targetArea = trimmedArea.isEmpty ? "Full Body & Mobility" : String(trimmedArea.prefix(80))
        next.description = trimmedDetails.isEmpty ? nil : String(trimmedDetails.prefix(500))
        next.exercises = items
        onSave(next)
        dismiss()
    }
}
