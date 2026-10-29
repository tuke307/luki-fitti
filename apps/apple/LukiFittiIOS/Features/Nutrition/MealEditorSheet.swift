import SwiftUI
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// Create or edit a meal. Changing only the amount rescales an item's nutrients.
struct MealEditorSheet: View {
    @Bindable var viewModel: LukiAppViewModel
    let context: MealEditorContext
    let onSaved: (_ reachedServer: Bool) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lukiLocale) private var tr
    @State private var mealType: MealType
    @State private var time: Date
    @State private var label: String
    @State private var items: [MealItemDto]
    @State private var recent: [MealItemDto] = []
    @State private var error: String?
    @State private var saving = false
    @State private var confirmDelete = false

    init(viewModel: LukiAppViewModel, context: MealEditorContext, onSaved: @escaping (Bool) -> Void) {
        self.viewModel = viewModel
        self.context = context
        self.onSaved = onSaved
        let entry = context.entry
        _mealType = State(initialValue: entry?.mealType ?? MealType.forTime(Date()))
        _time = State(initialValue: entry?.eatenAtDate ?? Date())
        _label = State(initialValue: entry?.label ?? "")
        _items = State(initialValue: entry?.items.isEmpty == false ? entry!.items : [MealItemDto(name: "")])
    }

    static func label(_ type: MealType, _ tr: SupportedLocale) -> String {
        switch type {
        case .BREAKFAST: return tr("Breakfast")
        case .LUNCH: return tr("Lunch")
        case .DINNER: return tr("Dinner")
        case .SNACK: return tr("Snack")
        case .COFFEE: return tr("Coffee")
        case .OTHER: return tr("Other")
        }
    }

    private var isSignedIn: Bool { viewModel.store.currentUser != nil }
    private var totals: NutritionTotalsDto { NutritionMath.sum(items) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(tr("Meal"), selection: $mealType) {
                        ForEach(MealType.allCases, id: \.self) { Text(Self.label($0, tr)).tag($0) }
                    }
                    DatePicker(tr("Time"), selection: $time, displayedComponents: .hourAndMinute)
                    TextField(tr("Name (optional)"), text: $label)
                }

                ForEach($items) { $item in
                    Section {
                        HStack {
                            TextField(tr("Food"), text: $item.name)
                                .font(.body.weight(.medium))
                            if item.source == .AI {
                                Label(tr("Estimated"), systemImage: "sparkles")
                                    .font(.caption)
                                    .labelStyle(.titleAndIcon)
                                    .foregroundStyle(LukiColors.accent)
                            }
                        }
                        numberRow(tr("Amount (g)"), id: "grams", value: Binding(
                            get: { item.grams },
                            set: { grams in
                                if let grams, item.grams != nil, (item.grams ?? 0) > 0 {
                                    item = NutritionMath.scale(item, toGrams: grams)
                                } else {
                                    item.grams = grams
                                }
                            }
                        ))
                        numberRow("kcal", id: "kcal", value: nonOptional($item.kcal))
                        numberRow(tr("Protein (g)"), id: "protein", value: nonOptional($item.proteinG))
                        numberRow(tr("Carbs (g)"), id: "carbs", value: nonOptional($item.carbsG))
                        numberRow(tr("Fat (g)"), id: "fat", value: nonOptional($item.fatG))
                        if item.source == .AI, let c = item.confidence, c < 0.5 {
                            Text(tr("Rough estimate — check the amount"))
                                .font(.footnote)
                                .foregroundStyle(LukiColors.warning)
                        }
                        Button(role: .destructive) {
                            items.removeAll { $0.id == item.id }
                            if items.isEmpty { items = [MealItemDto(name: "")] }
                        } label: {
                            Label(tr("Remove"), systemImage: "minus.circle")
                        }
                    }
                }

                Section {
                    Button {
                        items.append(MealItemDto(name: ""))
                    } label: {
                        Label(tr("Add another food"), systemImage: "plus")
                    }
                    if !recent.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(recent.prefix(12)) { r in
                                    Button("\(r.name) · \(Int(r.kcal))") {
                                        items.removeAll { $0.name.isEmpty && $0.kcal == 0 }
                                        var copy = r
                                        copy.id = UUID().uuidString
                                        copy.source = .MANUAL
                                        copy.confidence = nil
                                        items.append(copy)
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }
                        }
                    }
                } header: {
                    if !recent.isEmpty { Text(tr("Recent")) }
                }

                Section {
                    Text(tr("Total: %d kcal", Int(totals.kcal)))
                        .font(.headline)
                    Text("\(tr("Protein")) \(Int(totals.proteinG)) g · \(tr("Carbs")) \(Int(totals.carbsG)) g · \(tr("Fat")) \(Int(totals.fatG)) g")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if let error {
                        Text(error).foregroundStyle(LukiColors.destructive).font(.footnote)
                    }
                    if context.entry != nil {
                        Button(tr("Delete meal"), role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(context.entry == nil ? tr("New meal") : tr("Edit meal"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Save")) { Task { await save() } }
                        .disabled(saving)
                        .accessibilityIdentifier("ios.nutrition.saveMealButton")
                }
            }
            .confirmationDialog(tr("Delete this meal and its photos?"), isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(tr("Delete meal"), role: .destructive) {
                    guard let entry = context.entry else { return }
                    Task {
                        await viewModel.nutrition.remove(entry, isSignedIn: isSignedIn)
                        dismiss()
                    }
                }
            }
            .task {
                guard isSignedIn else { return }
                recent = (try? await viewModel.store.apiClient.fetchRecentMealItems()) ?? []
            }
        }
    }

    private func numberRow(_ title: String, id: String, value: Binding<Double?>) -> some View {
        HStack {
            Text(title)
            Spacer()
            LiveNumberField(value: value)
                .frame(maxWidth: 120)
                .accessibilityLabel(title)
                .accessibilityIdentifier("ios.nutrition.item.\(id)")
        }
    }

    private func nonOptional(_ binding: Binding<Double>) -> Binding<Double?> {
        Binding(get: { binding.wrappedValue }, set: { binding.wrappedValue = max(0, $0 ?? 0) })
    }

    private func save() async {
        let filled = items.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty || $0.kcal > 0 || ($0.grams ?? 0) > 0 }
        guard !filled.contains(where: { $0.name.trimmingCharacters(in: .whitespaces).isEmpty }) else {
            error = tr("Give each food a name.")
            return
        }
        saving = true
        defer { saving = false }
        let cal = Calendar.current
        let hm = cal.dateComponents([.hour, .minute], from: time)
        let eatenAt = cal.date(bySettingHour: hm.hour ?? 12, minute: hm.minute ?? 0, second: 0, of: context.day) ?? time
        let payload = UpsertMealEntryDto(
            clientEntryId: context.entry?.clientEntryId ?? NutritionStore.newClientId(),
            eatenAt: LukiISODate.string(eatenAt),
            mealType: mealType,
            label: label.trimmingCharacters(in: .whitespaces).isEmpty ? nil : label.trimmingCharacters(in: .whitespaces),
            notes: context.entry?.notes,
            items: filled.map {
                var item = $0
                item.name = item.name.trimmingCharacters(in: .whitespaces)
                return MealItemInputDto(item)
            }
        )
        let reached = await viewModel.nutrition.save(payload, isSignedIn: isSignedIn)
        onSaved(reached)
        dismiss()
    }
}

/// Number input that updates its value on every keystroke (a `TextField(value:format:)` only
/// commits on Return, so tapping Save right after typing would drop the value).
struct LiveNumberField: View {
    @Binding var value: Double?
    @State private var text: String
    @State private var lastWritten: Double?

    init(value: Binding<Double?>) {
        _value = value
        _text = State(initialValue: Self.format(value.wrappedValue))
        _lastWritten = State(initialValue: value.wrappedValue)
    }

    static func format(_ v: Double?) -> String {
        guard let v else { return "" }
        return v.rounded() == v ? String(Int(v)) : String(format: "%.1f", v)
    }

    var body: some View {
        TextField("0", text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .monospacedDigit()
            .onChange(of: text) { _, newText in
                let parsed = Double(newText.replacingOccurrences(of: ",", with: "."))
                lastWritten = parsed
                value = parsed
            }
            .onChange(of: value) { _, newValue in
                // Reflect external changes (e.g. rescaling after an amount edit) without
                // fighting the user's own typing.
                if newValue != lastWritten {
                    lastWritten = newValue
                    text = Self.format(newValue)
                }
            }
    }
}
