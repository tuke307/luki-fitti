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

    /// Apple Health reported active energy on one of the last 7 days, so the food ring already
    /// adds everyday movement and the base goal must not include it.
    private var hasMeasuredActivity: Bool {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        guard let weekAgo = calendar.date(byAdding: .day, value: -7, to: today) else { return false }
        return viewModel.activity.days.contains { day in
            guard day.activeKcal > 0, let date = LukiDayKey.date(day.day, calendar: calendar) else { return false }
            return date >= weekAgo && date <= today
        }
    }

    private var suggestion: Int? {
        NutritionMath.suggestedDailyKcal(
            bodyWeightKg: bodyWeightKg, heightCm: prefs.heightCm, birthYear: prefs.birthYear, sex: prefs.sex,
            bodyFatPct: prefs.bodyFatPct, activityLevel: prefs.activityLevel, measuredActivity: hasMeasuredActivity
        )
    }

    private var proteinSuggestion: Int? {
        NutritionMath.suggestedProteinG(bodyWeightKg: bodyWeightKg, bodyFatPct: prefs.bodyFatPct)
    }

    private var suggestionFooter: String {
        guard let suggestion else {
            return prefs.bodyFatPct == nil
                ? tr("Add weight, height, year of birth and sex in Health details to get a suggestion.")
                : tr("Add your weight in Health details to get a suggestion.")
        }
        let kcal = Self.number(suggestion, tr)
        return hasMeasuredActivity
            ? tr("About %@ kcal a day before activity. Each day, your workouts and the activity Apple Health measures are added on top.", kcal)
            : tr("About %@ kcal a day for your everyday activity. Each day, your workouts are added on top.", kcal)
    }

    static func number(_ value: Int, _ tr: SupportedLocale) -> String {
        value.formatted(.number.locale(Locale(identifier: tr.rawValue)))
    }

    // MARK: Learned maintenance

    private struct MaintenanceInput {
        let days: [MaintenanceMath.DayInput]
        let weighInsInWindow: Int
    }

    /// The 28 days ending yesterday with what was eaten and burned, exactly as the Food tab shows them.
    private var maintenanceInput: MaintenanceInput {
        let calendar = Calendar.current
        let keys = MaintenanceMath.windowDayKeys(calendar: calendar)
        let dates = keys.compactMap { LukiDayKey.date($0, calendar: calendar) }
        guard let first = dates.first, let last = dates.last,
              let end = calendar.date(byAdding: .day, value: 1, to: last) else {
            return MaintenanceInput(days: [], weighInsInWindow: 0)
        }
        // Only sessions near the window; the burn math is per day.
        let sessions = viewModel.store.historySessions.filter { session in
            guard let start = LukiISODate.parse(session.startedAt) else { return false }
            return start >= first.addingTimeInterval(-86_400) && start < end
        }
        let burns = NutritionCalendar.dayBurns(
            sessions: sessions,
            healthDays: viewModel.activity.days,
            healthWorkouts: viewModel.activity.workouts,
            calendar: calendar
        ) { viewModel.bodyWeightKg(at: $0) }
        let days = zip(keys, dates).map { key, date in
            MaintenanceMath.DayInput(
                day: key,
                intakeKcal: viewModel.nutrition.totals(on: date, calendar: calendar).kcal,
                burnedKcal: Double(burns[date]?.total ?? 0)
            )
        }
        let weighIns = viewModel.bodyWeight.points.filter { $0.date >= first && $0.date < end }.count
        return MaintenanceInput(days: days, weighInsInWindow: weighIns)
    }

    @ViewBuilder
    private var maintenanceSection: some View {
        let input = maintenanceInput
        let estimate = MaintenanceMath.estimate(days: input.days, weighIns: viewModel.bodyWeight.points)
        Section {
            if let estimate {
                let goal = min(Self.kcalRange.upperBound, max(Self.kcalRange.lowerBound, estimate.baseKcal))
                VStack(alignment: .leading, spacing: 4) {
                    Text(tr("Your measured maintenance ≈ %@ kcal", Self.number(estimate.totalKcal, tr)))
                        .font(.body.weight(.semibold))
                    Text(tr("Based on %d logged days and your weight trend.", estimate.loggedDays))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("ios.nutritionGoals.maintenance")
                Button {
                    kcalGoal = goal
                } label: {
                    Label(tr("Use %@ kcal as goal", Self.number(goal, tr)), systemImage: "checkmark.circle")
                }
                .disabled(kcalGoal == goal)
                .accessibilityIdentifier("ios.nutritionGoals.useMaintenanceButton")
            } else {
                let logged = input.days.filter { $0.intakeKcal > 0 }.count
                VStack(alignment: .leading, spacing: 4) {
                    Text(tr("Log food on at least %d of the last %d days and weigh in at least %d times over %d days or more. Then LukiFitti can work out what you really burn.",
                            MaintenanceMath.Rules.minLoggedDays, MaintenanceMath.Rules.windowDays,
                            MaintenanceMath.Rules.minWeighIns, Int(MaintenanceMath.Rules.minWeighInSpanDays)))
                    Text(tr("So far: %d days logged, %d weigh-ins.", logged, input.weighInsInWindow))
                        .monospacedDigit()
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("ios.nutritionGoals.maintenanceMissing")
            }
        } header: {
            Text(tr("From your logs"))
        } footer: {
            if let estimate, estimate.baseKcal != estimate.totalKcal {
                Text(tr("The goal leaves out the %@ kcal you burned on an average day, because burned calories are added on top each day.", Self.number(estimate.avgBurnedKcal, tr)))
            }
        }
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
                VStack(alignment: .leading, spacing: 6) {
                    Text(tr("This is your base for a day without workouts. Calories you burn are added on top each day."))
                    AutosaveStatusView(status: autosave.status)
                }
            }

            Section(tr("Macros")) {
                field(tr("Protein (g)"), $proteinGoal, id: "protein")
                field(tr("Carbs (g)"), $carbsGoal, id: "carbs")
                field(tr("Fat (g)"), $fatGoal, id: "fat")
            }

            Section {
                Button {
                    kcalGoal = suggestion
                    if let proteinSuggestion { proteinGoal = proteinSuggestion }
                } label: {
                    Label(tr("Suggest from my details"), systemImage: "wand.and.stars")
                }
                .disabled(suggestion == nil)
                .accessibilityIdentifier("ios.nutritionGoals.suggestButton")
            } footer: {
                Text(suggestionFooter)
            }

            maintenanceSection
        }
        .navigationTitle(tr("Nutrition goals"))
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: Values(kcal: kcalGoal, protein: proteinGoal, carbs: carbsGoal, fat: fatGoal)) {
            guard invalidMessage == nil else { return }
            autosave.schedule { await save() }
        }
        .onDisappear { Task { await autosave.flush() } }
        .task {
            // The learned maintenance needs the last 28 days of meals and Apple Health activity.
            let isSignedIn = viewModel.isSignedIn
            await viewModel.nutrition.refresh(isSignedIn: isSignedIn, force: false)
            await viewModel.activity.refresh(isSignedIn: isSignedIn, force: false)
            if let first = MaintenanceMath.windowDayKeys().first.flatMap({ LukiDayKey.date($0) }) {
                await viewModel.nutrition.ensureLoaded(from: first, isSignedIn: isSignedIn)
                await viewModel.activity.ensureLoaded(from: first, isSignedIn: isSignedIn)
            }
        }
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
