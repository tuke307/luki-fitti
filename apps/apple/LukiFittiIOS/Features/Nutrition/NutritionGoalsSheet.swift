import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

/// Daily calorie and macro goals with a suggestion from the health details. Saves automatically;
/// used as a Profile page and, wrapped in `NutritionGoalsSheet`, from the Food tab.
struct NutritionGoalsView: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var kcalGoal: Int?
    @State private var proteinGoal: Int?
    @State private var carbsGoal: Int?
    @State private var fatGoal: Int?
    @State private var autosave: PreferencesAutosaver

    static let kcalRange = 800...10_000
    static let proteinRange = 0...600
    static let carbsRange = 0...1_500
    static let fatRange = 0...600

    init(viewModel: LukiAppViewModel, autosave: PreferencesAutosaver = PreferencesAutosaver()) {
        self.viewModel = viewModel
        let p = viewModel.store.preferences
        _kcalGoal = State(initialValue: p.dailyKcalGoal)
        _proteinGoal = State(initialValue: p.proteinGoalG)
        _carbsGoal = State(initialValue: p.carbsGoalG)
        _fatGoal = State(initialValue: p.fatGoalG)
        _autosave = State(initialValue: autosave)
    }

    private struct Values: Equatable {
        let kcal: Int?, protein: Int?, carbs: Int?, fat: Int?
    }

    private var prefs: UserPreferencesDto { viewModel.store.preferences }
    private var bodyWeightKg: Double? { viewModel.currentBodyWeightKg }

    private var suggestion: Int? {
        NutritionMath.suggestedDailyKcal(
            bodyWeightKg: bodyWeightKg, heightCm: prefs.heightCm, birthYear: prefs.birthYear, sex: prefs.sex
        )
    }

    private var invalidMessage: String? {
        func outside(_ value: Int?, _ range: ClosedRange<Int>) -> Bool { value.map { !range.contains($0) } ?? false }
        if outside(kcalGoal, Self.kcalRange) {
            return tr("Enter calories between %d and %d.", Self.kcalRange.lowerBound, Self.kcalRange.upperBound)
        }
        if outside(proteinGoal, Self.proteinRange) || outside(carbsGoal, Self.carbsRange) || outside(fatGoal, Self.fatRange) {
            return tr("Macro goals look too high. Check the grams.")
        }
        return nil
    }

    var body: some View {
        Form {
            Section {
                field(tr("Daily calories (kcal)"), $kcalGoal, id: "kcal")
                if let invalidMessage {
                    Text(invalidMessage)
                        .font(.footnote)
                        .foregroundStyle(LukiColors.destructive)
                }
            } footer: {
                AutosaveStatusView(status: autosave.status)
            }

            Section(tr("Macros")) {
                field(tr("Protein (g)"), $proteinGoal, id: "protein")
                field(tr("Carbs (g)"), $carbsGoal, id: "carbs")
                field(tr("Fat (g)"), $fatGoal, id: "fat")
            }

            Section {
                Button {
                    kcalGoal = suggestion
                    if let w = bodyWeightKg { proteinGoal = Int((w * 1.8).rounded()) }
                } label: {
                    Label(tr("Suggest from my details"), systemImage: "wand.and.stars")
                }
                .disabled(suggestion == nil)
                .accessibilityIdentifier("ios.nutritionGoals.suggestButton")
            } footer: {
                if let suggestion {
                    Text(tr("About %d kcal a day keeps your weight steady at a light activity level.", suggestion))
                } else {
                    Text(tr("Add weight, height, year of birth and sex in Health details to get a suggestion."))
                }
            }
        }
        .navigationTitle(tr("Nutrition goals"))
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: Values(kcal: kcalGoal, protein: proteinGoal, carbs: carbsGoal, fat: fatGoal)) {
            guard invalidMessage == nil else { return }
            autosave.schedule { await save() }
        }
        .onDisappear { Task { await autosave.flush() } }
    }

    private func field(_ title: String, _ value: Binding<Int?>, id: String) -> some View {
        LabeledContent(title) {
            LiveNumberField(value: Binding(
                get: { value.wrappedValue.map(Double.init) },
                set: { value.wrappedValue = $0.map { Int($0.rounded()) } }
            ))
            .frame(maxWidth: 110)
            .accessibilityLabel(title)
            .accessibilityIdentifier("ios.nutritionGoals.\(id)Field")
        }
    }

    private func save() async -> String? {
        var next = viewModel.store.preferences
        next.dailyKcalGoal = kcalGoal
        next.proteinGoalG = proteinGoal
        next.carbsGoalG = carbsGoal
        next.fatGoalG = fatGoal
        var dto = UpdatePreferencesDto()
        dto.dailyKcalGoal = kcalGoal
        dto.proteinGoalG = proteinGoal
        dto.carbsGoalG = carbsGoal
        dto.fatGoalG = fatGoal
        return await viewModel.savePreferences(next, server: dto)
    }
}

/// Nutrition goals as a sheet; "Done" saves any pending change before closing.
struct NutritionGoalsSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var autosave = PreferencesAutosaver()

    var body: some View {
        NavigationStack {
            NutritionGoalsView(viewModel: viewModel, autosave: autosave)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(tr("Done")) {
                            Task {
                                await autosave.flush()
                                dismiss()
                            }
                        }
                        .accessibilityIdentifier("ios.nutritionGoals.doneButton")
                    }
                }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Opens `NutritionGoalsSheet`; drop-in for any summary that shows goals.
struct NutritionGoalsButton<Label: View>: View {
    @Bindable var viewModel: LukiAppViewModel
    @ViewBuilder var label: () -> Label
    @State private var isPresented = false

    var body: some View {
        Button { isPresented = true } label: { label() }
            .sheet(isPresented: $isPresented) {
                NutritionGoalsSheet(viewModel: viewModel)
            }
    }
}
