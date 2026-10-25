import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct WorkoutsView: View {
    @Bindable public var viewModel: LukiAppViewModel

    @State private var collapsedFolderIds: Set<String> = []

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

    private var areAllCollapsed: Bool {
        !allFolderIds.isEmpty && allFolderIds.allSatisfy { collapsedFolderIds.contains($0) }
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                headerBar

                ForEach(Array(viewModel.store.folders.enumerated()), id: \.element.id) { idx, folder in
                    folderSection(folder, index: idx)
                }

                if !viewModel.store.unfiledTemplates.isEmpty {
                    unfiledSection
                }
            }
            .padding(16)
        }
        .background(LukiColors.darkBackground)
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
            deleteTarget?.isFolder == true ? "Delete Folder?" : "Delete Workout Template?",
            isPresented: Binding(
                get: { deleteTarget != nil },
                set: { if !$0 { deleteTarget = nil } }
            )
        ) {
            if let target = deleteTarget {
                Button("Cancel", role: .cancel) {
                    deleteTarget = nil
                }
                Button("Confirm Delete", role: .destructive) {
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
                        ? "Are you sure you want to delete \"\(target.name)\"? Workouts inside this folder will be moved to Unfiled Workouts."
                        : "Are you sure you want to delete \"\(target.name)\"? Your historical training sessions and diary entries will NOT be deleted."
                )
            }
        }
    }

    // MARK: - Top Header Bar

    private var headerBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Workout Templates & Splits")
                .font(.title2.bold())
                .foregroundStyle(.white)
            Text("Reorderable split folders, superset pairings, session counters, and machine-busy backups")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                if allFolderIds.count > 1 {
                    Button {
                        if areAllCollapsed {
                            collapsedFolderIds.removeAll()
                        } else {
                            collapsedFolderIds = Set(allFolderIds)
                        }
                    } label: {
                        Label(
                            areAllCollapsed ? "Expand All" : "Collapse All",
                            systemImage: areAllCollapsed ? "chevron.up.chevron.down" : "arrow.down.right.and.arrow.up.left"
                        )
                        .font(.caption.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(Color.white.opacity(0.08)))
                        .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ios.workouts.collapseAllButton")
                }

                Button {
                    openCreateFolderModal()
                } label: {
                    Label("New Folder", systemImage: "folder.badge.plus")
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(LukiColors.darkCard))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ios.workouts.newFolderButton")

                Button {
                    openNewTemplateBuilder(defaultFolderId: viewModel.store.folders.first?.id)
                } label: {
                    Label("New Workout", systemImage: "plus")
                        .font(.caption.bold())
                        .foregroundStyle(.black)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(LukiColors.neonLime))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ios.workouts.newWorkoutButton")
            }
        }
    }

    // MARK: - Folder Section

    private func folderSection(_ folder: WorkoutFolderDto, index: Int) -> some View {
        let isCollapsed = collapsedFolderIds.contains(folder.id)
        let folderTemplateIds = Set(folder.templates.map(\.id))
        let folderSessions = viewModel.store.historySessions.filter {
            if let tid = $0.templateId { return folderTemplateIds.contains(tid) }
            return false
        }
        let lastDate = folderSessions.first.map { String($0.startedAt.prefix(10)) } ?? "—"

        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Button {
                    if isCollapsed {
                        collapsedFolderIds.remove(folder.id)
                    } else {
                        collapsedFolderIds.insert(folder.id)
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: isCollapsed ? "chevron.right" : "chevron.down")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                        Circle()
                            .fill(LukiColors.folderColor(folder.color))
                            .frame(width: 10, height: 10)
                        Image(systemName: "folder.fill")
                            .foregroundStyle(LukiColors.neonLime)
                        Text(folder.name)
                            .font(.headline.bold())
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Spacer()
                        Text("\(folder.templates.count) workouts")
                            .font(.caption2.bold().monospacedDigit())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Color.white.opacity(0.08)))
                            .foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)

                HStack(spacing: 8) {
                    Text("\(folderSessions.count) total sessions • Last: \(lastDate)")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)

                    Spacer()

                    Button {
                        reorderFolder(folder.id, moveUp: true)
                    } label: {
                        Image(systemName: "arrow.up")
                            .font(.caption2.bold())
                            .frame(width: 24, height: 24)
                            .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.08)))
                    }
                    .buttonStyle(.plain)
                    .disabled(index == 0)

                    Button {
                        reorderFolder(folder.id, moveUp: false)
                    } label: {
                        Image(systemName: "arrow.down")
                            .font(.caption2.bold())
                            .frame(width: 24, height: 24)
                            .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.08)))
                    }
                    .buttonStyle(.plain)
                    .disabled(index == viewModel.store.folders.count - 1)

                    Button {
                        openNewTemplateBuilder(defaultFolderId: folder.id)
                    } label: {
                        Text("+ Workout")
                            .font(.caption2.bold())
                            .foregroundStyle(LukiColors.neonLime)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(LukiColors.neonLime.opacity(0.15)))
                    }
                    .buttonStyle(.plain)

                    Button {
                        openRenameFolderModal(folder)
                    } label: {
                        Text("Rename")
                            .font(.caption2.bold())
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)

                    Button(role: .destructive) {
                        deleteTarget = DeleteTarget(id: folder.id, name: folder.name, isFolder: true)
                    } label: {
                        Image(systemName: "trash")
                            .font(.caption2)
                            .foregroundStyle(.red.opacity(0.85))
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                }
            }

            if !isCollapsed {
                if folder.templates.isEmpty {
                    Text("No workouts in this folder yet. Tap \"+ Workout\" or move an existing template here.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(16)
                        .background(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.1), style: StrokeStyle(lineWidth: 1, dash: [4])))
                } else {
                    ForEach(folder.templates) { template in
                        templateCard(template)
                    }
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(LukiColors.darkCard))
    }

    private var unfiledSection: some View {
        let isCollapsed = collapsedFolderIds.contains("__unfiled__")
        return VStack(alignment: .leading, spacing: 12) {
            Button {
                if isCollapsed {
                    collapsedFolderIds.remove("__unfiled__")
                } else {
                    collapsedFolderIds.insert("__unfiled__")
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: isCollapsed ? "chevron.right" : "chevron.down")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    Image(systemName: "dumbbell.fill")
                        .foregroundStyle(.secondary)
                    Text("Unfiled Workouts")
                        .font(.headline.bold())
                        .foregroundStyle(.white)
                    Spacer()
                    Text("\(viewModel.store.unfiledTemplates.count)")
                        .font(.caption2.bold().monospacedDigit())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Color.white.opacity(0.08)))
                }
            }
            .buttonStyle(.plain)

            if !isCollapsed {
                ForEach(viewModel.store.unfiledTemplates) { template in
                    templateCard(template)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(LukiColors.darkCard))
    }

    // MARK: - Template Card

    private func templateCard(_ template: WorkoutTemplateDto) -> some View {
        let matchingHistory = viewModel.store.historySessions.filter {
            $0.templateId == template.id || $0.workoutNameSnapshot.lowercased() == template.name.lowercased()
        }
        let lastSession = matchingHistory.first

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(template.name)
                        .font(.subheadline.bold())
                        .foregroundStyle(.white)
                    if let desc = template.description, !desc.isEmpty {
                        Text(desc)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Text("\(template.exercises.count) ex • ~\(template.estimatedDurationMinutes ?? 60)m")
                    .font(.caption2.monospacedDigit())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.white.opacity(0.08)))
            }

            HStack {
                Label("Total: \(matchingHistory.count) sessions", systemImage: "clock.arrow.circlepath")
                    .foregroundStyle(LukiColors.neonLime)
                Spacer()
                if let lastSession {
                    Text("Last: \(String(lastSession.startedAt.prefix(10)))")
                        .foregroundStyle(.secondary)
                } else {
                    Text("Last: Never trained")
                        .foregroundStyle(.secondary)
                }
            }
            .font(.caption2.monospacedDigit())
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.04)))

            // Full ordered exercise list (Gymlife Superset Blocks & Standalone Rows)
            let blocks = ProgressionEngine.groupTemplateExercisesIntoBlocks(template.exercises)
            VStack(spacing: 8) {
                ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                    if block.isSuperset {
                        VStack(alignment: .leading, spacing: 0) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 4) {
                                        Text("SUPERSET")
                                            .font(.caption.weight(.heavy))
                                            .foregroundStyle(LukiColors.electricCyan)
                                        Text("× \(block.rounds) ROUNDS")
                                            .font(.caption.weight(.heavy).monospacedDigit())
                                            .foregroundStyle(.white)
                                    }
                                    Text("Rest 0 s between exercises · \(ProgressionEngine.formatRestDurationMinSec(block.roundRestSeconds)) between rounds")
                                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
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
                                        .font(.system(size: 10, weight: .black, design: .monospaced))
                                        .foregroundStyle(LukiColors.electricCyan)
                                        .frame(width: 20, height: 20)
                                        .background(Circle().fill(Color.black))
                                    Text(exInfo?.name ?? "Exercise")
                                        .font(.caption.bold())
                                        .foregroundStyle(.white)
                                        .lineLimit(1)
                                    Spacer()
                                    Text("\(ex.plannedSets)×\(ex.targetRepsMin ?? 8)-\(ex.targetRepsMax ?? 12)")
                                        .font(.caption2.bold().monospacedDigit())
                                        .foregroundStyle(LukiColors.electricCyan)
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 3)
                                        .background(RoundedRectangle(cornerRadius: 6).fill(LukiColors.electricCyan.opacity(0.18)))
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                            }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(LukiColors.electricCyan.opacity(0.45), lineWidth: 1)
                        )
                    } else if let firstItem = block.items.first {
                        let ex = firstItem.item
                        let idx = firstItem.globalIndex
                        let exInfo = ex.exercise ?? viewModel.store.catalog.first { $0.id == ex.exerciseId }
                        HStack(spacing: 8) {
                            Text("\(idx + 1).")
                                .font(.caption.bold().monospacedDigit())
                                .foregroundStyle(LukiColors.neonLime)
                            Text(exInfo?.name ?? "Exercise")
                                .font(.caption.bold())
                                .foregroundStyle(.white)
                                .lineLimit(1)
                            Spacer()
                            if !ex.alternativeExerciseIds.isEmpty {
                                Text("+\(ex.alternativeExerciseIds.count) backup")
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundStyle(.secondary)
                            }
                            Text("\(ex.plannedSets)×\(ex.targetRepsMin ?? 8)-\(ex.targetRepsMax ?? 12)")
                                .font(.caption2.bold().monospacedDigit())
                                .foregroundStyle(LukiColors.electricCyan)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(RoundedRectangle(cornerRadius: 6).fill(LukiColors.electricCyan.opacity(0.16)))
                            Text("\(ex.restSeconds)s")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.03)))
                    }
                }

                // Rainbow Smart Exercise Suggestion (Max 1 per workout)
                if viewModel.store.preferences.exerciseSuggestionsEnabled,
                   let suggestion = ProgressionEngine.computeWorkoutExerciseSuggestion(
                       workoutName: template.name,
                       existingExerciseIds: template.exercises.map(\.exerciseId),
                       catalog: viewModel.store.catalog,
                       historySessions: viewModel.store.historySessions,
                       weightUnit: viewModel.store.preferences.weightUnit
                   ) {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles")
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("SMART SUGGESTION • \(suggestion.suggestedExercise.name)")
                                .font(.system(size: 10, weight: .heavy))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                            Text(suggestion.reasonText)
                                .font(.system(size: 9))
                                .foregroundStyle(.white.opacity(0.85))
                                .lineLimit(2)
                        }
                        Spacer()
                    }
                    .padding(9)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color.pink.opacity(0.25),
                                        Color.orange.opacity(0.22),
                                        Color.green.opacity(0.22),
                                        Color.cyan.opacity(0.25),
                                        Color.purple.opacity(0.25)
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(
                                        LinearGradient(
                                            colors: [.pink, .orange, .yellow, .green, .cyan, .purple],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        ),
                                        lineWidth: 1.5
                                    )
                            )
                    )
                    .accessibilityIdentifier("ios.workouts.rainbowSuggestion.\(template.id)")
                }
            }

            // Action Row 1: Edit, Duplicate, Move to Folder, Delete
            HStack(spacing: 8) {
                Button {
                    openEditTemplateBuilder(template)
                } label: {
                    Label("Edit", systemImage: "pencil")
                        .font(.caption.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.1)))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                Button {
                    duplicateTemplate(template)
                } label: {
                    Label("Duplicate", systemImage: "doc.on.doc")
                        .font(.caption.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.1)))
                        .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                Menu {
                    Button("Unfiled") {
                        moveTemplate(template, toFolderId: nil)
                    }
                    ForEach(viewModel.store.folders) { f in
                        Button("Folder: \(f.name)") {
                            moveTemplate(template, toFolderId: f.id)
                        }
                    }
                } label: {
                    Label("Move", systemImage: "folder")
                        .font(.caption.bold())
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.1)))
                        .foregroundStyle(.white)
                }

                Spacer()

                Button(role: .destructive) {
                    deleteTarget = DeleteTarget(id: template.id, name: template.name, isFolder: false)
                } label: {
                    Image(systemName: "trash")
                        .font(.caption.bold())
                        .foregroundStyle(.red.opacity(0.9))
                        .padding(7)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.red.opacity(0.12)))
                }
                .buttonStyle(.plain)
            }

            // Action Row 2: Start Session
            Button {
                viewModel.startSession(from: template, sourceDevice: .IPHONE)
            } label: {
                Label("Start Session", systemImage: "play.fill")
                    .font(.caption.bold())
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.neonLime))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ios.workouts.startTemplate.\(template.id)")
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.05)))
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
                                            .stroke(Color.white, lineWidth: folderColor == hex ? 3 : 0)
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
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                        TextField("e.g. Push A — Chest, Shoulders & Triceps", text: $name)
                            .textFieldStyle(.roundedBorder)

                        Text("Folder")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                        Picker("Folder", selection: $folderId) {
                            Text("Unfiled (No Folder)").tag("")
                            ForEach(folders) { folder in
                                Text(folder.name).tag(folder.id)
                            }
                        }
                        .pickerStyle(.menu)

                        Text("Notes / Focus")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                        TextField("Optional focus notes...", text: $desc)
                            .textFieldStyle(.roundedBorder)

                        Stepper("Est. Duration: \(durationMin) min", value: $durationMin, in: 10...240, step: 5)
                            .font(.subheadline)
                            .foregroundStyle(.white)
                    }
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))

                    HStack {
                        Text("Ordered Exercises (\(exercises.count))")
                            .font(.headline.bold())
                            .foregroundStyle(.white)
                        Spacer()
                        Button {
                            showingAddPickerSheet = true
                        } label: {
                            Text("+ Add Exercise Slot")
                                .font(.caption.bold())
                                .foregroundStyle(.black)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(Capsule().fill(LukiColors.neonLime))
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
                                    .foregroundStyle(.black)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Capsule().fill(LukiColors.neonLime))

                                Button {
                                    pickingSlotId = slot.id
                                } label: {
                                    HStack(spacing: 6) {
                                        Image(systemName: "magnifyingglass")
                                            .font(.caption2.bold())
                                            .foregroundStyle(LukiColors.neonLime)
                                        Text(resolvedEx?.name ?? "Select Exercise")
                                            .font(.subheadline.bold())
                                            .foregroundStyle(LukiColors.neonLime)
                                            .lineLimit(1)
                                            .truncationMode(.tail)
                                        Spacer(minLength: 4)
                                        Image(systemName: "chevron.up.chevron.down")
                                            .font(.caption2.bold())
                                            .foregroundStyle(LukiColors.neonLime)
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 7)
                                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.07)))
                                }
                                .buttonStyle(.plain)

                                Button {
                                    guard idx > 0 else { return }
                                    exercises.swapAt(idx, idx - 1)
                                } label: {
                                    Image(systemName: "arrow.up")
                                        .font(.caption.bold())
                                        .frame(width: 28, height: 28)
                                        .background(RoundedRectangle(cornerRadius: 7).fill(Color.white.opacity(0.08)))
                                }
                                .buttonStyle(.plain)
                                .disabled(idx == 0)

                                Button {
                                    guard idx < exercises.count - 1 else { return }
                                    exercises.swapAt(idx, idx + 1)
                                } label: {
                                    Image(systemName: "arrow.down")
                                        .font(.caption.bold())
                                        .frame(width: 28, height: 28)
                                        .background(RoundedRectangle(cornerRadius: 7).fill(Color.white.opacity(0.08)))
                                }
                                .buttonStyle(.plain)
                                .disabled(idx == exercises.count - 1)

                                Button(role: .destructive) {
                                    exercises.removeAll { $0.id == slot.id }
                                } label: {
                                    Image(systemName: "trash")
                                        .font(.caption.bold())
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
                                    .font(.caption2.bold())
                                    .foregroundStyle(isSupersetWithNext ? LukiColors.electricCyan : .secondary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 14).fill(LukiColors.darkCard))
                    }
                }
                .padding(16)
            }
            .background(LukiColors.darkBackground)
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
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.secondary)
                .lineLimit(1)

            HStack(spacing: 0) {
                Button(action: onDecrement) {
                    Image(systemName: "minus")
                        .font(.caption.bold())
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)

                Text(valueText)
                    .font(.subheadline.bold().monospacedDigit())
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)

                Button(action: onIncrement) {
                    Image(systemName: "plus")
                        .font(.caption.bold())
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.07)))
        }
    }
}
