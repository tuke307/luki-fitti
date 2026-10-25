import SwiftUI
import LukiFittiModels
import LukiFittiDesign

public struct WatchHomeView: View {
    @Bindable public var viewModel: WatchWorkoutViewModel

    public init(viewModel: WatchWorkoutViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        NavigationStack {
            List {
                if let active = viewModel.store.activeSession {
                    Button {
                        viewModel.activePageTab = 2
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Resume")
                                    .font(.headline)
                                Text(active.workoutNameSnapshot)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        } icon: {
                            Image(systemName: "figure.strengthtraining.traditional")
                                .foregroundStyle(LukiColors.accent)
                        }
                    }
                    .listItemTint(LukiColors.accent.opacity(0.35))
                }

                Section("Workouts") {
                    ForEach(viewModel.store.folders) { folder in
                        NavigationLink {
                            WatchFolderTemplatesView(viewModel: viewModel, folder: folder)
                        } label: {
                            folderLabel(name: folder.name, count: folder.templates.count, color: LukiColors.folderColor(folder.color))
                        }
                        .accessibilityIdentifier("watch.home.folder.\(folder.id)")
                    }

                    if !viewModel.store.unfiledTemplates.isEmpty {
                        NavigationLink {
                            WatchFolderTemplatesView(
                                viewModel: viewModel,
                                folder: WorkoutFolderDto(
                                    id: "folder-unfiled",
                                    name: "Unfiled",
                                    templates: viewModel.store.unfiledTemplates
                                )
                            )
                        } label: {
                            folderLabel(name: "Unfiled", count: viewModel.store.unfiledTemplates.count, color: .secondary)
                        }
                    }
                }

                if !viewModel.store.stretchingRoutines.isEmpty {
                    NavigationLink {
                        WatchStretchingListView(viewModel: viewModel)
                    } label: {
                        Label("Stretching", systemImage: "figure.flexibility")
                    }
                    .accessibilityIdentifier("watch.home.stretchingLink")
                }
            }
            .navigationTitle("LukiFitti")
        }
    }

    private func folderLabel(name: String, count: Int, color: Color) -> some View {
        HStack(spacing: 8) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(name).lineLimit(2)
            Spacer(minLength: 4)
            Text("\(count)")
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
    }
}

public struct WatchFolderTemplatesView: View {
    @Bindable public var viewModel: WatchWorkoutViewModel
    public let folder: WorkoutFolderDto

    public init(viewModel: WatchWorkoutViewModel, folder: WorkoutFolderDto) {
        self.viewModel = viewModel
        self.folder = folder
    }

    public var body: some View {
        List {
            ForEach(folder.templates) { template in
                let stats = lastPerformedStats(for: template)
                Button {
                    viewModel.startWorkout(from: template)
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(template.name)
                            .font(.headline)
                            .lineLimit(2)
                        Text(stats.totalCount > 0 ? "\(stats.dateText) · \(stats.durationText)" : "Never trained")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                }
                .accessibilityIdentifier("watch.folder.template.\(template.id)")
            }
        }
        .navigationTitle(folder.name)
    }

    private func lastPerformedStats(for template: WorkoutTemplateDto) -> (durationText: String, dateText: String, totalCount: Int) {
        let normalizedTemplateName = template.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let matched = viewModel.store.historySessions.filter { session in
            guard session.status == .COMPLETED else { return false }
            if let tid = session.templateId, tid == template.id {
                return true
            }
            return session.workoutNameSnapshot.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalizedTemplateName
        }
        guard let last = matched.first else {
            return ("--:--", "Never trained", 0)
        }
        let sec = max(0, last.activeDurationSeconds)
        let h = sec / 3600
        let m = (sec % 3600) / 60
        let s = sec % 60
        let dur = h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
        let shortDate = formatShortDayMonth(last.startedAt)
        return (dur, shortDate, matched.count)
    }

    private func formatShortDayMonth(_ iso: String) -> String {
        let f1 = ISO8601DateFormatter()
        f1.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let f2 = ISO8601DateFormatter()
        if let date = f1.date(from: iso) ?? f2.date(from: iso) {
            let out = DateFormatter()
            out.dateFormat = "dd MMM"
            return out.string(from: date)
        }
        return String(iso.prefix(10))
    }
}

public struct WatchStretchingListView: View {
    @Bindable public var viewModel: WatchWorkoutViewModel

    public init(viewModel: WatchWorkoutViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        List {
            ForEach(viewModel.store.stretchingRoutines) { routine in
                Button {
                    viewModel.startStretchingWorkout(from: routine)
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(routine.name)
                            .font(.headline)
                            .lineLimit(2)
                        Text("\(routine.estimatedDurationSeconds / 60) min · \(routine.targetArea)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Stretching")
    }
}
