import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

/// Body metrics (for burn estimates) and daily nutrition goals. Saved to the server explicitly.
/// Body weight comes from the weigh-in history (read-only here; edited on the weight screen).
struct BodyNutritionSection: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var heightCm: Double?
    @State private var birthYear: Int?
    @State private var sex: String = ""
    @State private var kcalGoal: Int?
    @State private var proteinGoal: Int?
    @State private var carbsGoal: Int?
    @State private var fatGoal: Int?
    @State private var status: String?
    @State private var saving = false

    init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
        let p = viewModel.store.preferences
        _heightCm = State(initialValue: p.heightCm)
        _birthYear = State(initialValue: p.birthYear)
        _sex = State(initialValue: p.sex ?? "")
        _kcalGoal = State(initialValue: p.dailyKcalGoal)
        _proteinGoal = State(initialValue: p.proteinGoalG)
        _carbsGoal = State(initialValue: p.carbsGoalG)
        _fatGoal = State(initialValue: p.fatGoalG)
    }

    /// Latest weigh-in, else the value saved before weigh-ins existed.
    private var bodyWeightKg: Double? { viewModel.currentBodyWeightKg }

    private var suggestion: Int? {
        NutritionMath.suggestedDailyKcal(
            bodyWeightKg: bodyWeightKg, heightCm: heightCm, birthYear: birthYear, sex: sex.isEmpty ? nil : sex
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(tr("Body & nutrition")).font(.headline)
                Text(tr("Used for calorie estimates. Stays private."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            currentWeightRow
            row(tr("Height (cm)"), value: $heightCm)
            intRow(tr("Year of birth"), value: $birthYear)
            Picker(tr("Sex (for estimates)"), selection: $sex) {
                Text(tr("Not set")).tag("")
                Text(tr("Female")).tag("female")
                Text(tr("Male")).tag("male")
            }
            Divider()
            intRow(tr("Daily calories (kcal)"), value: $kcalGoal)
            intRow(tr("Protein (g)"), value: $proteinGoal)
            intRow(tr("Carbs (g)"), value: $carbsGoal)
            intRow(tr("Fat (g)"), value: $fatGoal)

            HStack {
                Button(tr("Save")) { Task { await save() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(saving || viewModel.store.currentUser == nil)
                Button(tr("Suggest from my details")) {
                    kcalGoal = suggestion
                    if let w = bodyWeightKg { proteinGoal = Int((w * 1.8).rounded()) }
                }
                .buttonStyle(.bordered)
                .disabled(suggestion == nil)
            }
            if let status {
                Text(status).font(.footnote).foregroundStyle(.secondary)
            } else if suggestion == nil {
                Text(tr("Add weight, height, year of birth and sex to get a suggestion."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(LukiColors.cardBackground))
    }

    private var currentWeightRow: some View {
        let display = WeightDisplay(unit: viewModel.store.preferences.weightUnit, locale: tr)
        return NavigationLink {
            WeightView(viewModel: viewModel)
        } label: {
            HStack {
                Text(tr("Current weight"))
                    .foregroundStyle(.primary)
                Spacer()
                Text(bodyWeightKg.map(display.withUnit) ?? tr("Log weight"))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .font(.subheadline)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(tr("Opens your weight history"))
        .accessibilityIdentifier("ios.profile.currentWeightRow")
    }

    private func row(_ title: String, value: Binding<Double?>) -> some View {
        HStack {
            Text(title)
            Spacer()
            LiveNumberField(value: value).frame(maxWidth: 110).accessibilityLabel(title)
        }
        .font(.subheadline)
    }

    private func intRow(_ title: String, value: Binding<Int?>) -> some View {
        HStack {
            Text(title)
            Spacer()
            LiveNumberField(value: Binding(
                get: { value.wrappedValue.map(Double.init) },
                set: { value.wrappedValue = $0.map { Int($0.rounded()) } }
            ))
            .frame(maxWidth: 110)
            .accessibilityLabel(title)
        }
        .font(.subheadline)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        var dto = UpdatePreferencesDto()
        dto.heightCm = heightCm
        dto.birthYear = birthYear
        dto.sex = sex.isEmpty ? nil : sex
        dto.dailyKcalGoal = kcalGoal
        dto.proteinGoalG = proteinGoal
        dto.carbsGoalG = carbsGoal
        dto.fatGoalG = fatGoal
        do {
            let user = try await viewModel.store.apiClient.updatePreferences(dto)
            viewModel.store.saveAuthenticatedUser(user)
            status = tr("Saved")
        } catch {
            status = error.localizedDescription
        }
    }
}
