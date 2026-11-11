import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiAPI

public struct WorkoutsView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr

    @State private var expandedFolderIds: Set<String> = []
    @State private var expandedTemplateIds: Set<String> = []
    @State private var dismissedSuggestionTemplateIds: Set<String> = []
    @State private var isEditing = false

    // Folder Create / Rename Modal State
    @State private var showingFolderModal = false
    @State private var editingFolderId: String?
    @State private var folderName = ""
    @State private var folderColor = LukiColors.defaultFolderHex

    // Workout Template Builder Modal State
    @State private var activeBuilderContext: TemplateBuilderContext?
    @State private var showingAIBuilder = false
    @State private var showsAiKeyAlert = false

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
                        Text(tr("Your workouts, in folders you name and order."))
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
                        // From the toolbar a new workout starts unfiled; folder menus pass their folder.
                        openNewTemplateBuilder(defaultFolderId: nil)
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
                    if viewModel.showsAiFeature(.AI_WORKOUT_BUILDER) {
                        Button {
                            Task {
                                if await viewModel.ensureAiKeyConfigured() {
                                    showingAIBuilder = true
                                } else {
                                    showsAiKeyAlert = true
                                }
                            }
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
        .onChange(of: viewModel.pendingTemplateId, initial: true) { _, pending in
            guard let pending else { return }
            expandedTemplateIds.insert(pending)
            if let folder = viewModel.store.folders.first(where: { $0.templates.contains { $0.id == pending } }) {
                expandedFolderIds.insert(folder.id)
            } else {
                expandedFolderIds.insert("__unfiled__")
            }
            viewModel.pendingTemplateId = nil
        }
        .sheet(isPresented: $showingFolderModal) {
            folderEditorSheet
        }
        .aiAccessAlert(isPresented: $showsAiKeyAlert, isSignedIn: viewModel.isSignedIn) {
            viewModel.selectedTab = .profile
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
                historySessions: viewModel.store.historySessions,
                suggestionsEnabled: viewModel.store.preferences.exerciseSuggestionsEnabled,
                defaultWeightUnit: viewModel.store.preferences.weightUnit,
                analytics: viewModel.analytics,
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
                        let minutes = template.estimatedDurationMinutes ?? 60
                        Text(template.exercises.count == 1
                            ? tr("1 exercise · ~%d min · %@", minutes, lastText)
                            : tr("%d exercises · ~%d min · %@", template.exercises.count, minutes, lastText))
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
                    // Visible overflow like web's "•••"; the same actions as the context menu.
                    Menu {
                        templateActions(template)
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(tr("More actions for %@", template.name))
                    .accessibilityIdentifier("ios.workouts.templateMenu.\(template.id)")
                    // Plain accent glyph: glass belongs to the bars, not to every list row.
                    Button {
                        viewModel.startSession(from: template, sourceDevice: .IPHONE)
                    } label: {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 34))
                            .foregroundStyle(LukiColors.accent)
                            .frame(width: 44, height: 44)
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
        .contextMenu { templateActions(template) }
    }

    @ViewBuilder
    private func templateActions(_ template: WorkoutTemplateDto) -> some View {
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
                                        .lineLimit(2)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    Text("\(ex.plannedSets)×\(ex.targetRepsMin ?? 8)–\(ex.targetRepsMax ?? 12)")
                                        .font(.footnote.monospacedDigit())
                                        .foregroundStyle(LukiColors.accent)
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 3)
                                        .background(RoundedRectangle(cornerRadius: 6).fill(LukiColors.accent.opacity(0.18)))
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .frame(minHeight: 48)
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
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("\(idx + 1).")
                                .font(.caption.bold().monospacedDigit())
                                .foregroundStyle(LukiColors.accent)
                            // Name gets two lines and the alternatives sit under it, so neither
                            // truncates nor wraps beside the targets.
                            VStack(alignment: .leading, spacing: 2) {
                                Text(exInfo?.name ?? tr("Exercise"))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                                let alternatives = ex.alternativeExerciseIds.count
                                if alternatives > 0 {
                                    Text(alternatives == 1 ? tr("+1 alternative") : tr("+%d alternatives", alternatives))
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Text("\(ex.plannedSets)×\(ex.targetRepsMin ?? 8)–\(ex.targetRepsMax ?? 12)")
                                .font(.footnote.monospacedDigit())
                                .foregroundStyle(LukiColors.accent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(RoundedRectangle(cornerRadius: 6).fill(LukiColors.accent.opacity(0.16)))
                                .fixedSize()
                            Text("\(ex.restSeconds)s")
                                .font(.footnote.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .fixedSize()
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .frame(minHeight: 48)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(LukiColors.fill))
                    }
                }

                // Rainbow Smart Exercise Suggestion (Max 1 per workout)
                if viewModel.store.preferences.exerciseSuggestionsEnabled,
                   !dismissedSuggestionTemplateIds.contains(template.id),
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
                    let weightUnit = viewModel.store.preferences.weightUnit
                    SuggestionCardView(
                        suggestion: suggestion,
                        locale: tr,
                        historySessions: viewModel.store.historySessions,
                        weightUnit: weightUnit,
                        catalog: viewModel.store.catalog,
                        compact: true,
                        onAdd: {
                            viewModel.analytics.event(.suggestionAccept, ["action": .string("add"), "context": .string("template")])
                            updateTemplateExercises(template.id) {
                                $0.append(WorkoutTemplateExerciseDto(
                                    suggestion: suggestion,
                                    templateId: template.id,
                                    orderIndex: $0.count,
                                    weightUnit: weightUnit
                                ))
                            }
                        },
                        onReplace: {
                            viewModel.analytics.event(.suggestionAccept, ["action": .string("swap"), "context": .string("template")])
                            updateTemplateExercises(template.id) { $0.replaceStalling(with: suggestion) }
                        },
                        onDismiss: {
                            viewModel.analytics.event(.suggestionDismiss, ["context": .string("template")])
                            dismissedSuggestionTemplateIds.insert(template.id)
                        }
                    )
                    .accessibilityIdentifier("ios.workouts.rainbowSuggestion.\(template.id)")
                }
            }

        }
        .padding(.top, 4)
    }

    /// Edits a saved workout's exercises in place, keeping its position in the folder.
    private func updateTemplateExercises(_ templateId: String, _ transform: (inout [WorkoutTemplateExerciseDto]) -> Void) {
        viewModel.store.updateTemplateExercises(id: templateId, transform)
        syncWorkoutChanges()
    }

    /// Sends queued folder/workout changes right away (they stay queued when offline).
    private func syncWorkoutChanges() {
        let store = viewModel.store
        Task { await store.flushSyncQueue() }
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
        guard !folderName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        viewModel.store.saveFolder(id: editingFolderId, name: folderName, color: folderColor)
        syncWorkoutChanges()
        showingFolderModal = false
    }

    private func reorderFolder(_ folderId: String, moveUp: Bool) {
        viewModel.store.reorderFolder(id: folderId, moveUp: moveUp)
        syncWorkoutChanges()
    }

    private func deleteFolder(_ folderId: String) {
        viewModel.store.deleteFolder(id: folderId)
        syncWorkoutChanges()
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
                    targetRepsMin: nil,
                    targetRepsMax: nil,
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
        let targetFolderId: String? = folderId.isEmpty ? nil : folderId
        guard viewModel.store.saveTemplate(
            editingTemplateId: editingTemplateId,
            name: name,
            description: desc,
            folderId: targetFolderId,
            durationMinutes: durationMin,
            exercises: exercises
        ) != nil else { return }
        syncWorkoutChanges()
        let folders = viewModel.store.folders
        // Reveal the saved workout: folders start collapsed.
        let savedInFolder = targetFolderId.map { id in folders.contains { $0.id == id } } ?? false
        expandedFolderIds.insert(savedInFolder ? targetFolderId! : "__unfiled__")
        activeBuilderContext = nil
    }

    private func duplicateTemplate(_ template: WorkoutTemplateDto) {
        viewModel.store.duplicateTemplate(template, name: tr("%@ (Copy)", template.name))
        syncWorkoutChanges()
    }

    private func moveTemplate(_ template: WorkoutTemplateDto, toFolderId: String?) {
        viewModel.store.moveTemplate(id: template.id, toFolderId: toFolderId)
        syncWorkoutChanges()
        expandedFolderIds.insert(toFolderId ?? "__unfiled__")
    }

    private func deleteTemplate(_ templateId: String) {
        viewModel.store.deleteTemplate(id: templateId)
        syncWorkoutChanges()
    }
}

private struct TemplateBuilderSheetView: View {
    let context: WorkoutsView.TemplateBuilderContext
    let folders: [WorkoutFolderDto]
    let catalog: [ExerciseDto]
    let historySessions: [WorkoutSessionDto]
    let suggestionsEnabled: Bool
    let defaultWeightUnit: WeightUnit
    let analytics: AnalyticsClient
    let onCancel: () -> Void
    let onSave: (String, String, String, Int, [WorkoutTemplateExerciseDto]) -> Void

    @State private var guideExercise: ExerciseDto?
    @State private var suggestionDismissed = false
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
        historySessions: [WorkoutSessionDto],
        suggestionsEnabled: Bool,
        defaultWeightUnit: WeightUnit,
        analytics: AnalyticsClient,
        onCancel: @escaping () -> Void,
        onSave: @escaping (String, String, String, Int, [WorkoutTemplateExerciseDto]) -> Void
    ) {
        self.context = context
        self.folders = folders
        self.catalog = catalog
        self.historySessions = historySessions
        self.suggestionsEnabled = suggestionsEnabled
        self.defaultWeightUnit = defaultWeightUnit
        self.analytics = analytics
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
                        let resolvedEx = catalog.first(where: { $0.id == slot.exerciseId }) ?? slot.exercise

                        VStack(alignment: .leading, spacing: 12) {
                            // Header: #Badge + full-width exercise picker, then reorder/remove controls
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
                                            .lineLimit(2)
                                            .multilineTextAlignment(.leading)
                                            .fixedSize(horizontal: false, vertical: true)
                                        Spacer(minLength: 4)
                                        Image(systemName: "chevron.up.chevron.down")
                                            .font(.footnote.weight(.medium))
                                            .foregroundStyle(LukiColors.accent)
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.fill))
                                }
                                .buttonStyle(.plain)
                                .frame(maxWidth: .infinity)
                                .accessibilityLabel(tr("Exercise %d: %@. Change exercise", idx + 1, resolvedEx?.name ?? tr("Select Exercise")))
                            }

                            HStack(spacing: 8) {
                                if let resolvedEx {
                                    Button {
                                        guideExercise = resolvedEx
                                    } label: {
                                        Label(tr("How to do it"), systemImage: "book")
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(LukiColors.accent)
                                            .lineLimit(1)
                                            .fixedSize()
                                            .padding(.horizontal, 12)
                                            .frame(minHeight: 44)
                                            .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.fill))
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(tr("How to do %@", resolvedEx.name))
                                    .accessibilityIdentifier("ios.templateBuilder.guideButton.\(idx + 1)")
                                }

                                Spacer()

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

                            // Rest
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 8) {
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

                    builderSuggestionCard
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
                // Number pads have no return key; Done ends typing and commits the value.
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button(tr("Done")) {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                    .fontWeight(.semibold)
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
                    selectedExerciseId: currentExId,
                    historySessions: historySessions,
                    weightUnit: defaultWeightUnit
                ) { chosen in
                    if let idx = exercises.firstIndex(where: { $0.id == item.id }) {
                        exercises[idx].exerciseId = chosen.id
                        exercises[idx].exercise = chosen
                        exercises[idx].alternativeExerciseIds = Array(chosen.alternativeExerciseIds.prefix(2))
                    }
                    pickingSlotId = nil
                }
            }
            .sheet(item: $guideExercise) { exercise in
                ExerciseGuideSheet(exercise: exercise, historySessions: historySessions, weightUnit: defaultWeightUnit, catalog: catalog)
            }
            .sheet(isPresented: $showingAddPickerSheet) {
                SearchableExercisePickerSheet(
                    title: tr("Add Exercise"),
                    exercises: catalog,
                    selectedExerciseId: nil,
                    historySessions: historySessions,
                    weightUnit: defaultWeightUnit
                ) { chosen in
                    exercises.append(
                        WorkoutTemplateExerciseDto(
                            templateId: context.editingTemplateId ?? "new",
                            exerciseId: chosen.id,
                            orderIndex: exercises.count,
                            plannedSets: 3,
                            warmupSets: 0,
                            targetRepsMin: nil,
                            targetRepsMax: nil,
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

    /// Live suggestion for the workout being edited (mirrors the web builder's suggestion card).
    @ViewBuilder
    private var builderSuggestionCard: some View {
        if suggestionsEnabled,
           !suggestionDismissed,
           let suggestion = ProgressionEngine.computeWorkoutExerciseSuggestion(
               workoutName: name.isEmpty ? "Workout" : name,
               folderName: folders.first { $0.id == folderId }?.name,
               exercises: exercises.map {
                   WorkoutSuggestionInputExercise(exerciseId: $0.exerciseId, plannedSets: $0.plannedSets)
               },
               catalog: catalog,
               historySessions: historySessions,
               weightUnit: defaultWeightUnit
           ) {
            SuggestionCardView(
                suggestion: suggestion,
                locale: tr,
                historySessions: historySessions,
                weightUnit: defaultWeightUnit,
                catalog: catalog,
                onAdd: {
                    analytics.event(.suggestionAccept, ["action": .string("add"), "context": .string("builder")])
                    exercises.append(WorkoutTemplateExerciseDto(
                        suggestion: suggestion,
                        templateId: context.editingTemplateId ?? "new",
                        orderIndex: exercises.count,
                        weightUnit: defaultWeightUnit
                    ))
                },
                onReplace: {
                    analytics.event(.suggestionAccept, ["action": .string("swap"), "context": .string("builder")])
                    exercises.replaceStalling(with: suggestion)
                },
                onDismiss: {
                    analytics.event(.suggestionDismiss, ["context": .string("builder")])
                    suggestionDismissed = true
                }
            )
            .accessibilityIdentifier("ios.templateBuilder.rainbowSuggestion")
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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Keeps "12 reps" readable: the reps stepper never shrinks below this share of the row.
    @ScaledMetric(relativeTo: .body) private var repsMinWidth: CGFloat = 108

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

                    let step = LukiFormat.weightStep(weightUnit)
                    let weightStepper = LukiValueStepper(
                        value: set.weight.map { LukiFormat.weight($0) } ?? "–",
                        unit: LukiFormat.unitLabel(weightUnit),
                        minusLabel: tr("Decrease weight by %@, set %d", LukiFormat.weight(step), idx + 1),
                        plusLabel: tr("Increase weight by %@, set %d", LukiFormat.weight(step), idx + 1),
                        editLabel: tr("Weight, set %d", idx + 1),
                        keyboard: .decimal,
                        onMinus: {
                            var next = current
                            next[idx].weight = max(0, (set.weight ?? 0) - step)
                            commit(next)
                        },
                        onPlus: {
                            var next = current
                            next[idx].weight = (set.weight ?? 0) + step
                            commit(next)
                        },
                        onSubmit: { text in
                            if let v = LukiFormat.parseDecimal(text) {
                                var next = current
                                next[idx].weight = max(0, v)
                                commit(next)
                            }
                        }
                    )
                    let repsStepper = LukiValueStepper(
                        value: set.reps.map(String.init) ?? "–",
                        unit: tr("reps"),
                        minusLabel: tr("Decrease reps, set %d", idx + 1),
                        plusLabel: tr("Increase reps, set %d", idx + 1),
                        editLabel: tr("Reps, set %d", idx + 1),
                        keyboard: .integer,
                        onMinus: {
                            var next = current
                            next[idx].reps = max(0, (set.reps ?? 0) - 1)
                            commit(next)
                        },
                        onPlus: {
                            var next = current
                            next[idx].reps = (set.reps ?? 0) + 1
                            commit(next)
                        },
                        onSubmit: { text in
                            if let v = Int(text.trimmingCharacters(in: .whitespaces)) {
                                var next = current
                                next[idx].reps = max(0, v)
                                commit(next)
                            }
                        }
                    )
                    // Accessibility sizes stack the steppers; otherwise the reps stepper keeps a
                    // fixed share so weight can't squeeze the count away.
                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(spacing: 8) {
                            weightStepper
                            repsStepper
                        }
                        .frame(maxWidth: .infinity)
                    } else {
                        weightStepper
                        repsStepper
                            .frame(minWidth: min(repsMinWidth, 120), maxWidth: 120)
                    }

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

}

private extension WorkoutTemplateExerciseDto {
    /// New template slot from a smart suggestion (mirrors `onAdd` in the web workout builder).
    init(suggestion: WorkoutExerciseSuggestion, templateId: String, orderIndex: Int, weightUnit: WeightUnit) {
        self.init(
            templateId: templateId,
            exerciseId: suggestion.suggestedExercise.id,
            orderIndex: orderIndex,
            plannedSets: suggestion.recommendedSets,
            warmupSets: 0,
            targetRepsMin: suggestion.recommendedRepsMin,
            targetRepsMax: suggestion.recommendedRepsMax,
            targetWeight: suggestion.recommendedWeight,
            weightUnit: weightUnit,
            restSeconds: suggestion.recommendedRestSeconds,
            alternativeExerciseIds: Array(suggestion.suggestedExercise.alternativeExerciseIds.prefix(2)),
            exercise: suggestion.suggestedExercise
        )
    }
}

private extension Array where Element == WorkoutTemplateExerciseDto {
    /// Swaps the stalling exercise for the suggested one, keeping its sets and rest.
    mutating func replaceStalling(with suggestion: WorkoutExerciseSuggestion) {
        guard let stallingId = suggestion.stallingExerciseId else { return }
        for i in indices where self[i].exerciseId == stallingId {
            self[i].exerciseId = suggestion.suggestedExercise.id
            self[i].exercise = suggestion.suggestedExercise
            self[i].alternativeExerciseIds = [String](suggestion.suggestedExercise.alternativeExerciseIds.prefix(2))
        }
    }
}

private extension ISO8601DateFormatter {
    static func workoutsParse(_ iso: String) -> Date? {
        LukiDate.parseISO(iso)
    }
}
