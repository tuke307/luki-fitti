import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain

/// Profile → Health details: current weight (opens the weight screen) and the body
/// metrics used for calorie estimates. Changes save automatically.
struct HealthDetailsView: View {
    @Bindable var viewModel: LukiAppViewModel
    @Environment(\.lukiLocale) private var tr
    @State private var unit: WeightUnit
    @State private var heightCm: Double?
    @State private var birthYear: Int?
    @State private var sex: String
    @State private var autosave = PreferencesAutosaver()
    @State private var isConnectingHealth = false

    static let heightRange = 100.0...250.0
    static let birthYearRange = 1900...2030

    init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
        let p = viewModel.store.preferences
        _unit = State(initialValue: p.weightUnit)
        _heightCm = State(initialValue: p.heightCm)
        _birthYear = State(initialValue: p.birthYear)
        _sex = State(initialValue: p.sex ?? "")
    }

    private struct Values: Equatable {
        let unit: WeightUnit
        let heightCm: Double?
        let birthYear: Int?
        let sex: String
    }

    private var heightValid: Bool { heightCm.map(Self.heightRange.contains) ?? true }
    private var birthYearValid: Bool { birthYear.map(Self.birthYearRange.contains) ?? true }

    var body: some View {
        Form {
            Section {
                NavigationLink {
                    WeightView(viewModel: viewModel)
                } label: {
                    LabeledContent(tr("Current weight")) {
                        Text(viewModel.currentBodyWeightKg.map(WeightDisplay(unit: unit, locale: tr).withUnit) ?? tr("Log weight"))
                            .monospacedDigit()
                    }
                }
                .accessibilityHint(tr("Opens your weight history"))
                .accessibilityIdentifier("ios.profile.currentWeightRow")
            } footer: {
                Text(tr("Your weight comes from your weigh-ins and Apple Health."))
            }

            Section {
                LabeledContent(tr("Height (cm)")) {
                    LiveNumberField(value: $heightCm)
                        .frame(maxWidth: 110)
                        .accessibilityLabel(tr("Height (cm)"))
                        .accessibilityIdentifier("ios.profile.heightField")
                }
                if !heightValid {
                    hint(tr("Enter a height between %d and %d cm.", Int(Self.heightRange.lowerBound), Int(Self.heightRange.upperBound)))
                }
                LabeledContent(tr("Year of birth")) {
                    LiveNumberField(value: Binding(
                        get: { birthYear.map(Double.init) },
                        set: { birthYear = $0.map { Int($0.rounded()) } }
                    ))
                    .frame(maxWidth: 110)
                    .accessibilityLabel(tr("Year of birth"))
                    .accessibilityIdentifier("ios.profile.birthYearField")
                }
                if !birthYearValid {
                    hint(tr("Enter a year between %d and %d.", Self.birthYearRange.lowerBound, Self.birthYearRange.upperBound))
                }
                Picker(tr("Sex (for estimates)"), selection: $sex) {
                    Text(tr("Not set")).tag("")
                    Text(tr("Female")).tag("female")
                    Text(tr("Male")).tag("male")
                }
                .accessibilityIdentifier("ios.profile.sexPicker")
            } footer: {
                VStack(alignment: .leading, spacing: 6) {
                    Text(tr("Used for calorie estimates. Stays private."))
                    AutosaveStatusView(status: autosave.status)
                }
            }

            if viewModel.isAppleHealthAvailable {
                appleHealthSection
            }
        }
        .navigationTitle(tr("Health details"))
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: Values(unit: unit, heightCm: heightCm, birthYear: birthYear, sex: sex)) {
            guard heightValid, birthYearValid else { return }
            autosave.schedule { await save() }
        }
        .onDisappear { Task { await autosave.flush() } }
    }

    private var appleHealthSection: some View {
        Section {
            Button {
                isConnectingHealth = true
                Task {
                    await viewModel.connectAppleHealthActivity()
                    isConnectingHealth = false
                }
            } label: {
                HStack {
                    Label(
                        viewModel.activitySync.hasRequestedAuthorization ? tr("Sync with Apple Health") : tr("Connect Apple Health"),
                        systemImage: "heart.text.square"
                    )
                    Spacer()
                    if isConnectingHealth || viewModel.activitySync.isSyncing {
                        ProgressView()
                    }
                }
                .frame(minHeight: 44)
            }
            .disabled(isConnectingHealth)
            .accessibilityIdentifier("ios.profile.health.connectButton")
            if let last = viewModel.activitySync.lastSyncAt {
                LabeledContent(tr("Last synced")) {
                    Text(last.formatted(.relative(presentation: .named).locale(Locale(identifier: tr.rawValue))))
                }
                .accessibilityIdentifier("ios.profile.health.lastSync")
            }
        } header: {
            Text(tr("Apple Health"))
        } footer: {
            Text(tr("LukiFitti reads workouts and active energy from other apps such as Strava or Garmin to include them in calories burned, and saves your LukiFitti gym workouts to Apple Health. You choose what to share in the next step."))
                .accessibilityIdentifier("ios.profile.health.footer")
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(LukiColors.destructive)
    }

    private func save() async -> String? {
        var prefs = viewModel.store.preferences
        prefs.weightUnit = unit
        prefs.heightCm = heightCm
        prefs.birthYear = birthYear
        prefs.sex = sex.isEmpty ? nil : sex
        var dto = UpdatePreferencesDto()
        dto.weightUnit = unit
        dto.heightCm = heightCm
        dto.birthYear = birthYear
        dto.sex = prefs.sex
        let error = await viewModel.savePreferences(prefs, server: dto)
        viewModel.rescheduleWeighInReminders()
        return error
    }
}
