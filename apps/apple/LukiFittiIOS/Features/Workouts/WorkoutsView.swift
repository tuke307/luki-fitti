import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct WorkoutsView: View {
    @Bindable public var viewModel: LukiAppViewModel

    @State private var expandedFolderIds: Set<String> = []
    @State private var expandedTemplateIds: Set<String> = []
    @State private var isEditing = false

    // Folder Create / Rename Modal State
    @State private var showingFolderModal = false
    @State private var editingFolderId: String?
    @State private var folderName = ""
    @State private var folderColor = LukiColors.defaultFolderHex

    // Workout Template Builder Modal State
    @State private var activeBuilderContext: TemplateBuilderContext?

    fileprivate struct TemplateBuilderContext: Identifiable {
        let id: String
        let editingTemplateId: String?
        let initialName: String
        let initialDescription: String
        let initialFolderId: String
        let initialDurationMin: Int
        let initialExercises: [WorkoutTemplateExerciseDto]
    }

    // Delete Confirmation State
    @State private var deleteTarget: DeleteTarget?

    private struct DeleteTarget: Identifiable {
        let id: String
        let name: String
        let isFolder: Bool
    }

    private let folderAccentPalette = LukiColors.folderPaletteHex

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private var allFolderIds: [String] {
        var ids = viewModel.store.folders.map(\.id)
        if !viewModel.store.unfiledTemplates.isEmpty {
            ids.append("__unfiled__")
        }
        return ids
    }

    private var areAllExpanded: Bool {
        !allFolderIds.isEmpty && allFolderIds.allSatisfy { expandedFolderIds.contains($0) }
    }

    public var body: some View {
        List {
            if allFolderIds.count > 1, !isEditing {
                Section {
                    EmptyView()
                } header: {
                    HStack {
                        Text("Your plans, grouped by split.")
                            .textCase(nil)
                        Spacer()
                        Button(areAllExpanded ? "Collapse All" : "Expand All") {
                            expandedFolderIds = areAllExpanded ? [] : Set(allFolderIds)
                        }
                        .textCase(nil)
                        .font(.subheadline.weight(.medium))
                        .accessibilityIdentifier("ios.workouts.collapseAllButton")
                    }
                }
            }

            ForEach(Array(viewModel.store.folders.enumerated()), id: \.element.id) { idx, folder in
                Section {
                    folderHeaderRow(folder, index: idx)
                    if expandedFolderIds.contains(folder.id) {
                        if folder.templates.isEmpty {
                            Text("No workouts here yet.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(folder.templates) { templateRow($0) }
                        }
                        if isEditing {
                            Button {
                                openNewTemplateBuilder(defaultFolderId: folder.id)
                            } label: {
                                Label("Add Workout", systemImage: "plus.circle.fill")
                            }
                        }
                    }
                }
            }

            if !viewModel.store.unfiledTemplates.isEmpty {
                Section {
                    Button {
                        toggleFolder("__unfiled__")
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "tray")
                                .foregroundStyle(.secondary)
                            Text("Unfiled Workouts")
                                .font(.headline)
                                .foregroundStyle(.primary)
                            Spacer()
                            Text("\(viewModel.store.unfiledTemplates.count)")
                                .foregroundStyle(.secondary)
                            chevron(expanded: expandedFolderIds.contains("__unfiled__"))
                        }
                    }
                    if expandedFolderIds.contains("__unfiled__") {
                        ForEach(viewModel.store.unfiledTemplates) { templateRow($0) }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(14)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button(isEditing ? "Done" : "Edit") {
                    withAnimation { isEditing.toggle() }
                }
                .accessibilityIdentifier("ios.workouts.editToggle")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        openNewTemplateBuilder(defaultFolderId: viewModel.store.folders.first?.id)
                    } label: {
                        Label("New Workout", systemImage: "dumbbell")
                    }
                    .accessibilityIdentifier("ios.workouts.newWorkoutButton")
                    Button {
                        openCreateFolderModal()
                    } label: {
                        Label("New Folder", systemImage: "folder.badge.plus")
                    }
                    .accessibilityIdentifier("ios.workouts.newFolderButton")
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add")
                .accessibilityIdentifier("ios.workouts.addMenu")
            }
        }
        .sheet(isPresented: $showingFolderModal) {
            folderEditorSheet
        }
        .sheet(item: $activeBuilderContext) { context in
            TemplateBuilderSheetView(
                context: context,
                folders: viewModel.store.folders,
                catalog: viewModel.store.catalog,
                defaultWeightUnit: viewModel.store.preferences.weightUnit,
                onCancel: {
                    activeBuilderContext = nil
                },
                onSave: { name, desc, folderId, durationMin, exercises in
                    saveTemplateFromBuilder(
                        editingTemplateId: context.editingTemplateId,
                        name: name,
                        desc: desc,
                        folderId: folderId,
                        durationMin: durationMin,
                        exercises: exercises
                    )
                }
            )
        }
        .alert(
            deleteTarget?.isFolder == true ? "Delete folder?" : "Delete workout?",
            isPresented: Binding(
                get: { deleteTarget != nil },
                set: { if !$0 { deleteTarget = nil } }
            )
        ) {
            if let target = deleteTarget {
                Button("Cancel", role: .cancel) {
                    deleteTarget = nil
                }
                Button("Delete", role: .destructive) {
                    if target.isFolder {
                        deleteFolder(target.id)
                    } else {
                        deleteTemplate(target.id)
                    }
                    deleteTarget = nil
                }
            }
        } message: {
            if let target = deleteTarget {
                Text(
                    target.isFolder
                        ? "\"\(target.name)\" will be deleted. Its workouts move to Unfiled."
                        : "\"\(target.name)\" will be deleted. Your past workouts stay in History."
                )
            }
        }
    }

    // MARK: - Rows

    private func toggleFolder(_ id: String) {
        withAnimation(.smooth(duration: 0.25)) {
            if expandedFolderIds.contains(id) {
                expandedFolderIds.remove(id)
            } else {
                expandedFolderIds.insert(id)
            }
        }
    }

    private func chevron(expanded: Bool) -> some View {
        Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.tertiary)
            .rotationEffect(.degrees(expanded ? 90 : 0))
    }

    private func folderHeaderRow(_ folder: WorkoutFolderDto, index: Int) -> some View {
        HStack(spacing: 12) {
            if isEditing {
                Button(role: .destructive) {
                    deleteTarget = DeleteTarget(id: folder.id, name: folder.name, isFolder: true)
                } label: {
                    Image(systemName: "minus.circle.fill")
                        .foregroundStyle(.red)
                        .font(.title3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Delete folder \(folder.name)")
            }
            Button {
                toggleFolder(folder.id)
            } label: {
                HStack(spacing: 12) {
                    Circle()
                        .fill(LukiColors.folderColor(folder.color))
                        .frame(width: 12, height: 12)
                    Text(folder.name)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Spacer()
                    if !isEditing {
                        Text("\(folder.templates.count)")
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                        chevron(expanded: expandedFolderIds.contains(folder.id))
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ios.workouts.folder.\(folder.id)")
            if isEditing {
                Button { reorderFolder(folder.id, moveUp: true) } label: { Image(systemName: "arrow.up") }
                    .buttonStyle(.borderless)
                    .disabled(index == 0)
                Button { reorderFolder(folder.id, moveUp: false) } label: { Image(systemName: "arrow.down") }
                    .buttonStyle(.borderless)
                    .disabled(index == viewModel.store.folders.count - 1)
                Button { openRenameFolderModal(folder) } label: { Image(systemName: "pencil") }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Rename \(folder.name)")
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            Button { openRenameFolderModal(folder) } label: { Label("Rename", systemImage: "pencil") }
                .tint(.gray)
            Button { openNewTemplateBuilder(defaultFolderId: folder.id) } label: { Label("Add Workout", systemImage: "plus") }
                .tint(LukiColors.accent)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                deleteTarget = DeleteTarget(id: folder.id, name: folder.name, isFolder: true)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func templateRow(_ template: WorkoutTemplateDto) -> some View {
        let history = viewModel.store.historySessions.filter {
            $0.templateId == template.id || $0.workoutNameSnapshot.lowercased() == template.name.lowercased()
        }
        let lastText = history.first.map { "Last \(String($0.startedAt.prefix(10)))" } ?? "Never trained"
        let isExpanded = expandedTemplateIds.contains(template.id)

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Button {
                    withAnimation(.smooth(duration: 0.25)) {
                        if isExpanded { expandedTemplateIds.remove(template.id) } else { expandedTemplateIds.insert(template.id) }
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(template.name)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        Text("\(template.exercises.count) exercises · ~\(template.estimatedDurationMinutes ?? 60) min · \(lastText)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if isEditing {
                    Button { openEditTemplateBuilder(template) } label: { Image(systemName: "pencil") }
                        .buttonStyle(.borderless)
                } else {
                    Button {
                        viewModel.startSession(from: template, sourceDevice: .IPHONE)
                    } label: {
                        Image(systemName: "play.fill")
                    }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.circle)
                    .accessibilityLabel("Start \(template.name)")
                    .accessibilityIdentifier("ios.workouts.startTemplate.\(template.id)")
                }
            }
            if isExpanded {
                templateDetails(template)
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            Button { openEditTemplateBuilder(template) } label: { Label("Edit", systemImage: "pencil") }
                .tint(.gray)
            Button { duplicateTemplate(template) } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
                .tint(LukiColors.accent)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                deleteTarget = DeleteTarget(id: template.id, name: template.name, isFolder: false)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .contextMenu {
            Button { openEditTemplateBuilder(template) } label: { Label("Edit", systemImage: "pencil") }
            Button { duplicateTemplate(template) } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
            Menu {
                Button("Unfiled") { moveTemplate(template, toFolderId: nil) }
                ForEach(viewModel.store.folders) { f in
                    Button(f.name) { moveTemplate(template, toFolderId: f.id) }
                }
            } label: {
                Label("Move to", systemImage: "folder")
            }
            Divider()
            Button(role: .destructive) {
                deleteTarget = DeleteTarget(id: template.id, name: template.name, isFolder: false)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Template Card

    private func templateDetails(_ template: WorkoutTemplateDto) -> some View {
        return VStack(alignment: .leading, spacing: 10) {
            // Full ordered exercise list (Gymlife Superset Blocks & Standalone Rows)
            let blocks = ProgressionEngine.groupTemplateExercisesIntoBlocks(template.exercises)
            VStack(spacing: 8) {
                ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                    if block.isSuperset {
                        VStack(alignment: .leading, spacing: 0) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 4) {
                                        Text("Superset")
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(LukiColors.accent)
                                        Text("× \(block.rounds) ROUNDS")
                                            .font(.caption.weight(.heavy).monospacedDigit())
                                            .foregroundStyle(.primary)
                                    }
                                    Text("Rest 0 s between exercises · \(ProgressionEngine.formatRestDurationMinSec(block.roundRestSeconds)) between rounds")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(Color.black.opacity(0.65))

                            ForEach(Array(block.items.enumerated()), id: \.offset) { _, blockItem in
                                let ex = blockItem.item
                                let exInfo = ex.exercise ?? viewModel.store.catalog.first { $0.id == ex.exerciseId }
                                HStack(spacing: 8) {
                                    Text("\(blockItem.stepNumber)")
                                        .font(.footnote)
                                        .foregroundStyle(LukiColors.accent)
                                        .frame(width: 20, height: 20)
                                        .background(Circle().fill(Color.black))
                                    Text(exInfo?.name ?? "Exercise")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    Spacer()
                                    Text("\(ex.plannedSets)×\(ex.targetRepsMin ?? 8)-\(ex.targetRepsMax ?? 12)")
                                        .font(.footnote.monospacedDigit())
                                        .foregroundStyle(LukiColors.accent)
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 3)
                                        .background(RoundedRectangle(cornerRadius: 6).fill(LukiColors.accent.opacity(0.18)))
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                            }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(LukiColors.accent.opacity(0.45), lineWidth: 1)
                        )
                    } else if let firstItem = block.items.first {
                        let ex = firstItem.item
                        let idx = firstItem.globalIndex
                        let exInfo = ex.exercise ?? viewModel.store.catalog.first { $0.id == ex.exerciseId }
                        HStack(spacing: 8) {
                            Text("\(idx + 1).")
                                .font(.caption.bold().monospacedDigit())
                                .foregroundStyle(LukiColors.accent)
                            Text(exInfo?.name ?? "Exercise")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            Spacer()
                            if !ex.alternativeExerciseIds.isEmpty {
                                Text("+\(ex.alternativeExerciseIds.count) backup")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Text("\(ex.plannedSets)×\(ex.targetRepsMin ?? 8)-\(ex.targetRepsMax ?? 12)")
                                .font(.footnote.monospacedDigit())
                                .foregroundStyle(LukiColors.accent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(RoundedRectangle(cornerRadius: 6).fill(LukiColors.accent.opacity(0.16)))
                            Text("\(ex.restSeconds)s")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(RoundedRectangle(cornerRadius: 8).fill(LukiColors.fill))
                    }
                }

                // Rainbow Smart Exercise Suggestion (Max 1 per workout)
                if viewModel.store.preferences.exerciseSuggestionsEnabled,
                   let suggestion = ProgressionEngine.computeWorkoutExerciseSuggestion(
                       workoutName: template.name,
                       folderName: viewModel.store.folders.first { $0.id == template.folderId }?.name,
                       exercises: template.exercises.map {
                           WorkoutSuggestionInputExercise(exerciseId: $0.exerciseId, plannedSets: $0.plannedSets)
                       },
                       catalog: viewModel.store.catalog,
                       historySessions: viewModel.store.historySessions,
                       weightUnit: viewModel.store.preferences.weightUnit
                   ) {
                    SuggestionCardView(
                        suggestion: suggestion,
                        locale: SupportedLocale.resolve(viewModel.store.preferences.language),
                        compact: true
                    )
                    .accessibilityIdentifier("ios.workouts.rainbowSuggestion.\(template.id)")
                }
            }

        }
        .padding(.top, 4)
    }

    // MARK: - Folder Editor Sheet

    private var folderEditorSheet: some View {
        NavigationStack {
            Form {
                Section("Folder Details") {
                    TextField("Folder Name (e.g. 4er Split)", text: $folderName)
                }
                Section("Accent Color") {
                    HStack(spacing: 14) {
                        ForEach(folderAccentPalette, id: \.self) { hex in
                            Button {
                                folderColor = hex
                            } label: {
                                Circle()
                                    .fill(LukiColors.colorFromHex(hex))
                                    .frame(width: 30, height: 30)
                                    .overlay(
                                        Circle()
                                            .stroke(Color.primary, lineWidth: folderColor == hex ? 3 : 0)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle(editingFolderId == nil ? "Create Workout Folder" : "Rename Folder")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showingFolderModal = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save Folder") {
                        saveFolder()
                    }
                }
            }
        }
    }

    // MARK: - Actions & Persistence Helpers

    private func openCreateFolderModal() {
        editingFolderId = nil
        folderName = ""
        folderColor = LukiColors.defaultFolderHex
        showingFolderModal = true
    }

    private func openRenameFolderModal(_ folder: WorkoutFolderDto) {
        editingFolderId = folder.id
        folderName = folder.name
        folderColor = LukiColors.resolveFolderHex(folder.color)
        showingFolderModal = true
    }

    private func saveFolder() {
        let trimmed = folderName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var folders = viewModel.store.folders
        if let editingFolderId,
           let idx = folders.firstIndex(where: { $0.id == editingFolderId }) {
            folders[idx].name = trimmed
            folders[idx].color = folderColor
        } else {
            folders.append(
                WorkoutFolderDto(
                    id: "folder-\(UUID().uuidString.lowercased())",
                    name: trimmed,
                    color: folderColor,
                    sortOrder: folders.count
                )
            )
        }
        viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: viewModel.store.unfiledTemplates)
        showingFolderModal = false
    }

    private func reorderFolder(_ folderId: String, moveUp: Bool) {
        var folders = viewModel.store.folders
        guard let idx = folders.firstIndex(where: { $0.id == folderId }) else { return }
        let targetIdx = moveUp ? idx - 1 : idx + 1
        guard folders.indices.contains(targetIdx) else { return }
        folders.swapAt(idx, targetIdx)
        for i in folders.indices { folders[i].sortOrder = i }
        viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: viewModel.store.unfiledTemplates)
    }

    private func deleteFolder(_ folderId: String) {
        var folders = viewModel.store.folders
        var unfiled = viewModel.store.unfiledTemplates
        if let idx = folders.firstIndex(where: { $0.id == folderId }) {
            let moved = folders[idx].templates.map { tpl -> WorkoutTemplateDto in
                var copy = tpl
                copy.folderId = nil
                return copy
            }
            unfiled.append(contentsOf: moved)
            folders.remove(at: idx)
        }
        viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: unfiled)
    }

    private func openNewTemplateBuilder(defaultFolderId: String?) {
        let initialEx: [WorkoutTemplateExerciseDto]
        if let firstEx = viewModel.store.catalog.first {
            initialEx = [
                WorkoutTemplateExerciseDto(
                    templateId: "new",
                    exerciseId: firstEx.id,
                    orderIndex: 0,
                    plannedSets: 3,
                    warmupSets: 1,
                    targetRepsMin: 8,
                    targetRepsMax: 12,
                    targetWeight: 60,
                    weightUnit: viewModel.store.preferences.weightUnit,
                    restSeconds: 90,
                    alternativeExerciseIds: Array(firstEx.alternativeExerciseIds.prefix(2)),
                    exercise: firstEx
                )
            ]
        } else {
            initialEx = []
        }
        activeBuilderContext = TemplateBuilderContext(
            id: "new-\(UUID().uuidString)",
            editingTemplateId: nil,
            initialName: "",
            initialDescription: "",
            initialFolderId: defaultFolderId ?? "",
            initialDurationMin: 60,
            initialExercises: initialEx
        )
    }

    private func openEditTemplateBuilder(_ template: WorkoutTemplateDto) {
        activeBuilderContext = TemplateBuilderContext(
            id: "edit-\(template.id)",
            editingTemplateId: template.id,
            initialName: template.name,
            initialDescription: template.description ?? "",
            initialFolderId: template.folderId ?? "",
            initialDurationMin: template.estimatedDurationMinutes ?? 60,
            initialExercises: template.exercises
        )
    }

    private func saveTemplateFromBuilder(
        editingTemplateId: String?,
        name: String,
        desc: String,
        folderId: String,
        durationMin: Int,
        exercises: [WorkoutTemplateExerciseDto]
    ) {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }

        let targetFolderId: String? = folderId.isEmpty ? nil : folderId
        let templateId = editingTemplateId ?? "tpl-\(UUID().uuidString.lowercased())"
        let normalizedExercises = exercises.enumerated().map { idx, item -> WorkoutTemplateExerciseDto in
            var copy = item
            copy.templateId = templateId
            copy.orderIndex = idx
            if copy.exercise == nil {
                copy.exercise = viewModel.store.catalog.first { $0.id == copy.exerciseId }
            }
            return copy
        }

        let updatedTemplate = WorkoutTemplateDto(
            id: templateId,
            userId: viewModel.store.currentUser?.id ?? "local-user",
            folderId: targetFolderId,
            name: trimmedName,
            description: desc.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : desc,
            estimatedDurationMinutes: durationMin,
            sortOrder: 0,
            exercises: normalizedExercises
        )

        var folders = viewModel.store.folders
        var unfiled = viewModel.store.unfiledTemplates

        if let editingTemplateId {
            for i in folders.indices {
                folders[i].templates.removeAll { $0.id == editingTemplateId }
            }
            unfiled.removeAll { $0.id == editingTemplateId }
        }

        if let targetFolderId,
           let folderIdx = folders.firstIndex(where: { $0.id == targetFolderId }) {
            folders[folderIdx].templates.append(updatedTemplate)
        } else {
            unfiled.append(updatedTemplate)
        }

        viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: unfiled)
        // Reveal the saved workout: folders start collapsed.
        let savedInFolder = targetFolderId.map { id in folders.contains { $0.id == id } } ?? false
        expandedFolderIds.insert(savedInFolder ? targetFolderId! : "__unfiled__")
        activeBuilderContext = nil
    }

    private func duplicateTemplate(_ template: WorkoutTemplateDto) {
        var copy = template
        copy.id = "tpl-\(UUID().uuidString.lowercased())"
        copy.name = "\(template.name) (Copy)"
        var folders = viewModel.store.folders
        if let folderId = template.folderId,
           let idx = folders.firstIndex(where: { $0.id == folderId }) {
            if let sourcePos = folders[idx].templates.firstIndex(where: { $0.id == template.id }) {
                folders[idx].templates.insert(copy, at: sourcePos + 1)
            } else {
                folders[idx].templates.append(copy)
            }
            viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: viewModel.store.unfiledTemplates)
        } else {
            var unfiled = viewModel.store.unfiledTemplates
            unfiled.append(copy)
            viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: unfiled)
        }
    }

    private func moveTemplate(_ template: WorkoutTemplateDto, toFolderId: String?) {
        var folders = viewModel.store.folders
        var unfiled = viewModel.store.unfiledTemplates

        for i in folders.indices {
            folders[i].templates.removeAll { $0.id == template.id }
        }
        unfiled.removeAll { $0.id == template.id }

        var moved = template
        moved.folderId = toFolderId

        if let toFolderId,
           let fIdx = folders.firstIndex(where: { $0.id == toFolderId }) {
            folders[fIdx].templates.append(moved)
        } else {
            unfiled.append(moved)
        }

        viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: unfiled)
        expandedFolderIds.insert(toFolderId ?? "__unfiled__")
    }

    private func deleteTemplate(_ templateId: String) {
        var folders = viewModel.store.folders
        var unfiled = viewModel.store.unfiledTemplates
        for i in folders.indices {
            folders[i].templates.removeAll { $0.id == templateId }
        }
        unfiled.removeAll { $0.id == templateId }
        viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: unfiled)
    }
}

private struct TemplateBuilderSheetView: View {
    let context: WorkoutsView.TemplateBuilderContext
    let folders: [WorkoutFolderDto]
    let catalog: [ExerciseDto]
    let defaultWeightUnit: WeightUnit
    let onCancel: () -> Void
    let onSave: (String, String, String, Int, [WorkoutTemplateExerciseDto]) -> Void

    @State private var name: String
    @State private var desc: String
    @State private var folderId: String
    @State private var durationMin: Int
    @State private var exercises: [WorkoutTemplateExerciseDto]
    @State private var pickingSlotId: String?
    @State private var showingAddPickerSheet: Bool = false

    private struct PickingSlotItem: Identifiable {
        let id: String
    }

    init(
        context: WorkoutsView.TemplateBuilderContext,
        folders: [WorkoutFolderDto],
        catalog: [ExerciseDto],
        defaultWeightUnit: WeightUnit,
        onCancel: @escaping () -> Void,
        onSave: @escaping (String, String, String, Int, [WorkoutTemplateExerciseDto]) -> Void
    ) {
        self.context = context
        self.folders = folders
        self.catalog = catalog
        self.defaultWeightUnit = defaultWeightUnit
        self.onCancel = onCancel
        self.onSave = onSave
        self._name = State(initialValue: context.initialName)
        self._desc = State(initialValue: context.initialDescription)
        self._folderId = State(initialValue: context.initialFolderId)
        self._durationMin = State(initialValue: context.initialDurationMin)
        self._exercises = State(initialValue: context.initialExercises)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Workout Name *")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                        TextField("e.g. Push A — Chest, Shoulders & Triceps", text: $name)
                            .textFieldStyle(.roundedBorder)

                        Text("Folder")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Picker("Folder", selection: $folderId) {
                            Text("Unfiled (No Folder)").tag("")
                            ForEach(folders) { folder in
                                Text(folder.name).tag(folder.id)
                            }
                        }
                        .pickerStyle(.menu)

                        Text("Notes / Focus")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                        TextField("Optional focus notes...", text: $desc)
                            .textFieldStyle(.roundedBorder)

                        Stepper("Est. Duration: \(durationMin) min", value: $durationMin, in: 10...240, step: 5)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                    }
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))

                    HStack {
                        Text("Ordered Exercises (\(exercises.count))")
                            .font(.headline)
                            .foregroundStyle(.primary)
                        Spacer()
                        Button {
                            showingAddPickerSheet = true
                        } label: {
                            Text("+ Add Exercise Slot")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(LukiColors.accentForeground)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(Capsule().fill(LukiColors.accent))
                        }
                        .buttonStyle(.plain)
                    }

                    ForEach($exercises) { $slot in
                        let idx = exercises.firstIndex(where: { $0.id == slot.id }) ?? 0
                        let isSupersetWithNext = slot.restSeconds == 0 && idx < exercises.count - 1
                        let resolvedEx = slot.exercise ?? catalog.first(where: { $0.id == slot.exerciseId })

                        VStack(alignment: .leading, spacing: 12) {
                            // Top Row: #Badge + Searchable Exercise Picker Button + Up/Down/Trash buttons
                            HStack(spacing: 8) {
                                Text("#\(idx + 1)")
                                    .font(.caption.bold().monospacedDigit())
                                    .foregroundStyle(LukiColors.accentForeground)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Capsule().fill(LukiColors.accent))

                                Button {
                                    pickingSlotId = slot.id
                                } label: {
                                    HStack(spacing: 6) {
                                        Image(systemName: "magnifyingglass")
                                            .font(.footnote.weight(.medium))
                                            .foregroundStyle(LukiColors.accent)
                                        Text(resolvedEx?.name ?? "Select Exercise")
                                            .font(.subheadline.bold())
                                            .foregroundStyle(LukiColors.accent)
                                            .lineLimit(1)
                                            .truncationMode(.tail)
                                        Spacer(minLength: 4)
                                        Image(systemName: "chevron.up.chevron.down")
                                            .font(.footnote.weight(.medium))
                                            .foregroundStyle(LukiColors.accent)
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 7)
                                    .background(RoundedRectangle(cornerRadius: 8).fill(LukiColors.fill))
                                }
                                .buttonStyle(.plain)

                                Button {
                                    guard idx > 0 else { return }
                                    exercises.swapAt(idx, idx - 1)
                                } label: {
                                    Image(systemName: "arrow.up")
                                        .font(.subheadline.weight(.semibold))
                                        .frame(width: 28, height: 28)
                                        .background(RoundedRectangle(cornerRadius: 7).fill(LukiColors.fill))
                                }
                                .buttonStyle(.plain)
                                .disabled(idx == 0)

                                Button {
                                    guard idx < exercises.count - 1 else { return }
                                    exercises.swapAt(idx, idx + 1)
                                } label: {
                                    Image(systemName: "arrow.down")
                                        .font(.subheadline.weight(.semibold))
                                        .frame(width: 28, height: 28)
                                        .background(RoundedRectangle(cornerRadius: 7).fill(LukiColors.fill))
                                }
                                .buttonStyle(.plain)
                                .disabled(idx == exercises.count - 1)

                                Button(role: .destructive) {
                                    exercises.removeAll { $0.id == slot.id }
                                } label: {
                                    Image(systemName: "trash")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.red)
                                        .frame(width: 28, height: 28)
                                        .background(RoundedRectangle(cornerRadius: 7).fill(Color.red.opacity(0.14)))
                                }
                                .buttonStyle(.plain)
                            }

                            // Clean 2×3 Grid of Compact Metric Controls
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 8) {
                                compactMetricStepper(
                                    label: "WORKING SETS",
                                    valueText: "\(slot.plannedSets)",
                                    onDecrement: { slot.plannedSets = max(1, slot.plannedSets - 1) },
                                    onIncrement: { slot.plannedSets = min(20, slot.plannedSets + 1) }
                                )

                                compactMetricStepper(
                                    label: "WARMUP SETS",
                                    valueText: "\(slot.warmupSets)",
                                    onDecrement: { slot.warmupSets = max(0, slot.warmupSets - 1) },
                                    onIncrement: { slot.warmupSets = min(10, slot.warmupSets + 1) }
                                )

                                compactMetricStepper(
                                    label: "MIN REPS",
                                    valueText: "\(slot.targetRepsMin ?? 8)",
                                    onDecrement: { slot.targetRepsMin = max(1, (slot.targetRepsMin ?? 8) - 1) },
                                    onIncrement: { slot.targetRepsMin = min(100, (slot.targetRepsMin ?? 8) + 1) }
                                )

                                compactMetricStepper(
                                    label: "MAX REPS",
                                    valueText: "\(slot.targetRepsMax ?? 12)",
                                    onDecrement: { slot.targetRepsMax = max(1, (slot.targetRepsMax ?? 12) - 1) },
                                    onIncrement: { slot.targetRepsMax = min(100, (slot.targetRepsMax ?? 12) + 1) }
                                )

                                compactMetricStepper(
                                    label: "TARGET (\(defaultWeightUnit.rawValue))",
                                    valueText: String(format: "%g", slot.targetWeight ?? 40),
                                    onDecrement: { slot.targetWeight = max(0, (slot.targetWeight ?? 40) - 2.5) },
                                    onIncrement: { slot.targetWeight = min(500, (slot.targetWeight ?? 40) + 2.5) }
                                )

                                compactMetricStepper(
                                    label: "REST (SEC)",
                                    valueText: "\(slot.restSeconds)s",
                                    onDecrement: { slot.restSeconds = max(0, slot.restSeconds - 15) },
                                    onIncrement: { slot.restSeconds = min(600, slot.restSeconds + 15) }
                                )
                            }

                            if idx < exercises.count - 1 {
                                Button {
                                    slot.restSeconds = isSupersetWithNext ? 90 : 0
                                } label: {
                                    Label(
                                        isSupersetWithNext
                                            ? "Superset w/ #\(idx + 2) (0s Rest) — Tap to Unlink"
                                            : "Pair as Superset w/ #\(idx + 2)",
                                        systemImage: "bolt.fill"
                                    )
                                    .font(.footnote.weight(.medium))
                                    .foregroundStyle(isSupersetWithNext ? LukiColors.accent : .secondary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
                    }
                }
                .padding(16)
            }
            .background(LukiColors.groupedBackground)
            .navigationTitle(context.editingTemplateId == nil ? "Create Workout Template" : "Edit Workout")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { onCancel() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(context.editingTemplateId == nil ? "Create" : "Save Changes") {
                        onSave(name, desc, folderId, durationMin, exercises)
                    }
                }
            }
            .sheet(
                item: Binding<PickingSlotItem?>(
                    get: { pickingSlotId.map { PickingSlotItem(id: $0) } },
                    set: { pickingSlotId = $0?.id }
                )
            ) { item in
                let currentExId = exercises.first(where: { $0.id == item.id })?.exerciseId
                SearchableExercisePickerSheet(
                    title: "Change Exercise",
                    exercises: catalog,
                    selectedExerciseId: currentExId
                ) { chosen in
                    if let idx = exercises.firstIndex(where: { $0.id == item.id }) {
                        exercises[idx].exerciseId = chosen.id
                        exercises[idx].exercise = chosen
                        exercises[idx].alternativeExerciseIds = Array(chosen.alternativeExerciseIds.prefix(2))
                    }
                    pickingSlotId = nil
                }
            }
            .sheet(isPresented: $showingAddPickerSheet) {
                SearchableExercisePickerSheet(
                    title: "Add Exercise to Workout",
                    exercises: catalog,
                    selectedExerciseId: nil
                ) { chosen in
                    exercises.append(
                        WorkoutTemplateExerciseDto(
                            templateId: context.editingTemplateId ?? "new",
                            exerciseId: chosen.id,
                            orderIndex: exercises.count,
                            plannedSets: 3,
                            warmupSets: 0,
                            targetRepsMin: 8,
                            targetRepsMax: 12,
                            targetWeight: 40,
                            weightUnit: defaultWeightUnit,
                            restSeconds: 90,
                            alternativeExerciseIds: Array(chosen.alternativeExerciseIds.prefix(2)),
                            exercise: chosen
                        )
                    )
                    showingAddPickerSheet = false
                }
            }
        }
    }

    private func compactMetricStepper(
        label: String,
        valueText: String,
        onDecrement: @escaping () -> Void,
        onIncrement: @escaping () -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            HStack(spacing: 0) {
                Button(action: onDecrement) {
                    Image(systemName: "minus")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)

                Text(valueText)
                    .font(.subheadline.bold().monospacedDigit())
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity)

                Button(action: onIncrement) {
                    Image(systemName: "plus")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 8).fill(LukiColors.fill))
        }
    }
}
