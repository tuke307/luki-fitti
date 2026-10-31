import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiWatchSync

public struct WatchHomeView: View {
    @Bindable public var viewModel: WatchWorkoutViewModel
    @Environment(\.lukiLocale) private var tr

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
                                Text(tr("Resume"))
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
                } else if let next = viewModel.nextUpTemplate {
                    Button {
                        viewModel.startWorkout(from: next)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tr("Continue with"))
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                Text(next.name)
                                    .font(.headline)
                                    .lineLimit(2)
                            }
                        } icon: {
                            Image(systemName: "play.fill")
                                .foregroundStyle(LukiColors.accent)
                        }
                    }
                    .listItemTint(LukiColors.accent.opacity(0.35))
                    .accessibilityIdentifier("watch.home.nextUp")
                }

                Section(tr("Workouts")) {
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
                                    name: tr("Unfiled"),
                                    templates: viewModel.store.unfiledTemplates
                                )
                            )
                        } label: {
                            folderLabel(name: tr("Unfiled"), count: viewModel.store.unfiledTemplates.count, color: .secondary)
                        }
                    }
                }

                if !viewModel.store.stretchingRoutines.isEmpty {
                    NavigationLink {
                        WatchStretchingListView(viewModel: viewModel)
                    } label: {
                        Label(tr("Stretching"), systemImage: "figure.flexibility")
                    }
                    .accessibilityIdentifier("watch.home.stretchingLink")
                }

                syncSection
            }
            .navigationTitle("LukiFitti")
        }
    }

    /// Compact sync row: an icon whose shape matches the state, one status line, then the account.
    private var syncSection: some View {
        let status = viewModel.watchSyncCoordinator.status
        return Section {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    syncIcon(status)
                    Text(syncText(status))
                        .font(.footnote)
                        .foregroundStyle(status.lastError != nil && !viewModel.isSyncing ? LukiColors.destructive : .primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(viewModel.store.currentUser?.email ?? tr("Not signed in"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("watch.home.syncStatus")

            Button {
                viewModel.syncNow()
            } label: {
                Label(tr("Sync"), systemImage: "arrow.triangle.2.circlepath")
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .disabled(viewModel.isSyncing)
            .accessibilityIdentifier("watch.home.syncNowButton")
        } header: {
            Text(tr("iPhone"))
        }
    }

    @ViewBuilder
    private func syncIcon(_ status: WatchConnectionStatus) -> some View {
        if viewModel.isSyncing {
            ProgressView()
                .progressViewStyle(.circular)
                .frame(width: 14, height: 14)
        } else if status.lastError != nil {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(LukiColors.destructive)
        } else if status.lastReceivedAt != nil {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(LukiColors.success)
        } else {
            Image(systemName: "exclamationmark.circle").foregroundStyle(LukiColors.warning)
        }
    }

    private func syncText(_ status: WatchConnectionStatus) -> String {
        if viewModel.isSyncing { return tr("Syncing") }
        if let error = status.lastError { return tr(error) }
        if let last = status.lastReceivedAt {
            return tr("Synced with iPhone %@", last.formatted(.relative(presentation: .named)))
        }
        return tr("Not synced with iPhone yet")
    }

    private func folderLabel(name: String, count: Int, color: Color) -> some View {
        HStack(spacing: 8) {
            Circle().fill(color).frame(width: 8, height: 8).accessibilityHidden(true)
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
    @Environment(\.lukiLocale) private var tr

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
                        Text(stats.totalCount > 0 ? "\(stats.dateText) · \(stats.durationText)" : tr("Never trained"))
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
            return ("–", tr("Never trained"), 0)
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
            return date.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: tr.rawValue)))
        }
        return String(iso.prefix(10))
    }
}

public struct WatchStretchingListView: View {
    @Bindable public var viewModel: WatchWorkoutViewModel
    @Environment(\.lukiLocale) private var tr

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
                        Text(tr("%d min · %@", routine.estimatedDurationSeconds / 60, routine.targetArea))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle(tr("Stretching"))
    }
}
