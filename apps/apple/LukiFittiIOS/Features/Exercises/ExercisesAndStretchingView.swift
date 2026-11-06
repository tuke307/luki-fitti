import SwiftUI
import LukiFittiModels
import LukiFittiDomain
import LukiFittiDesign

public struct ExercisesAndStretchingView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var activeSubTab: String = "catalog"
    @State private var searchQuery: String = ""
    @State private var selectedMuscle: MuscleGroup?
    @State private var selectedType: ExerciseType?
    @State private var selectedEquipment: EquipmentType?
    @State private var searchIndex: ExerciseSearchIndex?
    @State private var guideExercise: ExerciseDto?
    @State private var showsCustomExercise = false
    @State private var guideAfterCustomExercise: ExerciseDto?
    @State private var selectedArea: String?
    @State private var expandedRoutineIds: Set<String> = []
    @State private var routineEditor: RoutineEditorTarget?
    @State private var routinePendingDelete: StretchingRoutineDto?
    @Environment(\.lukiLocale) private var tr

    /// `routine == nil` creates one.
    private struct RoutineEditorTarget: Identifiable {
        let id = UUID()
        let routine: StretchingRoutineDto?
    }

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            // Lazy so only visible rows (each with two Canvas poses) are built; the catalog has 1000+.
            LazyVStack(alignment: .leading, spacing: 16) {
                Picker(tr("Library"), selection: $activeSubTab) {
                    Text(tr("Exercises (%d)", viewModel.store.catalog.count)).tag("catalog")
                    Text(tr("Stretching (%d)", viewModel.store.stretchingRoutines.count)).tag("stretching")
                }
                .pickerStyle(.segmented)

                if activeSubTab == "catalog" {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                        TextField(tr("Search exercises"), text: $searchQuery)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        if !searchQuery.isEmpty {
                            Button {
                                searchQuery = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                                    .frame(minWidth: 44, minHeight: 44)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(tr("Clear search"))
                        }
                    }
                    .padding(.horizontal, 10)
                    .frame(minHeight: 44)
                    .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.cardBackground))

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Button {
                                selectedMuscle = nil
                            } label: {
                                Text(tr("All Muscles"))
                                    .font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 14)
                                    .frame(minHeight: 44)
                                    .background(Capsule().fill(selectedMuscle == nil ? LukiColors.accent : LukiColors.cardBackground))
                                    .foregroundStyle(selectedMuscle == nil ? LukiColors.accentForeground : .primary)
                            }
                            .buttonStyle(.plain)

                            ForEach(MuscleGroup.allCases, id: \.self) { muscle in
                                Button {
                                    selectedMuscle = muscle
                                } label: {
                                    Text(LukiI18n.muscleLabel(muscle, locale: tr))
                                        .font(.subheadline.weight(.semibold))
                                        .padding(.horizontal, 14)
                                        .frame(minHeight: 44)
                                        .background(Capsule().fill(selectedMuscle == muscle ? LukiColors.accent : LukiColors.cardBackground))
                                        .foregroundStyle(selectedMuscle == muscle ? LukiColors.accentForeground : .primary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    activeFilterChips

                    if filteredExercises.isEmpty {
                        ContentUnavailableView(
                            tr("No results"),
                            systemImage: "dumbbell",
                            description: Text(tr("Try a different search or clear the filters."))
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                        .accessibilityIdentifier("ios.library.noResults")
                    }

                    ForEach(filteredExercises) { exercise in
                        Button {
                            guideExercise = exercise
                        } label: {
                            HStack(spacing: 12) {
                                ExerciseThumbnailView(
                                    exercise: exercise,
                                    fallbackMuscle: exercise.primaryMuscleGroup,
                                    compact: true
                                )
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(exercise.name)
                                        .font(.subheadline.bold())
                                        .foregroundStyle(.primary)
                                        .multilineTextAlignment(.leading)
                                    Text("\(LukiI18n.muscleLabel(exercise.primaryMuscleGroup, locale: tr)) · \(LukiI18n.equipmentLabel(exercise.equipment, locale: tr))")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                        .multilineTextAlignment(.leading)
                                    if exercise.exerciseType != .STRETCHING { LateralityBadge(exercise.laterality) }
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(.tertiary)
                                    .accessibilityHidden(true)
                            }
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint(tr("How to do it"))
                        .accessibilityIdentifier("ios.library.exerciseRow.\(exercise.id)")
                    }
                } else {
                    areaChips

                    ForEach(filteredRoutines) { routine in
                        routineCard(routine)
                    }
                }
            }
            .padding(16)
        }
        .background(LukiColors.groupedBackground)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if activeSubTab == "catalog" {
                    filterMenu
                    Button {
                        showsCustomExercise = true
                    } label: {
                        Label(tr("New Exercise"), systemImage: "plus")
                    }
                    .accessibilityIdentifier("ios.library.addExerciseButton")
                } else {
                    Button {
                        routineEditor = RoutineEditorTarget(routine: nil)
                    } label: {
                        Label(tr("New Routine"), systemImage: "plus")
                    }
                    .accessibilityIdentifier("ios.library.addRoutineButton")
                }
            }
        }
        .sheet(item: $guideExercise) { exercise in
            ExerciseGuideSheet(
                exercise: exercise,
                historySessions: viewModel.store.historySessions,
                weightUnit: viewModel.store.preferences.weightUnit,
                catalog: viewModel.store.catalog
            )
        }
        .sheet(isPresented: $showsCustomExercise, onDismiss: {
            // Opened once the form is gone; two sheets can't animate at once.
            guideExercise = guideAfterCustomExercise
            guideAfterCustomExercise = nil
        }) {
            CustomExerciseSheet(
                catalog: viewModel.store.catalog,
                onSave: { draft in
                    let created = viewModel.createCustomExercise(draft)
                    // Show the new exercise: drop filters that would hide it.
                    searchQuery = ""
                    selectedMuscle = nil
                    selectedType = nil
                    selectedEquipment = nil
                    guideAfterCustomExercise = created
                },
                onShowExisting: { existing in
                    guideAfterCustomExercise = existing
                    showsCustomExercise = false
                }
            )
        }
        .sheet(item: $routineEditor) { target in
            StretchingRoutineEditorSheet(
                routine: target.routine,
                catalog: viewModel.store.catalog,
                historySessions: viewModel.store.historySessions,
                weightUnit: viewModel.store.preferences.weightUnit,
                onSave: { viewModel.saveStretchingRoutine($0) },
                onDelete: target.routine.map { routine in { viewModel.deleteStretchingRoutine(id: routine.id) } }
            )
        }
        .confirmationDialog(
            tr("Delete this routine?"),
            isPresented: Binding(get: { routinePendingDelete != nil }, set: { if !$0 { routinePendingDelete = nil } }),
            titleVisibility: .visible,
            presenting: routinePendingDelete
        ) { routine in
            Button(tr("Delete Routine"), role: .destructive) {
                viewModel.deleteStretchingRoutine(id: routine.id)
            }
            .accessibilityIdentifier("ios.library.confirmDeleteRoutine")
            Button(tr("Cancel"), role: .cancel) {}
        } message: { routine in
            Text(tr("%@ will be removed. Stretching sessions you already did stay in your history.", routine.name))
        }
        .onChange(of: viewModel.store.stretchingRoutines.map(\.targetArea)) { _, areas in
            if let selectedArea, !areas.contains(selectedArea) { self.selectedArea = nil }
        }
        // Build the search index once per catalog instead of on every keystroke.
        .task(id: viewModel.store.catalog.count) {
            let catalog = viewModel.store.catalog
            searchIndex = await Task.detached(priority: .userInitiated) {
                ExerciseSearchIndex.catalogWithLabels(catalog)
            }.value
        }
    }

    private var filteredExercises: [ExerciseDto] {
        let catalog = viewModel.store.catalog
        let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let matches = q.isEmpty
            ? catalog
            : (searchIndex ?? .catalogWithLabels(catalog)).search(q).map(\.exercise)
        guard selectedMuscle != nil || selectedType != nil || selectedEquipment != nil else { return matches }
        return matches.filter {
            (selectedMuscle == nil || $0.primaryMuscleGroup == selectedMuscle)
                && (selectedType == nil || $0.exerciseType == selectedType)
                && (selectedEquipment == nil || $0.equipment == selectedEquipment)
        }
    }

    // MARK: - Type & equipment filters

    private var hasTypeOrEquipmentFilter: Bool { selectedType != nil || selectedEquipment != nil }

    private var filterMenu: some View {
        Menu {
            Picker(selection: $selectedType) {
                Text(tr("All Types")).tag(ExerciseType?.none)
                ForEach(ExerciseType.allCases, id: \.self) {
                    Text(LukiI18n.exerciseTypeLabel($0, locale: tr)).tag(ExerciseType?.some($0))
                }
            } label: {
                Label(tr("Type"), systemImage: "figure.strengthtraining.traditional")
                Text(selectedType.map { LukiI18n.exerciseTypeLabel($0, locale: tr) } ?? tr("All Types"))
            }
            .pickerStyle(.menu)

            Picker(selection: $selectedEquipment) {
                Text(tr("All Equipment")).tag(EquipmentType?.none)
                ForEach(EquipmentType.allCases, id: \.self) {
                    Text(LukiI18n.equipmentLabel($0, locale: tr)).tag(EquipmentType?.some($0))
                }
            } label: {
                Label(tr("Equipment"), systemImage: "dumbbell")
                Text(selectedEquipment.map { LukiI18n.equipmentLabel($0, locale: tr) } ?? tr("All Equipment"))
            }
            .pickerStyle(.menu)

            if hasTypeOrEquipmentFilter {
                Button(tr("Clear filters"), systemImage: "xmark.circle", role: .destructive) {
                    selectedType = nil
                    selectedEquipment = nil
                }
            }
        } label: {
            Label(
                tr("Filter"),
                systemImage: hasTypeOrEquipmentFilter
                    ? "line.3.horizontal.decrease.circle.fill"
                    : "line.3.horizontal.decrease.circle"
            )
        }
        .accessibilityValue(hasTypeOrEquipmentFilter ? tr("On") : tr("Off"))
        .accessibilityIdentifier("ios.library.filterMenu")
    }

    /// The type/equipment filters from the toolbar menu, removable in place.
    @ViewBuilder
    private var activeFilterChips: some View {
        if hasTypeOrEquipmentFilter {
            HStack(spacing: 8) {
                if let selectedType {
                    removableChip(LukiI18n.exerciseTypeLabel(selectedType, locale: tr), id: "type") { self.selectedType = nil }
                }
                if let selectedEquipment {
                    removableChip(LukiI18n.equipmentLabel(selectedEquipment, locale: tr), id: "equipment") { self.selectedEquipment = nil }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func removableChip(_ title: String, id: String, onRemove: @escaping () -> Void) -> some View {
        Button(action: onRemove) {
            HStack(spacing: 6) {
                Text(title)
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(LukiColors.accent)
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .background(Capsule().fill(LukiColors.accent.opacity(0.14)))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tr("Remove filter %@", title))
        .accessibilityIdentifier("ios.library.activeFilter.\(id)")
    }

    // MARK: - Stretching

    private var routineAreas: [String] {
        var seen = Set<String>()
        return viewModel.store.stretchingRoutines.map(\.targetArea).filter { seen.insert($0).inserted }
    }

    private var filteredRoutines: [StretchingRoutineDto] {
        let routines = viewModel.store.stretchingRoutines
        guard let selectedArea else { return routines }
        return routines.filter { $0.targetArea == selectedArea }
    }

    @ViewBuilder
    private var areaChips: some View {
        if routineAreas.count > 1 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    areaChip(tr("All"), selected: selectedArea == nil, id: "all") { selectedArea = nil }
                    ForEach(routineAreas, id: \.self) { area in
                        areaChip(area, selected: selectedArea == area, id: area) { selectedArea = area }
                    }
                }
            }
        }
    }

    private func areaChip(_ title: String, selected: Bool, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .frame(minHeight: 44)
                .background(Capsule().fill(selected ? LukiColors.accent : LukiColors.cardBackground))
                .foregroundStyle(selected ? LukiColors.accentForeground : .primary)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("ios.library.areaChip.\(id)")
    }

    private func routineCard(_ routine: StretchingRoutineDto) -> some View {
        let minutes = max(1, Int((Double(routine.estimatedDurationSeconds) / 60).rounded()))
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(routine.targetArea)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LukiColors.accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(LukiColors.accent.opacity(0.14)))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(tr("~%d min", minutes))
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(tr("About %d min", minutes))
                    .accessibilityIdentifier("ios.library.routineDuration.\(routine.id)")
                Menu {
                    Button(tr("Edit"), systemImage: "pencil") {
                        routineEditor = RoutineEditorTarget(routine: routine)
                    }
                    Button(tr("Delete"), systemImage: "trash", role: .destructive) {
                        routinePendingDelete = routine
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 44, height: 32)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(tr("More actions for %@", routine.name))
                .accessibilityIdentifier("ios.library.routineMenu.\(routine.id)")
            }
            Text(routine.name)
                .font(.headline)
                .foregroundStyle(.primary)
            if let desc = routine.description {
                Text(desc).font(.caption).foregroundStyle(.secondary)
            }

            if !routine.exercises.isEmpty {
                stepsDisclosure(routine)
            }

            Button {
                viewModel.startStretchingSession(from: routine, sourceDevice: .IPHONE)
            } label: {
                Label(tr("Start"), systemImage: "figure.cooldown")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityLabel(tr("Start %@", routine.name))
            .accessibilityIdentifier("ios.library.startRoutine.\(routine.id)")
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    /// Collapsed by default so Start stays in reach; expanding lists every stretch with its timing.
    private func stepsDisclosure(_ routine: StretchingRoutineDto) -> some View {
        let expanded = Binding(
            get: { expandedRoutineIds.contains(routine.id) },
            set: { if $0 { expandedRoutineIds.insert(routine.id) } else { expandedRoutineIds.remove(routine.id) } }
        )
        return DisclosureGroup(isExpanded: expanded) {
            VStack(spacing: 6) {
                ForEach(Array(routine.exercises.enumerated()), id: \.element.id) { idx, item in
                    stepRow(item, index: idx + 1)
                }
            }
            .padding(.top, 6)
        } label: {
            Text(tr("%d stretches", routine.exercises.count))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
        }
        .tint(.secondary)
        .accessibilityIdentifier("ios.library.routineSteps.\(routine.id)")
    }

    private func stepRow(_ item: StretchingRoutineExerciseDto, index: Int) -> some View {
        let exercise = item.exercise ?? viewModel.store.catalog.first { $0.id == item.exerciseId }
        return Button {
            guideExercise = exercise
        } label: {
            HStack(spacing: 10) {
                ExerciseThumbnailView(exercise: exercise, fallbackName: tr("Stretch"), compact: true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(index). \(exercise?.name ?? tr("Stretch"))")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if let notes = item.notes, !notes.isEmpty {
                        Text(notes)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 4)
                Text(Self.timing(item, tr: tr))
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(LukiColors.accent)
                    .fixedSize()
            }
            .padding(8)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(LukiColors.fill))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(exercise == nil)
        .accessibilityIdentifier("ios.library.routineStep.\(index)")
    }

    /// "2 × 60s (15s rest)", like the web routine card.
    static func timing(_ item: StretchingRoutineExerciseDto, tr: SupportedLocale) -> String {
        if let duration = item.durationSeconds {
            return tr("%d × %ds (%ds rest)", item.sets, duration, item.transitionSeconds)
        }
        return tr("%d × %d reps (%ds rest)", item.sets, item.reps ?? 0, item.transitionSeconds)
    }
}
