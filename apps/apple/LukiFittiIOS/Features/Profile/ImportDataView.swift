import SwiftUI
import UniformTypeIdentifiers
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiAPI

/// Imports a `luki-fitti-import@1` file (a LukiFitti backup or a migration guide's output):
/// pick → preview → confirm → commit. The file only leaves the device as the request body.
struct ImportDataView: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @Environment(\.openURL) private var openURL
    @State private var showsPicker = false
    @State private var state: ImportState = .idle

    static let formatDocURL = URL(string: "https://github.com/tuke307/luki-fitti/blob/main/docs/import-format.md")!

    enum ImportState: Equatable {
        case idle
        case checking
        case preview(Data, ImportPreviewDto)
        case importing(ImportPreviewDto)
        case done(ImportPreviewDto)
        case invalid([ImportIssueDto])
        case failed(String)
    }

    /// Step-by-step migration guides in the public repo. App names stay untranslated.
    private static let importGuides: [(name: String, docFile: String, accessibilityId: String)] = [
        ("GymLife", "gymlife-import", "ios.profile.row.import.gymlife"),
        ("Alpha Progression", "alpha-progression-import", "ios.profile.row.import.alphaProgression"),
    ]

    var body: some View {
        List {
            if viewModel.store.currentUser == nil {
                Section {
                    Text(tr("Sign in to import a file."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("ios.import.signInHint")
                }
            } else {
                Section {
                    Text(tr("Import a LukiFitti backup or a file made by one of the migration guides. Anything already in your account is skipped, so importing the same file twice changes nothing."))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button {
                        openURL(Self.formatDocURL)
                    } label: {
                        Label(tr("What file can I import?"), systemImage: "questionmark.circle")
                    }
                    .accessibilityIdentifier("ios.import.formatDoc")
                }

                stateSection

                Section {
                    if case .preview(let data, let preview) = state, preview.hasNewData {
                        Button {
                            Task { await commit(data, preview) }
                        } label: {
                            Label(tr("Import Data"), systemImage: "square.and.arrow.down")
                                .fontWeight(.semibold)
                        }
                        .accessibilityIdentifier("ios.import.commit")
                    }
                    Button {
                        showsPicker = true
                    } label: {
                        Label(state == .idle ? tr("Choose File") : tr("Choose Another File"), systemImage: "doc")
                    }
                    .disabled(isBusy)
                    .accessibilityIdentifier("ios.import.chooseFile")
                }
            }

            Section {
                ForEach(Self.importGuides, id: \.name) { guide in
                    Button {
                        if let url = URL(string: "https://github.com/tuke307/luki-fitti/blob/main/docs/\(guide.docFile).md") {
                            openURL(url)
                        }
                    } label: {
                        SettingsRow(guide.name, systemImage: "square.and.arrow.down", tint: LukiColors.accent)
                    }
                    .accessibilityIdentifier(guide.accessibilityId)
                }
            } header: {
                Text(tr("From other apps"))
            } footer: {
                Text(tr("Step-by-step guides for moving your data into LukiFitti."))
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("Data import"))
        .navigationBarTitleDisplayMode(.inline)
        .fileImporter(isPresented: $showsPicker, allowedContentTypes: [.json]) { result in
            guard case .success(let url) = result else { return }
            Task { await preview(url) }
        }
    }

    private var isBusy: Bool {
        switch state {
        case .checking, .importing: true
        default: false
        }
    }

    @ViewBuilder
    private var stateSection: some View {
        switch state {
        case .idle:
            EmptyView()
        case .checking:
            Section { ProgressView(tr("Checking file…")) }
        case .importing(let preview):
            summary(preview)
            Section { ProgressView(tr("Importing…")) }
        case .preview(_, let preview):
            summary(preview)
        case .done(let result):
            Section {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tr("Import complete")).fontWeight(.semibold)
                        Text(tr(
                            "Added %d sessions, %d workouts and %d folders.",
                            result.counts.sessions.new, result.counts.templates.new, result.counts.folders.new
                        ))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(LukiColors.accent)
                }
            }
        case .invalid(let issues):
            Section {
                ForEach(Array(issues.enumerated()), id: \.offset) { _, issue in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(issue.path.isEmpty ? "(file)" : issue.path).font(.caption.monospaced())
                        Text(issue.message).font(.footnote)
                    }
                }
            } header: {
                Text(tr("This file doesn’t match the import format:"))
            }
        case .failed(let message):
            Section {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
        }
    }

    @ViewBuilder
    private func summary(_ preview: ImportPreviewDto) -> some View {
        Section {
            countRow(tr("Sessions"), preview.counts.sessions)
            countRow(tr("Workouts"), preview.counts.templates)
            countRow(tr("Folders"), preview.counts.folders)
            countRow(tr("Custom exercises"), preview.counts.customExercises)
            Text(tr("%d new sets", preview.newSets))
                .font(.footnote)
                .foregroundStyle(.secondary)
            if let from = LukiDate.parseISO(preview.earliestSessionAt),
               let to = LukiDate.parseISO(preview.latestSessionAt) {
                Text(tr("Sessions from %@ to %@", from.formatted(date: .abbreviated, time: .omitted), to.formatted(date: .abbreviated, time: .omitted)))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            ForEach(preview.warnings, id: \.key) { warning in
                Label(tr("You already have a folder “%@”; its workouts are added to it.", warning.name), systemImage: "exclamationmark.triangle")
                    .font(.footnote)
            }
            if preview.unknownSlugCount > 0 {
                VStack(alignment: .leading, spacing: 4) {
                    Text(tr("These exercises don’t exist in the catalog, so the file can’t be imported:"))
                    Text(preview.unknownSlugs.joined(separator: ", ")).font(.caption.monospaced())
                    if preview.unknownSlugCount > preview.unknownSlugs.count {
                        Text(tr("…and %d more", preview.unknownSlugCount - preview.unknownSlugs.count))
                    }
                }
                .font(.footnote)
                .foregroundStyle(.red)
            } else if !preview.hasNewData {
                Text(tr("Everything in this file is already in your account."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text(tr("Ready to Import"))
        } footer: {
            Text(tr("From %@", preview.sourceApp))
        }
    }

    private func countRow(_ title: String, _ counts: ImportKindCountsDto) -> some View {
        LabeledContent(title) {
            VStack(alignment: .trailing, spacing: 0) {
                Text("\(counts.total)").monospacedDigit()
                Text(tr("%d new · %d already there", counts.new, counts.existing))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func preview(_ url: URL) async {
        state = .checking
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        guard size <= ImportFormat.maxBytes else {
            state = .failed(tr("The file is larger than 10 MB."))
            return
        }
        guard let data = try? Data(contentsOf: url) else {
            state = .failed(tr("Couldn’t read the file."))
            return
        }
        guard (try? JSONSerialization.jsonObject(with: data)) != nil else {
            state = .failed(tr("This file is not valid JSON."))
            return
        }
        do {
            state = .preview(data, try await viewModel.store.apiClient.previewImport(fileData: data))
        } catch {
            state = failure(error)
        }
    }

    private func commit(_ data: Data, _ preview: ImportPreviewDto) async {
        state = .importing(preview)
        do {
            let result = try await viewModel.store.apiClient.commitImport(fileData: data)
            await viewModel.store.refreshFromServerAfterAuth()
            state = .done(result)
        } catch {
            state = failure(error)
        }
    }

    private func failure(_ error: Error) -> ImportState {
        switch error {
        case ImportAPIError.invalidFile(let issues): return .invalid(issues)
        case ImportAPIError.tooLarge: return .failed(tr("The file is larger than 10 MB."))
        case ImportAPIError.rateLimited: return .failed(tr("Too many imports. Please try again in an hour."))
        case APIClientError.offline: return .failed(tr("Couldn’t reach the server. Check your connection and try again."))
        default: return .failed(tr("The import failed. Nothing was changed. Please try again."))
        }
    }
}

/// Export & backup page: full JSON backup and the workout-log CSV as share sheets.
struct DataExportView: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        List {
            Section {
                let backup = BackupExportFile(
                    folders: viewModel.store.folders,
                    unfiledTemplates: viewModel.store.unfiledTemplates,
                    historySessions: viewModel.store.historySessions,
                    catalog: viewModel.store.catalog
                )
                ShareLink(item: backup, preview: SharePreview(backup.fileName)) {
                    SettingsRow(tr("Export Backup"), systemImage: "square.and.arrow.up", tint: LukiColors.setStretch)
                }
                .accessibilityIdentifier("ios.profile.row.exportBackup")

                let workoutLog = WorkoutLogExportFile(
                    historySessions: viewModel.store.historySessions,
                    folders: viewModel.store.folders
                )
                ShareLink(item: workoutLog, preview: SharePreview(workoutLog.fileName)) {
                    SettingsRow(tr("Workout Log (CSV)"), systemImage: "tablecells", tint: LukiColors.setStretch)
                }
                .accessibilityIdentifier("ios.profile.row.exportCsv")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(tr("Export & backup"))
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Export Backup: folders, templates, custom exercises and history as `luki-fitti-import@1`,
/// built only when the user actually shares it.
struct BackupExportFile: Transferable {
    let folders: [WorkoutFolderDto]
    let unfiledTemplates: [WorkoutTemplateDto]
    let historySessions: [WorkoutSessionDto]
    let catalog: [ExerciseDto]
    let fileName = ImportFileBuilder.fileName()

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .json) { backup in
            try ImportFileBuilder.encode(ImportFileBuilder.build(
                folders: backup.folders,
                unfiledTemplates: backup.unfiledTemplates,
                historySessions: backup.historySessions,
                catalog: backup.catalog,
                customExercises: backup.catalog.filter { !$0.isSystem },
                sourceApp: "LukiFitti iOS"
            ))
        }
        .suggestedFileName { $0.fileName }
    }
}
