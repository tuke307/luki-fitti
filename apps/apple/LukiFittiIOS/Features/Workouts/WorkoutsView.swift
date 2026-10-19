import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

public struct WorkoutsView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var collapsedFolderIds: Set<String> = []
    @State private var showingNewFolderSheet = false
    @State private var newFolderName = ""

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Workout Templates & Splits")
                            .font(.title2.bold())
                            .foregroundStyle(.white)
                        Text("Reorderable split folders, superset pairings, and backups")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("+ Folder") {
                        showingNewFolderSheet = true
                    }
                    .font(.caption.bold())
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(LukiColors.darkCard))
                }

                ForEach(viewModel.store.folders) { folder in
                    folderSection(folder)
                }

                if !viewModel.store.unfiledTemplates.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Unfiled Workouts")
                            .font(.headline)
                            .foregroundStyle(.white)
                        ForEach(viewModel.store.unfiledTemplates) { template in
                            templateCard(template)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(LukiColors.darkBackground)
        .sheet(isPresented: $showingNewFolderSheet) {
            NavigationStack {
                Form {
                    TextField("Folder Name (e.g. 4er Split)", text: $newFolderName)
                }
                .navigationTitle("Create Workout Folder")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingNewFolderSheet = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            guard !newFolderName.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                            var folders = viewModel.store.folders
                            folders.append(WorkoutFolderDto(name: newFolderName, sortOrder: folders.count))
                            viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: viewModel.store.unfiledTemplates)
                            newFolderName = ""
                            showingNewFolderSheet = false
                        }
                    }
                }
            }
        }
    }

    private func folderSection(_ folder: WorkoutFolderDto) -> some View {
        let isCollapsed = collapsedFolderIds.contains(folder.id)
        return VStack(alignment: .leading, spacing: 12) {
            Button {
                if isCollapsed {
                    collapsedFolderIds.remove(folder.id)
                } else {
                    collapsedFolderIds.insert(folder.id)
                }
            } label: {
                HStack(spacing: 10) {
                    Circle()
                        .fill(LukiColors.colorFromHex(folder.color))
                        .frame(width: 10, height: 10)
                    Text(folder.name)
                        .font(.headline.bold())
                        .foregroundStyle(.white)
                    Text("(\(folder.templates.count))")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Spacer()
                    Image(systemName: isCollapsed ? "chevron.right" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)

            if !isCollapsed {
                ForEach(folder.templates) { template in
                    templateCard(template)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(LukiColors.darkCard))
    }

    private func templateCard(_ template: WorkoutTemplateDto) -> some View {
        let matchingHistory = viewModel.store.historySessions.filter {
            $0.templateId == template.id || $0.workoutNameSnapshot == template.name
        }
        let lastSession = matchingHistory.first

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(template.name)
                        .font(.subheadline.bold())
                        .foregroundStyle(.white)
                    if let desc = template.description {
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

            HStack(spacing: 12) {
                Text("Total: \(matchingHistory.count) sessions")
                if let lastSession {
                    Text("Last: \(String(lastSession.startedAt.prefix(10)))")
                } else {
                    Text("Last: Never trained")
                }
            }
            .font(.caption2.monospacedDigit())
            .foregroundStyle(.secondary)

            ForEach(template.exercises.prefix(4)) { ex in
                HStack(spacing: 8) {
                    Text(ex.exercise?.name ?? "Exercise")
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                    Spacer()
                    if ex.restSeconds == 0 {
                        Text("Superset (0s)")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(LukiColors.electricCyan)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(LukiColors.electricCyan.opacity(0.15)))
                    }
                    Text("\(ex.plannedSets) × \(ex.targetRepsMin ?? 8)-\(ex.targetRepsMax ?? 12)")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 10) {
                Button {
                    viewModel.startSession(from: template, sourceDevice: .IPHONE)
                } label: {
                    Label("Start Session", systemImage: "play.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.neonLime))
                }
                .buttonStyle(.plain)

                Button {
                    duplicateTemplate(template)
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.caption)
                        .padding(9)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.04)))
    }

    private func duplicateTemplate(_ template: WorkoutTemplateDto) {
        var copy = template
        copy.id = "tpl-\(UUID().uuidString.lowercased())"
        copy.name = "\(template.name) (Copy)"
        var folders = viewModel.store.folders
        if let folderId = template.folderId,
           let idx = folders.firstIndex(where: { $0.id == folderId }) {
            folders[idx].templates.append(copy)
            viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: viewModel.store.unfiledTemplates)
        } else {
            var unfiled = viewModel.store.unfiledTemplates
            unfiled.append(copy)
            viewModel.store.saveWorkoutsOverview(folders: folders, unfiledTemplates: unfiled)
        }
    }
}
