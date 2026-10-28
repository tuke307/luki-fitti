import SwiftUI
import LukiFittiModels
import LukiFittiDomain
import LukiFittiDesign

public struct ExercisesAndStretchingView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var activeSubTab: String = "catalog"
    @State private var searchQuery: String = ""
    @State private var selectedMuscle: MuscleGroup?
    @State private var searchIndex: ExerciseSearchIndex?
    @Environment(\.lukiLocale) private var tr

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Picker(tr("Library"), selection: $activeSubTab) {
                    Text(tr("Exercises (%d)", viewModel.store.catalog.count)).tag("catalog")
                    Text(tr("Stretching (%d)", viewModel.store.stretchingRoutines.count)).tag("stretching")
                }
                .pickerStyle(.segmented)

                if activeSubTab == "catalog" {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                        TextField(tr("Search exercises"), text: $searchQuery)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        if !searchQuery.isEmpty {
                            Button {
                                searchQuery = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                                    .frame(minWidth: 44, minHeight: 44)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(tr("Clear search"))
                        }
                    }
                    .padding(.horizontal, 10)
                    .frame(minHeight: 44)
                    .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.cardBackground))

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Button {
                                selectedMuscle = nil
                            } label: {
                                Text(tr("All Muscles"))
                                    .font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 14)
                                    .frame(minHeight: 44)
                                    .background(Capsule().fill(selectedMuscle == nil ? LukiColors.accent : LukiColors.cardBackground))
                                    .foregroundStyle(selectedMuscle == nil ? LukiColors.accentForeground : .primary)
                            }
                            .buttonStyle(.plain)

                            ForEach(MuscleGroup.allCases, id: \.self) { muscle in
                                Button {
                                    selectedMuscle = muscle
                                } label: {
                                    Text(LukiI18n.muscleLabel(muscle, locale: tr))
                                        .font(.subheadline.weight(.semibold))
                                        .padding(.horizontal, 14)
                                        .frame(minHeight: 44)
                                        .background(Capsule().fill(selectedMuscle == muscle ? LukiColors.accent : LukiColors.cardBackground))
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
                                Text("\(LukiI18n.muscleLabel(exercise.primaryMuscleGroup, locale: tr)) · \(LukiI18n.equipmentLabel(exercise.equipment, locale: tr))")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
                    }
                } else {
                    ForEach(viewModel.store.stretchingRoutines) { routine in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(routine.name)
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Spacer()
                                Text(routine.targetArea)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            if let desc = routine.description {
                                Text(desc).font(.caption).foregroundStyle(.secondary)
                            }
                            Button {
                                viewModel.startStretchingSession(from: routine, sourceDevice: .IPHONE)
                            } label: {
                                Label(tr("Start"), systemImage: "figure.cooldown")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .accessibilityLabel(tr("Start %@", routine.name))
                            .accessibilityIdentifier("ios.library.startRoutine.\(routine.id)")
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
                    }
                }
            }
            .padding(16)
        }
        .background(LukiColors.groupedBackground)
        // Build the search index once per catalog instead of on every keystroke.
        .task(id: viewModel.store.catalog.count) {
            searchIndex = .catalogWithLabels(viewModel.store.catalog)
        }
    }

    private var filteredExercises: [ExerciseDto] {
        let catalog = viewModel.store.catalog
        let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let matches = q.isEmpty
            ? catalog
            : (searchIndex ?? .catalogWithLabels(catalog)).search(q).map(\.exercise)
        guard let selectedMuscle else { return matches }
        return matches.filter { $0.primaryMuscleGroup == selectedMuscle }
    }
}
