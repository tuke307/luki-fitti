import SwiftUI
import LukiFittiModels
import LukiFittiDomain

extension ExerciseSearchIndex {
    /// Catalog search index with muscle group and equipment labels in every language.
    public static func catalogWithLabels(_ exercises: [ExerciseDto]) -> ExerciseSearchIndex {
        .catalog(exercises) { ex in
            [SupportedLocale.en, .de].flatMap { locale in
                [LukiI18n.muscleLabel(ex.primaryMuscleGroup, locale: locale),
                 LukiI18n.equipmentLabel(ex.equipment, locale: locale)]
            }
        }
    }
}

/// A group of exercises shown above the full list while the user is not searching, e.g. the
/// "Best matches" of the replace sheet. `detail` is a short line under each name.
public struct ExercisePickerSection: Identifiable, Sendable {
    public struct Item: Identifiable, Sendable {
        public var exercise: ExerciseDto
        public var detail: String
        public var id: String { exercise.id }

        public init(exercise: ExerciseDto, detail: String) {
            self.exercise = exercise
            self.detail = detail
        }
    }

    /// Also the accessibility identifier suffix: `ios.picker.section.<id>`.
    public var id: String
    public var title: String
    public var items: [Item]
    public var highlighted: Bool

    public init(id: String, title: String, items: [Item], highlighted: Bool = false) {
        self.id = id
        self.title = title
        self.items = items
        self.highlighted = highlighted
    }
}

/// Searchable Exercise Picker sheet matching `apps/web/components/gym/exercise-picker.tsx`: ranked,
/// typo-tolerant search by English/German name, alias, muscle group or equipment, plus muscle chips.
public struct SearchableExercisePickerSheet: View {
    public let title: String
    public let exercises: [ExerciseDto]
    public let selectedExerciseId: String?
    public let suggestedSections: [ExercisePickerSection]
    public let onSelect: (ExerciseDto) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr

    @State private var searchText: String = ""
    @State private var selectedMuscle: MuscleGroup?
    @State private var searchIndex: ExerciseSearchIndex?

    public init(
        title: String = "Select Exercise",
        exercises: [ExerciseDto],
        selectedExerciseId: String? = nil,
        suggestedSections: [ExercisePickerSection] = [],
        onSelect: @escaping (ExerciseDto) -> Void
    ) {
        self.title = title
        self.exercises = exercises
        self.selectedExerciseId = selectedExerciseId
        self.suggestedSections = suggestedSections.filter { !$0.items.isEmpty }
        self.onSelect = onSelect
    }

    /// Suggestions only while browsing; a search or muscle filter shows plain results.
    private var visibleSections: [ExercisePickerSection] {
        let browsing = searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && selectedMuscle == nil
        return browsing ? suggestedSections : []
    }

    private var filteredExercises: [ExerciseDto] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let matches = query.isEmpty
            ? exercises
            : (searchIndex ?? .catalogWithLabels(exercises)).search(query).map(\.exercise)
        guard let selectedMuscle else { return matches }
        return matches.filter { $0.primaryMuscleGroup == selectedMuscle }
    }

    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search Bar + Muscle Group Filter Chips
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                        TextField(tr("Search exercises"), text: $searchText)
                            #if !os(macOS)
                            .textInputAutocapitalization(.never)
                            #endif
                            .autocorrectionDisabled()
                        if !searchText.isEmpty {
                            Button {
                                searchText = ""
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
                    .background(RoundedRectangle(cornerRadius: 12).fill(LukiColors.fill))

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Button {
                                selectedMuscle = nil
                            } label: {
                                Text(tr("All Muscles (%d)", exercises.count))
                                    .font(.subheadline.weight(.medium))
                                    .padding(.horizontal, 12)
                                    .frame(minHeight: 44)
                                    .background(
                                        Capsule().fill(selectedMuscle == nil ? LukiColors.accent : LukiColors.fill)
                                    )
                                    .foregroundStyle(selectedMuscle == nil ? LukiColors.accentForeground : .primary)
                            }
                            .buttonStyle(.plain)

                            ForEach(MuscleGroup.allCases, id: \.self) { muscle in
                                Button {
                                    selectedMuscle = muscle
                                } label: {
                                    Text(LukiI18n.muscleLabel(muscle, locale: tr))
                                        .font(.subheadline.weight(.medium))
                                        .padding(.horizontal, 12)
                                        .frame(minHeight: 44)
                                        .background(
                                            Capsule().fill(selectedMuscle == muscle ? LukiColors.accent : LukiColors.fill)
                                        )
                                        .foregroundStyle(selectedMuscle == muscle ? LukiColors.accentForeground : .primary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(12)
                .background(LukiColors.cardBackground)

                // Filtered Exercise Results
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(visibleSections) { section in
                            suggestedSection(section)
                        }
                        if !visibleSections.isEmpty && !filteredExercises.isEmpty {
                            sectionHeader(tr("All exercises"), highlighted: false)
                        }
                        if filteredExercises.isEmpty {
                            VStack(spacing: 6) {
                                Image(systemName: "magnifyingglass")
                                    .font(.title2)
                                    .foregroundStyle(.secondary)
                                Text(tr("No results"))
                                    .font(.subheadline.bold())
                                    .foregroundStyle(.primary)
                            }
                            .padding(.top, 40)
                        } else {
                            ForEach(filteredExercises) { ex in
                                let isSelected = ex.id == selectedExerciseId
                                Button {
                                    onSelect(ex)
                                    dismiss()
                                } label: {
                                    HStack(spacing: 12) {
                                        ExerciseVectorVisualView(
                                            exerciseName: ex.name,
                                            primaryMuscle: ex.primaryMuscleGroup,
                                            compact: true
                                        )

                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(ex.name)
                                                .font(.subheadline.bold())
                                                .foregroundStyle(isSelected ? LukiColors.accent : .primary)
                                                .multilineTextAlignment(.leading)

                                            Text("\(LukiI18n.muscleLabel(ex.primaryMuscleGroup, locale: tr)) · \(LukiI18n.equipmentLabel(ex.equipment, locale: tr))")
                                                .font(.footnote)
                                                .foregroundStyle(.secondary)
                                        }

                                        Spacer()

                                        if isSelected {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundStyle(LukiColors.accent)
                                        }
                                    }
                                    .padding(10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 12)
                                            .fill(isSelected ? LukiColors.accent.opacity(0.14) : LukiColors.cardBackground)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(12)
                }
                .background(LukiColors.groupedBackground)
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Close")) { dismiss() }
                }
            }
            // Build the search index once per catalog instead of on every keystroke.
            .task(id: exercises.count) { searchIndex = .catalogWithLabels(exercises) }
        }
    }

    private func sectionHeader(_ text: String, highlighted: Bool) -> some View {
        Text(text)
            .font(.footnote.bold())
            .foregroundStyle(highlighted ? LukiColors.accent : .secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
            .accessibilityAddTraits(.isHeader)
    }

    private func suggestedSection(_ section: ExercisePickerSection) -> some View {
        VStack(spacing: 8) {
            sectionHeader(section.title, highlighted: section.highlighted)
            ForEach(section.items) { item in
                Button {
                    onSelect(item.exercise)
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.exercise.name)
                            .font(.subheadline.bold())
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                        Text(item.detail)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.leading)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(section.highlighted ? LukiColors.accent.opacity(0.14) : LukiColors.cardBackground)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ios.picker.suggestion.\(item.exercise.id)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ios.picker.section.\(section.id)")
    }
}

/// The short reason line of a ranked alternative, e.g. "Same movement · Cable · Both sides".
public enum AlternativeReasonFormatter {
    public static func line(for alternative: RankedAlternative, locale tr: SupportedLocale) -> String {
        let reasons = alternative.reasons
        let ex = alternative.exercise
        let movement: String? = reasons.contains(.SAME_MOVEMENT)
            ? tr("Same movement")
            : reasons.contains(.SIMILAR_MOVEMENT) ? tr("Similar movement") : nil
        let side: String? = switch ex.laterality {
        case .UNILATERAL: tr("One side")
        case .BILATERAL: tr("Both sides")
        case nil: nil
        }
        let done: String? = reasons.contains(.DONE_BEFORE) ? tr("Done before") : nil
        return [movement, LukiI18n.equipmentLabel(ex.equipment, locale: tr), side, done]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}
