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
            ScrollView {
                VStack(spacing: 10) {
                    if let active = viewModel.store.activeSession {
                        Button {
                            viewModel.activePageTab = 2
                        } label: {
                            HStack {
                                Image(systemName: "bolt.heart.fill")
                                Text("RESUME: \(active.workoutNameSnapshot.uppercased())")
                                    .font(.caption.bold())
                            }
                            .foregroundStyle(.black)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.neonLime))
                        }
                        .buttonStyle(.plain)
                    }

                    ForEach(viewModel.store.folders) { folder in
                        NavigationLink {
                            WatchFolderTemplatesView(viewModel: viewModel, folder: folder)
                        } label: {
                            HStack(spacing: 8) {
                                Text("📁")
                                Text(folder.name.uppercased())
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(.white)
                                    .multilineTextAlignment(.leading)
                                Spacer()
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 14)
                            .background(
                                RoundedRectangle(cornerRadius: 16)
                                    .fill(LukiColors.watchFolderSlate)
                            )
                        }
                        .buttonStyle(.plain)
                    }

                    if !viewModel.store.unfiledTemplates.isEmpty {
                        let unfiledFolder = WorkoutFolderDto(
                            id: "folder-unfiled",
                            name: "UNFILED WORKOUTS",
                            templates: viewModel.store.unfiledTemplates
                        )
                        NavigationLink {
                            WatchFolderTemplatesView(viewModel: viewModel, folder: unfiledFolder)
                        } label: {
                            HStack(spacing: 8) {
                                Text("📁")
                                Text("UNFILED WORKOUTS")
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(.white)
                                Spacer()
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 14)
                            .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.watchFolderSlate))
                        }
                        .buttonStyle(.plain)
                    }

                    if !viewModel.store.stretchingRoutines.isEmpty {
                        NavigationLink {
                            WatchStretchingListView(viewModel: viewModel)
                        } label: {
                            HStack(spacing: 8) {
                                Text("🧘")
                                Text("STRETCHING & MOBILITY")
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(.white)
                                Spacer()
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 14)
                            .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.watchFolderSlate))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
            }
            .background(Color.black)
            .navigationTitle("LukiFitti")
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
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("📁 \(folder.name.uppercased())")
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundStyle(.white)
                    Rectangle()
                        .fill(Color.white)
                        .frame(height: 1.5)
                }
                .padding(.bottom, 4)

                ForEach(Array(folder.templates.enumerated()), id: \.element.id) { idx, template in
                    let stats = lastPerformedStats(for: template)
                    Button {
                        viewModel.startWorkout(from: template)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(template.name.uppercased())
                                .font(.system(size: 13, weight: .black))
                                .foregroundStyle(Color(red: 0.07, green: 0.07, blue: 0.07))
                                .multilineTextAlignment(.leading)

                            HStack(spacing: 8) {
                                Text("⏱ \(stats.durationText)")
                                Text("📅 \(stats.dateText)")
                                if stats.totalCount > 0 {
                                    Text("• \(stats.totalCount)x")
                                }
                            }
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundStyle(Color.black.opacity(0.78))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(LukiColors.watchTemplateCardFill(at: idx))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 8)
        }
        .background(Color.black)
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
            return ("--:--", "New", 0)
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
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(viewModel.store.stretchingRoutines.enumerated()), id: \.element.id) { idx, routine in
                    Button {
                        viewModel.startStretchingWorkout(from: routine)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(routine.name.uppercased())
                                .font(.system(size: 13, weight: .black))
                                .foregroundStyle(.black)
                            Text("⏱ \(routine.estimatedDurationSeconds / 60) min • \(routine.targetArea)")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.black.opacity(0.75))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(LukiColors.watchTemplateCardFill(at: idx))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 8)
        }
        .background(Color.black)
    }
}
