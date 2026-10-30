import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Log or edit one weigh-in. The value is entered in the person's unit and stored in kg.
struct LogWeightSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    let entry: BodyWeightEntryDto?
    let onSaved: (_ reachedServer: Bool) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var value: Double?
    @State private var measuredAt: Date
    @State private var note: String
    @State private var saving = false
    @State private var confirmDelete = false
    private let latestAllowedDate = Date()

    private static let step = 0.1

    init(viewModel: LukiAppViewModel, entry: BodyWeightEntryDto?, onSaved: @escaping (Bool) -> Void = { _ in }) {
        self.viewModel = viewModel
        self.entry = entry
        self.onSaved = onSaved
        let unit = viewModel.store.preferences.weightUnit
        let startKg = entry?.weightKg ?? viewModel.currentBodyWeightKg ?? NutritionMath.defaultBodyWeightKg
        _value = State(initialValue: (BodyWeightMath.display(startKg, unit: unit) * 10).rounded() / 10)
        _measuredAt = State(initialValue: min(entry?.measuredAtDate ?? Date(), Date()))
        _note = State(initialValue: entry?.note ?? "")
    }

    private var unit: WeightUnit { viewModel.store.preferences.weightUnit }
    private var unitLabel: String { LukiFormat.unitLabel(unit) }

    private var weightKg: Double? {
        guard let value, value.isFinite, value > 0 else { return nil }
        let kg = BodyWeightMath.kilograms(value, unit: unit)
        return BodyWeightLimits.kgRange.contains(kg) ? kg : nil
    }

    private var rangeHint: String {
        let low = BodyWeightMath.display(BodyWeightLimits.minKg, unit: unit).rounded(.up)
        let high = BodyWeightMath.display(BodyWeightLimits.maxKg, unit: unit).rounded(.down)
        return tr("Enter a weight between %d and %d %@.", Int(low), Int(high), unitLabel)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LukiValueStepper(
                        value: (value ?? 0).formatted(.number.precision(.fractionLength(1)).locale(Locale(identifier: tr.rawValue))),
                        unit: unitLabel,
                        minusLabel: tr("Decrease weight by %@", "0.1"),
                        plusLabel: tr("Increase weight by %@", "0.1"),
                        onMinus: { adjust(-Self.step) },
                        onPlus: { adjust(Self.step) }
                    )
                    .accessibilityIdentifier("ios.weight.stepper")
                    HStack {
                        Text(tr("Weight (%@)", unitLabel))
                        Spacer()
                        LiveNumberField(value: $value)
                            .frame(maxWidth: 120)
                            .accessibilityLabel(tr("Weight (%@)", unitLabel))
                            .accessibilityIdentifier("ios.weight.valueField")
                    }
                    if weightKg == nil {
                        Text(rangeHint)
                            .font(.footnote)
                            .foregroundStyle(LukiColors.destructive)
                    }
                } footer: {
                    Text(tr("Weigh yourself after waking, before breakfast, for the most consistent trend."))
                }

                Section {
                    DatePicker(
                        tr("Date"),
                        selection: $measuredAt,
                        in: ...latestAllowedDate,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .accessibilityIdentifier("ios.weight.datePicker")
                    TextField(tr("Note (optional)"), text: $note, axis: .vertical)
                        .lineLimit(1...4)
                        .onChange(of: note) { _, newValue in
                            if newValue.count > BodyWeightLimits.noteMaxLength {
                                note = String(newValue.prefix(BodyWeightLimits.noteMaxLength))
                            }
                        }
                        .accessibilityIdentifier("ios.weight.noteField")
                }

                if let entry {
                    Section {
                        if entry.source == .HEALTHKIT {
                            Label(tr("Imported from Apple Health"), systemImage: "heart.fill")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        Button(tr("Delete weigh-in"), role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(entry == nil ? tr("Log weight") : tr("Edit weigh-in"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Save")) { Task { await save() } }
                        .disabled(saving || weightKg == nil)
                        .accessibilityIdentifier("ios.weight.saveButton")
                }
            }
            .confirmationDialog(tr("Delete this weigh-in?"), isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(tr("Delete weigh-in"), role: .destructive) {
                    guard let entry else { return }
                    Task {
                        await viewModel.deleteWeighIn(entry)
                        dismiss()
                    }
                }
            }
        }
    }

    private func adjust(_ delta: Double) {
        let current = value ?? BodyWeightMath.display(NutritionMath.defaultBodyWeightKg, unit: unit)
        value = max(0, ((current + delta) * 10).rounded() / 10)
    }

    private func save() async {
        guard let kg = weightKg else { return }
        saving = true
        defer { saving = false }
        let reached = await viewModel.saveWeighIn(
            existing: entry,
            measuredAt: min(measuredAt, Date()),
            weightKg: kg,
            note: note
        )
        onSaved(reached)
        dismiss()
    }
}
