import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct WorkoutsView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr

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
    @State private var showingAIBuilder = false

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
                        Text(tr("Your plans, grouped by split."))
                            .textCase(nil)
                        Spacer()
                        Button(areAllExpanded ? tr("Collapse All") : tr("Expand All")) {
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
                            Text(tr("No workouts here yet."))
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(folder.templates) { templateRow($0) }
                        }
                        if isEditing {
                            Button {
                                openNewTemplateBuilder(defaultFolderId: folder.id)
                            } label: {
                                Label(tr("Add Workout"), systemImage: "plus.circle.fill")
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
                            Text(tr("Unfiled Workouts"))
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
                Button(isEditing ? tr("Done") : tr("Edit")) {
                    withAnimation { isEditing.toggle() }
                }
                .accessibilityIdentifier("ios.workouts.editToggle")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        openNewTemplateBuilder(defaultFolderId: viewModel.store.folders.first?.id)
                    } label: {
                        Label(tr("New Workout"), systemImage: "dumbbell")
                    }
                    .accessibilityIdentifier("ios.workouts.newWorkoutButton")
                    Button {
                        openCreateFolderModal()
                    } label: {
                        Label(tr("New Folder"), systemImage: "folder.badge.plus")
                    }
                    .accessibilityIdentifier("ios.workouts.newFolderButton")
                    if viewModel.store.currentUser?.hasFeature(.AI_WORKOUT_BUILDER) == true {
                        Button {
                            showingAIBuilder = true
                        } label: {
                            Label(tr("Plan with AI"), systemImage: "sparkles")
                        }
                        .accessibilityIdentifier("ios.workouts.aiBuilderButton")
                    }
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(tr("Add"))
                .accessibilityIdentifier("ios.workouts.addMenu")
            }
        }
        .sheet(isPresented: $showingFolderModal) {
            folderEditorSheet
        }
        .sheet(isPresented: $showingAIBuilder) {
            AIWorkoutBuilderSheet(viewModel: viewModel) { _ in
                expandedFolderIds.insert("__unfiled__")
            }
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
            deleteTarget?.isFolder == true ? tr("Delete folder?") : tr("Delete workout?"),
            isPresented: Binding(
                get: { deleteTarget != nil },
                set: { if !$0 { deleteTarget = nil } }
            )
        ) {
            if let target = deleteTarget {
                Button(tr("Cancel"), role: .cancel) {
                    deleteTarget = nil
                }
                Button(tr("Delete"), role: .destructive) {
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
                        ? tr("“%@” will be deleted. Its workouts move to Unfiled.", target.name)
                        : tr("“%@” will be deleted. Your past workouts stay in History.", target.name)
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
                .accessibilityLabel(tr("Delete folder %@", folder.name))
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
                    .accessibilityLabel(tr("Move folder %@ up", folder.name))
                Button { reorderFolder(folder.id, moveUp: false) } label: { Image(systemName: "arrow.down") }
                    .buttonStyle(.borderless)
                    .disabled(index == viewModel.store.folders.count - 1)
                    .accessibilityLabel(tr("Move folder %@ down", folder.name))
                Button { openRenameFolderModal(folder) } label: { Image(systemName: "pencil") }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(tr("Rename %@", folder.name))
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            Button { openRenameFolderModal(folder) } label: { Label(tr("Rename"), systemImage: "pencil") }
                .tint(.gray)
            Button { openNewTemplateBuilder(defaultFolderId: folder.id) } label: { Label(tr("Add Workout"), systemImage: "plus") }
                .tint(LukiColors.accent)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                deleteTarget = DeleteTarget(id: folder.id, name: folder.name, isFolder: true)
            } label: {
                Label(tr("Delete"), systemImage: "trash")
            }
        }
    }

    private func templateRow(_ template: WorkoutTemplateDto) -> some View {
        let history = viewModel.store.historySessions.filter {
            $0.templateId == template.id || $0.workoutNameSnapshot.lowercased() == template.name.lowercased()
        }
        let lastText = history.first
            .flatMap { ISO8601DateFormatter.workoutsParse($0.startedAt) }
            .map { tr("Last %@", $0.formatted(.dateTime.day().month())) } ?? tr("Never trained")
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
                        Text(tr("%d exercises · ~%d min · %@", template.exercises.count, template.estimatedDurationMinutes ?? 60, lastText))
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
                        .accessibilityLabel(tr("Edit %@", template.name))
                } else {
                    // Plain accent glyph: glass belongs to the bars, not to every list row.
                    Button {
                        viewModel.startSession(from: template, sourceDevice: .IPHONE)
                    } label: {
                        Image(systemName: "play.circle.fill")
                            .font(.title)
                            .foregroundStyle(LukiColors.accent)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(tr("Start %@", template.name))
                    .accessibilityIdentifier("ios.workouts.startTemplate.\(template.id)")
                }
            }
            if isExpanded {
                templateDetails(template)
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            Button { openEditTemplateBuilder(template) } label: { Label(tr("Edit"), systemImage: "pencil") }
                .tint(.gray)
            Button { duplicateTemplate(template) } label: { Label(tr("Duplicate"), systemImage: "plus.square.on.square") }
                .tint(LukiColors.accent)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                deleteTarget = DeleteTarget(id: template.id, name: template.name, isFolder: false)
            } label: {
                Label(tr("Delete"), systemImage: "trash")
            }
        }
        .contextMenu {
            Button { openEditTemplateBuilder(template) } label: { Label(tr("Edit"), systemImage: "pencil") }
            Button { duplicateTemplate(template) } label: { Label(tr("Duplicate"), systemImage: "plus.square.on.square") }
            Menu {
                Button(tr("Unfiled")) { moveTemplate(template, toFolderId: nil) }
                ForEach(viewModel.store.folders) { f in
                    Button(f.name) { moveTemplate(template, toFolderId: f.id) }
                }
            } label: {
                Label(tr("Move to"), systemImage: "folder")
            }
            Divider()
            Button(role: .destructive) {
                deleteTarget = DeleteTarget(id: template.id, name: template.name, isFolder: false)
            } label: {
                Label(tr("Delete"), systemImage: "trash")
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
                                    Text(tr("Superset · %d rounds", block.rounds))
                                        .font(.subheadline.weight(.semibold))
                                    Text(tr("No rest between exercises · %@ between rounds", ProgressionEngine.formatRestDurationMinSec(block.roundRestSeconds)))
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(LukiColors.fill)

                            ForEach(Array(block.items.enumerated()), id: \.offset) { _, blockItem in
                                let ex = blockItem.item
                                let exInfo = ex.exercise ?? viewModel.store.catalog.first { $0.id == ex.exerciseId }
                                HStack(spacing: 8) {
                                    Text("\(blockItem.stepNumber)")
                                        .font(.footnote)
                                        .foregroundStyle(LukiColors.accent)
                                        .frame(minWidth: 22, minHeight: 22)
                                        .background(Circle().fill(LukiColors.fill))
                                    Text(exInfo?.name ?? tr("Exercise"))
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    Spacer()
                                    Text("\(ex.plannedSets)×\(ex.targetRepsMin ?? 8)–\(ex.targetRepsMax ?? 12)")
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
                            Text(exInfo?.name ?? tr("Exercise"))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            Spacer()
                            if !ex.alternativeExerciseIds.isEmpty {
                                Text(tr("+%d alternatives", ex.alternativeExerciseIds.count))
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Text("\(ex.plannedSets)×\(ex.targetRepsMin ?? 8)–\(ex.targetRepsMax ?? 12)")
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
                        locale: tr,
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
                Section(tr("Folder Details")) {
                    TextField(tr("Folder Name (e.g. 4er Split)"), text: $folderName)
                }
                Section(tr("Accent Color")) {
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
            .navigationTitle(editingFolderId == nil ? tr("Create Workout Folder") : tr("Rename Folder"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { showingFolderModal = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Save Folder")) {
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
        copy.name = tr("%@ (Copy)", template.name)
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
    @Environment(\.lukiLocale) private var tr

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
                        Text(tr("Name"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                        TextField(tr("e.g. Push A — Chest, Shoulders & Triceps"), text: $name)
                            .textFieldStyle(.roundedBorder)

                        Text(tr("Folder"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Picker(tr("Folder"), selection: $folderId) {
                            Text(tr("Unfiled (No Folder)")).tag("")
                            ForEach(folders) { folder in
                                Text(folder.name).tag(folder.id)
                            }
                        }
                        .pickerStyle(.menu)

                        Text(tr("Notes / Focus"))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                        TextField(tr("Optional focus notes..."), text: $desc)
                            .textFieldStyle(.roundedBorder)

                        Stepper(tr("About %d min", durationMin), value: $durationMin, in: 10...240, step: 5)
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                    }
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))

                    HStack {
                        Text(tr("Exercises (%d)", exercises.count))
                            .font(.headline)
                            .foregroundStyle(.primary)
                        Spacer()
                        Button {
                            showingAddPickerSheet = true
                        } label: {
                            Label(tr("Add Exercise"), systemImage: "plus")
                        }
                        .buttonStyle(.bordered)
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
                                        Text(resolvedEx?.name ?? tr("Select Exercise"))
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
                                    .frame(minHeight: 44)
                                    .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.fill))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(tr("Exercise %d: %@. Change exercise", idx + 1, resolvedEx?.name ?? tr("Select Exercise")))

                                Button {
                                    guard idx > 0 else { return }
                                    exercises.swapAt(idx, idx - 1)
                                } label: {
                                    Image(systemName: "arrow.up")
                                        .font(.subheadline.weight(.semibold))
                                        .frame(width: 44, height: 44)
                                        .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.fill))
                                }
                                .buttonStyle(.plain)
                                .disabled(idx == 0)
                                .accessibilityLabel(tr("Move earlier"))

                                Button {
                                    guard idx < exercises.count - 1 else { return }
                                    exercises.swapAt(idx, idx + 1)
                                } label: {
                                    Image(systemName: "arrow.down")
                                        .font(.subheadline.weight(.semibold))
                                        .frame(width: 44, height: 44)
                                        .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.fill))
                                }
                                .buttonStyle(.plain)
                                .disabled(idx == exercises.count - 1)
                                .accessibilityLabel(tr("Move later"))

                                Button(role: .destructive) {
                                    exercises.removeAll { $0.id == slot.id }
                                } label: {
                                    Image(systemName: "trash")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(LukiColors.destructive)
                                        .frame(width: 44, height: 44)
                                        .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.fill))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(tr("Remove exercise"))
                            }

                            TemplateSetsEditorView(slot: $slot, weightUnit: defaultWeightUnit)

                            // Rep range goal and rest
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 8) {
                                compactMetricStepper(
                                    label: tr("Min reps"),
                                    valueText: "\(slot.targetRepsMin ?? 8)",
                                    onDecrement: { slot.targetRepsMin = max(1, (slot.targetRepsMin ?? 8) - 1) },
                                    onIncrement: { slot.targetRepsMin = min(100, (slot.targetRepsMin ?? 8) + 1) }
                                )

                                compactMetricStepper(
                                    label: tr("Max reps"),
                                    valueText: "\(slot.targetRepsMax ?? 12)",
                                    onDecrement: { slot.targetRepsMax = max(1, (slot.targetRepsMax ?? 12) - 1) },
                                    onIncrement: { slot.targetRepsMax = min(100, (slot.targetRepsMax ?? 12) + 1) }
                                )

                                compactMetricStepper(
                                    label: tr("Rest"),
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
                                            ? tr("Superset with #%d · Tap to unlink", idx + 2)
                                            : tr("Pair with #%d as a superset", idx + 2),
                                        systemImage: "bolt.fill"
                                    )
                                    .font(.footnote.weight(.medium))
                                    .foregroundStyle(isSupersetWithNext ? LukiColors.accent : .secondary)
                                }
                                .buttonStyle(.plain)
                                .frame(minHeight: 44)
                            }
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
                    }
                }
                .padding(16)
            }
            .background(LukiColors.groupedBackground)
            .navigationTitle(context.editingTemplateId == nil ? tr("Create Workout Template") : tr("Edit Workout"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { onCancel() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(context.editingTemplateId == nil ? tr("Create") : tr("Save Changes")) {
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
                    title: tr("Change Exercise"),
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
                    title: tr("Add Exercise"),
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
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tr("Decrease %@", label))

                Text(valueText)
                    .font(.subheadline.bold().monospacedDigit())
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity)

                Button(action: onIncrement) {
                    Image(systemName: "plus")
                        .font(.subheadline.weight(.semibold))
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tr("Increase %@", label))
            }
            .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.fill))
        }
    }
}

/// Per-set plan of a template exercise: type, weight and reps for every set (mirrors the web editor).
private struct TemplateSetsEditorView: View {
    @Binding var slot: WorkoutTemplateExerciseDto
    let weightUnit: WeightUnit
    @Environment(\.lukiLocale) private var tr

    private var sets: [TemplateSetDto] { TemplateSets.resolve(slot) }

    private func commit(_ next: [TemplateSetDto]) {
        TemplateSets.apply(next, to: &slot)
    }

    var body: some View {
        let current = sets
        let labels = LukiI18n.setBadgeLabels(current.map(\.setType))
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(current.enumerated()), id: \.offset) { idx, set in
                HStack(spacing: 8) {
                    Menu {
                        ForEach(SetType.allCases, id: \.self) { type in
                            Button(LukiI18n.setTypeLabel(type, locale: tr)) {
                                var next = current
                                next[idx].setType = type
                                commit(TemplateSets.orderWarmupsFirst(next, type: \.setType))
                            }
                        }
                    } label: {
                        SetTypeBadge(setType: set.setType, label: idx < labels.count ? labels[idx] : "", completed: false)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel(tr("Set %d: %@", idx + 1, LukiI18n.setTypeLabel(set.setType, locale: tr)))

                    stepper(
                        text: set.weight.map { String(format: "%g", $0) } ?? "–",
                        unit: LukiFormat.unitLabel(weightUnit),
                        onMinus: {
                            var next = current
                            next[idx].weight = max(0, (set.weight ?? 0) - LukiFormat.weightStep(weightUnit))
                            commit(next)
                        },
                        onPlus: {
                            var next = current
                            next[idx].weight = (set.weight ?? 0) + LukiFormat.weightStep(weightUnit)
                            commit(next)
                        }
                    )
                    stepper(
                        text: set.reps.map(String.init) ?? "–",
                        unit: tr("reps"),
                        onMinus: {
                            var next = current
                            next[idx].reps = max(0, (set.reps ?? 0) - 1)
                            commit(next)
                        },
                        onPlus: {
                            var next = current
                            next[idx].reps = (set.reps ?? 0) + 1
                            commit(next)
                        }
                    )

                    Button(role: .destructive) {
                        var next = current
                        next.remove(at: idx)
                        commit(next)
                    } label: {
                        Image(systemName: "trash")
                            .font(.footnote)
                            .foregroundStyle(LukiColors.destructive)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(current.count <= 1)
                    .accessibilityLabel(tr("Delete set %d", idx + 1))
                }
            }

            Button {
                let last = current.last
                commit(current + [TemplateSetDto(setType: .WORKING, weight: last?.weight, reps: last?.reps ?? 10, durationSeconds: last?.durationSeconds)])
            } label: {
                Label(tr("Add Set"), systemImage: "plus")
                    .font(.footnote.weight(.semibold))
            }
            .buttonStyle(.bordered)
        }
    }

    private func stepper(text: String, unit: String, onMinus: @escaping () -> Void, onPlus: @escaping () -> Void) -> some View {
        HStack(spacing: 2) {
            Button(action: onMinus) {
                Image(systemName: "minus").font(.caption.weight(.bold)).frame(minWidth: 32, minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(tr("Decrease %@", unit))
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(text).font(.subheadline.weight(.semibold).monospacedDigit())
                Text(unit).font(.caption2).foregroundStyle(.secondary)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(minWidth: 34)
            Button(action: onPlus) {
                Image(systemName: "plus").font(.caption.weight(.bold)).frame(minWidth: 32, minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(tr("Increase %@", unit))
        }
        .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.fill))
    }
}

private extension ISO8601DateFormatter {
    static func workoutsParse(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }
}
