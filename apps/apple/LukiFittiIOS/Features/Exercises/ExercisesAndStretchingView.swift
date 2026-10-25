import SwiftUI
import LukiFittiModels
import LukiFittiDesign

public struct ExercisesAndStretchingView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var activeSubTab: String = "catalog"
    @State private var searchQuery: String = ""
    @State private var selectedMuscle: MuscleGroup?

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Picker("Library Mode", selection: $activeSubTab) {
                    Text("Catalog (\(viewModel.store.catalog.count))").tag("catalog")
                    Text("Stretching Studio (\(viewModel.store.stretchingRoutines.count))").tag("stretching")
                }
                .pickerStyle(.segmented)

                if activeSubTab == "catalog" {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                        TextField("Search 130+ exercises by name, muscle, or German alias...", text: $searchQuery)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        if !searchQuery.isEmpty {
                            Button {
                                searchQuery = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.darkCard))

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Button {
                                selectedMuscle = nil
                            } label: {
                                Text("All Muscles")
                                    .font(.caption.bold())
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(Capsule().fill(selectedMuscle == nil ? LukiColors.neonLime : LukiColors.darkCard))
                                    .foregroundStyle(selectedMuscle == nil ? LukiColors.accentForeground : .primary)
                            }
                            .buttonStyle(.plain)

                            ForEach(MuscleGroup.allCases, id: \.self) { muscle in
                                Button {
                                    selectedMuscle = muscle
                                } label: {
                                    Text(LukiI18n.muscleLabel(muscle))
                                        .font(.caption.bold())
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(Capsule().fill(selectedMuscle == muscle ? LukiColors.neonLime : LukiColors.darkCard))
                                        .foregroundStyle(selectedMuscle == muscle ? LukiColors.accentForeground : .primary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    ForEach(filteredExercises) { exercise in
                        HStack(spacing: 12) {
                            ExerciseVectorVisualView(
                                exerciseName: exercise.name,
                                primaryMuscle: exercise.primaryMuscleGroup,
                                compact: true
                            )
                            VStack(alignment: .leading, spacing: 4) {
                                Text(exercise.name)
                                    .font(.subheadline.bold())
                                    .foregroundStyle(.primary)
                                Text("\(LukiI18n.muscleLabel(exercise.primaryMuscleGroup)) • \(LukiI18n.equipmentLabel(exercise.equipment))")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 14).fill(LukiColors.darkCard))
                    }
                } else {
                    ForEach(viewModel.store.stretchingRoutines) { routine in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(routine.name)
                                    .font(.headline.bold())
                                    .foregroundStyle(.primary)
                                Spacer()
                                Text(routine.targetArea)
                                    .font(.caption2)
                                    .foregroundStyle(LukiColors.electricCyan)
                            }
                            if let desc = routine.description {
                                Text(desc).font(.caption).foregroundStyle(.secondary)
                            }
                            Button {
                                viewModel.startStretchingSession(from: routine, sourceDevice: .IPHONE)
                            } label: {
                                Label("Start Stretching Session", systemImage: "figure.cooldown")
                                    .font(.caption.bold())
                                    .foregroundStyle(LukiColors.accentForeground)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 9)
                                    .background(RoundedRectangle(cornerRadius: 10).fill(LukiColors.electricCyan))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 16).fill(LukiColors.darkCard))
                    }
                }
            }
            .padding(16)
        }
        .background(LukiColors.darkBackground)
    }

    private var filteredExercises: [ExerciseDto] {
        let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return viewModel.store.catalog.filter { ex in
            if let selectedMuscle, ex.primaryMuscleGroup != selectedMuscle { return false }
            guard !q.isEmpty else { return true }
            return ex.name.lowercased().contains(q) ||
                ex.tags.contains(where: { $0.lowercased().contains(q) }) ||
                LukiI18n.muscleLabel(ex.primaryMuscleGroup, locale: .de).lowercased().contains(q)
        }
    }
}
